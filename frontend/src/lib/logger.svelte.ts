/**
 * Frontend Logger Service
 *
 * Provides structured logging for frontend operations with:
 * - Automatic data obfuscation for sensitive fields
 * - Circular buffer for recent logs
 * - Optional backend sync when expert mode enabled
 * - Correlation ID support for request tracking
 */

import { expertMode } from './expertMode.svelte';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  component: string;
  operation: string;
  message: string;
  metadata?: Record<string, unknown>;
  correlationId?: string;
  stackTrace?: string;
}

export interface LoggerConfig {
  logLevel: LogLevel;
  sendToBackend: boolean;
  bufferSize: number;
  includePerformance: boolean;
  throttleMs: number;
}

// Sensitive field patterns to obfuscate
const SENSITIVE_PATTERNS = [
  /password/i,
  /token/i,
  /secret/i,
  /api[_-]?key/i,
  /auth/i,
  /credential/i,
  /private[_-]?key/i,
  /session/i,
  /cookie/i,
];

// Default configuration
const DEFAULT_CONFIG: LoggerConfig = {
  logLevel: 'info',
  sendToBackend: false,
  bufferSize: 100,
  includePerformance: true,
  throttleMs: 1000, // Send logs max once per second
};

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

class FrontendLogger {
  private buffer: LogEntry[] = [];
  private config: LoggerConfig;
  private pendingLogs: LogEntry[] = [];
  private throttleTimer: number | null = null;
  private currentCorrelationId: string | null = null;

  constructor() {
    // Load config from localStorage
    const stored = typeof window !== 'undefined'
      ? localStorage.getItem('pabawi_logger_config')
      : null;

    this.config = stored ? { ...DEFAULT_CONFIG, ...(JSON.parse(stored) as Partial<LoggerConfig>) } : DEFAULT_CONFIG;

    // Auto-enable backend sync when expert mode is enabled
    // We'll check expert mode state on each log operation instead of using $effect
  }

  /**
   * Check if backend sync should be enabled based on expert mode
   */
  private shouldSendToBackend(): boolean {
    return expertMode.enabled;
  }

