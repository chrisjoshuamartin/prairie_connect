/**
 * Document corpus for the AI chatbot's Bedrock Knowledge Base — corridor
 * reports, rail content, PDFs etc. get dropped here and the Knowledge Base
 * ingests them into the Aurora pgvector store.
 */
export const corpusBucket = new sst.aws.Bucket("CorpusBucket");

/**
 * Public-read assets (rail line logos, etc.). Objects under `logos/` are
 * uploaded via presigned PUT from the admin API and served by direct S3 URL.
 */
export const assetsBucket = new sst.aws.Bucket("AssetsBucket", {
  access: "public",
});
