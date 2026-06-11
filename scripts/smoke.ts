/** Local smoke test of the Hono app — no AWS needed. `npx tsx scripts/smoke.ts` */
import { app } from "../packages/functions/src/api/app";

const health = await app.request("/health");
console.log("health:", health.status, await health.text());

const docs = await app.request("/docs");
console.log("docs:", docs.status, (await docs.text()).slice(0, 50).replace(/\n/g, ""));

const spec = await app.request("/openapi.json");
console.log("openapi.json:", spec.status);

const unauth = await app.request("/v1/chat/messages", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ message: "hi" }),
});
console.log("unauthed chat:", unauth.status, await unauth.text());

const invalid = await app.request("/v1/search");
console.log("invalid search:", invalid.status, await invalid.text());
