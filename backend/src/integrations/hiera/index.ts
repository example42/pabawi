/**
 * Hiera Integration - Service Exports
 *
 * @deprecated This module is deprecated. Import from 'plugins/native/hiera/backend' instead.
 * This file is kept for backward compatibility only.
 *
 * The plugin code has been migrated to:
 * - plugins/native/hiera/backend/HieraPlugin.ts
 * - plugins/native/hiera/backend/services/HieraService.ts
 * - plugins/native/hiera/backend/types.ts
 *
 * @module integrations/hiera
 * @version 1.0.0
 */

import { HieraPluginV1 } from "./HieraPluginV1.js";
import { HieraService } from "./HieraService.js";
import { CodeAnalyzer } from "./CodeAnalyzer.js";
import { LoggerService } from "../../services/LoggerService.js";
import { PerformanceMonitorService } from "../../services/PerformanceMonitorService.js";
import type { IntegrationManager } from "../IntegrationManager.js";

// Re-export v1.0 plugin class and config
export {
  HieraPluginV1,
  HieraPluginConfigSchema,
  type HieraPluginConfig,
  createHieraPlugin,
} from "./HieraPluginV1.js";

// Re-export legacy plugin for backward compatibility
export { HieraPlugin } from "./HieraPlugin.js";

// Re-export services
export { HieraService, type HieraServiceConfig } from "./HieraService.js";
export { HieraParser } from "./HieraParser.js";
export { HieraScanner } from "./HieraScanner.js";
export { HieraResolver } from "./HieraResolver.js";
export { FactService } from "./FactService.js";
export { CodeAnalyzer } from "./CodeAnalyzer.js";
export { CatalogCompiler } from "./CatalogCompiler.js";

// Re-export types
export type {
  HieraConfig,
  HieraDefaults,
  HierarchyLevel,
  LookupOptions,
  LookupMethod,
  HieraKey,
  HieraKeyLocation,
  HieraKeyIndex,
  HieraFileInfo,
  HieraResolution,
  ResolveOptions,
  MergeOptions,
  HierarchyFileInfo,
  NodeHieraData,
  KeyNodeValues,
  KeyUsageMap,
  Facts,
  FactResult,
  LocalFactFile,
  CodeAnalysisResult,
  UnusedCodeReport,
  UnusedItem,
  LintIssue,
  LintSeverity,
  ModuleUpdate,
  UsageStatistics,
  ClassUsage,
  ResourceUsage,
  KeyListResponse,
  HieraKeyInfo,
  KeySearchResponse,
  KeyDetailResponse,
  NodeHieraDataResponse,
  HieraResolutionInfo,
  GlobalKeyLookupResponse,
  ValueGroup,
  CodeAnalysisResponse,
  HieraStatusResponse,
  PaginationParams,
  PaginatedResponse,
  HIERA_ERROR_CODES,
  HieraErrorCode,
  HieraError,
  FactSourceConfig,
  CatalogCompilationConfig,
  HieraCacheConfig,
  CodeAnalysisConfig,
  HieraPluginConfig as HieraPluginConfigType,
  HieraHealthStatus,
} from "./types.js";

/**
 * Factory function with full dependency injection
 *
 * Creates a fully configured HieraPluginV1 instance with all dependencies.
 * Use this when you need to provide custom services.
 */
export function createHieraPluginWithDependencies(
  logger: LoggerService,
  performanceMonitor: PerformanceMonitorService,
  integrationManager?: IntegrationManager,
  hieraService?: HieraService,
  codeAnalyzer?: CodeAnalyzer,
): HieraPluginV1 {
  const plugin = new HieraPluginV1(logger, performanceMonitor);

  if (integrationManager) {
    plugin.setIntegrationManager(integrationManager);
  }

  if (hieraService) {
    plugin.setHieraService(hieraService);
  }

  if (codeAnalyzer) {
    plugin.setCodeAnalyzer(codeAnalyzer);
  }

  return plugin;
}

// Default export is the v1.0 plugin
export default HieraPluginV1;
