import { Construct } from 'constructs';
import { 
  RestApi, 
  CognitoUserPoolsAuthorizer, 
  LambdaIntegration, 
  Model, 
  JsonSchemaType, 
  JsonSchemaVersion,
  RequestValidator,
  Cors
} from 'aws-cdk-lib/aws-apigateway';
import { IUserPool } from 'aws-cdk-lib/aws-cognito';
import { IFunction } from 'aws-cdk-lib/aws-lambda';
import { TableV2 } from 'aws-cdk-lib/aws-dynamodb';

export interface RestApiProps {
  environment: string;
  userPool: IUserPool;
  gameManagementFunction: IFunction;
  getLeaderboardFunction: IFunction;
  gameStateTable: TableV2;
  leaderboardTable: TableV2;
}

export class RestApiConstruct extends Construct {
  public readonly restApi: RestApi;

  constructor(scope: Construct, id: string, props: RestApiProps) {
    super(scope, id);

    this.restApi = new RestApi(this, 'MastermindApi', {
      restApiName: `MastermindApi-${props.environment}`,
      deployOptions: {
        stageName: props.environment,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: Cors.ALL_ORIGINS,
        allowMethods: Cors.ALL_METHODS,
        allowHeaders: Cors.DEFAULT_HEADERS,
      },
    });

    const authorizer = new CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer', {
      cognitoUserPools: [props.userPool],
    });

    const fullValidator = new RequestValidator(this, 'FullRequestValidator', {
      restApi: this.restApi,
      requestValidatorName: `MastermindRequestValidator-${props.environment}`,
      validateRequestBody: true,
      validateRequestParameters: true,
    });

    const parameterValidator = new RequestValidator(this, 'ParameterValidator', {
      restApi: this.restApi,
      requestValidatorName: `GameIdParameterValidator-${props.environment}`,
      validateRequestBody: false,
      validateRequestParameters: true,
    });

    const createGameModel = new Model(this, 'CreateGameModel', {
      restApi: this.restApi,
      schema: {
        schema: JsonSchemaVersion.DRAFT4,
        type: JsonSchemaType.OBJECT,
        properties: {
          difficulty: { type: JsonSchemaType.STRING },
        },
        required: ['difficulty'],
      },
    });

    const errorModel = new Model(this, 'ErrorModel', {
      restApi: this.restApi,
      schema: {
        schema: JsonSchemaVersion.DRAFT4,
        type: JsonSchemaType.OBJECT,
        properties: {
          message: { type: JsonSchemaType.STRING },
          error: { type: JsonSchemaType.STRING },
        },
        required: ['message'],
      },
    });

    const gameIntegration = new LambdaIntegration(props.gameManagementFunction);
    const leaderboardIntegration = new LambdaIntegration(props.getLeaderboardFunction);

    const mastermindResource = this.restApi.root.addResource('mastermind');

    // POST /mastermind - Create Game
    mastermindResource.addMethod('POST', gameIntegration, {
      authorizer,
      requestValidator: fullValidator,
      requestModels: { 'application/json': createGameModel },
      methodResponses: [
        { statusCode: '200', responseModels: { 'application/json': Model.EMPTY_MODEL } },
        { statusCode: '400', responseModels: { 'application/json': errorModel } },
        { statusCode: '401', responseModels: { 'application/json': errorModel } },
        { statusCode: '500', responseModels: { 'application/json': errorModel } },
      ],
    });

    // GET /mastermind - List User Games
    mastermindResource.addMethod('GET', gameIntegration, {
      authorizer,
      requestParameters: {
        'method.request.querystring.difficulty': false,
        'method.request.querystring.limit': false,
        'method.request.querystring.lastEvaluatedKey': false,
      },
      methodResponses: [
        { statusCode: '200', responseModels: { 'application/json': Model.EMPTY_MODEL } },
        { statusCode: '400', responseModels: { 'application/json': errorModel } },
        { statusCode: '401', responseModels: { 'application/json': errorModel } },
        { statusCode: '500', responseModels: { 'application/json': errorModel } },
      ],
    });

    // GET /mastermind/{gameId} - Get Game Details
    const gameIdResource = mastermindResource.addResource('{gameId}');
    gameIdResource.addMethod('GET', gameIntegration, {
      authorizer,
      requestValidator: parameterValidator,
      requestParameters: {
        'method.request.path.gameId': true,
      },
      methodResponses: [
        { statusCode: '200', responseModels: { 'application/json': Model.EMPTY_MODEL } },
        { statusCode: '404', responseModels: { 'application/json': errorModel } },
        { statusCode: '500', responseModels: { 'application/json': errorModel } },
      ],
    });

    // GET /mastermind/leaderboard - Get Leaderboard
    const leaderboardResource = mastermindResource.addResource('leaderboard');
    leaderboardResource.addMethod('GET', leaderboardIntegration, {
      authorizer,
      requestParameters: {
        'method.request.querystring.difficulty': false,
        'method.request.querystring.limit': false,
        'method.request.querystring.lastEvaluatedKey': false,
      },
      methodResponses: [
        { statusCode: '200', responseModels: { 'application/json': Model.EMPTY_MODEL } },
        { statusCode: '500', responseModels: { 'application/json': errorModel } },
      ],
    });
  }
}