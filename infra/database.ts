export const vpc = new sst.aws.Vpc("Vpc");

const subnetGroup = new aws.rds.SubnetGroup("DatabaseSubnetGroup", {
  name: `${$app.name}-${$app.stage}-db-subnet-group`,
  subnetIds: vpc.privateSubnets,
});

const securityGroup = new aws.ec2.SecurityGroup("DatabaseSg", {
  vpcId: vpc.id,
  description: "Aurora Serverless v2",
  ingress: [
    {
      protocol: "tcp",
      fromPort: 5432,
      toPort: 5432,
      cidrBlocks: [vpc.nodes.vpc.cidrBlock],
    },
  ],
  egress: [
    {
      protocol: "-1",
      fromPort: 0,
      toPort: 0,
      cidrBlocks: ["0.0.0.0/0"],
    },
  ],
});

export const cluster = new aws.rds.Cluster(
  "DatabaseCluster",
  {
    engine: "aurora-postgresql",
    engineVersion: "16.11",
    engineMode: "provisioned",
    databaseName: "prairieconnect",
    masterUsername: "postgres",
    manageMasterUserPassword: true,
    // Data API — required for Drizzle's aws-data-api driver AND for using
    // this cluster as a Bedrock Knowledge Base vector store.
    enableHttpEndpoint: true,
    dbSubnetGroupName: subnetGroup.name,
    vpcSecurityGroupIds: [securityGroup.id],
    serverlessv2ScalingConfiguration: {
      minCapacity: 0,
      maxCapacity: 4,
      secondsUntilAutoPause: 3600,
    },
    skipFinalSnapshot: $app.stage !== "production",
  },
  {
    // AWS auto-upgrades Aurora minor versions during maintenance windows.
    // Ignore drift on engineVersion so refresh/deploy don't try to downgrade.
    ignoreChanges: ["engineVersion"],
  },
);

export const dbInstance = new aws.rds.ClusterInstance(
  "DatabaseInstance",
  {
    clusterIdentifier: cluster.id,
    instanceClass: "db.serverless",
    engine: "aurora-postgresql",
    engineVersion: cluster.engineVersion,
    publiclyAccessible: false,
  },
  {
    ignoreChanges: ["engineVersion"],
  },
);

export const secretArn = cluster.masterUserSecrets.apply(
  (secrets) => secrets![0].secretArn!,
);

export const database = new sst.Linkable("Database", {
  properties: {
    clusterArn: cluster.arn,
    secretArn,
    database: "prairieconnect",
  },
  include: [
    sst.aws.permission({
      actions: ["rds-data:*"],
      resources: [cluster.arn],
    }),
    sst.aws.permission({
      actions: ["secretsmanager:GetSecretValue"],
      resources: [secretArn],
    }),
  ],
});