  /**
   * Save configuration to localStorage
   */
  private saveConfig(): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem('pabawi_logger_config', JSON.stringify(this.config));
    }
  }

  /**
   * Check if a log level should be logged based on current config
   */
  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.config.logLevel];
  }

  /**
   * Obfuscate sensitive data in objects
   */
  private obfuscateData(data: unknown): unknown {
    if (data === null || data === undefined) {
      return data;
    }

    if (typeof data === 'string') {
      // Don't obfuscate strings directly, only when they're values of sensitive keys
      return data;
    }

    if (Array.isArray(data)) {
      return data.map(item => this.obfuscateData(item));
    }

    if (typeof data === 'object') {
      const result: Record<string, unknown> = {};

      for (const [key, value] of Object.entries(data)) {
        // Check if key matches sensitive pattern
        const isSensitive = SENSITIVE_PATTERNS.some(pattern => pattern.test(key));

        if (isSensitive) {
          result[key] = '***';
        } else if (typeof value === 'object' && value !== null) {
          result[key] = this.obfuscateData(value);
        } else {
          result[key] = value;
        }
      }

      return result;
    }

    return data;
  }

  /**
   * Add log entry to buffer
   */
  private addToBuffer(entry: LogEntry): void {
    // Add to circular buffer
    this.buffer.push(entry);
    if (this.buffer.length > this.config.bufferSize) {
      this.buffer.shift(); // Remove oldest entry
    }

    // Add to pending logs for backend sync if expert mode is enabled
    if (this.shouldSendToBackend()) {
      this.pendingLogs.push(entry);
      this.scheduleBackendSync();

      // Also log to console when expert mode is enabled
      if (entry.level === 'error') {
        console.error(`[${entry.component}] ${entry.operation}: ${entry.message}`, entry.metadata ?? '');
      } else if (entry.level === 'warn') {
        console.warn(`[${entry.component}] ${entry.operation}: ${entry.message}`, entry.metadata ?? '');
      }
    }
  }

  /**
   * Schedule throttled backend sync
   */
  private scheduleBackendSync(): void {
    if (this.throttleTimer !== null) {
      return; // Already scheduled
    }

    this.throttleTimer = window.setTimeout(() => {
      this.sendLogsToBackend();
      this.throttleTimer = null;
    }, this.config.throttleMs);
  }

  /**
   * Send pending logs to backend
   */
  private sendLogsToBackend(): void {
    if (this.pendingLogs.length === 0) {
      return;
    }

    const logsToSend = [...this.pendingLogs];
    this.pendingLogs = [];

    fetch('/api/debug/frontend-logs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        logs: logsToSend,
        browserInfo: this.getBrowserInfo(),
      }),
    }).catch((error: unknown) => {
      // Failed to send logs - add back to buffer but don't retry
      // to avoid infinite loops
      console.warn('Failed to send logs to backend:', error);
    });
  }

  /**
   * Get browser information for context
   */
  private getBrowserInfo(): {
    userAgent: string;
    language: string;
    platform: string;
    viewport: { width: number; height: number };
    url: string;
  } | null {
    if (typeof window === 'undefined') {
      return null;
    }

    return {
      userAgent: navigator.userAgent,
      language: navigator.language,
      platform: this.getPlatform(),
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      url: window.location.href,
    };
  }

  /**
   * Get platform information using modern API with fallback
   */
  private getPlatform(): string {
    // Use modern userAgentData API if available
    if ('userAgentData' in navigator && navigator.userAgentData) {
      return (navigator.userAgentData as { platform?: string }).platform ?? 'unknown';
    }
    // Fallback to userAgent parsing
    const ua = navigator.userAgent;
    if (ua.includes('Win')) return 'Windows';
    if (ua.includes('Mac')) return 'macOS';
    if (ua.includes('Linux')) return 'Linux';
    if (ua.includes('Android')) return 'Android';
    if (ua.includes('iOS') || ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
    return 'unknown';
  }

  /**
   * Generate a correlation ID for tracking related operations
   */
  public generateCorrelationId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 11);
    return `frontend_${timestamp}_${random}`;
  }

  /**
   * Set correlation ID for subsequent logs
   */
  public setCorrelationId(id: string): void {
    this.currentCorrelationId = id;
  }

  /**
   * Clear correlation ID
   */
  public clearCorrelationId(): void {
    this.currentCorrelationId = null;
  }

  /**
   * Get current correlation ID
   */
  public getCorrelationId(): string | null {
    return this.currentCorrelationId;
  }

  /**
   * Log debug message
   */
  public debug(
    component: string,
    operation: string,
    message: string,
    metadata?: Record<string, unknown>
  ): void {
    if (!this.shouldLog('debug')) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'debug',
      component,
      operation,
      message,
      metadata: metadata ? this.obfuscateData(metadata) as Record<string, unknown> : undefined,
      correlationId: this.currentCorrelationId ?? undefined,
    };

    this.addToBuffer(entry);
  }

  /**
   * Log info message
   */
  public info(
    component: string,
    operation: string,
    message: string,
    metadata?: Record<string, unknown>
  ): void {
    if (!this.shouldLog('info')) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'info',
      component,
      operation,
      message,
      metadata: metadata ? this.obfuscateData(metadata) as Record<string, unknown> : undefined,
      correlationId: this.currentCorrelationId ?? undefined,
    };

    this.addToBuffer(entry);
  }

  /**
   * Log warning message
   */
  public warn(
    component: string,
    operation: string,
    message: string,
    metadata?: Record<string, unknown>
  ): void {
    if (!this.shouldLog('warn')) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'warn',
      component,
      operation,
      message,
      metadata: metadata ? this.obfuscateData(metadata) as Record<string, unknown> : undefined,
      correlationId: this.currentCorrelationId ?? undefined,
    };

    this.addToBuffer(entry);
  }

  /**
   * Log error message
   */
  public error(
    component: string,
    operation: string,
    message: string,
    error?: Error,
    metadata?: Record<string, unknown>
  ): void {
    if (!this.shouldLog('error')) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'error',
      component,
      operation,
      message,
      metadata: metadata ? this.obfuscateData(metadata) as Record<string, unknown> : undefined,
      correlationId: this.currentCorrelationId ?? undefined,
      stackTrace: error?.stack,
    };

    this.addToBuffer(entry);
  }

  /**
   * Get all logs from buffer
   */
  public getLogs(): LogEntry[] {
    return [...this.buffer];
  }

  /**
   * Get logs filtered by correlation ID
   */
  public getLogsByCorrelationId(correlationId: string): LogEntry[] {
    return this.buffer.filter(entry => entry.correlationId === correlationId);
  }

  /**
   * Clear log buffer
   */
  public clearLogs(): void {
    this.buffer = [];
  }

  /**
   * Update logger configuration
   */
  public updateConfig(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config };
    this.saveConfig();
  }

  /**
   * Get current configuration
   */
  public getConfig(): LoggerConfig {
    return { ...this.config };
  }

  /**
   * Flush pending logs immediately (useful before page unload)
   */
  public flush(): void {
    if (this.throttleTimer !== null) {
      window.clearTimeout(this.throttleTimer);
      this.throttleTimer = null;
    }
    this.sendLogsToBackend();
  }
}

// Export singleton instance
export const logger = new FrontendLogger();

// Flush logs before page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    logger.flush();
  });
}
