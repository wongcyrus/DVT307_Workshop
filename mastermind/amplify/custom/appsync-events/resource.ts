import { Construct } from 'constructs';
import { 
  EventApi, 
  AppSyncAuthProvider, 
  AppSyncAuthorizationType, 
  AppSyncFieldLogLevel 
} from 'aws-cdk-lib/aws-appsync';
import { IUserPool } from 'aws-cdk-lib/aws-cognito';
import { IFunction } from 'aws-cdk-lib/aws-lambda';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';

/**
 * Props for AppSyncEventsConstruct
 */
export type AppSyncEventsConstructProps = {
  /** Environment */
  environment: string;
  /** Amazon Cognito user pool */
  userPool: IUserPool;
  /** AWS Lambda function - validateGuess */
  validateGuess: IFunction;
};

export class AppSyncEventsConstruct extends Construct {
  public readonly eventApi: EventApi;

  constructor(scope: Construct, id: string, props: AppSyncEventsConstructProps) {
    super(scope, id);

    const apiKeyProvider: AppSyncAuthProvider = {
      authorizationType: AppSyncAuthorizationType.API_KEY,
    };

    const cognitoProvider: AppSyncAuthProvider = {
      authorizationType: AppSyncAuthorizationType.USER_POOL,
      cognitoConfig: {
        userPool: props.userPool,
      },
    };

    const authorizationConfig = {
      authProviders: [apiKeyProvider, cognitoProvider],
      connectionAuthModeTypes: [AppSyncAuthorizationType.USER_POOL],
      defaultPublishAuthModeTypes: [AppSyncAuthorizationType.USER_POOL],
      defaultSubscribeAuthModeTypes: [AppSyncAuthorizationType.USER_POOL],
    };

    const logConfig = {
      fieldLogLevel: props.environment === 'dev' 
        ? AppSyncFieldLogLevel.ALL 
        : AppSyncFieldLogLevel.ERROR,
      retention: props.environment === 'dev' 
        ? RetentionDays.ONE_WEEK 
        : RetentionDays.ONE_MONTH,
    };

    this.eventApi = new EventApi(this, `MastermindEventApi-${props.environment}`, {
      apiName: `MastermindEventApi-${props.environment}`,
      authorizationConfig,
      logConfig,
    });

    const validateGuessDS = this.eventApi.addLambdaDataSource(
      'MastermindValidateGuessFunc',
      props.validateGuess
    );

    this.eventApi.addChannelNamespace('game', {
      publishHandlerConfig: {
        dataSource: validateGuessDS,
        direct: true,
      },
    });

    this.eventApi.addChannelNamespace('leaderboard', {
      authorizationConfig: {
        publishAuthModeTypes: [AppSyncAuthorizationType.API_KEY],
      },
    });
  }
}