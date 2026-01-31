import type { ExecutionResult } from "../../bolt/types";

export type PackageEnsure = "present" | "absent" | "latest";

export interface PackageTaskConfig {
  name: string;
  label: string;
  parameterMapping: {
    packageName: string;
    ensure?: string;
    version?: string;
    settings?: string;
  };
}

export interface PackageOperationInput {
  nodeId: string;
  taskName: string;
  packageName: string;
  ensure?: PackageEnsure;
  version?: string;
  settings?: Record<string, unknown>;
  expertMode?: boolean;
}

export type PackageExecutionResult = ExecutionResult & { type: "package" };

export interface PackageOperation {
  action: "install" | "uninstall" | "update" | "list";
  packageName: string;
  version?: string; // Optional for install/update
}

export interface PackageResult {
  success: boolean;
  output: string;
  error?: string;
  source: "package-manager"; // Identifies this plugin
}
