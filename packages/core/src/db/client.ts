import { Resource } from "sst";
import { drizzle } from "drizzle-orm/aws-data-api/pg";
import { RDSDataClient } from "@aws-sdk/client-rds-data";
import * as schema from "./schema/index";
import { isAuroraWakingError } from "./wake";

/**
 * Aurora Serverless v2 auto-pauses when idle (ACU min = 0). The first query
 * after a pause throws `DatabaseResumingException` and the cluster takes
 * ~15-30s to wake. The AWS SDK's built-in retry policy treats this as a
 * client error and gives up too quickly, so we add our own.
 *
 * SHORT profile in Lambda (requests must fit inside API Gateway's 30s
 * timeout), LONG for hand-run scripts (migrate, seed) which would rather
 * wait through the full cold start. Override with
 * DB_RESUME_RETRY_PROFILE=short|long.
 */
const RETRY_PROFILES = {
  short: [2000, 4000, 8000],
  long: [2000, 4000, 8000, 12000, 12000],
} as const;

function pickRetryProfile(): readonly number[] {
  const override = process.env.DB_RESUME_RETRY_PROFILE;
  if (override === "short" || override === "long") {
    return RETRY_PROFILES[override];
  }
  const inLambda = !!process.env.AWS_LAMBDA_FUNCTION_NAME;
  return inLambda ? RETRY_PROFILES.short : RETRY_PROFILES.long;
}

type Db = ReturnType<typeof createDb>;

// `Resource.Database` is only dereferenced inside createDb(), which runs on
// first query — so this module stays importable outside an SST context
// (unit tests, the OpenAPI export script).
function createDb() {
  const backoffs = pickRetryProfile();
  const rdsClient = new RDSDataClient({
    maxAttempts: 8,
    retryMode: "adaptive",
  });

  rdsClient.middlewareStack.add(
    (next) => async (args) => {
      let lastErr: unknown;
      for (let attempt = 0; attempt <= backoffs.length; attempt++) {
        try {
          return await next(args);
        } catch (err: unknown) {
          if (!isAuroraWakingError(err) || attempt === backoffs.length) {
            throw err;
          }
          const delay = backoffs[attempt];
          console.log(
            `[db] Aurora is resuming, retrying in ${delay}ms (attempt ${attempt + 1}/${backoffs.length})`,
          );
          await new Promise((r) => setTimeout(r, delay));
          lastErr = err;
        }
      }
      throw lastErr;
    },
    { step: "finalizeRequest", name: "auroraResumeRetry", priority: "high" },
  );

  return drizzle(rdsClient, {
    database: Resource.Database.database,
    secretArn: Resource.Database.secretArn,
    resourceArn: Resource.Database.clusterArn,
    schema,
  });
}

let _db: Db | null = null;

export function getDb(): Db {
  if (!_db) _db = createDb();
  return _db;
}
