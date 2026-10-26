import type { NodeConfig, NodeKind } from '@/core';

/**
 * Cloud services, drawn with each provider's official architecture icon (in public/cloud/),
 * and mapped to the built-in behaviour the simulator should use for them.
 *
 * The icon terms require the full service name next to the icon and the icon to represent that
 * service only, unmodified: so `name` is the full name and these icons are never recoloured.
 */
export type CloudProvider = 'aws' | 'azure' | 'gcp';

export interface CloudService {
  /** Stable id stored in designs as `appearance.icon = "cloud:<id>"`. */
  id: string;
  provider: CloudProvider;
  /** Full official name, shown as the component's type. */
  name: string;
  /** Short default label for the component. */
  short: string;
  kind: NodeKind;
  config?: Partial<NodeConfig>;
  /** Extra search words. */
  tags?: string;
}

export const PROVIDER_LABEL: Record<CloudProvider, string> = { aws: 'AWS', azure: 'Azure', gcp: 'Google Cloud' };

/** Managed services scale themselves; model that as autoscaling with a short warm-up. */
const managed = (min: number, max: number, warmupSeconds = 20) => ({ enabled: true, min, max, targetUtilization: 0.65, warmupSeconds });
const fn = (min = 2, max = 50): Partial<NodeConfig> => ({
  replicas: Math.max(min, 2),
  capacityPerReplica: 1000,
  baseLatencyMs: 25,
  circuitBreaker: true,
  autoscale: managed(min, max, 3),
});
// Managed streams replicate across zones, so two replicas.
const stream: Partial<NodeConfig> = { replicas: 2, capacityPerReplica: 200_000, maxQueueDepth: 2_000_000, baseLatencyMs: 8 };
const objectStore: Partial<NodeConfig> = { replicas: 3, capacityPerReplica: 25_000, baseLatencyMs: 25, failoverSeconds: 5 };
const warehouse: Partial<NodeConfig> = { replicas: 2, capacityPerReplica: 3000, baseLatencyMs: 120, failoverSeconds: 30 };
const kv: Partial<NodeConfig> = { replicas: 3, capacityPerReplica: 15_000, baseLatencyMs: 6, failoverSeconds: 5 };
const sql: Partial<NodeConfig> = { replicas: 2, capacityPerReplica: 4000, baseLatencyMs: 8, failoverSeconds: 30 };
const batch: Partial<NodeConfig> = { replicas: 3, capacityPerReplica: 600, baseLatencyMs: 150, autoscale: managed(2, 20, 60) };
const query: Partial<NodeConfig> = { replicas: 2, capacityPerReplica: 800, baseLatencyMs: 600, autoscale: managed(2, 20) };
const dash: Partial<NodeConfig> = { replicas: 2, capacityPerReplica: 1500, baseLatencyMs: 80, autoscale: managed(2, 10) };
/** Stream processors receive the whole stream, so they start with headroom. */
const streamProc: Partial<NodeConfig> = { replicas: 5, capacityPerReplica: 1000, baseLatencyMs: 20, autoscale: managed(5, 30, 15) };
const mlEndpoint: Partial<NodeConfig> = { replicas: 2, capacityPerReplica: 500, baseLatencyMs: 90, autoscale: managed(2, 10) };
const llm: Partial<NodeConfig> = { capacityPerReplica: 400, baseLatencyMs: 1200, errorRate: 0.01 };

