/**
 * Write the OpenAPI spec to openapi.json at the repo root. Checked in so
 * API contract changes are visible in PR diffs; the deployed API also
 * serves it live at /openapi.json.
 *
 *   npm run openapi
 */
import { writeFile } from "fs/promises";
import { join } from "path";
import { app, openApiConfig } from "../packages/functions/src/api/app";

const doc = app.getOpenAPI31Document(openApiConfig);
const out = join(import.meta.dirname, "..", "openapi.json");
await writeFile(out, JSON.stringify(doc, null, 2) + "\n");
console.log(`Wrote ${out}`);
