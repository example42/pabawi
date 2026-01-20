<script lang="ts">
  import { showSuccess, showError } from '../lib/toast.svelte';
  import type { DebugInfo } from '../lib/api';
  import type { LogEntry } from '../lib/logger.svelte';

  interface FrontendDebugInfo {
    renderTime?: number;
    componentTree?: string[];
    url?: string;
    browserInfo?: {
      userAgent: string;
      viewport: { width: number; height: number };
      language: string;
      platform: string;
    };
    cookies?: Record<string, string>;
    localStorage?: Record<string, string>;
    sessionStorage?: Record<string, string>;
  }

  interface Props {
    data: unknown;
    debugInfo?: DebugInfo;
    frontendInfo?: FrontendDebugInfo;
    frontendLogs?: LogEntry[];
    label?: string;
    includeContext?: boolean;
    includePerformance?: boolean;
    includeBrowserInfo?: boolean;
    includeCookies?: boolean;
    includeStorage?: boolean;
    insideModal?: boolean; // If true, copy directly instead of opening a modal
  }

  let {
    data,
    debugInfo,
    frontendInfo,
    frontendLogs = [],
    label = 'Show Details',
    includeContext = true,
    includePerformance = true,
    includeBrowserInfo = true,
    includeCookies = false,
    includeStorage = false,
    insideModal = false
  }: Props = $props();

  // Modal state
  let showModal = $state(false);

  /**
   * Collect browser information dynamically
   */
  function collectBrowserInfo(): FrontendDebugInfo['browserInfo'] {
    if (typeof window === 'undefined') return undefined;

    return {
      userAgent: navigator.userAgent,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      language: navigator.language,
      platform: navigator.platform
    };
  }

  /**
   * Collect cookies dynamically
   */
  function collectCookies(): Record<string, string> {
    if (typeof document === 'undefined') return {};

    const cookies: Record<string, string> = {};
    const cookieString = document.cookie;

    if (cookieString) {
      cookieString.split(';').forEach(cookie => {
        const [key, value] = cookie.trim().split('=');
        if (key && value) {
          cookies[key] = value;
        }
      });
    }

    return cookies;
  }

  /**
   * Collect localStorage data dynamically
   */
  function collectLocalStorage(): Record<string, string> {
    if (typeof window === 'undefined' || !window.localStorage) return {};

    const storage: Record<string, string> = {};

    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          const value = localStorage.getItem(key);
          if (value !== null) {
            storage[key] = value;
          }
        }
      }
    } catch (error) {
      console.warn('Failed to read localStorage:', error);
    }

    return storage;
  }

  /**
   * Collect sessionStorage data dynamically
   */
  function collectSessionStorage(): Record<string, string> {
    if (typeof window === 'undefined' || !window.sessionStorage) return {};

    const storage: Record<string, string> = {};

    try {
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key) {
          const value = sessionStorage.getItem(key);
          if (value !== null) {
            storage[key] = value;
          }
        }
      }
    } catch (error) {
      console.warn('Failed to read sessionStorage:', error);
    }

    return storage;
  }

  /**
   * Format data for support requests with full context
   * Optimized for easy sharing with support teams and AI assistants
   */
  function formatForSupport(): string {
    const sections: string[] = [];

    // Header with clear formatting for AI parsing
    sections.push('='.repeat(80));
    sections.push('PABAWI DEBUG INFORMATION');
    sections.push('Generated: ' + new Date().toISOString());
    sections.push('='.repeat(80));
    sections.push('');

    // Debug Info Section
    if (debugInfo) {
      sections.push('--- BACKEND DEBUG INFORMATION ---');
      sections.push('');
      sections.push(`Timestamp: ${debugInfo.timestamp}`);
      sections.push(`Request ID: ${debugInfo.requestId}`);
      sections.push(`Operation: ${debugInfo.operation}`);
      sections.push(`Duration: ${debugInfo.duration}ms`);

      if (debugInfo.integration) {
        sections.push(`Integration: ${debugInfo.integration}`);
      }

      if (debugInfo.cacheHit !== undefined) {
        sections.push(`Cache Hit: ${debugInfo.cacheHit ? 'Yes' : 'No'}`);
      }

      sections.push('');

      // Errors (always include if present)
      if (debugInfo.errors && debugInfo.errors.length > 0) {
        sections.push('Errors:');
        debugInfo.errors.forEach((error, index) => {
          sections.push(`  ${index + 1}. ${error.message}`);
          if (error.code) {
            sections.push(`     Code: ${error.code}`);
          }
          if (error.stack) {
            sections.push(`     Stack Trace:`);
            error.stack.split('\n').forEach(line => {
              sections.push(`       ${line}`);
            });
          }
        });
        sections.push('');
      }

      // Warnings (always include if present)
      if (debugInfo.warnings && debugInfo.warnings.length > 0) {
        sections.push('Warnings:');
        debugInfo.warnings.forEach((warning, index) => {
          sections.push(`  ${index + 1}. ${warning.message}`);
          if (warning.context) {
            sections.push(`     Context: ${warning.context}`);
          }
        });
        sections.push('');
      }

      // Info Messages (always include if present)
      if (debugInfo.info && debugInfo.info.length > 0) {
        sections.push('Info Messages:');
        debugInfo.info.forEach((info, index) => {
          sections.push(`  ${index + 1}. ${info.message}`);
          if (info.context) {
            sections.push(`     Context: ${info.context}`);
          }
        });
        sections.push('');
      }

      // Debug Messages (always include if present)
      if (debugInfo.debug && debugInfo.debug.length > 0) {
        sections.push('Debug Messages:');
        debugInfo.debug.forEach((debug, index) => {
          sections.push(`  ${index + 1}. ${debug.message}`);
          if (debug.context) {
            sections.push(`     Context: ${debug.context}`);
          }
        });
        sections.push('');
      }

      // API Calls (always include if present)
      if (debugInfo.apiCalls && debugInfo.apiCalls.length > 0) {
        sections.push('API Calls:');
        debugInfo.apiCalls.forEach((call, index) => {
          sections.push(`  ${index + 1}. ${call.method} ${call.endpoint}`);
          sections.push(`     Status: ${call.status}`);
          sections.push(`     Duration: ${call.duration}ms`);
          sections.push(`     Cached: ${call.cached ? 'Yes' : 'No'}`);
        });
        sections.push('');
      }

      // Performance Metrics (optional based on includePerformance flag)
      if (includePerformance && debugInfo.performance) {
        sections.push('--- PERFORMANCE METRICS ---');
        sections.push('');
        sections.push('Backend Performance:');
        sections.push(`  Memory Usage: ${(debugInfo.performance.memoryUsage / (1024 * 1024)).toFixed(2)} MB`);
        sections.push(`  CPU Usage: ${debugInfo.performance.cpuUsage.toFixed(2)}%`);
        sections.push(`  Active Connections: ${debugInfo.performance.activeConnections}`);
        sections.push('');
        sections.push('Cache Statistics:');
        sections.push(`  Hit Rate: ${(debugInfo.performance.cacheStats.hitRate * 100).toFixed(1)}%`);
        sections.push(`  Cache Hits: ${debugInfo.performance.cacheStats.hits}`);
        sections.push(`  Cache Misses: ${debugInfo.performance.cacheStats.misses}`);
        sections.push(`  Cache Size: ${debugInfo.performance.cacheStats.size} items`);
        sections.push('');
        sections.push('Request Statistics:');
        sections.push(`  Total Requests: ${debugInfo.performance.requestStats.total}`);
        sections.push(`  Avg Duration: ${debugInfo.performance.requestStats.avgDuration.toFixed(2)}ms`);
        sections.push(`  P95 Duration: ${debugInfo.performance.requestStats.p95Duration.toFixed(2)}ms`);
        sections.push(`  P99 Duration: ${debugInfo.performance.requestStats.p99Duration.toFixed(2)}ms`);
        sections.push('');
      }

      // Request Context (optional based on includeContext flag)
      if (includeContext && debugInfo.context) {
        sections.push('--- REQUEST CONTEXT ---');
        sections.push('');
        sections.push(`URL: ${debugInfo.context.url}`);
        sections.push(`Method: ${debugInfo.context.method}`);
        sections.push(`User Agent: ${debugInfo.context.userAgent}`);
        sections.push(`IP Address: ${debugInfo.context.ip}`);
        sections.push(`Timestamp: ${debugInfo.context.timestamp}`);
        sections.push('');

        if (Object.keys(debugInfo.context.query).length > 0) {
          sections.push('Query Parameters:');
          Object.entries(debugInfo.context.query).forEach(([key, value]) => {
            sections.push(`  ${key}: ${value}`);
          });
          sections.push('');
        }

        if (Object.keys(debugInfo.context.headers).length > 0) {
          sections.push('Request Headers:');
          Object.entries(debugInfo.context.headers).forEach(([key, value]) => {
            sections.push(`  ${key}: ${value}`);
          });
          sections.push('');
        }
      }

      // Metadata (always include if present)
      if (debugInfo.metadata && Object.keys(debugInfo.metadata).length > 0) {
        sections.push('Additional Metadata:');
        sections.push(JSON.stringify(debugInfo.metadata, null, 2));
        sections.push('');
      }
    }

    // Frontend Info Section
    const currentBrowserInfo = includeBrowserInfo ? (frontendInfo?.browserInfo || collectBrowserInfo()) : undefined;
    const currentCookies = includeCookies ? (frontendInfo?.cookies || collectCookies()) : undefined;
    const currentLocalStorage = includeStorage ? (frontendInfo?.localStorage || collectLocalStorage()) : undefined;
    const currentSessionStorage = includeStorage ? (frontendInfo?.sessionStorage || collectSessionStorage()) : undefined;

    if (frontendInfo || currentBrowserInfo || currentCookies || currentLocalStorage || currentSessionStorage || frontendLogs.length > 0) {
      sections.push('--- FRONTEND INFORMATION ---');
      sections.push('');

      if (frontendInfo?.renderTime) {
        sections.push(`Render Time: ${frontendInfo.renderTime}ms`);
      }

      const currentUrl = frontendInfo?.url || (typeof window !== 'undefined' ? window.location.href : undefined);
      if (currentUrl) {
        sections.push(`Current URL: ${currentUrl}`);
      }

      if (currentBrowserInfo) {
        sections.push('');
        sections.push('Browser Information:');
        sections.push(`  Platform: ${currentBrowserInfo.platform}`);
        sections.push(`  Language: ${currentBrowserInfo.language}`);
        sections.push(`  Viewport: ${currentBrowserInfo.viewport.width}x${currentBrowserInfo.viewport.height}`);
        sections.push(`  User Agent: ${currentBrowserInfo.userAgent}`);
      }

      // Frontend Logs
      if (frontendLogs.length > 0) {
        sections.push('');
        sections.push('Frontend Logs:');
        sections.push('');

        // Sort logs by timestamp (newest first)
        const sortedLogs = [...frontendLogs].sort((a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );

        sortedLogs.forEach((log, index) => {
          sections.push(`  ${index + 1}. [${log.level.toUpperCase()}] ${log.timestamp}`);
          sections.push(`     Component: ${log.component}`);
          sections.push(`     Operation: ${log.operation}`);
          sections.push(`     Message: ${log.message}`);

          if (log.correlationId) {
            sections.push(`     Correlation ID: ${log.correlationId}`);
          }

          if (log.metadata && Object.keys(log.metadata).length > 0) {
            sections.push(`     Metadata: ${JSON.stringify(log.metadata)}`);
          }

          if (log.stackTrace) {
            sections.push(`     Stack Trace:`);
            log.stackTrace.split('\n').forEach(line => {
              sections.push(`       ${line}`);
            });
          }

          sections.push('');
        });
      }

      if (currentCookies && Object.keys(currentCookies).length > 0) {
        sections.push('');
        sections.push('Cookies:');
        Object.entries(currentCookies).forEach(([key, value]) => {
          sections.push(`  ${key}: ${value}`);
        });
      }

      if (currentLocalStorage && Object.keys(currentLocalStorage).length > 0) {
        sections.push('');
        sections.push('Local Storage:');
        Object.entries(currentLocalStorage).forEach(([key, value]) => {
          // Truncate long values for readability
          const displayValue = value.length > 100 ? value.substring(0, 100) + '...' : value;
          sections.push(`  ${key}: ${displayValue}`);
        });
      }

      if (currentSessionStorage && Object.keys(currentSessionStorage).length > 0) {
        sections.push('');
        sections.push('Session Storage:');
        Object.entries(currentSessionStorage).forEach(([key, value]) => {
          // Truncate long values for readability
          const displayValue = value.length > 100 ? value.substring(0, 100) + '...' : value;
          sections.push(`  ${key}: ${displayValue}`);
        });
      }

      if (frontendInfo?.componentTree && frontendInfo.componentTree.length > 0) {
        sections.push('');
        sections.push('Component Tree:');
        frontendInfo.componentTree.forEach(component => {
          sections.push(`  - ${component}`);
        });
      }

      sections.push('');
    }

    // Response Data Section (optional based on includeContext flag)
    if (includeContext && data) {
      sections.push('--- RESPONSE DATA ---');
      sections.push('');
      sections.push(JSON.stringify(data, null, 2));
      sections.push('');
    }

    // Footer with helpful instructions
    sections.push('='.repeat(80));
    sections.push('END OF DEBUG INFORMATION');
    sections.push('');
    sections.push('This debug information can be shared with support teams or AI assistants');
    sections.push('to help diagnose issues. It includes backend debug data, performance');
    sections.push('metrics, and frontend context information.');
    sections.push('='.repeat(80));

    return sections.join('\n');
  }

  /**
   * Copy debug information to clipboard
   */
  async function copyToClipboard(): Promise<void> {
    try {
      const formattedData = formatForSupport();

      // Use Clipboard API
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(formattedData);
        showSuccess('Debug information copied to clipboard', 'Ready to paste into support requests');
      } else {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = formattedData;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        try {
          document.execCommand('copy');
          showSuccess('Debug information copied to clipboard', 'Ready to paste into support requests');
        } catch (err) {
          throw new Error('Failed to copy using fallback method');
        } finally {
          document.body.removeChild(textArea);
        }
      }
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      showError(
        'Failed to copy to clipboard',
        error instanceof Error ? error.message : 'Please try again or manually copy the debug information'
      );
    }
  }

  /**
   * Open the modal or copy directly if inside a modal
   */
  function handleClick(): void {
    if (insideModal) {
      // If we're already inside a modal, just copy to clipboard
      copyToClipboard();
    } else {
      // Otherwise, open the modal
      showModal = true;
    }
  }

  /**
   * Close the modal
   */
  function closeModal(): void {
    showModal = false;
  }