export const CLOUD_SERVICES: CloudService[] = [
  // ---------------------------------------------------------------- AWS
  { id: 'aws-iot-core', provider: 'aws', name: 'AWS IoT Core', short: 'IoT Core', kind: 'load_balancer', config: { replicas: 2, capacityPerReplica: 50_000 }, tags: 'mqtt devices ingestion' },
  { id: 'aws-kinesis', provider: 'aws', name: 'Amazon Kinesis Data Streams', short: 'Kinesis', kind: 'queue', config: stream, tags: 'stream ingestion' },
  { id: 'aws-msk', provider: 'aws', name: 'Amazon Managed Streaming for Apache Kafka', short: 'MSK', kind: 'queue', config: stream, tags: 'kafka stream' },
  { id: 'aws-sqs', provider: 'aws', name: 'Amazon Simple Queue Service', short: 'SQS', kind: 'queue', tags: 'queue' },
  { id: 'aws-sns', provider: 'aws', name: 'Amazon Simple Notification Service', short: 'SNS', kind: 'queue', tags: 'pubsub fanout' },
  { id: 'aws-eventbridge', provider: 'aws', name: 'Amazon EventBridge', short: 'EventBridge', kind: 'queue', tags: 'events bus' },
  { id: 'aws-lambda', provider: 'aws', name: 'AWS Lambda', short: 'Lambda', kind: 'api_server', config: fn(), tags: 'serverless function' },
  { id: 'aws-ec2', provider: 'aws', name: 'Amazon EC2', short: 'EC2', kind: 'api_server', config: { replicas: 3 }, tags: 'vm compute' },
  { id: 'aws-ecs', provider: 'aws', name: 'Amazon Elastic Container Service', short: 'ECS', kind: 'api_server', config: { replicas: 3 }, tags: 'containers' },
  { id: 'aws-eks', provider: 'aws', name: 'Amazon Elastic Kubernetes Service', short: 'EKS', kind: 'api_server', config: { replicas: 3 }, tags: 'kubernetes' },
  { id: 'aws-fargate', provider: 'aws', name: 'AWS Fargate', short: 'Fargate', kind: 'api_server', config: fn(2, 40), tags: 'containers serverless' },
  { id: 'aws-api-gateway', provider: 'aws', name: 'Amazon API Gateway', short: 'API Gateway', kind: 'load_balancer', config: { replicas: 2, baseLatencyMs: 8 }, tags: 'api' },
  { id: 'aws-elb', provider: 'aws', name: 'Elastic Load Balancing', short: 'Load Balancer', kind: 'load_balancer', config: { replicas: 2 }, tags: 'alb nlb' },
  { id: 'aws-cloudfront', provider: 'aws', name: 'Amazon CloudFront', short: 'CloudFront', kind: 'cdn', tags: 'cdn edge' },
  { id: 'aws-s3', provider: 'aws', name: 'Amazon Simple Storage Service (S3)', short: 'S3', kind: 'database', config: objectStore, tags: 'object storage data lake' },
  { id: 'aws-glacier', provider: 'aws', name: 'Amazon S3 Glacier', short: 'Glacier', kind: 'database', config: { ...objectStore, baseLatencyMs: 300 }, tags: 'archive' },
  { id: 'aws-glue', provider: 'aws', name: 'AWS Glue', short: 'Glue ETL', kind: 'worker', config: batch, tags: 'etl' },
  { id: 'aws-emr', provider: 'aws', name: 'Amazon EMR', short: 'EMR', kind: 'worker', config: batch, tags: 'spark hadoop' },
  { id: 'aws-flink', provider: 'aws', name: 'Amazon Managed Service for Apache Flink', short: 'Managed Flink', kind: 'worker', config: streamProc, tags: 'kinesis analytics stream processing' },
  { id: 'aws-sagemaker', provider: 'aws', name: 'Amazon SageMaker AI', short: 'SageMaker', kind: 'api_server', config: mlEndpoint, tags: 'ml model' },
  { id: 'aws-bedrock', provider: 'aws', name: 'Amazon Bedrock', short: 'Bedrock', kind: 'external_api', config: llm, tags: 'llm ai genai' },
  { id: 'aws-redshift', provider: 'aws', name: 'Amazon Redshift', short: 'Redshift', kind: 'database', config: warehouse, tags: 'warehouse' },
  { id: 'aws-rds', provider: 'aws', name: 'Amazon RDS', short: 'RDS', kind: 'database', config: sql, tags: 'postgres mysql sql' },
  { id: 'aws-aurora', provider: 'aws', name: 'Amazon Aurora', short: 'Aurora', kind: 'database', config: { ...sql, failoverSeconds: 15 }, tags: 'postgres mysql sql' },
  { id: 'aws-dynamodb', provider: 'aws', name: 'Amazon DynamoDB', short: 'DynamoDB', kind: 'database', config: kv, tags: 'nosql key value' },
  { id: 'aws-opensearch', provider: 'aws', name: 'Amazon OpenSearch Service', short: 'OpenSearch', kind: 'database', config: { replicas: 3, capacityPerReplica: 3000, baseLatencyMs: 20, failoverSeconds: 10 }, tags: 'search elasticsearch' },
  { id: 'aws-elasticache', provider: 'aws', name: 'Amazon ElastiCache', short: 'ElastiCache', kind: 'cache', tags: 'redis memcached cache' },
  { id: 'aws-athena', provider: 'aws', name: 'Amazon Athena', short: 'Athena', kind: 'api_server', config: query, tags: 'sql query' },
  { id: 'aws-quick', provider: 'aws', name: 'Amazon Quick Suite (Quick Sight)', short: 'Quick Sight', kind: 'api_server', config: dash, tags: 'quicksight bi dashboard' },
  { id: 'aws-step-functions', provider: 'aws', name: 'AWS Step Functions', short: 'Step Functions', kind: 'worker', config: { autoscale: managed(2, 20) }, tags: 'workflow orchestration' },
  { id: 'aws-cognito', provider: 'aws', name: 'Amazon Cognito', short: 'Cognito', kind: 'api_server', config: { replicas: 2, baseLatencyMs: 30 }, tags: 'auth identity' },

  // ---------------------------------------------------------------- Azure
  { id: 'azure-iot-hub', provider: 'azure', name: 'Azure IoT Hub', short: 'IoT Hub', kind: 'load_balancer', config: { replicas: 2, capacityPerReplica: 50_000 }, tags: 'devices ingestion' },
  { id: 'azure-event-hubs', provider: 'azure', name: 'Azure Event Hubs', short: 'Event Hubs', kind: 'queue', config: stream, tags: 'stream kafka' },
  { id: 'azure-service-bus', provider: 'azure', name: 'Azure Service Bus', short: 'Service Bus', kind: 'queue', tags: 'queue' },
  { id: 'azure-event-grid', provider: 'azure', name: 'Azure Event Grid', short: 'Event Grid', kind: 'queue', tags: 'events' },
  { id: 'azure-functions', provider: 'azure', name: 'Azure Functions', short: 'Functions', kind: 'api_server', config: fn(), tags: 'serverless' },
  { id: 'azure-app-service', provider: 'azure', name: 'Azure App Service', short: 'App Service', kind: 'api_server', config: { replicas: 3 }, tags: 'web app' },
  { id: 'azure-aks', provider: 'azure', name: 'Azure Kubernetes Service', short: 'AKS', kind: 'api_server', config: { replicas: 3 }, tags: 'kubernetes' },
  { id: 'azure-vm', provider: 'azure', name: 'Azure Virtual Machines', short: 'Virtual Machine', kind: 'api_server', config: { replicas: 2 }, tags: 'vm compute' },
  { id: 'azure-logic-apps', provider: 'azure', name: 'Azure Logic Apps', short: 'Logic Apps', kind: 'worker', config: { autoscale: managed(2, 20) }, tags: 'workflow' },
  { id: 'azure-api-management', provider: 'azure', name: 'Azure API Management', short: 'API Management', kind: 'load_balancer', config: { replicas: 2, baseLatencyMs: 10 }, tags: 'api gateway' },
  { id: 'azure-load-balancer', provider: 'azure', name: 'Azure Load Balancer', short: 'Load Balancer', kind: 'load_balancer', config: { replicas: 2 }, tags: 'lb' },
  { id: 'azure-app-gateway', provider: 'azure', name: 'Azure Application Gateway', short: 'App Gateway', kind: 'load_balancer', config: { replicas: 2 }, tags: 'waf l7' },
  { id: 'azure-front-door', provider: 'azure', name: 'Azure Front Door', short: 'Front Door', kind: 'cdn', tags: 'cdn edge' },
  { id: 'azure-storage', provider: 'azure', name: 'Azure Data Lake Storage (Storage account)', short: 'Data Lake Storage', kind: 'database', config: objectStore, tags: 'blob adls data lake' },
  { id: 'azure-data-factory', provider: 'azure', name: 'Azure Data Factory', short: 'Data Factory', kind: 'worker', config: batch, tags: 'etl pipelines' },
  { id: 'azure-databricks', provider: 'azure', name: 'Azure Databricks', short: 'Databricks', kind: 'worker', config: batch, tags: 'spark' },
  { id: 'azure-stream-analytics', provider: 'azure', name: 'Azure Stream Analytics', short: 'Stream Analytics', kind: 'worker', config: streamProc, tags: 'stream processing' },
  { id: 'azure-data-explorer', provider: 'azure', name: 'Azure Data Explorer', short: 'Data Explorer', kind: 'worker', config: { replicas: 2, capacityPerReplica: 1500, baseLatencyMs: 40, autoscale: managed(2, 10) }, tags: 'kusto analytics' },
  { id: 'azure-machine-learning', provider: 'azure', name: 'Azure Machine Learning', short: 'Azure ML', kind: 'api_server', config: mlEndpoint, tags: 'ml' },
  { id: 'azure-openai', provider: 'azure', name: 'Azure OpenAI in Foundry Models', short: 'Azure OpenAI', kind: 'external_api', config: llm, tags: 'llm ai' },
  { id: 'azure-synapse', provider: 'azure', name: 'Azure Synapse Analytics', short: 'Synapse', kind: 'database', config: warehouse, tags: 'warehouse' },
  { id: 'azure-sql-database', provider: 'azure', name: 'Azure SQL Database', short: 'Azure SQL', kind: 'database', config: sql, tags: 'sql' },
  { id: 'azure-cosmos-db', provider: 'azure', name: 'Azure Cosmos DB', short: 'Cosmos DB', kind: 'database', config: kv, tags: 'nosql' },
  { id: 'azure-redis', provider: 'azure', name: 'Azure Cache for Redis', short: 'Azure Redis', kind: 'cache', tags: 'redis cache' },
  { id: 'azure-power-bi', provider: 'azure', name: 'Power BI Embedded', short: 'Power BI', kind: 'api_server', config: dash, tags: 'bi dashboard' },

  // ---------------------------------------------------------------- Google Cloud
  { id: 'gcp-pubsub', provider: 'gcp', name: 'Pub/Sub', short: 'Pub/Sub', kind: 'queue', config: stream, tags: 'stream events ingestion' },
  { id: 'gcp-eventarc', provider: 'gcp', name: 'Eventarc', short: 'Eventarc', kind: 'queue', tags: 'events' },
  { id: 'gcp-tasks', provider: 'gcp', name: 'Cloud Tasks', short: 'Cloud Tasks', kind: 'queue', tags: 'queue' },
  { id: 'gcp-cloud-functions', provider: 'gcp', name: 'Cloud Run functions', short: 'Cloud Functions', kind: 'api_server', config: fn(), tags: 'serverless function' },
  { id: 'gcp-cloud-run', provider: 'gcp', name: 'Cloud Run', short: 'Cloud Run', kind: 'api_server', config: fn(1, 100), tags: 'containers serverless' },
  { id: 'gcp-gke', provider: 'gcp', name: 'Google Kubernetes Engine', short: 'GKE', kind: 'api_server', config: { replicas: 3 }, tags: 'kubernetes' },
  { id: 'gcp-compute-engine', provider: 'gcp', name: 'Compute Engine', short: 'Compute Engine', kind: 'api_server', config: { replicas: 2 }, tags: 'vm' },
  { id: 'gcp-load-balancing', provider: 'gcp', name: 'Cloud Load Balancing', short: 'Load Balancing', kind: 'load_balancer', config: { replicas: 2 }, tags: 'lb' },
  { id: 'gcp-api-gateway', provider: 'gcp', name: 'API Gateway', short: 'API Gateway', kind: 'load_balancer', config: { replicas: 2, baseLatencyMs: 8 }, tags: 'api' },
  { id: 'gcp-cdn', provider: 'gcp', name: 'Cloud CDN', short: 'Cloud CDN', kind: 'cdn', tags: 'cdn edge' },
  { id: 'gcp-cloud-storage', provider: 'gcp', name: 'Cloud Storage', short: 'Cloud Storage', kind: 'database', config: objectStore, tags: 'object storage gcs data lake' },
  { id: 'gcp-dataprep', provider: 'gcp', name: 'Dataprep by Trifacta', short: 'Dataprep', kind: 'worker', config: batch, tags: 'etl' },
  { id: 'gcp-dataflow', provider: 'gcp', name: 'Dataflow', short: 'Dataflow', kind: 'worker', config: streamProc, tags: 'beam stream batch' },
  { id: 'gcp-dataproc', provider: 'gcp', name: 'Dataproc', short: 'Dataproc', kind: 'worker', config: batch, tags: 'spark hadoop' },
  { id: 'gcp-composer', provider: 'gcp', name: 'Cloud Composer', short: 'Composer', kind: 'worker', config: { autoscale: managed(2, 10) }, tags: 'airflow orchestration' },
  { id: 'gcp-vertex-ai', provider: 'gcp', name: 'Vertex AI', short: 'Vertex AI', kind: 'api_server', config: mlEndpoint, tags: 'ml automl' },
  { id: 'gcp-bigquery', provider: 'gcp', name: 'BigQuery', short: 'BigQuery', kind: 'database', config: warehouse, tags: 'warehouse' },
  { id: 'gcp-bigtable', provider: 'gcp', name: 'Bigtable', short: 'Bigtable', kind: 'database', config: kv, tags: 'nosql wide column' },
  { id: 'gcp-firestore', provider: 'gcp', name: 'Firestore', short: 'Firestore', kind: 'database', config: kv, tags: 'nosql datastore document' },
  { id: 'gcp-cloud-sql', provider: 'gcp', name: 'Cloud SQL', short: 'Cloud SQL', kind: 'database', config: sql, tags: 'postgres mysql' },
  { id: 'gcp-spanner', provider: 'gcp', name: 'Spanner', short: 'Spanner', kind: 'database', config: { ...sql, replicas: 3, failoverSeconds: 5 }, tags: 'sql global' },
  { id: 'gcp-memorystore', provider: 'gcp', name: 'Memorystore', short: 'Memorystore', kind: 'cache', tags: 'redis cache' },
  { id: 'gcp-looker', provider: 'gcp', name: 'Looker', short: 'Looker', kind: 'api_server', config: dash, tags: 'bi dashboard looker studio' },
];

const BY_ID = new Map(CLOUD_SERVICES.map((s) => [s.id, s]));

export function cloudService(id: string): CloudService | undefined {
  return BY_ID.get(id);
}

/** Icons stored in designs as "cloud:<service id>". */
export function cloudIconUrl(icon: string | undefined): string | undefined {
  if (!icon?.startsWith('cloud:')) return undefined;
  const s = BY_ID.get(icon.slice(6));
  if (!s) return undefined;
  return `/cloud/${s.provider}/${s.id.slice(s.provider.length + 1)}.svg`;
}

export const isCloudIcon = (icon?: string) => !!icon?.startsWith('cloud:');
