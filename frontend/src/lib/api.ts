/**
 * API utility functions with retry logic and error handling
 */

import { expertMode } from './expertMode.svelte';
import { showWarning } from './toast.svelte';

export type ErrorType = 'connection' | 'authentication' | 'timeout' | 'validation' | 'not_found' | 'permission' | 'execution' | 'configuration' | 'unknown';

export interface TroubleshootingGuidance {
  steps: string[];
  documentation?: string;
  relatedErrors?: string[];
}

export interface ApiError {
  code: string;
  message: string;
  type: ErrorType;
  actionableMessage: string;
  troubleshooting?: TroubleshootingGuidance;
  details?: unknown;
  // Expert mode fields
  stackTrace?: string;
  requestId?: string;
  timestamp?: string;
  rawResponse?: unknown;
  executionContext?: unknown;
  boltCommand?: string;
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
  timeout?: number;
  signal?: AbortSignal;
  showRetryNotifications?: boolean; // New option to control retry notifications
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  retryDelay: 1000,
  retryableStatuses: [408, 429, 500, 502, 503, 504],
  onRetry: () => {
    // Default no-op retry handler
  },
  timeout: undefined,
  signal: undefined,
  showRetryNotifications: true, // Show retry notifications by default
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
        type: data.error.type || 'unknown',
        actionableMessage: data.error.actionableMessage || data.error.message || 'An unknown error occurred',
        troubleshooting: data.error.troubleshooting,
        details: data.error.details,
        stackTrace: data.error.stackTrace,
        requestId: data.error.requestId,
        timestamp: data.error.timestamp,
        rawResponse: data.error.rawResponse,
        executionContext: data.error.executionContext,
        boltCommand: data.error.boltCommand,
      };
    }
    // If no error field, fall through to default error
  } catch {
    // Failed to parse JSON, use status text
  }

  // Categorize HTTP error
  const type = categorizeHttpError(response.status);
  const actionableMessage = getActionableMessageForStatus(response.status);

  return {
    code: `HTTP_${String(response.status)}`,
    message: response.statusText !== '' ? response.statusText : 'Request failed',
    type,
    actionableMessage,
  };
}

/**
 * Categorize HTTP status code into error type
 */
function categorizeHttpError(status: number): ErrorType {
  if (status === 401) return 'authentication';
  if (status === 403) return 'permission';
  if (status === 404) return 'not_found';
  if (status === 408 || status === 504) return 'timeout';
  if (status >= 400 && status < 500) return 'validation';
  if (status === 503) return 'connection';
  return 'unknown';
}

/**
 * Get actionable message for HTTP status code
 */
function getActionableMessageForStatus(status: number): string {
  switch (status) {
    case 400:
      return 'Invalid request. Check your input and try again.';
    case 401:
      return 'Authentication required. Please log in and try again.';
    case 403:
      return 'You don\'t have permission to perform this action.';
    case 404:
      return 'The requested resource was not found.';
    case 408:
      return 'Request timed out. Please try again.';
    case 429:
      return 'Too many requests. Please wait a moment and try again.';
    case 500:
      return 'Server error occurred. Please try again later.';
    case 502:
      return 'Bad gateway. The server is temporarily unavailable.';
    case 503:
      return 'Service unavailable. Please try again later.';
    case 504:
      return 'Gateway timeout. The operation took too long to complete.';
    default:
      return 'An error occurred. Please try again.';
  }
}

/**
 * Fetch with retry logic and expert mode header support
 */
export async function fetchWithRetry<T = unknown>(
  url: string,
  options?: RequestInit,
  retryOptions?: RetryOptions
): Promise<T> {
  // Merge options with defaults, ensuring required fields are present
  const maxRetries = retryOptions?.maxRetries ?? DEFAULT_RETRY_OPTIONS.maxRetries!;
  const retryDelay = retryOptions?.retryDelay ?? DEFAULT_RETRY_OPTIONS.retryDelay!;
  const retryableStatuses = retryOptions?.retryableStatuses ?? DEFAULT_RETRY_OPTIONS.retryableStatuses!;
  const onRetry = retryOptions?.onRetry ?? DEFAULT_RETRY_OPTIONS.onRetry!;
  const timeout = retryOptions?.timeout;
  const signal = retryOptions?.signal;
  const showRetryNotifications = retryOptions?.showRetryNotifications ?? DEFAULT_RETRY_OPTIONS.showRetryNotifications!;

  let lastError: Error | null = null;

  // Add expert mode header if enabled
  const headers = new Headers(options?.headers);
  if (expertMode.enabled) {
    headers.set('X-Expert-Mode', 'true');
  }

  // Create abort controller for timeout if specified
  let timeoutId: number | undefined;
  let timeoutController: AbortController | undefined;

  if (timeout && !signal) {
    timeoutController = new AbortController();
    timeoutId = window.setTimeout(() => {
      timeoutController?.abort();
    }, timeout);
  }

  // Use provided signal or timeout controller signal
  const requestSignal = signal ?? timeoutController?.signal;

  const requestOptions: RequestInit = {
    ...options,
    headers,
    signal: requestSignal,
  };

  try {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(url, requestOptions);

        // If response is OK, parse and return data
        if (response.ok) {
          return await response.json() as T;
        }

        // Check if status is retryable
        if (attempt < maxRetries && isRetryableStatus(response.status, retryableStatuses)) {
          const error = await parseErrorResponse(response);
          lastError = new Error(error.message);
          onRetry(attempt + 1, lastError);

          // Show retry notification in UI
          if (showRetryNotifications) {
            const nextDelay = retryDelay * (attempt + 1);
            showWarning(
              `Request failed (${error.type}), retrying...`,
              `Attempt ${String(attempt + 1)} of ${String(maxRetries)}. Retrying in ${String(nextDelay)}ms`
            );
          }

          await sleep(retryDelay * (attempt + 1)); // Exponential backoff
          continue;
        }

        // Non-retryable error, throw immediately
        const error = await parseErrorResponse(response);
        throw new Error(error.message);
      } catch (error) {
        // Check if request was aborted
        if (error instanceof Error && error.name === 'AbortError') {
          throw error; // Don't retry aborted requests
        }

        // Network errors are retryable
        if (attempt < maxRetries && isNetworkError(error)) {
          lastError = error as Error;
          onRetry(attempt + 1, lastError);

          // Show retry notification in UI
          if (showRetryNotifications) {
            const nextDelay = retryDelay * (attempt + 1);
            showWarning(
              'Network error, retrying...',
              `Attempt ${String(attempt + 1)} of ${String(maxRetries)}. Retrying in ${String(nextDelay)}ms`
            );
          }

          await sleep(retryDelay * (attempt + 1)); // Exponential backoff
          continue;
        }

        // Non-retryable error or max retries reached
        throw error;
      }
    }

    // Max retries reached
    throw lastError ?? new Error('Request failed after maximum retries');
  } finally {
    // Clear timeout if it was set
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }
  }
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
