import { TEMPLATES, type Annotation, type Design, type DesignEdge, type DesignNode, type NodeConfig, type Template } from '@/core';
import { cloudService } from '@/lib/cloudCatalog';

/**
 * The classic "same data platform on three clouds" poster, as runnable designs: five stage
 * columns, official icons, devices writing on the left and analysts reading on the right.
 */

const COL_W = 260;
const GAP = 30;
const STAGES = [
  ['Ingestion', '#10b981'],
  ['Data Lake', '#3b82f6'],
  ['Computation', '#f97316'],
  ['Data Warehouse', '#a855f7'],
  ['Presentation', '#6366f1'],
] as const;
const colX = (i: number) => i * (COL_W + GAP);
/** Card x that centres a component in column i. */
const at = (i: number) => colX(i) + Math.round((COL_W - 176) / 2);
// Rows sit a card's width apart so they still clear each other in the phone's top-to-bottom view.
const ROW = [20, 210, 400, 590];

function stages(prefix: string): Annotation[] {
  return STAGES.map(([text, color], i) => ({ id: `${prefix}-stage-${i}`, type: 'stage' as const, position: { x: colX(i), y: -60 }, width: COL_W, height: 840, text, color }));
}

function svc(id: string, serviceId: string, col: number, row: number, extra: Partial<NodeConfig> = {}): DesignNode {
  const s = cloudService(serviceId);
  if (!s) throw new Error(`unknown cloud service ${serviceId}`);
  return { id, kind: s.kind, label: s.short, appearance: { typeLabel: s.name, icon: `cloud:${s.id}` }, config: { ...s.config, ...extra }, position: { x: at(col), y: ROW[row] } };
}

const devices = (rps: number): DesignNode => ({
  id: 'devices',
  kind: 'client',
  label: 'Devices',
  appearance: { typeLabel: 'IoT devices', icon: 'cpu', color: '#10b981' },
  config: { rps, retries: 1, timeoutMs: 3000 },
  position: { x: -250, y: ROW[1] },
});

const analysts = (rps: number): DesignNode => ({
  id: 'analysts',
  kind: 'client',
  label: 'Analysts',
  appearance: { typeLabel: 'Dashboard users', icon: 'users', color: '#6366f1' },
  config: { rps, timeoutMs: 8000 },
  position: { x: colX(5) + 40, y: ROW[0] },
});

type E = [string, string, Omit<Partial<DesignEdge>, 'id' | 'source' | 'target'>?];
const LEFT = { sourceHandle: 'l', targetHandle: 'r' } as const;
const DOWN = { sourceHandle: 'b', targetHandle: 't' } as const;

function edges(list: E[]): DesignEdge[] {
  return list.map(([source, target, extra], i) => ({ id: `e${i + 1}`, source, target, pathStyle: 'step', ...extra }));
}

function design(nodes: DesignNode[], links: E[], prefix: string): Design {
  return { version: 1, nodes, edges: edges(links), annotations: stages(prefix) };
}

