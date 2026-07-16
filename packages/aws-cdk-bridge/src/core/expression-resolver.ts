/**
 * Expression resolver for CloudFormation intrinsic functions
 *
 * Adapted from @shared-iir/core expression resolver for use in aws-cdk-bridge.
 * Handles conversion of CloudFormation intrinsic functions to Terraform-compatible formats.
 */

/**
 * CloudFormation intrinsic function representation
 */
export type CfnIntrinsic =
  | { Ref: string }
  | { "Fn::GetAtt": [string, string] | string }
  | { "Fn::Sub": string | [string, Record<string, any>] }
  | { "Fn::Join": [string, any[]] }
  | { "Fn::Split": [string, string] }
  | { "Fn::Select": [number, any[]] }
  | { "Fn::Base64": any }
  | { "Fn::Cidr": [string, number, number] }
  | { "Fn::FindInMap": [string, string, string] }
  | { "Fn::GetAZs": string | "" }
  | { "Fn::ImportValue": string }
  | { "Fn::If": [string, any, any] }
  | { "Fn::Not": [any] }
  | { "Fn::Equals": [any, any] }
  | { "Fn::And": any[] }
  | { "Fn::Or": any[] }
  | { "Fn::Contains": [any[], any] }
  | { [key: string]: any };

/**
 * Resolution strategy for intrinsic functions
 */
export type ResolutionStrategy =
  | "cfncompat"  // Convert to cfncompat provider functions
  | "skip"       // Skip intrinsics (remove from output)
  | "preserve"   // Keep as-is
  | "error";     // Throw error on intrinsics

/**
 * Options for expression resolution
 */
export interface ResolverOptions {
  /** Strategy for handling intrinsic functions */
  strategy?: ResolutionStrategy;
  /** Whether to recursively process nested values */
  recursive?: boolean;
}

/**
 * CloudFormation expression resolver
 *
 * Resolves CloudFormation intrinsic functions according to the specified strategy.
 */
export class CfnExpressionResolver {
  private readonly strategy: ResolutionStrategy;
  private readonly recursive: boolean;

  constructor(options: ResolverOptions = {}) {
    this.strategy = options.strategy ?? "skip";
    this.recursive = options.recursive ?? true;
  }

  /**
   * Resolve a value that may contain CloudFormation intrinsic functions
   */
  resolve(value: any): any {
    if (value === null || value === undefined) {
      return undefined;
    }

    // Primitive types
    if (typeof value !== "object") {
      return value;
    }

    // Arrays
    if (Array.isArray(value)) {
      if (!this.recursive) return value;
      const resolved = value
        .map(item => this.resolve(item))
        .filter(item => item !== undefined);
      return resolved.length > 0 ? resolved : undefined;
    }

    // Check if this is an intrinsic function
    if (this.isIntrinsic(value)) {
      return this.resolveIntrinsic(value);
    }

    // Regular object - recurse
    if (!this.recursive) return value;

    const resolved: Record<string, any> = {};
    for (const [key, val] of Object.entries(value)) {
      const resolvedValue = this.resolve(val);
      if (resolvedValue !== undefined) {
        resolved[key] = resolvedValue;
      }
    }

    return Object.keys(resolved).length > 0 ? resolved : undefined;
  }

  /**
   * Check if a value is a CloudFormation intrinsic function
   */
  private isIntrinsic(value: any): boolean {
    if (typeof value !== "object" || Array.isArray(value)) {
      return false;
    }

    const intrinsicKeys = [
      "Ref",
      "Fn::GetAtt",
      "Fn::Sub",
      "Fn::Join",
      "Fn::Split",
      "Fn::Select",
      "Fn::Base64",
      "Fn::Cidr",
      "Fn::FindInMap",
      "Fn::GetAZs",
      "Fn::ImportValue",
      "Fn::If",
      "Fn::Not",
      "Fn::Equals",
      "Fn::And",
      "Fn::Or",
      "Fn::Contains",
      "Fn::Length",
      "Fn::ToJsonString",
      "Fn::EachMemberEquals",
      "Fn::EachMemberIn",
      "Fn::Transform",
      "Fn::ForEach",
      "Fn::RefAll",
      "Fn::ValueOf",
      "Fn::ValueOfAll",
    ];

    return intrinsicKeys.some(key => key in value);
  }

  /**
   * Resolve an intrinsic function according to the strategy
   */
  private resolveIntrinsic(intrinsic: CfnIntrinsic): any {
    switch (this.strategy) {
      case "skip":
        return undefined;

      case "preserve":
        return intrinsic;

      case "cfncompat":
        return this.convertToCfncompat(intrinsic);

      case "error":
        const fnName = Object.keys(intrinsic)[0];
        throw new Error(
          `CloudFormation intrinsic function "${fnName}" not supported`
        );

      default:
        return undefined;
    }
  }

