/** Report the account's formal Bedrock authorization status per model. */
import {
  BedrockClient,
  GetFoundationModelAvailabilityCommand,
} from "@aws-sdk/client-bedrock";

const client = new BedrockClient({});

for (const modelId of [
  "amazon.titan-embed-text-v2:0",
  "anthropic.claude-3-haiku-20240307-v1:0",
]) {
  try {
    const r = await client.send(
      new GetFoundationModelAvailabilityCommand({ modelId }),
    );
    console.log(
      modelId,
      JSON.stringify({
        auth: r.authorizationStatus,
        entitlement: r.entitlementAvailability,
        agreement: r.agreementAvailability?.status,
        region: r.regionAvailability,
      }),
    );
  } catch (e) {
    console.log(modelId, "error:", (e as Error).name, (e as Error).message);
  }
}
