/** List Bedrock models + inference profiles available in this region. */
import {
  BedrockClient,
  ListFoundationModelsCommand,
  ListInferenceProfilesCommand,
} from "@aws-sdk/client-bedrock";

const client = new BedrockClient({});

const models = await client.send(new ListFoundationModelsCommand({}));
console.log("=== Foundation models (TEXT/EMBEDDING, ON_DEMAND or INFERENCE_PROFILE) ===");
for (const m of models.modelSummaries ?? []) {
  const out = m.outputModalities?.join(",");
  if (out !== "TEXT" && out !== "EMBEDDING") continue;
  console.log(
    `${m.modelId}  [${out}]  inference=${m.inferenceTypesSupported?.join(",")}  lifecycle=${m.modelLifecycle?.status}`,
  );
}

console.log("\n=== Inference profiles ===");
const profiles = await client.send(new ListInferenceProfilesCommand({ maxResults: 100 }));
for (const p of profiles.inferenceProfileSummaries ?? []) {
  console.log(`${p.inferenceProfileId}  status=${p.status}`);
}
