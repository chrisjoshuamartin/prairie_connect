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

## Stages

Two long-lived stages, both in account `730335564302` (profile `wcslra`, `ca-central-1`):

| Stage | Purpose | Notes |
|---|---|---|
| `dev` | Shared development + frontend integration | Torn down freely; `sst dev` runs here |
| `production` | Live | `removal: retain` + `protect` guard against accidental teardown |

All scripts are stage-explicit, so nothing ever deploys to an unexpected personal stage.

## Local development & testing

There are two levels of "local", smallest blast radius first.

### 1. Fully offline — no AWS, no deploy (start here)

The API app, request validation, auth rejection, routing, and the OpenAPI/Swagger
generation all run on your machine with zero AWS:

```bash
npm install
npm test          # unit tests (UI action protocol, realtime authorizer)
npm run smoke     # boots the Hono app in-process and hits real routes
npm run openapi   # regenerate openapi.json
npm run typecheck
```

`npm run smoke` exercises `/health`, `/docs`, `/openapi.json`, and confirms auth +
validation behavior. Anything that touches the database, Cognito, Bedrock, or IoT
won't run here (no `Resource` bindings) — that's what stage `dev` is for.

### 2. Live dev against the `dev` stage (Live Lambda)

`sst dev` provisions the `dev` stage's infra on AWS **once**, then runs your handler
code locally — edit a file and the next request uses it instantly, with breakpoints
and real logs. This is how you test anything hitting the DB / Cognito / Bedrock.

```bash
npm run dev              # sst dev --stage dev  (first run provisions infra, ~10 min)
# ...in another terminal, once it prints the Api URL:
npm run db:migrate:dev   # apply migrations to the dev database
```

Hit the printed `Api` URL (e.g. open `<apiUrl>/docs`). The first request after idle
takes ~15-30s while Aurora resumes from auto-pause; subsequent ones are fast.

> Note: SST v4 has no fully-offline cloud emulator — `sst dev` is the intended local
> workflow and it needs the `dev` stage's resources to exist in AWS. Use level 1 for
> anything that doesn't require live AWS services.

## Deploying

```bash
npm run deploy:dev          # deploy + migrate the dev stage
npm run deploy:production    # deploy + migrate production (protected stage)
```

Other scripts:

```bash
npm run db:generate          # drizzle-kit: generate a migration from schema changes
npm run db:migrate:dev       # apply migrations to dev
npm run db:migrate:production # apply migrations to production
npm run remove:dev           # tear down the dev stage
```

## API docs (Swagger)

- **Interactive docs:** `https://<api-url>/docs` — "Authorize" with a Cognito JWT to test live
- **Raw spec:** `https://<api-url>/openapi.json`, or the checked-in [openapi.json](openapi.json)
- Frontend integration details (auth flow, realtime topics, chatbot UI actions): [docs/frontend-integration.md](docs/frontend-integration.md)

The spec is generated from the same Zod schemas that validate requests at runtime, so it cannot drift from actual behavior. Stack outputs (`apiUrl`, `docsUrl`, `userPoolId`, `userPoolClientId`, `realtimeEndpoint`, ...) are printed after each deploy.

## One-time setup after first deploy

Run these per stage (`:dev` shown; use `:production` for prod):

1. **Migrations** — `npm run db:migrate:dev` (creates tables, extensions, indexes, and the `bedrock_integration.bedrock_kb` table).
2. **Bedrock model access** — in the AWS console (Bedrock → Model access, `ca-central-1`), enable Anthropic Claude and Amazon Titan Text Embeddings v2. Account-wide one-time step — the **only** manual Bedrock step.
3. **Knowledge Base (enables RAG)** — fully IaC'd, but gated behind a flag because Bedrock validates the vector table at creation time (so it can't exist before migrations have run). After step 1, set in `.env.dev`:

   ```
   ENABLE_KNOWLEDGE_BASE=true
   ```

   and run `npm run deploy:dev` again. This creates the Knowledge Base, its IAM role, and the S3 data source, and wires `knowledgeBaseId` / `dataSourceId` into the API automatically — no console steps, no ids to copy. Chat works without it (no retrieval grounding); the knowledge `sync` endpoints return `409` until it's enabled.

