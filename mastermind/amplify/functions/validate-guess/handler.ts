import { Context } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

interface ValidateGuessInput {
  guess: string[];
}

async function processEvent(event: any, userId: string, gameId: string) {
  const { guess }: ValidateGuessInput = event.payload;

  const getCommand = new GetCommand({
    TableName: process.env.GAMES_TABLE_NAME,
    Key: { gameId, userId },
  });

  const { Item: game } = await docClient.send(getCommand);
  if (!game) {
    throw new Error(`Game ${gameId} not found for user ${userId}`);
  }

  const secretCode = game.secretCode;
  const totalGuesses = game.totalGuesses || 0;
  const guessNumber = totalGuesses + 1;

  const secretCodeCopy = structuredClone(secretCode);
  const guessCopy = structuredClone(guess);

  let correctPosition = 0;
  for (let i = 0; i < secretCode.length; i++) {
    if (guess[i] === secretCode[i]) {
      correctPosition++;
      secretCodeCopy[i] = null;
      guessCopy[i] = null;
    }
  }

  let correctColor = 0;
  for (const color of guessCopy) {
    if (color !== null) {
      const index = secretCodeCopy.indexOf(color);
      if (index !== -1) {
        correctColor++;
        secretCodeCopy[index] = null;
      }
    }
  }

  const gameStatus = correctPosition === secretCode.length ? 'won' : 
                    guessNumber >= 10 ? 'lost' : 'playing';

  const updateCommand = new UpdateCommand({
    TableName: process.env.GAMES_TABLE_NAME,
    Key: { gameId, userId },
    UpdateExpression: `SET totalGuesses = :totalGuesses, guess${guessNumber} = :guess, gameStatus = :gameStatus`,
    ExpressionAttributeValues: {
      ':totalGuesses': guessNumber,
      ':guess': guess,
      ':gameStatus': gameStatus,
    },
  });

  await docClient.send(updateCommand);

  return {
    id: event.id,
    payload: {
      guess,
      blackPegs: correctPosition,
      whitePegs: correctColor,
      guessNumber,
      gameStatus,
      secretCode: gameStatus === 'won' ? secretCode : null,
    },
  };
}

export const handler = async (event: any, context: Context) => {
  console.log('Processing AppSync Events:', JSON.stringify(event, null, 2));

  if (event.info.operation !== 'PUBLISH') {
    return { events: event.events };
  }

  const userId = event.identity.sub;
  const gameId = event.info.channel.path.substring(6);

  const processedEvents = await Promise.all(
    event.events.map((evt: any) => processEvent(evt, userId, gameId))
  );

  return { events: processedEvents };
};