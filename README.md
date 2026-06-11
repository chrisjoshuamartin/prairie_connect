# Prairie Connect API

API-first backend for the Prairie Connect rail logistics platform — connecting producers, shippers, short line railways, and economic development partners across the Canadian Prairies.

Built with [SST v4](https://sst.dev) on AWS (`ca-central-1`, profile `wcslra`).

## Architecture

| Concern | Implementation |
|---|---|
| API | Hono on Lambda behind API Gateway v2, OpenAPI 3.1 spec auto-generated from Zod route schemas |
| Database | Aurora Serverless v2 PostgreSQL 16 (Data API, 0–4 ACU auto-pause) with pgvector, PostGIS, pgRouting, pg_trgm |
| ORM | Drizzle over the RDS Data API |
| Auth | Cognito User Pool; clients integrate with Cognito directly and send JWTs as Bearer tokens |
| Search | Postgres FTS + trigram + PostGIS geo filters, pgvector semantic/hybrid mode, behind a swappable `SearchProvider` |
| Realtime | AWS IoT Core (MQTT over WSS) with a Cognito JWT custom authorizer |
| AI chat | Bedrock Converse (Claude) with tool-use → typed UI actions; optional Knowledge Base RAG on the same Aurora cluster |
| Routing | pgRouting (Dijkstra) over the `rail_nodes`/`rail_edges` graph |

```
packages/core        DB schema/client, search, chat, routing, realtime helpers
packages/functions   Lambda handlers: the Hono API, Cognito trigger, IoT authorizer
infra/               SST/Pulumi infrastructure modules
scripts/             export-openapi.ts, smoke.ts
docs/                Project docs + frontend integration guide
```

## Getting started

```bash
npm install
npx sst dev          # live-dev against AWS (deploys a personal stage)
npm run deploy       # deploy + run DB migrations
```

Useful scripts:

```bash
npm run db:generate  # drizzle-kit: generate migration from schema changes
npm run db:migrate   # apply migrations (via sst shell)
npm run openapi      # write openapi.json (checked in; visible in PR diffs)
npm test             # unit tests
npm run typecheck
npx tsx scripts/smoke.ts   # local smoke test of the API app, no AWS needed
```

## API docs (Swagger)

- **Interactive docs:** `https://<api-url>/docs` — "Authorize" with a Cognito JWT to test live
- **Raw spec:** `https://<api-url>/openapi.json`, or the checked-in [openapi.json](openapi.json)
- Frontend integration details (auth flow, realtime topics, chatbot UI actions): [docs/frontend-integration.md](docs/frontend-integration.md)

The spec is generated from the same Zod schemas that validate requests at runtime, so it cannot drift from actual behavior. Stack outputs (`apiUrl`, `docsUrl`, `userPoolId`, `userPoolClientId`, `realtimeEndpoint`, ...) are printed after each deploy.

## One-time setup after first deploy

1. **Migrations** — `npm run db:migrate` (creates tables, extensions, indexes, and the `bedrock_integration.bedrock_kb` table).
2. **Bedrock model access** — in the AWS console (Bedrock → Model access, `ca-central-1`), enable Anthropic Claude and Amazon Titan Embeddings v2.
3. **Knowledge Base (optional, enables RAG)** — Bedrock → Knowledge Bases → create with:
   - Data source: the `CorpusBucket` S3 bucket (stack output `corpusBucket`)
   - Embeddings model: Titan Text Embeddings v2 (1024 dims)
   - Vector store: Amazon Aurora — cluster ARN from stack output, database `prairieconnect`, schema `bedrock_integration`, table `bedrock_kb`, mappings: `id` / `embedding` / `chunks` / `metadata` / `custom_metadata`
   - Put the resulting KB id in `.env` as `KNOWLEDGE_BASE_ID=...` and redeploy. Chat works without it (no retrieval grounding).

Environment overrides (`.env`): `CHAT_MODEL_ID`, `EMBEDDING_MODEL_ID`, `KNOWLEDGE_BASE_ID`.

## Seeding the rail network

Route finding needs `rail_nodes` / `rail_edges` rows (corridor geometry, interchanges, ports). Import scripts land in `scripts/` as corridor data becomes available; until then `/v1/routes/find` returns 404 (no route).
