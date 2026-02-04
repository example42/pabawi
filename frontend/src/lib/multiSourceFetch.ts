/**
 * Multi-Source Data Fetching with Graceful Degradation
 *
 * Utilities for fetching data from multiple sources (e.g., multiple plugins)
 * with graceful degradation when one or more sources fail.
 *
 * Implements requirements:
 * - 1.5: Display error messages and continue showing data from other sources
 * - 4.5: Display error messages while preserving other node detail functionality
 * - 6.5: Display error messages while preserving facts from other sources
 * - 8.5: Operate normally when a plugin is not configured
 */

export interface SourceResult<T> {
  source: string;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  loading: boolean;
}

export interface MultiSourceResult<T> {
  results: SourceResult<T>[];
  hasData: boolean;
  hasErrors: boolean;
  allFailed: boolean;
}

/**
 * Fetch data from multiple sources with graceful degradation
 *
 * @param sources - Array of source configurations
 * @returns Multi-source result with data and errors
 */
export async function fetchFromMultipleSources<T>(
  sources: {
    name: string;
    fetch: () => Promise<T>;
    optional?: boolean; // If true, don't count failures against allFailed
  }[],
): Promise<MultiSourceResult<T>> {
  const results: SourceResult<T>[] = [];

  // Fetch from all sources in parallel
  await Promise.all(
    sources.map(async (source) => {
      const result: SourceResult<T> = {
        source: source.name,
        loading: true,
      };

      try {
        result.data = await source.fetch();
        result.loading = false;
      } catch (error) {
        result.loading = false;

        // Parse error response
        if (error instanceof Response) {
          try {
            const errorData = (await error.json()) as {
              error?: {
                code?: string;
                message?: string;
                details?: unknown;
              };
            };
            result.error = {
              code: errorData.error?.code ?? "UNKNOWN_ERROR",
              message: errorData.error?.message ?? "An unknown error occurred",
              details: errorData.error?.details,
            };
          } catch {
            result.error = {
              code: "PARSE_ERROR",
              message: `Failed to parse error response from ${source.name}`,
            };
          }
        } else if (error instanceof Error) {
          result.error = {
            code: "FETCH_ERROR",
            message: error.message,
          };
        } else {
          result.error = {
            code: "UNKNOWN_ERROR",
            message: String(error),
          };
        }

        // Log error for debugging
        console.warn(`[${source.name}] Fetch failed:`, result.error);
      }

      results.push(result);
    }),
  );

  // Calculate summary statistics
  const hasData = results.some((r) => r.data !== undefined);
  const hasErrors = results.some((r) => r.error !== undefined);

  // Check if all required sources failed
  const requiredSources = sources.filter((s) => !s.optional);
  const requiredResults = results.filter((r) =>
    requiredSources.some((s) => s.name === r.source),
  );
  const allFailed =
    requiredResults.length > 0 &&
    requiredResults.every((r) => r.error !== undefined);

  return {
    results,
    hasData,
    hasErrors,
    allFailed,
  };
}

/**
 * Check if an error indicates the source is not configured
 *
 * @param error - Error object
 * @returns true if error indicates source is not configured
 */
export function isNotConfiguredError(error?: {
  code: string;
  message: string;
}): boolean {
  if (!error) return false;

  // Check for generic not configured error codes
  return error.code.includes('NOT_CONFIGURED') || error.code.includes('NOT_INITIALIZED');
}

/**
 * Check if an error indicates a connection failure
 *
 * @param error - Error object
 * @returns true if error indicates connection failure
 */
export function isConnectionError(error?: {
  code: string;
  message: string;
}): boolean {
  if (!error) return false;

  // Check for generic connection error codes
  return error.code.includes('CONNECTION_ERROR') || error.code === 'FETCH_ERROR';
}

/**
 * Get user-friendly error message with troubleshooting guidance
 *
 * Implements requirement 14.2: Provide actionable error messages with troubleshooting guidance
 *
 * @param source - Source name
 * @param error - Error object
 * @returns User-friendly error message
 */
export function getUserFriendlyErrorMessage(
  source: string,
  error: { code: string; message: string; details?: unknown },
): string {
  // Not configured errors
  if (isNotConfiguredError(error)) {
    return `${source} is not configured. The system will continue to operate using other available data sources.`;
  }

  // Connection errors
  if (isConnectionError(error)) {
    return `Unable to connect to ${source}. Please check that ${source} is running and accessible. Data from other sources will still be displayed.`;
  }

  // Authentication errors
  if (
    error.code.includes('AUTH_ERROR')
  ) {
    return `Authentication failed for ${source}. Please check your credentials and try again. Data from other sources will still be displayed.`;
  }

  // Timeout errors
  if (error.code.includes('TIMEOUT_ERROR')) {
    return `Request to ${source} timed out. The server may be overloaded. Data from other sources will still be displayed.`;
  }

  // Configuration errors
  if (
    error.code.includes('CONFIG_ERROR')
  ) {
    return `${source} configuration error: ${error.message}. Please check your configuration. Data from other sources will still be displayed.`;
  }

  // Generic error with original message
  return `${source} error: ${error.message}. Data from other sources will still be displayed.`;
}

/**
 * Merge facts from multiple sources
 *
 * Implements requirement 6.3: Display facts from both sources with timestamps
 *
 * @param results - Results from multiple sources
 * @returns Merged facts with source attribution
 */
export function mergeFactsFromSources(
  results: SourceResult<{
    facts: {
      gatheredAt: string;
      source: string;
      facts: Record<string, unknown>;
      categories?: {
        system: Record<string, unknown>;
        network: Record<string, unknown>;
        hardware: Record<string, unknown>;
        custom: Record<string, unknown>;
      };
    };
  }>[],
): {
  factsBySources: {
    source: string;
    gatheredAt: string;
    facts: Record<string, unknown>;
    categories?: {
      system: Record<string, unknown>;
      network: Record<string, unknown>;
      hardware: Record<string, unknown>;
      custom: Record<string, unknown>;
    };
  }[];
  errors: {
    source: string;
    message: string;
  }[];
} {
  const factsBySources: {
    source: string;
    gatheredAt: string;
    facts: Record<string, unknown>;
    categories?: {
      system: Record<string, unknown>;
      network: Record<string, unknown>;
      hardware: Record<string, unknown>;
      custom: Record<string, unknown>;
    };
  }[] = [];

  const errors: {
    source: string;
    message: string;
  }[] = [];

  for (const result of results) {
    if (result.data) {
      factsBySources.push({
        source: result.source,
        gatheredAt: result.data.facts.gatheredAt,
        facts: result.data.facts.facts,
        categories: result.data.facts.categories,
      });
    } else if (result.error) {
      // Only add error if it's not a "not configured" error
      if (!isNotConfiguredError(result.error)) {
        errors.push({
          source: result.source,
          message: getUserFriendlyErrorMessage(result.source, result.error),
        });
      }
    }
  }

  return { factsBySources, errors };
}
