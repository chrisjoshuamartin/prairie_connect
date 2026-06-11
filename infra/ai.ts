import { cluster, secretArn } from "./database";
import { corpusBucket } from "./storage";

const CHAT_MODEL_ID =
  process.env.CHAT_MODEL_ID ?? "anthropic.claude-3-5-sonnet-20240620-v1:0";
const EMBEDDING_MODEL_ID =
  process.env.EMBEDDING_MODEL_ID ?? "amazon.titan-embed-text-v2:0";

/**
 * Bedrock Knowledge Base, fully IaC'd — gated behind ENABLE_KNOWLEDGE_BASE
 * because creating the KB requires the `bedrock_integration.bedrock_kb`
 * table to already exist (Bedrock validates connectivity at create time).
 *
 * Bootstrap order for a fresh stage:
 *   1. deploy (without the flag) -> cluster + everything else
 *   2. db:migrate -> creates the vector table
 *   3. set ENABLE_KNOWLEDGE_BASE=true in .env.<stage>, deploy again -> KB
 *
 * Model access (Claude + Titan Embeddings) must be enabled once per account
 * in the Bedrock console — that's the only manual step.
 */
const enableKnowledgeBase = process.env.ENABLE_KNOWLEDGE_BASE === "true";

function createKnowledgeBase() {
  const region = aws.getRegionOutput({});
  const embeddingModelArn = $interpolate`arn:aws:bedrock:${region.name}::foundation-model/${EMBEDDING_MODEL_ID}`;

  const role = new aws.iam.Role("KnowledgeBaseRole", {
    assumeRolePolicy: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: { Service: "bedrock.amazonaws.com" },
          Action: "sts:AssumeRole",
        },
      ],
    }),
  });

  new aws.iam.RolePolicy("KnowledgeBaseRolePolicy", {
    role: role.id,
    policy: $jsonStringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: ["bedrock:InvokeModel"],
          Resource: [embeddingModelArn],
        },
        {
          Effect: "Allow",
          Action: [
            "rds:DescribeDBClusters",
            "rds-data:ExecuteStatement",
            "rds-data:BatchExecuteStatement",
          ],
          Resource: [cluster.arn],
        },
        {
          Effect: "Allow",
          Action: ["secretsmanager:GetSecretValue"],
          Resource: [secretArn],
        },
        {
          Effect: "Allow",
          Action: ["s3:GetObject", "s3:ListBucket"],
          Resource: [corpusBucket.arn, $interpolate`${corpusBucket.arn}/*`],
        },
      ],
    }),
  });

  const knowledgeBase = new aws.bedrock.AgentKnowledgeBase("KnowledgeBase", {
    name: `${$app.name}-${$app.stage}`,
    roleArn: role.arn,
    knowledgeBaseConfiguration: {
      type: "VECTOR",
      vectorKnowledgeBaseConfiguration: {
        embeddingModelArn,
      },
    },
    storageConfiguration: {
      type: "RDS",
      rdsConfiguration: {
        resourceArn: cluster.arn,
        credentialsSecretArn: secretArn,
        databaseName: "prairieconnect",
        tableName: "bedrock_integration.bedrock_kb",
        fieldMapping: {
          primaryKeyField: "id",
          vectorField: "embedding",
          textField: "chunks",
          metadataField: "metadata",
        },
      },
    },
  });

  const dataSource = new aws.bedrock.AgentDataSource("CorpusDataSource", {
    knowledgeBaseId: knowledgeBase.id,
    name: "corpus",
    // Drop chunks from the vector store when their source object is
    // deleted from S3 and a sync runs.
    dataDeletionPolicy: "DELETE",
    dataSourceConfiguration: {
      type: "S3",
      s3Configuration: {
        bucketArn: corpusBucket.arn,
      },
    },
  });

  return { knowledgeBase, dataSource };
}

const kb = enableKnowledgeBase ? createKnowledgeBase() : null;

export const ai = new sst.Linkable("Ai", {
  properties: {
    chatModelId: CHAT_MODEL_ID,
    embeddingModelId: EMBEDDING_MODEL_ID,
    knowledgeBaseId: kb?.knowledgeBase.id ?? "",
    dataSourceId: kb?.dataSource.dataSourceId ?? "",
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
    // Control-plane: drive document ingestion into the vector store.
    sst.aws.permission({
      actions: [
        "bedrock:StartIngestionJob",
        "bedrock:GetIngestionJob",
        "bedrock:ListIngestionJobs",
      ],
      resources: ["*"],
    }),
  ],
});
