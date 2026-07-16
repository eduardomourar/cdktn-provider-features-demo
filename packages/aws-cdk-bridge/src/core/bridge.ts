/**
 * Generic TerraformResource wrapper with automatic CDK → CDKTN conversion
 *
 * Usage:
 *   const bucket = fromAwsCdk(
 *     scope,
 *     "MyBucket",
 *     () => new cdk.Bucket(stack, "Bucket", { versioned: true }),
 *     S3Bucket  // CDKTN resource class
 *   );
 *
 * The factory:
 * 1. Synthesizes CDK construct to CloudFormation (isolated)
 * 2. Extracts CFN resource properties via introspection
 * 3. Converts to CDKTN resource configuration
 * 4. Creates CDKTN resource with converted config
 */

import type { Construct } from "constructs";
import {
  TerraformResourceFactory,
  ResourceClassRegistry,
  type CfnResourceMetadata,
} from "./resource-factory.ts";

/**
 * Options for fromAwsCdk()
 */
export interface FromOptions<T = any> {
  /** CDKTN scope where resource will be created */
  scope: Construct;
  /** Construct ID for the CDKTN resource */
  id: string;
  /** Function that instantiates the CDK construct (in isolated scope) */
  constructFn: (scope: Construct, id: string) => void;
  /** CDKTN resource class to instantiate */
  resourceClass?: new (scope: any, id: string, config?: any) => T;
  /** Optionally override the CloudFormation type to look for */
  cfnType?: string;
  /** Index of resource if multiple resources are created (default: 0) */
  resourceIndex?: number;
}

/**
 * Create a CDKTN resource from a CDK construct
 *
 * This method uses introspection to automatically convert any CDK L1/L2
 * construct to the corresponding CDKTN resource.
 *
 * @example
 * ```typescript
 * import { Bucket as CdkBucket } from "aws-cdk-lib/aws-s3";
 * import { S3Bucket } from ".gen/providers/awscc/s3-bucket";
 *
 * const bucket = fromAwsCdk({
 *   scope: stack,
 *   id: "MyBucket",
 *   constructFn: (scope, id) => new CdkBucket(scope, id, { versioned: true }),
 *   resourceClass: S3Bucket,
 * });
 * ```
 */
export const fromAwsCdk = <T = any>(options: FromOptions<T>): T => {
  const {
    scope,
    id,
    constructFn,
    resourceClass,
    cfnType,
    resourceIndex = 0,
  } = options;

  // Extract CloudFormation metadata by synthesizing CDK construct
  const metadata = TerraformResourceFactory.extractCfnMetadata(
    constructFn,
    id
  );

  if (metadata.length === 0) {
    throw new Error(
      `No CloudFormation resources found when synthesizing construct "${id}"`
    );
  }

  // Find the target resource
  let targetMetadata: CfnResourceMetadata;

  if (cfnType) {
    // Look for specific CloudFormation type
    const found = metadata.find(m => m.type === cfnType);
    if (!found) {
      throw new Error(
        `CloudFormation resource type "${cfnType}" not found. ` +
        `Available types: ${metadata.map(m => m.type).join(", ")}`
      );
    }
    targetMetadata = found;
  } else {
    // Use resourceIndex
    if (resourceIndex >= metadata.length) {
      throw new Error(
        `Resource index ${resourceIndex} out of bounds. ` +
        `Found ${metadata.length} resource(s): ${metadata.map(m => m.type).join(", ")}`
      );
    }
    targetMetadata = metadata[resourceIndex];
  }

  // Look up resource class in registry
  const toClass = resourceClass ?? ResourceClassRegistry.get(targetMetadata.type);
  if (!toClass) {
    throw new Error(
      `No CDKTN resource class registered for CloudFormation type "${targetMetadata.type}". ` +
      `Available types: ${ResourceClassRegistry.types().join(", ")}`
    );
  }

  // Create CDKTN resource
  return TerraformResourceFactory.createTerraformResource<T>(
    {
      scope,
      id,
      cfnMetadata: targetMetadata,
    },
    toClass
  );
};

/**
 * Extract CloudFormation metadata from a CDK construct without creating CDKTN resource
 *
 * Useful for debugging or custom conversion logic.
 */
export const inspect = (
  constructFn: (scope: Construct, id: string) => void,
  constructId: string = "Resource"
): CfnResourceMetadata[] => {
  return TerraformResourceFactory.extractCfnMetadata(constructFn, constructId);
};

/**
 * Convert CloudFormation properties to Terraform format
 *
 * Useful for custom conversion scenarios.
 */
export const convertProperties = (
  properties: Record<string, any>,
  options?: { resolveRefs?: boolean }
): Record<string, any> => {
  return TerraformResourceFactory.convertProperties(properties, options);
};

/**
 * Re-export registry for convenience
 */
export { ResourceClassRegistry };
