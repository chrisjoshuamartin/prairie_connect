/**
 * Document corpus for the AI chatbot's Bedrock Knowledge Base — corridor
 * reports, rail content, PDFs etc. get dropped here and the Knowledge Base
 * ingests them into the Aurora pgvector store.
 */
export const corpusBucket = new sst.aws.Bucket("CorpusBucket");
