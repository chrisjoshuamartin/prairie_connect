/* This file is overwritten by SST on the first `sst dev`/`sst deploy`.
   Hand-written stand-in so type checking works before the first deploy. */
/* tslint:disable */
/* eslint-disable */

declare module "sst" {
  export interface Resource {
    "Ai": {
      "chatModelId": string
      "embeddingModelId": string
      "knowledgeBaseId": string
      "type": "sst.sst.Linkable"
    }
    "Api": {
      "type": "sst.aws.ApiGatewayV2"
      "url": string
    }
    "CorpusBucket": {
      "name": string
      "type": "sst.aws.Bucket"
    }
    "Database": {
      "clusterArn": string
      "database": string
      "secretArn": string
      "type": "sst.sst.Linkable"
    }
    "Realtime": {
      "authorizer": string
      "endpoint": string
      "type": "sst.aws.Realtime"
    }
    "RealtimePublish": {
      "authorizer": string
      "endpoint": string
      "type": "sst.sst.Linkable"
    }
    "UserPool": {
      "id": string
      "type": "sst.aws.CognitoUserPool"
    }
    "WebClient": {
      "id": string
      "secret": string
      "type": "sst.aws.CognitoUserPoolClient"
    }
  }
}

export {};
