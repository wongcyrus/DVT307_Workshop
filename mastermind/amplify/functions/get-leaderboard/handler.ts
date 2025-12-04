import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
};

export const handler: APIGatewayProxyHandler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: '',
    };
  }

  try {
    const difficulty = event.queryStringParameters?.difficulty;

    const scanCommand = new ScanCommand({
      TableName: process.env.LEADERBOARD_TABLE_NAME,
      ...(difficulty && {
        FilterExpression: 'difficulty = :difficulty',
        ExpressionAttributeValues: { ':difficulty': difficulty },
      }),
    });

    const { Items = [] } = await docClient.send(scanCommand);

    const sortedLeaderboard = Items.sort((a, b) => {
      if (a.gamesWon !== b.gamesWon) {
        return b.gamesWon - a.gamesWon;
      }
      return a.bestScore - b.bestScore;
    });

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ leaderboard: sortedLeaderboard }),
    };
  } catch (error) {
    console.error('Error retrieving leaderboard:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Failed to retrieve leaderboard' }),
    };
  }
};