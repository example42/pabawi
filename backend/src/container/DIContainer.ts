import { LoggerService } from "../services/LoggerService";
import { ExpertModeService } from "../services/ExpertModeService";
import { ConfigService } from "../config/ConfigService";

export interface ServiceRegistry {
  logger: LoggerService;
  expertMode: ExpertModeService;
  config: ConfigService;
}

export class DIContainer {
  private services = new Map<string, unknown>();

  register<K extends keyof ServiceRegistry>(
    key: K,
    instance: ServiceRegistry[K],
  ): void {
    this.services.set(key, instance);
  }

  resolve<K extends keyof ServiceRegistry>(key: K): ServiceRegistry[K] {
    const instance = this.services.get(key);
    if (!instance) {
      throw new Error(`Service '${key}' not registered in container`);
    }
    return instance as ServiceRegistry[K];
  }

  has(key: keyof ServiceRegistry): boolean {
    return this.services.has(key);
  }
}

/**
 * Create a default container with LoggerService, ExpertModeService, and ConfigService.
 * Used as a fallback when route factories are called without an explicit container
 * (e.g., in test setups that predate DI migration).
 *
 * A fresh container is created on each call to pick up current env var state
 * (important for tests that set env vars in beforeEach).
 */
export function createDefaultContainer(): DIContainer {
  const container = new DIContainer();
  container.register("logger", new LoggerService());
  container.register("expertMode", new ExpertModeService());

  // Attempt to register ConfigService — requires JWT_SECRET and PABAWI_LIFECYCLE_TOKEN env vars
  try {
    container.register("config", new ConfigService());
  } catch {
    // ConfigService validation failed (missing env vars) — skip registration.
    // Route factories that need config will throw at resolve() time with a clear message.
  }

  return container;
}
