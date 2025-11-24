/**
 * Circuit Breaker Pattern
 *
 * Implements the circuit breaker pattern to prevent cascading failures
 * and allow failing services time to recover.
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Too many failures, requests fail immediately
 * - HALF_OPEN: Testing if service has recovered
 */

/**
 * Circuit breaker state
 */
export type CircuitBreakerState = "closed" | "open" | "half-open";

/**
 * Configuration for circuit breaker
 */
export interface CircuitBreakerConfig {
  /** Number of failures before opening circuit */
  failureThreshold: number;

  /** Time in milliseconds before attempting to close circuit */
  resetTimeout: number;

  /** Timeout in milliseconds for operations */
  timeout?: number;

  /** Callback invoked when circuit state changes */
  onStateChange?: (oldState: CircuitBreakerState, newState: CircuitBreakerState) => void;

  /** Callback invoked when circuit opens */
  onOpen?: (failureCount: number) => void;

  /** Callback invoked when circuit closes */
  onClose?: () => void;
}

/**
 * Circuit breaker error
 */
export class CircuitBreakerOpenError extends Error {
  constructor(message: string = "Circuit breaker is open") {
    super(message);
    this.name = "CircuitBreakerOpenError";
  }
}

/**
 * Circuit breaker statistics
 */
export interface CircuitBreakerStats {
  state: CircuitBreakerState;
  failureCount: number;
  successCount: number;
  lastFailureTime?: number;
  lastSuccessTime?: number;
  openedAt?: number;
}

/**
 * Circuit Breaker
 *
 * Protects operations from cascading failures by:
 * 1. Tracking failure rate
 * 2. Opening circuit after threshold is reached
 * 3. Allowing periodic test requests to check recovery
 * 4. Closing circuit when service recovers
 */
export class CircuitBreaker {
  private state: CircuitBreakerState = "closed";
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime?: number;
  private lastSuccessTime?: number;
  private openedAt?: number;

  /**
   * Create a new circuit breaker
   *
   * @param config - Circuit breaker configuration
   */
  constructor(private config: CircuitBreakerConfig) {
    if (config.failureThreshold < 1) {
      throw new Error("Failure threshold must be at least 1");
    }

    if (config.resetTimeout < 0) {
      throw new Error("Reset timeout must be non-negative");
    }
  }

  /**
   * Execute an operation with circuit breaker protection
   *
   * @param operation - Async operation to execute
   * @returns Result of the operation
   * @throws CircuitBreakerOpenError if circuit is open
   * @throws Original error if operation fails
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    // Check if circuit should transition from open to half-open
    if (this.state === "open") {
      if (this.shouldAttemptReset()) {
        this.transitionTo("half-open");
      } else {
        throw new CircuitBreakerOpenError(
          `Circuit breaker is open. Service will be retried after ${String(this.getRemainingResetTime())}ms`,
        );
      }
    }

    try {
      // Execute operation with timeout if configured
      const result = this.config.timeout
        ? await this.executeWithTimeout(operation, this.config.timeout)
        : await operation();

      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Execute operation with timeout
   *
   * @param operation - Operation to execute
   * @param timeout - Timeout in milliseconds
   * @returns Result of operation
   */
  private async executeWithTimeout<T>(
    operation: () => Promise<T>,
    timeout: number,
  ): Promise<T> {
    return Promise.race([
      operation(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Operation timed out")), timeout),
      ),
    ]);
  }

  /**
   * Handle successful operation
   */
  private onSuccess(): void {
    this.successCount++;
    this.lastSuccessTime = Date.now();

    if (this.state === "half-open") {
      // Service has recovered, close the circuit
      this.reset();
      this.transitionTo("closed");
    }
  }

