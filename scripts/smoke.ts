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

const adminNoAuth = await app.request("/v1/admin/knowledge/documents");
console.log("admin knowledge no auth:", adminNoAuth.status, await adminNoAuth.text());

// Map layers is fully static — should work offline.
const layers = await app.request("/v1/map/layers");
const layersBody = (await layers.json()) as { id: string }[];
console.log("map layers:", layers.status, `${layersBody.length} layers:`, layersBody.map((l) => l.id).join(", "));

// Lead with a bad payload should be a structured 422 (no DB hit).
const badLead = await app.request("/v1/leads", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "", email: "not-an-email" }),
});
console.log("invalid lead:", badLead.status, await badLead.text());

// Analytics with an empty batch should also 422 before touching the DB.
const badEvents = await app.request("/v1/analytics/events", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ events: [] }),
});
console.log("invalid analytics:", badEvents.status, await badEvents.text());

// Admin placement/intent writes without a token must 401.
const adminPlacement = await app.request("/v1/admin/placements", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ title: "x" }),
});
console.log("admin placements no auth:", adminPlacement.status, await adminPlacement.text());
