import { Resource } from "sst";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";

let client: BedrockRuntimeClient | null = null;

function getClient(): BedrockRuntimeClient {
  if (!client) client = new BedrockRuntimeClient({});
  return client;
}

/**
 * Embed text with Titan v2 (1024 dims — must match the vector(1024)
 * columns and the Bedrock Knowledge Base table). Used for listing
 * indexing and semantic/hybrid search queries.
 */
export async function embedText(text: string): Promise<number[]> {
  const res = await getClient().send(
    new InvokeModelCommand({
      modelId: Resource.Ai.embeddingModelId,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({ inputText: text.slice(0, 8000) }),
    }),
  );
  const body = JSON.parse(new TextDecoder().decode(res.body));
  return body.embedding as number[];
}
