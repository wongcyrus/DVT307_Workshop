import { Construct } from 'constructs';
import { RemovalPolicy } from 'aws-cdk-lib';
import { 
  TableV2, 
  AttributeType, 
  StreamViewType, 
  Billing, 
  ProjectionType 
} from 'aws-cdk-lib/aws-dynamodb';

interface DynamoDBConstructProps {
  environment: string;
}

export class DynamoDBConstruct extends Construct {
  public readonly gamesTable: TableV2;
  public readonly leaderboardTable: TableV2;

  constructor(scope: Construct, id: string, props: DynamoDBConstructProps) {
    super(scope, id);

    const removalPolicy = props.environment === 'production' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY;

    this.gamesTable = new TableV2(this, 'GamesTable', {
      tableName: `Mastermind-Games-${props.environment}`,
      partitionKey: { name: 'gameId', type: AttributeType.STRING },
      sortKey: { name: 'userId', type: AttributeType.STRING },
      billing: Billing.onDemand(),
      dynamoStream: StreamViewType.NEW_AND_OLD_IMAGES,
      timeToLiveAttribute: 'ttl',
      removalPolicy,
      globalSecondaryIndexes: [{
        indexName: 'UserGamesIndex',
        partitionKey: { name: 'userId', type: AttributeType.STRING },
        sortKey: { name: 'startedAt', type: AttributeType.STRING },
        projectionType: ProjectionType.ALL,
      }],
    });

    this.leaderboardTable = new TableV2(this, 'LeaderboardTable', {
      tableName: `Mastermind-Leaderboard-${props.environment}`,
      partitionKey: { name: 'userId', type: AttributeType.STRING },
      sortKey: { name: 'difficulty', type: AttributeType.STRING },
      billing: Billing.onDemand(),
      removalPolicy,
    });
  }
}