  /**
   * Handle failed operation
   */
  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === "half-open") {
      // Test failed, reopen circuit
      this.transitionTo("open");
      this.openedAt = Date.now();
    } else if (this.state === "closed") {
      // Check if we should open circuit
      if (this.failureCount >= this.config.failureThreshold) {
        this.transitionTo("open");
        this.openedAt = Date.now();

        if (this.config.onOpen) {
          this.config.onOpen(this.failureCount);
        }
      }
    }
  }

  /**
   * Check if circuit should attempt reset (transition to half-open)
   *
   * @returns true if enough time has passed since opening
   */
  private shouldAttemptReset(): boolean {
    if (!this.openedAt) {
      return false;
    }

    const timeSinceOpened = Date.now() - this.openedAt;
    return timeSinceOpened >= this.config.resetTimeout;
  }

  /**
   * Get remaining time until reset attempt
   *
   * @returns Milliseconds until reset, or 0 if ready
   */
  private getRemainingResetTime(): number {
    if (!this.openedAt) {
      return 0;
    }

    const timeSinceOpened = Date.now() - this.openedAt;
    const remaining = this.config.resetTimeout - timeSinceOpened;
    return Math.max(0, remaining);
  }

  /**
   * Transition to a new state
   *
   * @param newState - New circuit breaker state
   */
  private transitionTo(newState: CircuitBreakerState): void {
    const oldState = this.state;

    if (oldState === newState) {
      return;
    }

    this.state = newState;

    // Log state transition
    console.log(`[CircuitBreaker] State transition: ${oldState} -> ${newState}`);

    // Invoke callback
    if (this.config.onStateChange) {
      this.config.onStateChange(oldState, newState);
    }

    // Invoke specific callbacks
    if (newState === "closed" && this.config.onClose) {
      this.config.onClose();
    }
  }

  /**
   * Reset circuit breaker counters
   */
  private reset(): void {
    this.failureCount = 0;
    this.successCount = 0;
    this.openedAt = undefined;
  }

  /**
   * Get current circuit breaker state
   *
   * @returns Current state
   */
  getState(): CircuitBreakerState {
    return this.state;
  }

  /**
   * Get circuit breaker statistics
   *
   * @returns Statistics
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      openedAt: this.openedAt,
    };
  }

  /**
   * Check if circuit is open
   *
   * @returns true if circuit is open
   */
  isOpen(): boolean {
    return this.state === "open";
  }

  /**
   * Check if circuit is closed
   *
   * @returns true if circuit is closed
   */
  isClosed(): boolean {
    return this.state === "closed";
  }

  /**
   * Check if circuit is half-open
   *
   * @returns true if circuit is half-open
   */
  isHalfOpen(): boolean {
    return this.state === "half-open";
  }

  /**
   * Manually reset the circuit breaker
   *
   * Forces circuit to closed state and resets counters.
   * Use with caution - typically circuit should manage its own state.
   */
  forceReset(): void {
    this.reset();
    this.transitionTo("closed");
  }

  /**
   * Manually open the circuit breaker
   *
   * Forces circuit to open state.
   * Use with caution - typically circuit should manage its own state.
   */
  forceOpen(): void {
    this.transitionTo("open");
    this.openedAt = Date.now();
  }
}

/**
 * Create a circuit breaker for PuppetDB operations
 *
 * @param failureThreshold - Number of failures before opening
 * @param resetTimeout - Time before attempting reset
 * @param timeout - Operation timeout
 * @returns Configured circuit breaker
 */
export function createPuppetDBCircuitBreaker(
  failureThreshold: number = 5,
  resetTimeout: number = 60000,
  timeout?: number,
): CircuitBreaker {
  return new CircuitBreaker({
    failureThreshold,
    resetTimeout,
    timeout,
    onStateChange: (oldState, newState) => {
      console.log(`[PuppetDB] Circuit breaker: ${oldState} -> ${newState}`);
    },
    onOpen: (failureCount) => {
      console.error(
        `[PuppetDB] Circuit breaker opened after ${String(failureCount)} failures`,
      );
    },
    onClose: () => {
      console.log("[PuppetDB] Circuit breaker closed - service recovered");
    },
  });
}
