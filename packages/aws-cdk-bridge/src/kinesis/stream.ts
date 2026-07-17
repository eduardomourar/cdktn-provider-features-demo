/**
 * Transparent bridge: AWS CDK L2 Stream → CDKTN (via awscc provider)
 *
 * Uses generic fromAwsCdk() for automatic conversion.
 *
 * Bridge pattern:
 * 1. Internally synthesize real aws-cdk-lib Stream to CloudFormation (isolated)
 * 2. Extract CFN resource definition via introspection
 * 3. Create awscc_kinesis_stream resource in CDKTN tree
 * 4. Pass CFN properties directly (awscc provider accepts CFN schemas)
 *
 * The CDKTN app never sees CloudFormation - only native Terraform resources.
 *
 * Note: This is a convenience wrapper. For a fully generic approach, use
 * fromAwsCdk() directly.
 */

import { Construct } from "constructs";
import { Stream as CdkStream, type StreamProps as CdkStreamProps } from "aws-cdk-lib/aws-kinesis";
import { KinesisStream } from "../../../../.gen/providers/awscc/kinesis-stream/index.ts";
import { fromAwsCdk } from "../core/index.ts";

export type StreamProps = CdkStreamProps;

export class Stream extends Construct {
  public readonly streamArn: string;
  public readonly streamName: string;
  private readonly resource: KinesisStream;

  constructor(scope: Construct, id: string, props: StreamProps = {}) {
    super(scope, id);

    // Use generic TerraformResource factory for automatic conversion
    this.resource = fromAwsCdk({
      scope: this,
      id,
      constructFn: (cdkScope, cdkId) => new CdkStream(cdkScope, cdkId, props),
      resourceClass: KinesisStream,
      cfnType: "AWS::Kinesis::Stream",
      resolutionStrategy: "cfncompat",
    });

    // Expose Terraform outputs (these are native Terraform references)
    this.streamArn = this.resource.arn;
    this.streamName = this.resource.name;
  }
}
