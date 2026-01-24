import { existsSync, statSync } from "fs";
import { join } from "path";
import { LoggerService } from "../services/LoggerService";

/**
 * Validation errors for Bolt configuration
 */
export class BoltValidationError extends Error {
  constructor(
    message: string,
    public readonly missingFiles: string[] = [],
    public readonly details?: string,
  ) {
    super(message);
    this.name = "BoltValidationError";
  }
}

/**
 * Validator for Bolt configuration files and project structure
 */
export class BoltValidator {
  private boltProjectPath: string;
  private logger: LoggerService;

  constructor(boltProjectPath: string) {
    this.boltProjectPath = boltProjectPath;
    this.logger = new LoggerService();
  }

  /**
   * Validate Bolt configuration on startup
   * Checks for required files and directory structure
   */
  public validate(): void {
    const missingFiles: string[] = [];
    const errors: string[] = [];

    // Check if project path exists
    if (!existsSync(this.boltProjectPath)) {
      throw new BoltValidationError(
        `Bolt project path does not exist: ${this.boltProjectPath}`,
        [],
        "Ensure BOLT_PROJECT_PATH points to a valid directory",
      );
    }

    // Check if path is a directory
    if (!statSync(this.boltProjectPath).isDirectory()) {
      throw new BoltValidationError(
        `Bolt project path is not a directory: ${this.boltProjectPath}`,
        [],
        "BOLT_PROJECT_PATH must point to a directory",
      );
    }

    // Check for inventory file (inventory.yaml or inventory.yml)
    const inventoryYaml = join(this.boltProjectPath, "inventory.yaml");
    const inventoryYml = join(this.boltProjectPath, "inventory.yml");

    if (!existsSync(inventoryYaml) && !existsSync(inventoryYml)) {
      missingFiles.push("inventory.yaml or inventory.yml");
      errors.push("Inventory file is required for Bolt operations");
    }

    // Check for bolt-project.yaml (optional but recommended)
    const boltProjectYaml = join(this.boltProjectPath, "bolt-project.yaml");
    const boltProjectYml = join(this.boltProjectPath, "bolt-project.yml");

    if (!existsSync(boltProjectYaml) && !existsSync(boltProjectYml)) {
      // This is a warning, not an error
      this.logger.warn("bolt-project.yaml not found. Using default Bolt configuration.", {
        component: "BoltValidator",
        operation: "validate",
      });
    }

    // Check for modules directory (optional, can be 'modules' or '.modules')
    const modulesDir = join(this.boltProjectPath, "modules");
    const hiddenModulesDir = join(this.boltProjectPath, ".modules");
    if (!existsSync(modulesDir) && !existsSync(hiddenModulesDir)) {
      this.logger.warn("modules or .modules directory not found. Task execution may be limited.", {
        component: "BoltValidator",
        operation: "validate",
      });
    }

    // If there are missing required files, throw error
    if (missingFiles.length > 0) {
      throw new BoltValidationError(
        "Bolt configuration validation failed",
        missingFiles,
        errors.join("; "),
      );
    }
  }

  /**
   * Get the inventory file path (checks both .yaml and .yml)
   */
  public getInventoryPath(): string | null {
    const inventoryYaml = join(this.boltProjectPath, "inventory.yaml");
    const inventoryYml = join(this.boltProjectPath, "inventory.yml");

    if (existsSync(inventoryYaml)) {
      return inventoryYaml;
    }
    if (existsSync(inventoryYml)) {
      return inventoryYml;
    }
    return null;
  }

  /**
   * Get the bolt-project file path (checks both .yaml and .yml)
   */
  public getBoltProjectPath(): string | null {
    const boltProjectYaml = join(this.boltProjectPath, "bolt-project.yaml");
    const boltProjectYml = join(this.boltProjectPath, "bolt-project.yml");

    if (existsSync(boltProjectYaml)) {
      return boltProjectYaml;
    }
    if (existsSync(boltProjectYml)) {
      return boltProjectYml;
    }
    return null;
  }

  /**
   * Get the modules directory path
   * Checks for both 'modules' and '.modules' directories
   */
  public getModulesPath(): string {
    const modulesDir = join(this.boltProjectPath, "modules");
    const hiddenModulesDir = join(this.boltProjectPath, ".modules");

    // Prefer .modules if it exists, otherwise return modules path
    if (existsSync(hiddenModulesDir)) {
      return hiddenModulesDir;
    }
    return modulesDir;
  }

  /**
   * Check if modules directory exists (either 'modules' or '.modules')
   */
  public hasModules(): boolean {
    const modulesDir = join(this.boltProjectPath, "modules");
    const hiddenModulesDir = join(this.boltProjectPath, ".modules");
    return existsSync(modulesDir) || existsSync(hiddenModulesDir);
  }
}
