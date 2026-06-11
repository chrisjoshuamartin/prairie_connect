/**
 * Bedrock configuration + permissions, exposed to handlers as Resource.Ai.
 *
 * `knowledgeBaseId` is empty until the Bedrock Knowledge Base is created
 * (one-time setup against the Aurora cluster — see README). Chat falls back
 * to tool-use-only (no RAG retrieval) when it's unset, so the API works
 * end-to-end before the KB exists.
 */
export const ai = new sst.Linkable("Ai", {
  properties: {
    chatModelId:
      process.env.CHAT_MODEL_ID ?? "anthropic.claude-3-5-sonnet-20240620-v1:0",
    embeddingModelId:
      process.env.EMBEDDING_MODEL_ID ?? "amazon.titan-embed-text-v2:0",
    knowledgeBaseId: process.env.KNOWLEDGE_BASE_ID ?? "",
  },
  include: [
    sst.aws.permission({
      actions: [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream",
        "bedrock:Retrieve",
      ],
      resources: ["*"],
    }),
  ],
});
