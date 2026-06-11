# Prairie Connect — Frontend Integration Guide

Everything the client app needs to talk to the API. The values referenced as "stack outputs" are printed on deploy and can be shared as a simple config block:

```json
{
  "apiUrl": "https://xxxx.execute-api.ca-central-1.amazonaws.com",
  "region": "ca-central-1",
  "userPoolId": "ca-central-1_XXXXXXX",
  "userPoolClientId": "xxxxxxxxxxxxxxxxxxxxxxxxxx",
  "realtimeEndpoint": "xxxxxxxx-ats.iot.ca-central-1.amazonaws.com"
}
```

## 1. API reference

- Interactive Swagger UI: `{apiUrl}/docs` (click **Authorize**, paste a Cognito JWT, try calls live)
- OpenAPI 3.1 spec: `{apiUrl}/openapi.json`
- Generate a typed client: `npx openapi-typescript {apiUrl}/openapi.json -o src/api-types.ts`

All endpoints are versioned under `/v1/`. Errors are always `{ "error": string }`; validation failures are `422` with an `issues` array.

## 2. Authentication (Cognito)

The API has no `/login` endpoint by design — authenticate **directly against Cognito** with the pool/client ids above, then send the resulting JWT to the API:

```ts
// e.g. with aws-amplify
import { Amplify } from "aws-amplify";
import { signIn, signUp, fetchAuthSession } from "aws-amplify/auth";

Amplify.configure({
  Auth: { Cognito: { userPoolId, userPoolClientId } },
});

await signUp({ username: email, password, options: { userAttributes: { email } } });
await signIn({ username: email, password });

const session = await fetchAuthSession();
const jwt = session.tokens!.idToken!.toString();   // id or access token both work

await fetch(`${apiUrl}/v1/me`, { headers: { Authorization: `Bearer ${jwt}` } });
```

- Sign-up flow: `signUp` → email confirmation code → `confirmSignUp` → `signIn`. The backend creates the user record automatically.
- Tokens last 24h; refresh tokens 30 days (Amplify refreshes automatically).
- Public endpoints (search, directory browse, corridors, route finding) need no token. Sending an **invalid** token to any endpoint returns `401`.

### Sign in with Google

Google login flows through the Cognito hosted UI OAuth endpoints (authorization code + PKCE) — the stack output `googleLoginEnabled` tells you whether it's switched on for the stage, and `authDomain` is the OAuth host. With Amplify it's one extra config block and one call:

```ts
Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId,
      userPoolClientId,
      loginWith: {
        oauth: {
          domain: authDomain,                          // stack output, e.g. prairie-connect-dev.auth.ca-central-1.amazoncognito.com
          scopes: ["openid", "email", "profile"],
          redirectSignIn: ["http://localhost:3000/auth/callback"],
          redirectSignOut: ["http://localhost:3000"],
          responseType: "code",
        },
      },
    },
  },
});

import { signInWithRedirect } from "aws-amplify/auth";
await signInWithRedirect({ provider: "Google" });
```

After the redirect back, `fetchAuthSession()` returns a normal Cognito JWT — **everything downstream (Bearer header, realtime auth, roles) is identical to email/password users**. First Google sign-in auto-creates the user record, same as email sign-up.

Your redirect URLs must be registered server-side. Localhost is pre-registered; tell us your deployed frontend origins and we'll add them (`AUTH_CALLBACK_URLS` / `AUTH_LOGOUT_URLS`).

## 3. Realtime (WebSockets)

Chat replies stream over MQTT-over-WSS (AWS IoT). Get the connection config:

```
GET /v1/realtime/token   (Bearer auth)
→ { endpoint, authorizer, topicPrefix, topics: { notifications, chatPattern } }
```

Connect with any MQTT-over-WebSocket client (e.g. `mqtt` npm package):

```ts
import mqtt from "mqtt";

const cfg = await api.get("/v1/realtime/token");
const client = mqtt.connect(
  `wss://${cfg.endpoint}/mqtt?x-amz-customauthorizer-name=${cfg.authorizer}`,
  {
    username: "",            // ignored
    password: jwt,           // your Cognito JWT — verified by the authorizer
    clientId: `web-${crypto.randomUUID()}`,
    protocolVersion: 5,
  },
);

client.subscribe(cfg.topics.notifications);
client.subscribe(cfg.topics.chatPattern.replace("{conversationId}", conversationId));
```

The authorizer scopes every connection to the user's own topic subtree — you can only subscribe to your own topics. Connections are dropped at token expiry; reconnect with a fresh JWT.

## 4. AI chat + UI actions

```
POST /v1/chat/messages   (Bearer auth)
body: { "conversationId"?: string, "message": string }
→ { conversationId, messageId, message, actions }
```

While the model responds, the conversation topic receives a live stream:

```jsonc
{ "type": "delta",  "text": "Here are grain processors..." }   // token chunks
{ "type": "action", "action": { "type": "show_map", ... } }    // as emitted
{ "type": "done",   "messageId": "..." }
```

The HTTP response carries the **final** text and validated actions — use the stream for typing effects, the response as the source of truth.

### The UI action protocol

`actions` is an array of `{ type, payload }` objects (schema name `UiAction` in the OpenAPI spec). The assistant emits them to drive your UI — render each type however fits your design:

| type | payload | intent |
|---|---|---|
| `show_map` | `{ center: [lng, lat], zoom, layers[] }` | display/refocus the map, enable layers like `corridor:<slug>` |
| `navigate` | `{ path }` | route the user to another page (`/directory`, `/route-finder`, ...) |
| `show_directory_results` | `{ listingIds[], filter? }` | show specific listings or a filtered directory view |
| `draw_route` | `{ routeId? , origin?, destination? }` | draw a shipping route on the map |
| `open_corridor_page` | `{ slug }` | open a corridor detail page |

Unknown action types may be added over time — ignore types you don't handle. Every action the server returns has already been schema-validated.

## 5. Search

```
GET /v1/search?q=grain+processor&sector=agrivalue&lat=52.1&lng=-106.6&radiusKm=50&mode=hybrid
GET /v1/search/suggest?q=gra
```

`mode`: `keyword` (default, full-text + fuzzy), `semantic` (vector similarity), `hybrid` (fused ranking). Hits include `score` and `distanceKm` when geo-filtering.

## 6. Route finder

```
POST /v1/routes/find
body: { origin: { lat, lng }, destination: { lat, lng }, reverse?: boolean }
→ { segments[], totalLengthKm, geometry, nearestOriginNode, nearestDestinationNode }
```

`geometry` is a GeoJSON FeatureCollection — feed it straight to Mapbox/MapLibre. `segments` is the ordered step list (mode, operator, from/to nodes, km) for the itinerary panel. Authenticated users can persist with `POST /v1/routes` (same body + `name`) and list with `GET /v1/routes`.

## 7. Directory & corridors

- `GET /v1/directory` — browse published listings (`sector`, `q`, paging)
- `GET /v1/directory/{idOrSlug}` — one listing
- `POST /v1/directory` (auth) — submit a listing (goes to `pending` until verified)
- `GET /v1/corridors` — corridor list (no geometry)
- `GET /v1/corridors/{slug}` — corridor with GeoJSON geometry for the map