  /**
   * Convert CloudFormation intrinsic to cfncompat provider function
   */
  private convertToCfncompat(intrinsic: CfnIntrinsic): string {
    // Map CloudFormation intrinsics to cfncompat provider functions
    // Format: provider::cfncompat::<function_name>()

    if ("Ref" in intrinsic) {
      // References should be resolved at synthesis time, not here
      return `\${var.${intrinsic.Ref}}`;
    }

    if ("Fn::GetAtt" in intrinsic) {
      const value = intrinsic["Fn::GetAtt"];
      const [resource, attr] = Array.isArray(value) ? value : [value, ""];
      return `\${${resource}.${attr}}`;
    }

    if ("Fn::Join" in intrinsic) {
      const [delimiter, parts] = intrinsic["Fn::Join"];
      const resolvedParts = parts.map((p: any) => this.resolve(p));
      return `provider::cfncompat::join("${delimiter}", [${resolvedParts.join(", ")}])`;
    }

    if ("Fn::Split" in intrinsic) {
      const [delimiter, str] = intrinsic["Fn::Split"];
      return `provider::cfncompat::split("${delimiter}", "${str}")`;
    }

    if ("Fn::Select" in intrinsic) {
      const [index, list] = intrinsic["Fn::Select"];
      const resolvedList = this.resolve(list);
      return `provider::cfncompat::select(${index}, ${resolvedList})`;
    }

    if ("Fn::Sub" in intrinsic) {
      const value = intrinsic["Fn::Sub"];
      if (typeof value === "string") {
        // Simple string substitution
        if (!value.includes("${")) {
          // No variables - return as literal
          return value;
        }
        return `provider::cfncompat::sub("${value}")`;
      } else if (Array.isArray(value)) {
        const [str, vars] = value;
        return `provider::cfncompat::sub("${str}", ${JSON.stringify(vars)})`;
      }
    }

    if ("Fn::Base64" in intrinsic) {
      const value = this.resolve(intrinsic["Fn::Base64"]);
      return `provider::cfncompat::base64("${value}")`;
    }

    if ("Fn::Cidr" in intrinsic) {
      const [ipBlock, count, cidrBits] = intrinsic["Fn::Cidr"];
      return `provider::cfncompat::cidr("${ipBlock}", ${count}, ${cidrBits})`;
    }

    if ("Fn::FindInMap" in intrinsic) {
      const [mapName, topKey, secondKey] = intrinsic["Fn::FindInMap"];
      return `provider::cfncompat::find_in_map("${mapName}", "${topKey}", "${secondKey}")`;
    }

    if ("Fn::If" in intrinsic) {
      const [condition, trueValue, falseValue] = intrinsic["Fn::If"];
      return `provider::cfncompat::condition_if("${condition}", ${this.resolve(trueValue)}, ${this.resolve(falseValue)})`;
    }

    if ("Fn::Equals" in intrinsic) {
      const [left, right] = intrinsic["Fn::Equals"];
      return `provider::cfncompat::condition_equals(${this.resolve(left)}, ${this.resolve(right)})`;
    }

    if ("Fn::Not" in intrinsic) {
      const [value] = intrinsic["Fn::Not"];
      return `provider::cfncompat::condition_not(${this.resolve(value)})`;
    }

    if ("Fn::And" in intrinsic) {
      const conditions = intrinsic["Fn::And"].map((c: any) => this.resolve(c));
      return `provider::cfncompat::condition_and(${conditions.join(", ")})`;
    }

    if ("Fn::Or" in intrinsic) {
      const conditions = intrinsic["Fn::Or"].map((c: any) => this.resolve(c));
      return `provider::cfncompat::condition_or(${conditions.join(", ")})`;
    }

    if ("Fn::Contains" in intrinsic) {
      const [list, value] = intrinsic["Fn::Contains"];
      return `provider::cfncompat::condition_contains(${this.resolve(list)}, ${this.resolve(value)})`;
    }

    // Unsupported intrinsic - return as-is or undefined based on strategy
    return (this.strategy === "preserve" ? JSON.stringify(intrinsic) : undefined) as any;
  }
}

/**
 * Helper function to resolve CloudFormation properties
 */
export function resolveCfnProperties(
  properties: Record<string, any>,
  strategy: ResolutionStrategy = "skip"
): Record<string, any> {
  const resolver = new CfnExpressionResolver({ strategy, recursive: true });
  return resolver.resolve(properties) ?? {};
}

/**
 * Helper to check if a value contains any intrinsic functions
 */
export function containsIntrinsics(value: any): boolean {
  if (value === null || value === undefined || typeof value !== "object") {
    return false;
  }

  if (Array.isArray(value)) {
    return value.some(item => containsIntrinsics(item));
  }

  const intrinsicKeys = [
    "Ref", "Fn::GetAtt", "Fn::Sub", "Fn::Join", "Fn::Split",
    "Fn::Select", "Fn::Base64", "Fn::Cidr", "Fn::FindInMap",
    "Fn::GetAZs", "Fn::ImportValue", "Fn::If", "Fn::Not",
    "Fn::Equals", "Fn::And", "Fn::Or", "Fn::Contains",
  ];

  if (intrinsicKeys.some(key => key in value)) {
    return true;
  }

  return Object.values(value).some(val => containsIntrinsics(val));
}
