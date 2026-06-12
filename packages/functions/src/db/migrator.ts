import { join } from "path";
import { runMigrations } from "@prairie-connect/core/db/migrator";

/**
 * Deploy-time migration runner. Invoked by an aws.lambda.Invocation during
 * `sst deploy` whenever the migration files change (see infra/migrator.ts).
 * The .sql files are bundled alongside the handler via copyFiles.
 */
export const handler = async () => {
  const { applied } = await runMigrations(join(process.cwd(), "migrations"));
  return { ok: true, applied };
};
