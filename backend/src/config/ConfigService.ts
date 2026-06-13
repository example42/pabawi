import { config as loadDotenv } from "dotenv";
import {
  AppConfigSchema,
  ConsoleConfigSchema,
  type AppConfig,
  type ConsoleConfig,
  type EntraIdConfig,
  type WhitelistConfig,
} from "./schema";
import { z } from "zod";
import { parseJson } from "../utils/json";
import { LoggerService } from "../services/LoggerService";

/**
 * Configuration service to load and validate application settings
 * from environment variables and .env file
 */
export class ConfigService {
  private config: AppConfig;
  private entraIdConfig: EntraIdConfig | null = null;
  private consoleConfig: ConsoleConfig;

  constructor() {
    // Load .env file only if not in test environment
    if (process.env.NODE_ENV !== "test") {
      loadDotenv();
    }

    // Parse console config with validation and warning logging
    this.consoleConfig = this.parseConsoleConfig();

    // Parse and validate configuration
    this.config = this.loadConfiguration();
  }

  /**
   * Parse and validate console configuration from CONSOLE_* environment variables.
   * Logs warnings via LoggerService for invalid values and cross-field constraint violations.
   */
  private parseConsoleConfig(): ConsoleConfig {
    const logger = new LoggerService();
    const context = { component: "ConfigService" };
    const defaults = ConsoleConfigSchema.parse({});

    const parsePositiveInt = (
      envName: string,
      defaultValue: number,
      minValue = 1,
    ): number => {
      const raw = process.env[envName];
      if (raw === undefined || raw === "") {
        return defaultValue;
      }

      const parsed = Number(raw);
      if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < minValue) {
        logger.warn(
          `Invalid value for ${envName}="${raw}" (must be an integer >= ${String(minValue)}). Using default: ${String(defaultValue)}`,
          context,
        );
        return defaultValue;
      }

      return parsed;
    };

    const sessionTimeoutMs = parsePositiveInt(
      "CONSOLE_SESSION_TIMEOUT_MS",
      defaults.sessionTimeoutMs,
    );
    const maxSessionDuration = parsePositiveInt(
      "CONSOLE_MAX_SESSION_DURATION",
      defaults.maxSessionDuration,
    );
    const maxConcurrentSessions = parsePositiveInt(
      "CONSOLE_MAX_CONCURRENT_SESSIONS",
      defaults.maxConcurrentSessions,
    );
    const heartbeatIntervalMs = parsePositiveInt(
      "CONSOLE_HEARTBEAT_INTERVAL_MS",
      defaults.heartbeatIntervalMs,
    );

    // Cross-field validation: heartbeat must be less than session timeout (Req 11.6)
    if (heartbeatIntervalMs >= sessionTimeoutMs) {
      logger.warn(
        `CONSOLE_HEARTBEAT_INTERVAL_MS (${String(heartbeatIntervalMs)}) must be less than CONSOLE_SESSION_TIMEOUT_MS (${String(sessionTimeoutMs)}). Using defaults for both: heartbeatIntervalMs=${String(defaults.heartbeatIntervalMs)}, sessionTimeoutMs=${String(defaults.sessionTimeoutMs)}`,
        context,
      );
      return {
        sessionTimeoutMs: defaults.sessionTimeoutMs,
        maxSessionDuration,
        maxConcurrentSessions,
        heartbeatIntervalMs: defaults.heartbeatIntervalMs,
      };
    }

