/**
 * Export database + API structure for the admin schema visualizer.
 *
 *   npm run schema:export
 */
import { mkdir, readFile, readdir, writeFile } from "fs/promises";
import { join } from "path";

const ROOT = join(import.meta.dirname, "..");
const SCHEMA_DIR = join(ROOT, "packages/core/src/db/schema");
const OUT = join(ROOT, "packages/admin/src/data/schema-graph.json");
const OPENAPI = join(ROOT, "openapi.json");

const COLUMN_TYPE =
  /(\w+):\s*(?:uuid|text|bigserial|bigint|integer|boolean|doublePrecision|jsonb|timestamp|geographyMultiLineString|geographyPoint|geographyLineString|vector1024)\("([^"]+)"\)([\s\S]*?)(?=,\n\s*\w+:|\n\}\s*,|\n\}\s*\))/g;

const DOMAINS: Record<string, { label: string; tables: string[] }> = {
  rail: {
    label: "Rail & corridors",
    tables: ["rail_lines", "corridors", "rail_nodes", "rail_edges"],
  },
  directory: {
    label: "Directory",
    tables: [
      "users",
      "organizations",
      "directory_listings",
      "featured_placements",
      "corridors",
    ],
  },
  platform: {
    label: "Platform",
    tables: [
      "users",
      "conversations",
      "chat_messages",
      "saved_routes",
      "intents",
      "leads",
      "analytics_events",
    ],
  },
};

export interface SchemaColumn {
  name: string;
  dbName: string;
  type: string;
  primaryKey?: boolean;
  unique?: boolean;
  notNull?: boolean;
  references?: string;
}

export interface SchemaTable {
  id: string;
  varName: string;
  columns: SchemaColumn[];
  domains: string[];
}

export interface SchemaEdge {
  id: string;
  from: string;
  to: string;
  label: string;
}

export interface ApiEndpoint {
  method: string;
  path: string;
  summary?: string;
}

export interface SchemaGraph {
  generatedAt: string;
  tables: SchemaTable[];
  edges: SchemaEdge[];
  domains: typeof DOMAINS;
  api: { tags: { name: string; endpoints: ApiEndpoint[] }[] };
}

function extractPgTables(source: string): { varName: string; tableName: string; body: string }[] {
  const tables: { varName: string; tableName: string; body: string }[] = [];
  const re = /export const (\w+) = pgTable\(\s*"([^"]+)"\s*,\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const start = m.index + m[0].length;
    let depth = 1;
    let i = start;
    while (i < source.length && depth > 0) {
      if (source[i] === "{") depth++;
      else if (source[i] === "}") depth--;
      i++;
    }
    tables.push({
      varName: m[1],
      tableName: m[2],
      body: source.slice(start, i - 1),
    });
  }
  return tables;
}

function parseColumns(body: string, varToTable: Map<string, string>): SchemaColumn[] {
  const columns: SchemaColumn[] = [];
  const re = new RegExp(COLUMN_TYPE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const [, name, dbName, tail] = m;
    const typeMatch = m[0].match(
      /:\s*(uuid|text|bigserial|bigint|integer|boolean|doublePrecision|jsonb|timestamp|geographyMultiLineString|geographyPoint|geographyLineString|vector1024)\(/,
    );
    const type = typeMatch?.[1] ?? "unknown";
    const refMatch = tail.match(/\.references\(\(\)\s*=>\s*(\w+)\.id\)/);
    const col: SchemaColumn = {
      name,
      dbName,
      type,
      primaryKey: /\.primaryKey\(\)/.test(tail),
      unique: /\.unique\(\)/.test(tail),
      notNull: /\.notNull\(\)/.test(tail),
    };
    if (refMatch) {
      const target = varToTable.get(refMatch[1]);
      if (target) col.references = target;
    }
    columns.push(col);
  }
  return columns;
}

async function parseDrizzleSchema(): Promise<{
  tables: SchemaTable[];
  edges: SchemaEdge[];
  varToTable: Map<string, string>;
}> {
  const files = (await readdir(SCHEMA_DIR)).filter(
    (f) => f.endsWith(".ts") && f !== "types.ts" && f !== "index.ts",
  );

  const rawTables: { varName: string; tableName: string; body: string }[] = [];
  for (const file of files) {
    const source = await readFile(join(SCHEMA_DIR, file), "utf8");
    rawTables.push(...extractPgTables(source));
  }

  const varToTable = new Map(rawTables.map((t) => [t.varName, t.tableName]));
  const tables: SchemaTable[] = rawTables.map((t) => ({
    id: t.tableName,
    varName: t.varName,
    columns: parseColumns(t.body, varToTable),
    domains: [],
  }));

  const edges: SchemaEdge[] = [];
  for (const table of tables) {
    for (const col of table.columns) {
      if (col.references) {
        edges.push({
          id: `${table.id}.${col.dbName}->${col.references}`,
          from: table.id,
          to: col.references,
          label: col.dbName,
        });
      }
    }
  }

  for (const table of tables) {
    table.domains = Object.entries(DOMAINS)
      .filter(([, d]) => d.tables.includes(table.id))
      .map(([key]) => key);
  }

  return { tables, edges, varToTable };
}

async function parseOpenApi(): Promise<SchemaGraph["api"]> {
  const raw = await readFile(OPENAPI, "utf8");
  const doc = JSON.parse(raw) as {
    paths: Record<string, Record<string, { tags?: string[]; summary?: string }>>;
  };

  const byTag = new Map<string, ApiEndpoint[]>();
  for (const [path, methods] of Object.entries(doc.paths)) {
    for (const [method, op] of Object.entries(methods)) {
      if (method === "parameters") continue;
      const tags = op.tags ?? ["Other"];
      for (const tag of tags) {
        const list = byTag.get(tag) ?? [];
        list.push({
          method: method.toUpperCase(),
          path,
          summary: op.summary,
        });
        byTag.set(tag, list);
      }
    }
  }

  return {
    tags: [...byTag.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, endpoints]) => ({
        name,
        endpoints: endpoints.sort((a, b) => a.path.localeCompare(b.path)),
      })),
  };
}

const { tables, edges } = await parseDrizzleSchema();
const api = await parseOpenApi();

const graph: SchemaGraph = {
  generatedAt: new Date().toISOString(),
  tables: tables.sort((a, b) => a.id.localeCompare(b.id)),
  edges,
  domains: DOMAINS,
  api,
};

await mkdir(join(ROOT, "packages/admin/src/data"), { recursive: true });
await writeFile(OUT, JSON.stringify(graph, null, 2) + "\n");
console.log(
  `Wrote ${OUT} (${tables.length} tables, ${edges.length} FKs, ${api.tags.length} API tags)`,
);