</script>

<!-- Show Details / Copy Button -->
{#if insideModal}
  <!-- Inside a modal: show as a copy button -->
  <button
    type="button"
    class="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:bg-blue-500 dark:hover:bg-blue-600 transition-colors"
    onclick={copyToClipboard}
    aria-label="Copy debug information to clipboard"
  >
    <svg
      class="h-4 w-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
      />
    </svg>
    <span>Copy Debug Info</span>
  </button>
{:else}
  <!-- Not inside a modal: show as a button that opens a modal -->
  <button
    type="button"
    class="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:bg-blue-500 dark:hover:bg-blue-600 transition-colors"
    onclick={handleClick}
    aria-label={label}
  >
    <svg
      class="h-4 w-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
    <span>{label}</span>
  </button>
{/if}

<!-- Modal -->
{#if showModal}
  <div class="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
    <div class="flex min-h-screen items-end justify-center px-4 pt-4 pb-20 text-center sm:block sm:p-0">
      <!-- Background overlay -->
      <div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true" onclick={closeModal}></div>

      <!-- Center modal -->
      <span class="hidden sm:inline-block sm:h-screen sm:align-middle" aria-hidden="true">&#8203;</span>

      <div class="inline-block transform overflow-hidden rounded-lg bg-white dark:bg-gray-800 text-left align-bottom shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-4xl sm:align-middle">
        <div class="bg-white dark:bg-gray-800 px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
          <div class="flex items-start justify-between mb-4">
            <h3 class="text-lg font-medium leading-6 text-gray-900 dark:text-gray-100" id="modal-title">
              Complete Debug Information
            </h3>
            <button
              type="button"
              class="rounded-md bg-white dark:bg-gray-800 text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              onclick={closeModal}
            >
              <span class="sr-only">Close</span>
              <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- Debug info content -->
          <div class="max-h-[70vh] overflow-y-auto">
            <pre class="overflow-x-auto rounded-lg border border-gray-200 bg-gray-50 p-4 text-xs text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 whitespace-pre-wrap">{formatForSupport()}</pre>
          </div>
        </div>

        <div class="bg-gray-50 dark:bg-gray-900 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6 gap-3">
          <button
            type="button"
            class="inline-flex w-full justify-center items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 sm:w-auto"
            onclick={copyToClipboard}
          >
            <svg
              class="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
            Copy to Clipboard
          </button>
          <button
            type="button"
            class="mt-3 inline-flex w-full justify-center rounded-md bg-white dark:bg-gray-700 px-3 py-2 text-sm font-semibold text-gray-900 dark:text-gray-100 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 sm:mt-0 sm:w-auto"
            onclick={closeModal}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}
