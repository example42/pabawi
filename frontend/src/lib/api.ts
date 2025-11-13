/**
 * API utility functions with retry logic and error handling
 */

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiResponse<T> {
  data?: T;
  error?: ApiError;
}

export interface RetryOptions {
  maxRetries?: number;
  retryDelay?: number;
  retryableStatuses?: number[];
  onRetry?: (attempt: number, error: Error) => void;
}

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  retryDelay: 1000,
  retryableStatuses: [408, 429, 500, 502, 503, 504],
  onRetry: () => {
    // Default no-op retry handler
  },
};

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if an HTTP status code is retryable
 */
function isRetryableStatus(status: number, retryableStatuses: number[]): boolean {
  return retryableStatuses.includes(status);
}

/**
 * Check if an error is a network error
 */
function isNetworkError(error: unknown): boolean {
  return (
    error instanceof TypeError &&
    (error.message.includes('fetch') ||
      error.message.includes('network') ||
      error.message.includes('Failed to fetch'))
  );
}

/**
 * Parse error response from API
 */
async function parseErrorResponse(response: Response): Promise<ApiError> {
  try {
    const data = await response.json() as { error?: ApiError };
    if (data.error) {
      return {
        code: data.error.code || 'UNKNOWN_ERROR',
        message: data.error.message || 'An unknown error occurred',
        details: data.error.details,
      };
    }
  } catch {
    // Failed to parse JSON, use status text
  }

  return {
    code: `HTTP_${String(response.status)}`,
    message: response.statusText ?? 'Request failed',
  };
}

/**
 * Fetch with retry logic
 */
export async function fetchWithRetry<T = unknown>(
  url: string,
  options?: RequestInit,
  retryOptions?: RetryOptions
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...retryOptions };
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      // If response is OK, parse and return data
      if (response.ok) {
        return await response.json() as T;
      }

      // Check if status is retryable
      if (attempt < opts.maxRetries && isRetryableStatus(response.status, opts.retryableStatuses)) {
        const error = await parseErrorResponse(response);
        lastError = new Error(error.message);
        opts.onRetry(attempt + 1, lastError);
        await sleep(opts.retryDelay * (attempt + 1)); // Exponential backoff
        continue;
      }

      // Non-retryable error, throw immediately
      const error = await parseErrorResponse(response);
      throw new Error(error.message);
    } catch (error) {
      // Network errors are retryable
      if (attempt < opts.maxRetries && isNetworkError(error)) {
        lastError = error as Error;
        opts.onRetry(attempt + 1, lastError);
        await sleep(opts.retryDelay * (attempt + 1)); // Exponential backoff
        continue;
      }

      // Non-retryable error or max retries reached
      throw error;
    }
  }

  // Max retries reached
  throw lastError || new Error('Request failed after maximum retries');
}

/**
 * GET request with retry
 */
export async function get<T = unknown>(
  url: string,
  retryOptions?: RetryOptions
): Promise<T> {
  return fetchWithRetry<T>(url, { method: 'GET' }, retryOptions);
}

/**
 * POST request with retry
 */
export async function post<T = unknown>(
  url: string,
  body?: unknown,
  retryOptions?: RetryOptions
): Promise<T> {
  return fetchWithRetry<T>(
    url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    },
    retryOptions
  );
}

/**
 * PUT request with retry
 */
export async function put<T = unknown>(
  url: string,
  body?: unknown,
  retryOptions?: RetryOptions
): Promise<T> {
  return fetchWithRetry<T>(
    url,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    },
    retryOptions
  );
}

/**
 * DELETE request with retry
 */
export async function del<T = unknown>(
  url: string,
  retryOptions?: RetryOptions
): Promise<T> {
  return fetchWithRetry<T>(url, { method: 'DELETE' }, retryOptions);
}

/**
 * Get user-friendly error message with actionable guidance
 */
export function getErrorGuidance(error: unknown): { message: string; guidance: string } {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Network errors
    if (message.includes('fetch') || message.includes('network')) {
      return {
        message: 'Network connection failed',
        guidance: 'Check your internet connection and try again. If the problem persists, the server may be down.',
      };
    }

    // Timeout errors
    if (message.includes('timeout')) {
      return {
        message: 'Request timed out',
        guidance: 'The operation took too long to complete. Try again or check if the target node is reachable.',
      };
    }

    // Authentication errors
    if (message.includes('unauthorized') || message.includes('authentication')) {
      return {
        message: 'Authentication failed',
        guidance: 'Your session may have expired. Please refresh the page and try again.',
      };
    }

    // Permission errors
    if (message.includes('forbidden') || message.includes('permission')) {
      return {
        message: 'Permission denied',
        guidance: 'You do not have permission to perform this action. Contact your administrator.',
      };
    }

    // Not found errors
    if (message.includes('not found')) {
      return {
        message: 'Resource not found',
        guidance: 'The requested resource does not exist. It may have been deleted or moved.',
      };
    }

    // Command whitelist errors
    if (message.includes('whitelist') || message.includes('not allowed')) {
      return {
        message: 'Command not allowed',
        guidance: 'This command is not in the whitelist. Contact your administrator to add it or enable allow-all mode.',
      };
    }

    // Node unreachable errors
    if (message.includes('unreachable') || message.includes('connection refused')) {
      return {
        message: 'Node unreachable',
        guidance: 'Cannot connect to the target node. Check if the node is online and network connectivity is working.',
      };
    }

    // Bolt execution errors
    if (message.includes('bolt')) {
      return {
        message: 'Bolt execution failed',
        guidance: 'The Bolt command failed to execute. Check the error details and verify your Bolt configuration.',
      };
    }

    // Generic error
    return {
      message: error.message,
      guidance: 'An unexpected error occurred. Try again or contact support if the problem persists.',
    };
  }

  return {
    message: 'An unknown error occurred',
    guidance: 'Please try again. If the problem persists, contact support.',
  };
}
