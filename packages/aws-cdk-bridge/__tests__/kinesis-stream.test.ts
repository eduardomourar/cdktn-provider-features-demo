/**
 * Unit test: AWS CDK L2 Stream construct → CDKTN (Terraform via awscc provider)
 */

import { test } from "node:test";
import assert from "node:assert";
import { StreamMode } from "aws-cdk-lib/aws-kinesis";
import { TerraformStack, Testing } from "cdktn";
import { AwsccProvider } from "../../../.gen/providers/awscc/provider/index.ts";
import { KinesisStream } from "../../../.gen/providers/awscc/kinesis-stream/index.ts";
import { Stream } from "../src/kinesis/stream.ts";

test("AWS CDK L2 Kinesis Stream bridges transparently to CDKTN", () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, "test-stack");

  // Configure awscc provider
  new AwsccProvider(stack, "awscc", {
    region: "us-east-1",
  });

  // Use real aws-cdk-lib API, synthesizes to Terraform!
  const stream = new Stream(stack, "MyStream", {
    streamName: "my-kinesis-stream",
    streamMode: StreamMode.PROVISIONED,
    shardCount: 1,
  });

  // Verify stream was created in CDKTN tree
  assert.ok(stream.streamArn, "Stream ARN is available");
  assert.ok(stream.streamName, "Stream name is available");

  // Synthesize to Terraform
  const synthesized = Testing.synth(stack);

  // Verify Terraform resource was created
  assert.ok(synthesized, "CDKTN synthesized successfully");

  // Parse synthesized Terraform JSON
  const tfJson = JSON.parse(synthesized);

  // Verify awscc_kinesis_stream resource exists
  const resources = tfJson?.resource?.awscc_kinesis_stream;
  assert.ok(resources, "awscc_kinesis_stream resource found in Terraform output");

  console.log("\n=== Synthesized Terraform (via awscc provider) ===");
  console.log(JSON.stringify(tfJson, null, 2));
});