export const CLOUD_TEMPLATES: Template[] = [
  {
    id: 'aws-data-platform',
    title: 'AWS Data Platform',
    description: 'IoT Core and Kinesis in, S3 data lake, Glue/EMR/Flink, Redshift and DynamoDB, Quick Sight on top.',
    design: design(
      [
        devices(3000),
        svc('iot', 'aws-iot-core', 0, 0),
        svc('kinesis', 'aws-kinesis', 0, 1),
        svc('lambda', 'aws-lambda', 0, 2, { replicas: 5, autoscale: { enabled: true, min: 5, max: 50, targetUtilization: 0.65, warmupSeconds: 3 } }),
        svc('s3', 'aws-s3', 1, 1),
        svc('glacier', 'aws-glacier', 1, 3),
        svc('glue', 'aws-glue', 2, 0),
        svc('emr', 'aws-emr', 2, 1),
        svc('flink', 'aws-flink', 2, 2),
        svc('sagemaker', 'aws-sagemaker', 2, 3),
        svc('redshift', 'aws-redshift', 3, 0),
        svc('dynamodb', 'aws-dynamodb', 3, 2),
        svc('opensearch', 'aws-opensearch', 3, 3),
        svc('quick', 'aws-quick', 4, 0),
        svc('athena', 'aws-athena', 4, 1),
        analysts(150),
      ],
      [
        ['devices', 'iot', { label: 'MQTT', sourceHandle: 't', targetHandle: 'l' }],
        ['iot', 'kinesis', { label: 'rules', ...DOWN }],
        ['kinesis', 'lambda', DOWN],
        ['lambda', 's3', { label: 'raw events' }],
        ['kinesis', 'flink', { label: 'stream' }],
        ['s3', 'glue', { label: 'hourly ETL', weight: 0.2 }],
        ['s3', 'emr', { weight: 0.05 }],
        ['glue', 'redshift'],
        ['emr', 'redshift'],
        ['flink', 'dynamodb'],
        ['flink', 'opensearch', { weight: 0.5 }],
        ['s3', 'glacier', { kind: 'annotation', label: 'lifecycle', ...DOWN }],
        ['redshift', 'sagemaker', { kind: 'annotation', label: 'training data', ...LEFT }],
        ['analysts', 'quick', LEFT],
        ['quick', 'redshift', { label: 'SQL', ...LEFT }],
        ['quick', 'athena', { weight: 0.3, ...DOWN }],
        ['athena', 's3', { label: 'ad-hoc', ...LEFT }],
      ],
      'aws',
    ),
  },
  {
    id: 'azure-data-platform',
    title: 'Azure Data Platform',
    description: 'IoT Hub and Event Hubs in, Data Lake Storage, Databricks and Stream Analytics, SQL and Cosmos DB, Power BI on top.',
    design: design(
      [
        devices(3000),
        svc('iothub', 'azure-iot-hub', 0, 0),
        svc('eventhubs', 'azure-event-hubs', 0, 1),
        svc('functions', 'azure-functions', 0, 2, { replicas: 5, autoscale: { enabled: true, min: 5, max: 50, targetUtilization: 0.65, warmupSeconds: 3 } }),
        svc('lake', 'azure-storage', 1, 1),
        svc('databricks', 'azure-databricks', 2, 0),
        svc('explorer', 'azure-data-explorer', 2, 1),
        svc('streamanalytics', 'azure-stream-analytics', 2, 2),
        svc('ml', 'azure-machine-learning', 2, 3),
        svc('sql', 'azure-sql-database', 3, 0),
        svc('redis', 'azure-redis', 3, 1),
        svc('cosmos', 'azure-cosmos-db', 3, 2),
        svc('powerbi', 'azure-power-bi', 4, 0),
        analysts(150),
      ],
      [
        ['devices', 'iothub', { label: 'MQTT', sourceHandle: 't', targetHandle: 'l' }],
        ['iothub', 'eventhubs', { label: 'routes', ...DOWN }],
        ['eventhubs', 'functions', DOWN],
        ['functions', 'lake', { label: 'raw events' }],
        ['eventhubs', 'streamanalytics', { label: 'stream' }],
        ['lake', 'databricks', { label: 'batch', weight: 0.2 }],
        ['lake', 'explorer', { weight: 0.05 }],
        ['databricks', 'sql'],
        ['streamanalytics', 'cosmos'],
        ['sql', 'ml', { kind: 'annotation', label: 'training data', ...LEFT }],
        ['analysts', 'powerbi', LEFT],
        ['powerbi', 'redis', { ...LEFT, sourceHandle: 'b', targetHandle: 'r' }],
        ['redis', 'sql', { ...DOWN, sourceHandle: 't', targetHandle: 'b' }],
        ['powerbi', 'cosmos', { weight: 0.3, ...LEFT, sourceHandle: 'b', targetHandle: 'r' }],
      ],
      'azure',
    ),
  },
  {
    id: 'gcp-data-platform',
    title: 'Google Cloud Data Platform',
    description: 'Pub/Sub in, Cloud Storage lake, Dataflow, Dataproc and Dataprep, BigQuery and Bigtable, Looker on top.',
    design: design(
      [
        devices(3000),
        svc('pubsub', 'gcp-pubsub', 0, 1),
        svc('functions', 'gcp-cloud-functions', 0, 2, { replicas: 5, autoscale: { enabled: true, min: 5, max: 50, targetUtilization: 0.65, warmupSeconds: 3 } }),
        svc('gcs', 'gcp-cloud-storage', 1, 1),
        svc('dataproc', 'gcp-dataproc', 2, 0),
        svc('dataflow', 'gcp-dataflow', 2, 1),
        svc('dataprep', 'gcp-dataprep', 2, 2),
        svc('vertex', 'gcp-vertex-ai', 2, 3),
        svc('bigquery', 'gcp-bigquery', 3, 0),
        svc('bigtable', 'gcp-bigtable', 3, 1),
        svc('memorystore', 'gcp-memorystore', 3, 2),
        svc('looker', 'gcp-looker', 4, 0),
        analysts(150),
      ],
      [
        ['devices', 'pubsub', { label: 'events' }],
        ['pubsub', 'functions', DOWN],
        ['functions', 'gcs', { label: 'raw events' }],
        ['pubsub', 'dataflow', { label: 'stream' }],
        ['gcs', 'dataproc', { weight: 0.05 }],
        ['gcs', 'dataprep', { label: 'clean', weight: 0.1 }],
        ['dataflow', 'bigquery'],
        ['dataflow', 'bigtable', { weight: 0.5 }],
        ['dataproc', 'bigtable'],
        ['dataprep', 'bigquery'],
        ['bigquery', 'vertex', { kind: 'annotation', label: 'training data', ...LEFT }],
        ['analysts', 'looker', LEFT],
        ['looker', 'bigquery', { label: 'SQL', ...LEFT }],
        ['looker', 'memorystore', { weight: 0.3, ...LEFT, sourceHandle: 'b', targetHandle: 'r' }],
        ['memorystore', 'bigtable', { ...DOWN, sourceHandle: 't', targetHandle: 'b' }],
      ],
      'gcp',
    ),
  },
];

/** Every template the UI offers: the core ones first, then the cloud platforms. */
export const ALL_TEMPLATES: Template[] = [...TEMPLATES, ...CLOUD_TEMPLATES];
