import { DynamoDBStreamHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

interface LeaderboardEntry {
  userId: string;
  difficulty: string;
  gamesWon: number;
  totalGames: number;
  bestScore: number;
  averageScore: number;
  lastWonAt: string;
  username?: string;
}

async function publishToAppSyncEvents(entry: LeaderboardEntry): Promise<void> {
  const endpoint = process.env.APPSYNC_EVENTS_ENDPOINT;
  const apiKey = process.env.APPSYNC_EVENTS_API_KEY;

  if (!endpoint || !apiKey) {
    console.log('AppSync Events not configured, skipping publication');
    return;
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        channel: `/leaderboard/${entry.difficulty}`,
        events: [entry],
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    console.log(`Published leaderboard update for ${entry.userId} in ${entry.difficulty}`);
  } catch (error) {
    console.error('Failed to publish to AppSync Events:', error);
  }
}

export const handler: DynamoDBStreamHandler = async (event) => {
  console.log('Processing DynamoDB stream events:', JSON.stringify(event, null, 2));

  for (const record of event.Records) {
    if (record.eventName !== 'MODIFY') continue;

    const newImage = record.dynamodb?.NewImage;
    const oldImage = record.dynamodb?.OldImage;

    if (!newImage || !oldImage) continue;

    const newStatus = newImage.gameStatus?.S;
    const oldStatus = oldImage.gameStatus?.S;

    if (newStatus !== 'won' || oldStatus === 'won') continue;

    const userId = newImage.userId?.S;
    const username = newImage.username?.S;
    const difficulty = newImage.difficulty?.S;
    const totalGuesses = newImage.totalGuesses?.N;

    if (!userId || !difficulty || !totalGuesses) {
      console.error('Missing required fields in stream record');
      continue;
    }

    const score = parseInt(totalGuesses);

    try {
      const getCommand = new GetCommand({
        TableName: process.env.LEADERBOARD_TABLE_NAME,
        Key: { userId, difficulty },
      });

      const { Item: existingEntry } = await docClient.send(getCommand);

      let updatedEntry: LeaderboardEntry;

      if (existingEntry) {
        const newGamesWon = existingEntry.gamesWon + 1;
        const newTotalGames = existingEntry.totalGames + 1;
        const newBestScore = Math.min(existingEntry.bestScore, score);
        const newAverageScore = Math.round(
          ((existingEntry.averageScore * existingEntry.gamesWon) + score) / newGamesWon
        );

        updatedEntry = {
          ...existingEntry,
          gamesWon: newGamesWon,
          totalGames: newTotalGames,
          bestScore: newBestScore,
          averageScore: newAverageScore,
          lastWonAt: new Date().toISOString(),
          username,
        };
      } else {
        updatedEntry = {
          userId,
          difficulty,
          gamesWon: 1,
          totalGames: 1,
          bestScore: score,
          averageScore: score,
          lastWonAt: new Date().toISOString(),
          username,
        };
      }

      const putCommand = new PutCommand({
        TableName: process.env.LEADERBOARD_TABLE_NAME,
        Item: updatedEntry,
      });

      await docClient.send(putCommand);

      console.log(`Updated leaderboard for ${userId} in ${difficulty}: ${updatedEntry.gamesWon} wins`);

      await publishToAppSyncEvents(updatedEntry);

    } catch (error) {
      console.error(`Failed to update leaderboard for ${userId}:`, error);
    }
  }
};