Environment overrides are read from `.env` and the per-stage `.env.<stage>` (e.g. `.env.dev`, `.env.production`), which SST auto-loads: `ENABLE_KNOWLEDGE_BASE`, `CHAT_MODEL_ID`, `EMBEDDING_MODEL_ID`. These files are gitignored.

## Knowledge base content workflow

The chatbot answers are grounded in documents stored in the S3 corpus bucket and ingested into the Aurora pgvector store by Bedrock. Admin-only endpoints (`role = admin`) manage this:

| Endpoint | Purpose |
|---|---|
| `POST /v1/admin/knowledge/text` | Add an authored text snippet (stored as markdown) |
| `POST /v1/admin/knowledge/uploads` | Get a presigned URL to upload a file (PDF, docx, txt, md) |
| `GET /v1/admin/knowledge/documents` | List corpus documents (optional `prefix`) |
| `DELETE /v1/admin/knowledge/documents?key=...` | Remove a document |
| `POST /v1/admin/knowledge/sync` | Start a Bedrock ingestion job (chunk + embed into the vector store) |
| `GET /v1/admin/knowledge/sync/{jobId}` | Poll ingestion status |
| `POST /v1/admin/knowledge/sync-platform` | Export live platform data (corridors + published listings) into the corpus, then ingest (`?ingest=false` to export only) |

Typical flow: add/upload one or more documents → call `sync` once → poll the job until `COMPLETE`. New/changed/removed documents are only reflected in chat answers after a successful sync. The ingestion endpoints return `409` until `ENABLE_KNOWLEDGE_BASE` is on; document upload/list/delete work immediately (they're just S3).

`sync-platform` keeps the chatbot current on the platform's own data: it mirrors every corridor and published directory listing into `platform/` as markdown (with metadata sidecars for filtering), removes docs for unpublished/deleted entities, and kicks off ingestion. Re-run it after meaningful content changes — e.g. weekly, or after a batch of listings is verified.

## Guided pathways, placements, leads, analytics, map layers

Endpoints supporting the curated prototype experience (all public unless noted):

| Endpoint | Purpose |
|---|---|
| `GET /v1/intents` | The "I want to..." guided pathways (move goods by rail, find a transload site, ...). Each carries default filters, suggested search terms, a destination page, CTAs, and AI starter prompts — basic navigation never burns AI tokens. |
| `GET /v1/intents/{slug}` | One pathway page with resolved content: copy, guided questions, related corridors, related listings, curated routes, and featured placements targeted at the intent. |
| `PUT/DELETE /v1/admin/intents/{slug}` | (admin) Curate pathways without a deploy. The 7 launch pathways are seeded by migration; seeds never overwrite admin edits. |
| `GET /v1/featured-placements` | Premium listings / corridor sponsors / featured partners for a surface. Filter with `?page=&sector=&region=&corridor=&intent=&listingType=`; placements that don't target a dimension match anything for it. Ordered by `weight`. |
| `GET/POST/PATCH/DELETE /v1/admin/placements` | (admin) Manage placement inventory, including targeting, scheduling (`startsAt`/`endsAt`), and weight. |
| `POST /v1/leads` | Inquiry capture for every contact CTA. Anonymous-friendly; attributed to the user when a Bearer token is present. |
| `GET /v1/admin/leads`, `PATCH /v1/admin/leads/{id}` | (admin) Review captured leads, move them through `new → contacted → qualified → closed`. |
| `POST /v1/analytics/events` | Batched product analytics (1-50 events/call). Open vocabulary (`intent_selected`, `search_performed`, `ai_prompt_used`, ...) with a free-form `payload` and client `sessionId`. |
| `GET /v1/map/layers` | Code-defined registry of map layers (short lines, Class I, interchanges, ports, transloads, development sites, ...). Layers report `available` or `planned` so the frontend stays config-driven. |

## Seeding the rail network

Route finding needs `rail_nodes` / `rail_edges` rows (corridor geometry, interchanges, ports). Import scripts land in `scripts/` as corridor data becomes available; until then `/v1/routes/find` returns 404 (no route).
