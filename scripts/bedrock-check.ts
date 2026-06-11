/**
 * First-invoke / health check for the Bedrock models the platform uses.
 * Serverless models auto-enable account-wide on first invocation, so this
 * doubles as the "activation" step. Run with:
 *   AWS_PROFILE=wcslra AWS_REGION=ca-central-1 npx tsx scripts/bedrock-check.ts
 */
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";

const CHAT_MODEL_ID =
  process.env.CHAT_MODEL_ID ?? "anthropic.claude-3-5-sonnet-20240620-v1:0";
const EMBEDDING_MODEL_ID =
  process.env.EMBEDDING_MODEL_ID ?? "amazon.titan-embed-text-v2:0";

const client = new BedrockRuntimeClient({});

async function checkEmbeddings() {
  const res = await client.send(
    new InvokeModelCommand({
      modelId: EMBEDDING_MODEL_ID,
      contentType: "application/json",
      body: JSON.stringify({ inputText: "hello prairie connect" }),
    }),
  );
  const body = JSON.parse(new TextDecoder().decode(res.body));
  console.log(`embeddings OK (${EMBEDDING_MODEL_ID}): ${body.embedding.length} dims`);
}

async function checkChat() {
  const res = await client.send(
    new ConverseCommand({
      modelId: CHAT_MODEL_ID,
      messages: [{ role: "user", content: [{ text: "Say OK." }] }],
      inferenceConfig: { maxTokens: 10 },
    }),
  );
  const text = res.output?.message?.content?.[0]?.text ?? "(no text)";
  console.log(`chat OK (${CHAT_MODEL_ID}): "${text.trim()}"`);
}

let failed = false;
for (const [name, fn] of [
  ["embeddings", checkEmbeddings],
  ["chat", checkChat],
] as const) {
  try {
    await fn();
  } catch (err) {
    failed = true;
    console.error(`${name} FAILED:`, (err as Error).name, (err as Error).message);
  }
}
process.exit(failed ? 1 : 0);
