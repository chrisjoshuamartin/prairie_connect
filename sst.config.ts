/// <reference path="./.sst/platform/config.d.ts" />

// SST v4 auto-loads `.env` (and `.env.<stage>`) from the project root
// before evaluating this config. Top-level imports are forbidden in
// sst.config.ts — everything must be a dynamic `await import(...)`
// inside a function.

export default $config({
  app(input) {
    return {
      name: "prairie-connect",
      removal: input?.stage === "production" ? "retain" : "remove",
      home: "aws",
      providers: {
        aws: {
          profile: "wcslra",
          region: "ca-central-1",
        },
      },
    };
  },
  async run() {
    const { database, cluster } = await import("./infra/database");
    const { userPool, userPoolClient } = await import("./infra/auth");
    const { realtime } = await import("./infra/realtime");
    const { corpusBucket } = await import("./infra/storage");
    const { api } = await import("./infra/api");

    return {
      apiUrl: api.url,
      docsUrl: $interpolate`${api.url}/docs`,
      openapiUrl: $interpolate`${api.url}/openapi.json`,
      region: "ca-central-1",
      userPoolId: userPool.id,
      userPoolClientId: userPoolClient.id,
      realtimeEndpoint: realtime.endpoint,
      realtimeAuthorizer: realtime.authorizer,
      corpusBucket: corpusBucket.name,
      databaseHost: cluster.endpoint,
    };
  },
});
