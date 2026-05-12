import { LoggerService } from "../services/LoggerService";
import { ExpertModeService } from "../services/ExpertModeService";
import type { ConfigService } from "../config/ConfigService";

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
}

// Lazy singleton for the default container used by route factories when no
// explicit container is provided (backward compat for tests).
let defaultContainer: DIContainer | null = null;

/**
 * Create a default container with LoggerService and ExpertModeService.
 * Used as a fallback when route factories are called without an explicit container
 * (e.g., in test setups that predate DI migration).
 */
export function createDefaultContainer(): DIContainer {
  if (defaultContainer) return defaultContainer;

  defaultContainer = new DIContainer();
  defaultContainer.register("logger", new LoggerService());
  defaultContainer.register("expertMode", new ExpertModeService());
  return defaultContainer;
}
