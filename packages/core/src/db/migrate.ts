import { join } from "path";
import { runMigrations } from "./migrator";

// CLI entry point — run via `sst shell` so Resource.Database is bound:
//   npm run db:migrate:dev / db:migrate:production
runMigrations(join(import.meta.dirname, "migrations")).catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
