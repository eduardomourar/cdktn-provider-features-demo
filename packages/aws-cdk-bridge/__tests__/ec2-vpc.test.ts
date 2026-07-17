/**
 * Unit test: AWS CDK L2 VPC construct → CDKTN (Terraform via awscc provider)
 */

import { test } from "node:test";
import assert from "node:assert";
import { TerraformStack, Testing } from "cdktn";
import { AwsccProvider } from "../../../.gen/providers/awscc/provider/index.ts";
import { Ec2Vpc } from "../../../.gen/providers/awscc/ec2-vpc/index.ts";
import { Vpc } from "../src/ec2/vpc.ts";

test("AWS CDK L2 VPC bridges transparently to CDKTN", () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, "test-stack");

  // Configure awscc provider
  new AwsccProvider(stack, "awscc", {
    region: "us-east-1",
  });

  // Use real aws-cdk-lib API, synthesizes to Terraform!
  const vpc = new Vpc(stack, "MyVpc", {
    maxAzs: 2,
  });

  // Verify VPC was created in CDKTN tree
  assert.ok(vpc.vpcId, "VPC ID is available");
  assert.ok(vpc.cidrBlock, "CIDR block is available");

  // Synthesize to Terraform
  const synthesized = Testing.synth(stack);

  // Verify Terraform resource was created
  assert.ok(synthesized, "CDKTN synthesized successfully");

  // Parse synthesized Terraform JSON
  const tfJson = JSON.parse(synthesized);

  // Verify awscc_ec2_vpc resource exists
  const resources = tfJson?.resource?.awscc_ec2_vpc;
  assert.ok(resources, "awscc_ec2_vpc resource found in Terraform output");

  console.log("\n=== Synthesized Terraform (via awscc provider) ===");
  console.log(JSON.stringify(tfJson, null, 2));
});
