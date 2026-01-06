/**
 * Hiera Integration Module
 *
 * Exports all Hiera integration components for local Puppet control repository
 * analysis, Hiera data lookup, and code analysis.
 */

// Export all types
export * from "./types";

// Export HieraParser
export { HieraParser } from "./HieraParser";
export type { HieraParseResult, ValidationResult, DataBackend, BackendInfo } from "./HieraParser";

// Export FactService
export { FactService } from "./FactService";

// Export HieraScanner
export { HieraScanner } from "./HieraScanner";
export type { FileScanResult, FileChangeCallback } from "./HieraScanner";

// Export HieraResolver
export { HieraResolver } from "./HieraResolver";
export type { CatalogAwareResolveOptions } from "./HieraResolver";

// Export HieraService
export { HieraService } from "./HieraService";
export type { HieraServiceConfig } from "./HieraService";

// Export CatalogCompiler
export { CatalogCompiler } from "./CatalogCompiler";
export type { CompiledCatalogResult } from "./CatalogCompiler";

// Export CodeAnalyzer
export { CodeAnalyzer } from "./CodeAnalyzer";
export type { LintFilterOptions, IssueCounts } from "./CodeAnalyzer";

// Export PuppetfileParser
export { PuppetfileParser } from "./PuppetfileParser";
export type {
  ParsedModule,
  PuppetfileParseResult,
  PuppetfileParseError,
  PuppetfileValidationIssue,
  PuppetfileValidationResult,
} from "./PuppetfileParser";

// Export ForgeClient
export { ForgeClient } from "./ForgeClient";
export type {
  ForgeModuleInfo,
  ForgeApiError,
  ModuleUpdateCheckResult,
  ForgeClientConfig,
  SecurityAdvisory,
  ModuleSecurityStatus,
} from "./ForgeClient";

// Export HieraPlugin
export { HieraPlugin } from "./HieraPlugin";
