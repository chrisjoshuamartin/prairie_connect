# Prairie Connect API Platform — Technical Plan

## Overview

Prairie Connect's backend will be built as a standalone, API-first platform on AWS using the SST framework. A separate frontend team will build the client application against this API. The architecture covers: a serverless PostgreSQL database, a documented REST API, Cognito authentication, search, realtime WebSockets, an AI chatbot with retrieval-augmented answers and UI-action triggers, and a rail-network routing engine.

## Architecture at a glance

- Frontend client -> API Gateway (JWT-secured) -> Hono app on Lambda
- Frontend client -> Cognito User Pool directly for sign-up / sign-in
- Frontend client -> AWS IoT Core (MQTT over WebSockets) for realtime updates
- API -> Aurora Serverless v2 PostgreSQL (pgvector, PostGIS, pgRouting, full-text search)
- API -> Amazon Bedrock (chat model + Knowledge Base backed by the same Aurora cluster)

## 1. Repo scaffold (SST v4 monorepo)

- npm workspaces: `packages/core` (database schema/queries, business logic), `packages/functions` (Lambda handlers), `infra/` modules, `sst.config.ts`.
- TypeScript throughout, Vitest for tests, root scripts (`dev`, `deploy`, `db:migrate`).
- README documenting architecture and how the frontend team consumes each service.

## 2. Database — Aurora Serverless v2 (PostgreSQL 16)

- New cluster with the RDS Data API enabled, 0–4 ACU auto-scaling with auto-pause (near-zero cost at idle), credentials in Secrets Manager.
- Drizzle ORM over the Data API (no VPC-bound Lambdas needed).
- Extensions enabled from the first migration: `vector` (pgvector), `postgis`, `pgrouting`, `pg_trgm` — vector search, geospatial, routing, and fuzzy search all live in one database.
- Initial schema: users, organizations, directory listings (marketplace), corridors, rail network nodes/edges, saved routes, chat conversations/messages.

## 3. API layer — Hono on Lambda behind API Gateway v2

- Single Hono application Lambda behind `sst.aws.ApiGatewayV2`: fast cold starts, Express-like routing, centralized middleware for auth, validation, and errors.
- Routes defined with `@hono/zod-openapi`: Zod schemas drive both runtime validation and an auto-generated OpenAPI 3.1 spec, so the docs can never drift from actual behavior.
- Swagger docs for the frontend team:
  - Interactive Swagger UI served at `/docs`, with a Bearer-auth button for pasting Cognito JWTs and testing live against the dev stage.
  - Raw spec at `/openapi.json` for Postman import or typed client generation (`openapi-typescript`, Orval).
  - Chatbot UI-action schemas registered as named OpenAPI components, so the action protocol is documented in the same spec.
  - A checked-in `openapi.json` snapshot so contract changes are visible in pull requests.
- Versioned routes: `/v1/directory`, `/v1/search`, `/v1/corridors`, `/v1/routes`, `/v1/chat`, `/v1/realtime/token`, `/v1/me`.

## 4. Authentication — Cognito as an integrate-able service

- Cognito User Pool + app client (email login, SRP and refresh-token flows).
- The frontend integrates directly with Cognito using the published User Pool ID / Client ID / region (Amplify Auth, `amazon-cognito-identity-js`, or the OAuth hosted UI) — no custom auth API required. The resulting JWT is sent to the API as a Bearer token.
- API Gateway JWT authorizer validates tokens at the gateway; middleware reads claims for role checks (admin, EDO, short-line operator, public).
- A post-confirmation trigger creates the user record in the database.

## 5. Search — Postgres-native now, swappable later

- `/v1/search` backed by weighted full-text search (`tsvector`), trigram fuzzy matching/autocomplete (`pg_trgm`), and PostGIS geo filters (e.g. "processors within 50 km of corridor X").
- A thin `SearchProvider` interface so Algolia or OpenSearch can be slotted in later without touching API routes; an indexer hook fires on listing create/update.
- Hybrid semantic search: pgvector lives in the same database, so keyword results can be merged with embedding-similarity results (reciprocal rank fusion) using the same embeddings the chatbot uses — no second system to operate.

## 6. Realtime — managed WebSockets via AWS IoT Core

- SST Realtime component (MQTT over WSS) with a Lambda authorizer that validates Cognito JWTs; token endpoint at `/v1/realtime/token`.
- Topic scheme: `chat/{conversationId}` (streamed chatbot tokens/actions), `notifications/{userId}`, with room for future live shipping/ETA feeds.
- Frontend uses a standard MQTT-over-WebSocket client; topic scheme and auth handshake are documented for the frontend team.

## 7. AI chatbot — Amazon Bedrock + Knowledge Base on Aurora

- Retrieval-augmented generation: a Bedrock Knowledge Base uses the Aurora cluster (pgvector with HNSW index) as its vector store — officially supported by AWS. An S3 bucket holds corridor docs and rail content as the data source, plus an embedding sync job for database content (listings, corridor summaries).
- `/v1/chat` uses the Bedrock Converse API with tool use (Claude). Responses stream to the client over the realtime channel.

## 8. Chatbot UI-action protocol

The chatbot can trigger frontend functionality through a typed action format. UI capabilities are defined as Bedrock tools the model can call — `show_map`, `navigate`, `show_directory_results`, `draw_route`, `open_corridor_page` — and the API translates tool calls into typed actions returned alongside the text reply:

```json
{
  "message": "Here are grain processors along the Great Western corridor...",
  "actions": [
    { "type": "show_map", "payload": { "center": [-106.6, 52.1], "zoom": 8, "layers": ["corridor:gw"] } },
    { "type": "show_directory_results", "payload": { "listingIds": ["..."], "filter": { "sector": "agrivalue" } } }
  ]
}
```

Action schemas are defined once in Zod, exported as JSON Schema, and included in the OpenAPI spec — the frontend team gets an exact contract and decides how to render each action type. Adding new capabilities means adding a tool and a schema; the protocol itself doesn't change.

## 9. Routing — rail network graph in the database

- Network graph: `rail_nodes` / `rail_edges` tables with PostGIS geometries (short lines, Class I interchanges, ports, transloads) and edge attributes (operator, commodity restrictions, cost weights).
- Pathfinding: pgRouting (Dijkstra / A* / k-shortest-paths) runs directly in Aurora. `/v1/routes/find` takes an origin and destination and returns ordered segments plus GeoJSON geometry for the map. Reverse routing uses swapped direction with market-weighted costs.
- Saved routes: a `saved_routes` table stores computed segment lists and metadata; popular or verified routes get curated flags and can refine cost weights over time.
- First/last mile and geocoding: Amazon Location Service for truck legs (farm to railhead) and address-to-coordinate geocoding — pay-per-request pricing.

## Notes and later phases

- AWS credentials: the project is structured so deployment works as soon as a profile is supplied; schema and handlers can be built and unit-tested before then.
- Later phases: Algolia/OpenSearch layer, live Class I shipping APIs, and the admin CMS UI. The search interface and roles model leave room for all three.
