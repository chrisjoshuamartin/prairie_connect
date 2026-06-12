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
  domains: Record<string, { label: string; tables: string[] }>;
  api: { tags: { name: string; endpoints: ApiEndpoint[] }[] };
}

export type SchemaView = "rail" | "directory" | "platform" | "all" | "api";
