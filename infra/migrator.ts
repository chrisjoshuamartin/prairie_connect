import { readdirSync, readFileSync } from "fs";
import { createHash } from "crypto";
import { join } from "path";
import { database, dbInstance } from "./database";

const MIGRATIONS_DIR = "packages/core/src/db/migrations";

/**
 * Hash of all migration files — the Invocation below re-runs whenever this
 * changes (new or edited migrations), and stays put otherwise so routine
 * deploys don't wake Aurora for nothing.
 */
function migrationsHash(): string {
  const hash = createHash("sha256");
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    hash.update(file).update(readFileSync(join(MIGRATIONS_DIR, file)));
  }
  return hash.digest("hex");
}

export const migrator = new sst.aws.Function("DatabaseMigrator", {
  handler: "packages/functions/src/db/migrator.handler",
  link: [database],
  copyFiles: [{ from: MIGRATIONS_DIR, to: "migrations" }],
  // Generous: covers Aurora resuming from auto-pause plus the migrations.
  timeout: "10 minutes",
  // Always run in AWS, even under `sst dev` — a migration must not depend
  // on the local dev session being attached.
  live: false,
});

/**
 * Runs migrations as part of `sst deploy`. Skipped under `sst dev`, where
 * migrations stay manual (`npm run db:migrate:dev`) so a dev session
 * starting up doesn't mutate the shared dev database unexpectedly.
 */
if (!$dev) {
  new aws.lambda.Invocation(
    "DatabaseMigratorInvocation",
    {
      functionName: migrator.name,
      input: JSON.stringify({}),
      triggers: { migrations: migrationsHash() },
    },
    // The cluster instance must be up before the first invocation on a
    // fresh stage.
    { dependsOn: [dbInstance] },
  );
}
