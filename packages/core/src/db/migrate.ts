import { Resource } from "sst";
import {
  RDSDataClient,
  ExecuteStatementCommand,
} from "@aws-sdk/client-rds-data";
import { readdir, readFile } from "fs/promises";
import { join } from "path";

const rdsClient = new RDSDataClient({});

async function sql(statement: string, retries = 10) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await rdsClient.send(
        new ExecuteStatementCommand({
          resourceArn: Resource.Database.clusterArn,
          secretArn: Resource.Database.secretArn,
          database: Resource.Database.database,
          sql: statement,
        }),
      );
    } catch (err: any) {
      if (err.name === "DatabaseResumingException" && attempt < retries) {
        const wait = Math.min(attempt * 5, 30);
        console.log(
          `Aurora is waking up... retrying in ${wait}s (${attempt}/${retries})`,
        );
        await new Promise((r) => setTimeout(r, wait * 1000));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Unreachable");
}

async function migrate() {
  console.log("Running migrations...\n");

  await sql(`CREATE TABLE IF NOT EXISTS _drizzle_migrations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);

  const result = await sql(`SELECT name FROM _drizzle_migrations ORDER BY id`);
  const applied = new Set((result.records ?? []).map((r) => r[0].stringValue!));

  const migrationsDir = join(import.meta.dirname, "migrations");
  let entries: string[];
  try {
    entries = await readdir(migrationsDir);
  } catch {
    console.log("No migrations directory found. Run 'npm run db:generate' first.");
    return;
  }

  const migrationFiles = entries.filter((e) => e.endsWith(".sql")).sort();

  let count = 0;
  for (const file of migrationFiles) {
    if (applied.has(file)) continue;

    const content = await readFile(join(migrationsDir, file), "utf-8");
    console.log(`Applying: ${file}`);

    // Split on the Drizzle statement separator and execute each statement
    const statements = content
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);

    for (const stmt of statements) {
      await sql(stmt);
    }

    await sql(
      `INSERT INTO _drizzle_migrations (name) VALUES ('${file.replace(/'/g, "''")}')`,
    );
    count++;
  }

  if (count === 0) {
    console.log("Database is up to date. No new migrations to apply.");
  } else {
    console.log(`\nApplied ${count} migration(s).`);
  }
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
