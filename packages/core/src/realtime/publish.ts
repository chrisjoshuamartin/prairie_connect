import { Resource } from "sst";
import {
  IoTDataPlaneClient,
  PublishCommand,
} from "@aws-sdk/client-iot-data-plane";
import { topicPrefix } from "./topics";

let client: IoTDataPlaneClient | null = null;

function endpoint(): string | null {
  try {
    const e = (Resource as any).RealtimePublish?.endpoint as
      | string
      | undefined;
    return e ?? null;
  } catch {
    return null;
  }
}

function getClient(host: string): IoTDataPlaneClient {
  if (!client) {
    client = new IoTDataPlaneClient({ endpoint: `https://${host}` });
  }
  return client;
}

/** `<appName>/<stage>` prefix resolved from the SST app context. */
export function realtimePrefix(): string {
  return topicPrefix(Resource.App.name, Resource.App.stage);
}

/**
 * Publish a JSON payload to an IoT topic. Failures are swallowed (logged)
 * — realtime is a progressive enhancement; canonical state lives in
 * Postgres and the client re-fetches over HTTP.
 */
export async function publishRealtime(
  topic: string,
  payload: unknown,
): Promise<void> {
  const host = endpoint();
  if (!host) {
    console.warn(
      `[realtime] no endpoint linked, skipping publish topic=${topic}`,
    );
    return;
  }
  try {
    await getClient(host).send(
      new PublishCommand({
        topic,
        qos: 1,
        payload: Buffer.from(JSON.stringify(payload)),
      }),
    );
  } catch (err) {
    console.error(`[realtime] publish failed topic=${topic}`, err);
  }
}
