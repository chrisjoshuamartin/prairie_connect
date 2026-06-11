/** Probe which chat/embedding model ids actually invoke in this region. */
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";

const client = new BedrockRuntimeClient({});

const CHAT_CANDIDATES = [
  "ca.amazon.nova-lite-v1:0",
  "anthropic.claude-3-haiku-20240307-v1:0",
  "anthropic.claude-haiku-4-5-20251001-v1:0",
  "global.anthropic.claude-haiku-4-5-20251001-v1:0",
  "anthropic.claude-sonnet-4-5-20250929-v1:0",
  "global.anthropic.claude-sonnet-4-5-20250929-v1:0",
];

for (const modelId of CHAT_CANDIDATES) {
  try {
    const res = await client.send(
      new ConverseCommand({
        modelId,
        messages: [{ role: "user", content: [{ text: "Say OK." }] }],
        inferenceConfig: { maxTokens: 10 },
      }),
    );
    const text = res.output?.message?.content?.[0]?.text ?? "";
    console.log(`PASS chat  ${modelId}  -> "${text.trim()}"`);
  } catch (err) {
    console.log(`fail chat  ${modelId}  -> ${(err as Error).name}: ${(err as Error).message}`);
  }
}

for (const modelId of ["amazon.titan-embed-text-v2:0", "cohere.embed-english-v3"]) {
  try {
    const body =
      modelId.startsWith("amazon.titan")
        ? { inputText: "hello" }
        : { texts: ["hello"], input_type: "search_document" };
    await client.send(
      new InvokeModelCommand({
        modelId,
        contentType: "application/json",
        body: JSON.stringify(body),
      }),
    );
    console.log(`PASS embed ${modelId}`);
  } catch (err) {
    console.log(`fail embed ${modelId}  -> ${(err as Error).name}: ${(err as Error).message}`);
  }
}