    return {
      sessionTimeoutMs,
      maxSessionDuration,
      maxConcurrentSessions,
      heartbeatIntervalMs,
    };
  }

  /**
   * Parse integrations configuration from environment variables
   */
  private parseIntegrationsConfig(): {
    ansible?: {
      enabled: boolean;
      projectPath: string;
      inventoryPath?: string;
      timeout?: number;
    };
    puppetdb?: {
      enabled: boolean;
      serverUrl: string;
      port?: number;
      token?: string;
      ssl?: {
        enabled: boolean;
        ca?: string;
        cert?: string;
        key?: string;
        rejectUnauthorized?: boolean;
      };
      timeout?: number;
      retryAttempts?: number;
      retryDelay?: number;
      cache?: {
        ttl?: number;
      };
      circuitBreaker?: {
        threshold?: number;
        timeout?: number;
        resetTimeout?: number;
      };
    };
    puppetserver?: {
      enabled: boolean;
      serverUrl: string;
      port?: number;
      token?: string;
      ssl?: {
        enabled: boolean;
        ca?: string;
        cert?: string;
        key?: string;
        rejectUnauthorized?: boolean;
      };
      timeout?: number;
      retryAttempts?: number;
      retryDelay?: number;
      inactivityThreshold?: number;
      cache?: {
        ttl?: number;
      };
      circuitBreaker?: {
        threshold?: number;
        timeout?: number;
        resetTimeout?: number;
      };
    };
    hiera?: {
      enabled: boolean;
      controlRepoPath: string;
      hieraConfigPath?: string;
      environments?: string[];
      factSources?: {
        preferPuppetDB?: boolean;
        localFactsPath?: string;
      };
      catalogCompilation?: {
        enabled?: boolean;
        timeout?: number;
        cacheTTL?: number;
      };
      cache?: {
        enabled?: boolean;
        ttl?: number;
        maxEntries?: number;
      };
      codeAnalysis?: {
        enabled?: boolean;
        lintEnabled?: boolean;
        moduleUpdateCheck?: boolean;
        analysisInterval?: number;
        exclusionPatterns?: string[];
      };
    };
    proxmox?: {
      enabled: boolean;
      host: string;
      port?: number;
      username?: string;
      password?: string;
      realm?: string;
      token?: string;
      ssl?: {
        rejectUnauthorized?: boolean;
        ca?: string;
        cert?: string;
        key?: string;
      };
      timeout?: number;
      priority?: number;
    };
    aws?: {
      enabled: boolean;
      accessKeyId?: string;
      secretAccessKey?: string;
      region?: string;
      regions?: string[];
      sessionToken?: string;
      profile?: string;
      endpoint?: string;
    };
    azure?: {
      enabled: boolean;
      tenantId?: string;
      clientId?: string;
      clientSecret?: string;
      subscriptionId?: string;
      resourceGroups?: string[];
    };
    checkmk?: {
      enabled: boolean;
      serverUrl: string;
      site?: string;
      username: string;
      password: string; // pragma: allowlist secret
      sslVerify: boolean;
      healthCheckIntervalMs?: number;
      livestatus?: {
        host: string;
        port?: number;
        tls?: boolean;
        timeoutMs?: number;
      };
    };
  } {
    const integrations: ReturnType<typeof this.parseIntegrationsConfig> = {};

    // Parse Ansible configuration
    if (process.env.ANSIBLE_ENABLED === "true") {
      integrations.ansible = {
        enabled: true,
        projectPath: process.env.ANSIBLE_PROJECT_PATH ?? process.cwd(),
        inventoryPath: process.env.ANSIBLE_INVENTORY_PATH,
        timeout: process.env.ANSIBLE_EXECUTION_TIMEOUT
          ? parseInt(process.env.ANSIBLE_EXECUTION_TIMEOUT, 10)
          : undefined,
      };
    }

    // Parse PuppetDB configuration
    if (process.env.PUPPETDB_ENABLED === "true") {
      const serverUrl = process.env.PUPPETDB_SERVER_URL;
      if (!serverUrl) {
        throw new Error(
          "PUPPETDB_SERVER_URL is required when PUPPETDB_ENABLED is true",
        );
      }

      integrations.puppetdb = {
        enabled: true,
        serverUrl,
        port: process.env.PUPPETDB_PORT
          ? parseInt(process.env.PUPPETDB_PORT, 10)
          : undefined,
        token: process.env.PUPPETDB_TOKEN,
        timeout: process.env.PUPPETDB_TIMEOUT
          ? parseInt(process.env.PUPPETDB_TIMEOUT, 10)
          : undefined,
        retryAttempts: process.env.PUPPETDB_RETRY_ATTEMPTS
          ? parseInt(process.env.PUPPETDB_RETRY_ATTEMPTS, 10)
          : undefined,
        retryDelay: process.env.PUPPETDB_RETRY_DELAY
          ? parseInt(process.env.PUPPETDB_RETRY_DELAY, 10)
          : undefined,
      };

      // Parse SSL configuration if any SSL-related env vars are set
      if (
        process.env.PUPPETDB_SSL_ENABLED !== undefined ||
        process.env.PUPPETDB_SSL_CA ||
        process.env.PUPPETDB_SSL_CERT ||
        process.env.PUPPETDB_SSL_KEY ||
        process.env.PUPPETDB_SSL_REJECT_UNAUTHORIZED !== undefined
      ) {
        integrations.puppetdb.ssl = {
          enabled: process.env.PUPPETDB_SSL_ENABLED !== "false",
          ca: process.env.PUPPETDB_SSL_CA,
          cert: process.env.PUPPETDB_SSL_CERT,
          key: process.env.PUPPETDB_SSL_KEY,
          rejectUnauthorized:
            process.env.PUPPETDB_SSL_REJECT_UNAUTHORIZED !== "false",
        };
      }

      // Parse cache configuration
      if (process.env.PUPPETDB_CACHE_TTL) {
        integrations.puppetdb.cache = {
          ttl: parseInt(process.env.PUPPETDB_CACHE_TTL, 10),
        };
      }

      // Parse circuit breaker configuration
      if (
        process.env.PUPPETDB_CIRCUIT_BREAKER_THRESHOLD ||
        process.env.PUPPETDB_CIRCUIT_BREAKER_TIMEOUT ||
        process.env.PUPPETDB_CIRCUIT_BREAKER_RESET_TIMEOUT
      ) {
        integrations.puppetdb.circuitBreaker = {
          threshold: process.env.PUPPETDB_CIRCUIT_BREAKER_THRESHOLD
            ? parseInt(process.env.PUPPETDB_CIRCUIT_BREAKER_THRESHOLD, 10)
            : undefined,
          timeout: process.env.PUPPETDB_CIRCUIT_BREAKER_TIMEOUT
            ? parseInt(process.env.PUPPETDB_CIRCUIT_BREAKER_TIMEOUT, 10)
            : undefined,
          resetTimeout: process.env.PUPPETDB_CIRCUIT_BREAKER_RESET_TIMEOUT
            ? parseInt(
                process.env.PUPPETDB_CIRCUIT_BREAKER_RESET_TIMEOUT,
                10,
              )
            : undefined,
        };
      }
    }

    // Parse Puppetserver configuration
    if (process.env.PUPPETSERVER_ENABLED === "true") {
      const serverUrl = process.env.PUPPETSERVER_SERVER_URL;
      if (!serverUrl) {
        throw new Error(
          "PUPPETSERVER_SERVER_URL is required when PUPPETSERVER_ENABLED is true",
        );
      }

      integrations.puppetserver = {
        enabled: true,
        serverUrl,
        port: process.env.PUPPETSERVER_PORT
          ? parseInt(process.env.PUPPETSERVER_PORT, 10)
          : undefined,
        token: process.env.PUPPETSERVER_TOKEN,
        timeout: process.env.PUPPETSERVER_TIMEOUT
          ? parseInt(process.env.PUPPETSERVER_TIMEOUT, 10)
          : undefined,
        retryAttempts: process.env.PUPPETSERVER_RETRY_ATTEMPTS
          ? parseInt(process.env.PUPPETSERVER_RETRY_ATTEMPTS, 10)
          : undefined,
        retryDelay: process.env.PUPPETSERVER_RETRY_DELAY
          ? parseInt(process.env.PUPPETSERVER_RETRY_DELAY, 10)
          : undefined,
        inactivityThreshold: process.env.PUPPETSERVER_INACTIVITY_THRESHOLD
          ? parseInt(process.env.PUPPETSERVER_INACTIVITY_THRESHOLD, 10)
          : undefined,
      };

      // Parse SSL configuration if any SSL-related env vars are set
      if (
        process.env.PUPPETSERVER_SSL_ENABLED !== undefined ||
        process.env.PUPPETSERVER_SSL_CA ||
        process.env.PUPPETSERVER_SSL_CERT ||
        process.env.PUPPETSERVER_SSL_KEY ||
        process.env.PUPPETSERVER_SSL_REJECT_UNAUTHORIZED !== undefined
      ) {
        integrations.puppetserver.ssl = {
          enabled: process.env.PUPPETSERVER_SSL_ENABLED !== "false",
          ca: process.env.PUPPETSERVER_SSL_CA,
          cert: process.env.PUPPETSERVER_SSL_CERT,
          key: process.env.PUPPETSERVER_SSL_KEY,
          rejectUnauthorized:
            process.env.PUPPETSERVER_SSL_REJECT_UNAUTHORIZED !== "false",
        };
      }

      // Parse cache configuration
      if (process.env.PUPPETSERVER_CACHE_TTL) {
        integrations.puppetserver.cache = {
          ttl: parseInt(process.env.PUPPETSERVER_CACHE_TTL, 10),
        };
      }

      // Parse circuit breaker configuration
      if (
        process.env.PUPPETSERVER_CIRCUIT_BREAKER_THRESHOLD ||
        process.env.PUPPETSERVER_CIRCUIT_BREAKER_TIMEOUT ||
        process.env.PUPPETSERVER_CIRCUIT_BREAKER_RESET_TIMEOUT
      ) {
        integrations.puppetserver.circuitBreaker = {
          threshold: process.env.PUPPETSERVER_CIRCUIT_BREAKER_THRESHOLD
            ? parseInt(process.env.PUPPETSERVER_CIRCUIT_BREAKER_THRESHOLD, 10)
            : undefined,
          timeout: process.env.PUPPETSERVER_CIRCUIT_BREAKER_TIMEOUT
            ? parseInt(process.env.PUPPETSERVER_CIRCUIT_BREAKER_TIMEOUT, 10)
            : undefined,
          resetTimeout: process.env.PUPPETSERVER_CIRCUIT_BREAKER_RESET_TIMEOUT
            ? parseInt(
                process.env.PUPPETSERVER_CIRCUIT_BREAKER_RESET_TIMEOUT,
                10,
              )
            : undefined,
        };
      }
    }

    // Parse Hiera configuration
    if (process.env.HIERA_ENABLED === "true") {
      const controlRepoPath = process.env.HIERA_CONTROL_REPO_PATH;
      if (!controlRepoPath) {
        throw new Error(
          "HIERA_CONTROL_REPO_PATH is required when HIERA_ENABLED is true",
        );
      }

      // Parse environments from JSON array
      let environments: string[] | undefined;
      if (process.env.HIERA_ENVIRONMENTS) {
        try {
          const parsed = parseJson(process.env.HIERA_ENVIRONMENTS);
          if (Array.isArray(parsed)) {
            environments = parsed.filter(
              (item): item is string => typeof item === "string",
            );
          }
        } catch {
          throw new Error(
            "HIERA_ENVIRONMENTS must be a valid JSON array of strings",
          );
        }
      }

      integrations.hiera = {
        enabled: true,
        controlRepoPath,
        hieraConfigPath: process.env.HIERA_CONFIG_PATH,
        environments,
      };

      // Parse fact source configuration
      if (
        process.env.HIERA_FACT_SOURCE_PREFER_PUPPETDB !== undefined ||
        process.env.HIERA_FACT_SOURCE_LOCAL_PATH
      ) {
        integrations.hiera.factSources = {
          preferPuppetDB:
            process.env.HIERA_FACT_SOURCE_PREFER_PUPPETDB !== "false",
          localFactsPath: process.env.HIERA_FACT_SOURCE_LOCAL_PATH,
        };
      }

      // Parse catalog compilation configuration
      if (
        process.env.HIERA_CATALOG_COMPILATION_ENABLED !== undefined ||
        process.env.HIERA_CATALOG_COMPILATION_TIMEOUT ||
        process.env.HIERA_CATALOG_COMPILATION_CACHE_TTL
      ) {
        integrations.hiera.catalogCompilation = {
          enabled: process.env.HIERA_CATALOG_COMPILATION_ENABLED === "true",
          timeout: process.env.HIERA_CATALOG_COMPILATION_TIMEOUT
            ? parseInt(process.env.HIERA_CATALOG_COMPILATION_TIMEOUT, 10)
            : undefined,
          cacheTTL: process.env.HIERA_CATALOG_COMPILATION_CACHE_TTL
            ? parseInt(process.env.HIERA_CATALOG_COMPILATION_CACHE_TTL, 10)
            : undefined,
        };
      }

      // Parse cache configuration
      if (
        process.env.HIERA_CACHE_ENABLED !== undefined ||
        process.env.HIERA_CACHE_TTL ||
        process.env.HIERA_CACHE_MAX_ENTRIES
      ) {
        integrations.hiera.cache = {
          enabled: process.env.HIERA_CACHE_ENABLED !== "false",
          ttl: process.env.HIERA_CACHE_TTL
            ? parseInt(process.env.HIERA_CACHE_TTL, 10)
            : undefined,
          maxEntries: process.env.HIERA_CACHE_MAX_ENTRIES
            ? parseInt(process.env.HIERA_CACHE_MAX_ENTRIES, 10)
            : undefined,
        };
      }

      // Parse code analysis configuration
      if (
        process.env.HIERA_CODE_ANALYSIS_ENABLED !== undefined ||
        process.env.HIERA_CODE_ANALYSIS_LINT_ENABLED !== undefined ||
        process.env.HIERA_CODE_ANALYSIS_MODULE_UPDATE_CHECK !== undefined ||
        process.env.HIERA_CODE_ANALYSIS_INTERVAL ||
        process.env.HIERA_CODE_ANALYSIS_EXCLUSION_PATTERNS
      ) {
        // Parse exclusion patterns from JSON array
        let exclusionPatterns: string[] | undefined;
        if (process.env.HIERA_CODE_ANALYSIS_EXCLUSION_PATTERNS) {
          try {
            const parsed = parseJson(
              process.env.HIERA_CODE_ANALYSIS_EXCLUSION_PATTERNS,
            );
            if (Array.isArray(parsed)) {
              exclusionPatterns = parsed.filter(
                (item): item is string => typeof item === "string",
              );
            }
          } catch {
            throw new Error(
              "HIERA_CODE_ANALYSIS_EXCLUSION_PATTERNS must be a valid JSON array of strings",
            );
          }
        }

        integrations.hiera.codeAnalysis = {
          enabled: process.env.HIERA_CODE_ANALYSIS_ENABLED !== "false",
          lintEnabled: process.env.HIERA_CODE_ANALYSIS_LINT_ENABLED !== "false",
          moduleUpdateCheck:
            process.env.HIERA_CODE_ANALYSIS_MODULE_UPDATE_CHECK !== "false",
          analysisInterval: process.env.HIERA_CODE_ANALYSIS_INTERVAL
            ? parseInt(process.env.HIERA_CODE_ANALYSIS_INTERVAL, 10)
            : undefined,
          exclusionPatterns,
        };
      }
    }

    // Parse Proxmox configuration
    if (process.env.PROXMOX_ENABLED === "true") {
      const host = process.env.PROXMOX_HOST;
      if (!host) {
        throw new Error(
          "PROXMOX_HOST is required when PROXMOX_ENABLED is true",
        );
      }

      integrations.proxmox = {
        enabled: true,
        host,
        port: process.env.PROXMOX_PORT
          ? parseInt(process.env.PROXMOX_PORT, 10)
          : undefined,
        username: process.env.PROXMOX_USERNAME,
        password: process.env.PROXMOX_PASSWORD,
        realm: process.env.PROXMOX_REALM,
        token: process.env.PROXMOX_TOKEN,
        timeout: process.env.PROXMOX_TIMEOUT
          ? parseInt(process.env.PROXMOX_TIMEOUT, 10)
          : undefined,
        priority: process.env.PROXMOX_PRIORITY
          ? parseInt(process.env.PROXMOX_PRIORITY, 10)
          : undefined,
      };

      // Parse SSL configuration if any SSL-related env vars are set
      if (
        process.env.PROXMOX_SSL_REJECT_UNAUTHORIZED !== undefined ||
        process.env.PROXMOX_SSL_CA ||
        process.env.PROXMOX_SSL_CERT ||
        process.env.PROXMOX_SSL_KEY
      ) {
        integrations.proxmox.ssl = {
          rejectUnauthorized:
            process.env.PROXMOX_SSL_REJECT_UNAUTHORIZED !== "false",
          ca: process.env.PROXMOX_SSL_CA,
          cert: process.env.PROXMOX_SSL_CERT,
          key: process.env.PROXMOX_SSL_KEY,
        };
      }
    }

    // Parse AWS configuration
    if (process.env.AWS_ENABLED === "true") {
      // Parse regions from JSON array or comma-separated string
      let regions: string[] | undefined;
      if (process.env.AWS_REGIONS) {
        try {
          const parsed = parseJson(process.env.AWS_REGIONS);
          if (Array.isArray(parsed)) {
            regions = parsed.filter(
              (item): item is string => typeof item === "string",
            );
          }
        } catch {
          // Not JSON — treat as comma-separated
          regions = process.env.AWS_REGIONS.split(",").map((r) => r.trim()).filter(Boolean);
        }
      }

      integrations.aws = {
        enabled: true,
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        region: process.env.AWS_DEFAULT_REGION ?? undefined,
        regions,
        sessionToken: process.env.AWS_SESSION_TOKEN,
        profile: process.env.AWS_PROFILE,
        endpoint: process.env.AWS_ENDPOINT,
      };
    }

    // Parse Azure configuration
    if (process.env.AZURE_ENABLED === "true") {
      // Parse resource groups from JSON array or comma-separated string
      let resourceGroups: string[] | undefined;
      if (process.env.AZURE_RESOURCE_GROUPS) {
        try {
          const parsed = parseJson(process.env.AZURE_RESOURCE_GROUPS);
          if (Array.isArray(parsed)) {
            resourceGroups = parsed.filter(
              (item): item is string => typeof item === "string",
            );
          }
        } catch {
          // Not JSON — treat as comma-separated
          resourceGroups = process.env.AZURE_RESOURCE_GROUPS.split(",").map((r) => r.trim()).filter(Boolean);
        }
      }

      integrations.azure = {
        enabled: true,
        tenantId: process.env.AZURE_TENANT_ID,
        clientId: process.env.AZURE_CLIENT_ID,
        clientSecret: process.env.AZURE_CLIENT_SECRET,
        subscriptionId: process.env.AZURE_SUBSCRIPTION_ID,
        resourceGroups,
      };
    }

    // Parse Checkmk configuration
    if (process.env.CHECKMK_ENABLED === "true") {
      const serverUrl = process.env.CHECKMK_SERVER_URL;
      const site = process.env.CHECKMK_SITE;
      const username = process.env.CHECKMK_USERNAME;
      const password = process.env.CHECKMK_PASSWORD; // pragma: allowlist secret

      const missing: string[] = [];
      if (!serverUrl) missing.push("CHECKMK_SERVER_URL");
      if (!username) missing.push("CHECKMK_USERNAME");
      if (!password) missing.push("CHECKMK_PASSWORD"); // pragma: allowlist secret

      if (missing.length > 0) {
        console.warn(
          `[ConfigService] Checkmk enabled but required variables missing: ${missing.join(", ")}. Plugin will not be registered.`,
        );
      } else if (serverUrl && username && password) {
        const sslVerify = process.env.CHECKMK_SSL_VERIFY !== "false";

        const checkmkConfig: NonNullable<typeof integrations.checkmk> = {
          enabled: true,
          serverUrl,
          ...(site ? { site } : {}),
          username,
          password, // pragma: allowlist secret
          sslVerify,
          healthCheckIntervalMs: process.env.CHECKMK_HEALTHCHECK_INTERVAL_MS
            ? parseInt(process.env.CHECKMK_HEALTHCHECK_INTERVAL_MS, 10)
            : undefined,
        };

        // Build livestatus sub-object only when CHECKMK_LIVESTATUS_HOST is non-empty
        const livestatusHost = process.env.CHECKMK_LIVESTATUS_HOST;
        if (livestatusHost) {
          const livestatusTls = process.env.CHECKMK_LIVESTATUS_TLS === "true";

          if (!livestatusTls) {
            console.warn(
              "[ConfigService] Checkmk Livestatus enabled without TLS — traffic will be unencrypted.",
            );
          }

          checkmkConfig.livestatus = {
            host: livestatusHost,
            port: process.env.CHECKMK_LIVESTATUS_PORT
              ? parseInt(process.env.CHECKMK_LIVESTATUS_PORT, 10)
              : undefined,
            tls: livestatusTls,
            timeoutMs: process.env.CHECKMK_LIVESTATUS_TIMEOUT_MS
              ? parseInt(process.env.CHECKMK_LIVESTATUS_TIMEOUT_MS, 10)
              : undefined,
          };
        }

        integrations.checkmk = checkmkConfig;
      }
    }

    return integrations;
  }

  /**
   * Parse Entra ID (Azure AD) authentication configuration from environment variables.
   * Skips all parsing when ENTRA_ID_ENABLED is not "true".
   * Throws with all missing variable names when enabled but required vars are absent.
   */
  private parseEntraIdConfig(): EntraIdConfig | null {
    if (process.env.ENTRA_ID_ENABLED !== "true") {
      return null;
    }

    // Collect all missing required variables
    const missing: string[] = [];
    const tenantId = process.env.ENTRA_ID_TENANT_ID;
    const clientId = process.env.ENTRA_ID_CLIENT_ID;
    const clientSecret = process.env.ENTRA_ID_CLIENT_SECRET; // pragma: allowlist secret
    const redirectUri = process.env.ENTRA_ID_REDIRECT_URI;

    if (!tenantId) missing.push("ENTRA_ID_TENANT_ID");
    if (!clientId) missing.push("ENTRA_ID_CLIENT_ID");
    if (!clientSecret) missing.push("ENTRA_ID_CLIENT_SECRET"); // pragma: allowlist secret
    if (!redirectUri) missing.push("ENTRA_ID_REDIRECT_URI");

    if (missing.length > 0) {
      throw new Error(
        `Entra ID authentication is enabled but required configuration variables are missing: ${missing.join(", ")}`,
      );
    }

    // After the guard above, these are guaranteed non-empty strings.
    // Narrow explicitly so TypeScript tracks the guarantee without assertions.
    if (!tenantId || !clientId || !clientSecret || !redirectUri) {
      // Unreachable — the missing[] guard above already throws.
      throw new Error("Unreachable: required Entra ID variables validated");
    }

    // Parse optional scopes (comma-separated, discard empty entries)
    const scopesRaw = process.env.ENTRA_ID_SCOPES;
    const scopes = scopesRaw
      ? scopesRaw.split(",").map((s) => s.trim()).filter(Boolean)
      : ["openid", "profile", "email"];

    // Parse optional group mapping (JSON Record<string,string>)
    let groupMapping: Record<string, string> | null = null;
    const groupMappingRaw = process.env.ENTRA_ID_GROUP_MAPPING;
    if (groupMappingRaw) {
      try {
        const parsed = parseJson(groupMappingRaw);
        if (
          typeof parsed !== "object" ||
          parsed === null ||
          Array.isArray(parsed)
        ) {
          throw new Error("must be a JSON object");
        }
        // Validate all keys and values are strings
        for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
          if (typeof key !== "string" || typeof value !== "string") {
            throw new Error("all keys and values must be strings");
          }
        }
        groupMapping = parsed as Record<string, string>;
      } catch (error) {
        throw new Error(
          `ENTRA_ID_GROUP_MAPPING contains invalid JSON: ${error instanceof Error ? error.message : "parse error"}`,
        );
      }
    }

    // Parse optional post-logout redirect URI
    const postLogoutRedirectUri =
      process.env.ENTRA_ID_POST_LOGOUT_REDIRECT_URI ?? undefined;

    // Parse optional JWKS cache TTL
    const jwksCacheTtlMs = process.env.ENTRA_ID_JWKS_CACHE_TTL_MS
      ? parseInt(process.env.ENTRA_ID_JWKS_CACHE_TTL_MS, 10)
      : undefined;

    // At this point tenantId, clientId, clientSecret, redirectUri are guaranteed non-empty
    // (we threw above if any were falsy)
    const config: EntraIdConfig = {
      enabled: true,
      tenantId,
      clientId,
      clientSecret, // pragma: allowlist secret
      redirectUri,
      scopes,
      groupMapping,
      postLogoutRedirectUri,
      jwksCacheTtlMs: jwksCacheTtlMs ?? 86400000,
    };

    this.entraIdConfig = config;
    return config;
  }

  /**
   * Load configuration from environment variables with validation
   */
  private loadConfiguration(): AppConfig {
    try {
      // Parse command whitelist from JSON string
      let commandWhitelist: WhitelistConfig;
      try {
        const whitelistJson = process.env.COMMAND_WHITELIST ?? "[]";
        const parsedWhitelist = parseJson(whitelistJson);
        const whitelistArray: string[] = Array.isArray(parsedWhitelist)
          ? parsedWhitelist.filter(
              (item): item is string => typeof item === "string",
            )
          : [];
        const matchMode = process.env.COMMAND_WHITELIST_MATCH_MODE;
        commandWhitelist = {
          allowAll: process.env.COMMAND_WHITELIST_ALLOW_ALL === "true",
          whitelist: whitelistArray,
          matchMode:
            matchMode === "exact" || matchMode === "prefix"
              ? matchMode
              : "exact",
        };
      } catch (error) {
        throw new Error(
          `Failed to parse COMMAND_WHITELIST: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }

      // Parse package tasks from JSON string if provided
      let packageTasks: unknown;
      if (process.env.BOLT_PACKAGE_TASKS) {
        try {
          packageTasks = parseJson(process.env.BOLT_PACKAGE_TASKS);
        } catch (error) {
          throw new Error(
            `Failed to parse BOLT_PACKAGE_TASKS: ${error instanceof Error ? error.message : "Unknown error"}`,
          );
        }
      }

      // Parse streaming configuration
      const streaming = {
        bufferMs: process.env.STREAMING_BUFFER_MS
          ? parseInt(process.env.STREAMING_BUFFER_MS, 10)
          : undefined,
        maxOutputSize: process.env.STREAMING_MAX_OUTPUT_SIZE
          ? parseInt(process.env.STREAMING_MAX_OUTPUT_SIZE, 10)
          : undefined,
        maxLineLength: process.env.STREAMING_MAX_LINE_LENGTH
          ? parseInt(process.env.STREAMING_MAX_LINE_LENGTH, 10)
          : undefined,
      };

      // Parse cache configuration
      const cache = {
        inventoryTtl: process.env.CACHE_INVENTORY_TTL
          ? parseInt(process.env.CACHE_INVENTORY_TTL, 10)
          : undefined,
        factsTtl: process.env.CACHE_FACTS_TTL
          ? parseInt(process.env.CACHE_FACTS_TTL, 10)
          : undefined,
      };

      // Parse execution queue configuration
      const executionQueue = {
        concurrentLimit: process.env.CONCURRENT_EXECUTION_LIMIT
          ? parseInt(process.env.CONCURRENT_EXECUTION_LIMIT, 10)
          : undefined,
        maxQueueSize: process.env.MAX_QUEUE_SIZE
          ? parseInt(process.env.MAX_QUEUE_SIZE, 10)
          : undefined,
      };

      // Parse integrations configuration
      const integrations = this.parseIntegrationsConfig();

      // Parse UI configuration
      const ui = {
        showHomePageRunChart:
          process.env.UI_SHOW_HOME_PAGE_RUN_CHART !== "false",
      };

      // Parse provisioning safety configuration
      const provisioning = {
        allowDestructiveActions:
          process.env.ALLOW_DESTRUCTIVE_PROVISIONING === "true",
      };

      // Build configuration object
      const rawConfig = {
        port: process.env.PORT ? parseInt(process.env.PORT, 10) : undefined,
        host: process.env.HOST,
        crashDumpDir: process.env.PABAWI_CRASH_DUMP_DIR ?? undefined,
        boltProjectPath: process.env.BOLT_PROJECT_PATH,
        jwtSecret: process.env.JWT_SECRET,
        lifecycleToken: process.env.PABAWI_LIFECYCLE_TOKEN,
        commandWhitelist,
        executionTimeout: process.env.BOLT_EXECUTION_TIMEOUT
          ? parseInt(process.env.BOLT_EXECUTION_TIMEOUT, 10)
          : undefined,
        logLevel: process.env.LOG_LEVEL,
        databasePath: process.env.DATABASE_PATH,
        dbType: process.env.DB_TYPE,
        databaseUrl: process.env.DATABASE_URL,
        corsAllowedOrigins: process.env.CORS_ALLOWED_ORIGINS
          ? process.env.CORS_ALLOWED_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean)
          : undefined,
        packageTasks,
        streaming,
        cache,
        executionQueue,
        integrations,
        provisioning,
        ui,
        mcpEnabled: process.env.MCP_ENABLED === "true",
        mcpAuthToken: process.env.MCP_AUTH_TOKEN ?? undefined,
        entraId: this.parseEntraIdConfig() ?? undefined,
        console: this.consoleConfig,
      };

      // Validate with Zod schema
      return AppConfigSchema.parse(rawConfig);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const issues = error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join(", ");
        throw new Error(`Configuration validation failed: ${issues}`);
      }
      throw error;
    }
  }

  /**
   * Get the complete application configuration
   */
  public getConfig(): AppConfig {
    return this.config;
  }

  /**
   * Get a specific configuration value
   */
  public get<K extends keyof AppConfig>(key: K): AppConfig[K] {
    return this.config[key];
  }

  /**
   * Get port number
   */
  public getPort(): number {
    return this.config.port;
  }

  /**
   * Get host address
   */
  public getHost(): string {
    return this.config.host;
  }

  /**
   * Get JWT secret for authentication token signing/verification
   */
  public getJwtSecret(): string {
    return this.config.jwtSecret;
  }

  /**
   * Get lifecycle token for inventory webhook authentication
   */
  public getLifecycleToken(): string {
    return this.config.lifecycleToken;
  }

  /**
   * Get Bolt project path
   */
  public getBoltProjectPath(): string {
    return this.config.boltProjectPath;
  }

  /**
   * Get command whitelist configuration
   */
  public getCommandWhitelist(): WhitelistConfig {
    return this.config.commandWhitelist;
  }

  /**
   * Get execution timeout in milliseconds
   */
  public getExecutionTimeout(): number {
    return this.config.executionTimeout;
  }

  /**
   * Get log level
   */
  public getLogLevel(): string {
    return this.config.logLevel;
  }

  /**
   * Get crash dump directory path.
   * Returns the configured path or undefined (crash handler falls back to <cwd>/crash-dumps).
   */
  public getCrashDumpDir(): string | undefined {
    return this.config.crashDumpDir;
  }

  /**
   * Get database path
   */
  public getDatabasePath(): string {
    return this.config.databasePath;
  }

  /**
   * Get package installation tasks configuration
   */
  public getPackageTasks(): typeof this.config.packageTasks {
    return this.config.packageTasks;
  }

  /**
   * Get streaming configuration
   */
  public getStreamingConfig(): typeof this.config.streaming {
    return this.config.streaming;
  }

  /**
   * Get cache configuration
   */
  public getCacheConfig(): typeof this.config.cache {
    return this.config.cache;
  }

  /**
   * Get execution queue configuration
   */
  public getExecutionQueueConfig(): typeof this.config.executionQueue {
    return this.config.executionQueue;
  }

  /**
   * Get integrations configuration
   */
  public getIntegrationsConfig(): typeof this.config.integrations {
    return this.config.integrations;
  }

  /**
   * Check whether destructive provisioning actions (destroy/terminate) are allowed
   */
  public isDestructiveProvisioningAllowed(): boolean {
    return this.config.provisioning.allowDestructiveActions;
  }

  /**
   * Check whether the embedded MCP server is enabled
   */
  public isMcpEnabled(): boolean {
    return this.config.mcpEnabled;
  }

  /**
   * Get the static MCP authentication token (if configured)
   */
  public getMcpAuthToken(): string | undefined {
    return this.config.mcpAuthToken;
  }

  /**
   * Get PuppetDB configuration if enabled
   */
  public getPuppetDBConfig():
    | (typeof this.config.integrations.puppetdb & { enabled: true })
    | null {
    const puppetdb = this.config.integrations.puppetdb;
    if (puppetdb?.enabled) {
      return puppetdb as typeof puppetdb & { enabled: true };
    }
    return null;
  }

  /**
   * Get Ansible configuration if enabled
   */
  public getAnsibleConfig():
    | (typeof this.config.integrations.ansible & { enabled: true })
    | null {
    const ansible = this.config.integrations.ansible;
    if (ansible?.enabled) {
      return ansible as typeof ansible & { enabled: true };
    }
    return null;
  }

  /**
   * Get Puppetserver configuration if enabled
   */
  public getPuppetserverConfig():
    | (typeof this.config.integrations.puppetserver & { enabled: true })
    | null {
    const puppetserver = this.config.integrations.puppetserver;
    if (puppetserver?.enabled) {
      return puppetserver as typeof puppetserver & { enabled: true };
    }
    return null;
  }

  /**
   * Get Hiera configuration if enabled
   */
  public getHieraConfig():
    | (typeof this.config.integrations.hiera & { enabled: true })
    | null {
    const hiera = this.config.integrations.hiera;
    if (hiera?.enabled) {
      return hiera as typeof hiera & { enabled: true };
    }
    return null;
  }

  /**
   * Get UI configuration
   */
  public getUIConfig(): typeof this.config.ui {
    return this.config.ui;
  }

  /**
   * Get AWS configuration if enabled
   */
  public getAWSConfig():
    | (typeof this.config.integrations.aws & { enabled: true })
    | null {
    const aws = this.config.integrations.aws;
    if (aws?.enabled) {
      return aws as typeof aws & { enabled: true };
    }
    return null;
  }

  /**
   * Get Azure configuration if enabled
   */
  public getAzureConfig():
    | (typeof this.config.integrations.azure & { enabled: true })
    | null {
    const azure = this.config.integrations.azure;
    if (azure?.enabled) {
      return azure as typeof azure & { enabled: true };
    }
    return null;
  }

  /**
   * Get Checkmk configuration if enabled
   */
  public getCheckmkConfig():
    | (typeof this.config.integrations.checkmk & { enabled: true })
    | null {
    const checkmk = this.config.integrations.checkmk;
    if (checkmk?.enabled) {
      return checkmk as typeof checkmk & { enabled: true };
    }
    return null;
  }

  /**
   * Get Entra ID authentication configuration if enabled.
   * Returns null when ENTRA_ID_ENABLED is not "true".
   */
  public getEntraIdConfig(): EntraIdConfig | null {
    return this.entraIdConfig;
  }

  /**
   * Get console session configuration
   */
  public getConsoleConfig(): ConsoleConfig {
    return this.consoleConfig;
  }
}
