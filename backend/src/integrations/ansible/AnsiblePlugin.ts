import { spawn } from "child_process";
import { existsSync } from "fs";
import { resolve } from "path";
import { BasePlugin } from "../BasePlugin";
import type {
  Action,
  Capability,
  ExecutionToolPlugin,
  HealthStatus,
} from "../types";
import type { ExecutionResult } from "../bolt/types";
import type { LoggerService } from "../../services/LoggerService";
import type { PerformanceMonitorService } from "../../services/PerformanceMonitorService";
import { AnsibleService } from "./AnsibleService";

export class AnsiblePlugin extends BasePlugin implements ExecutionToolPlugin {
  readonly type = "execution" as const;
  private readonly ansibleService: AnsibleService;

  constructor(
    ansibleService: AnsibleService,
    logger?: LoggerService,
    performanceMonitor?: PerformanceMonitorService,
  ) {
    super("ansible", "execution", logger, performanceMonitor);
    this.ansibleService = ansibleService;
  }

  protected async performInitialization(): Promise<void> {
    await this.performHealthCheck();
  }

  protected async performHealthCheck(): Promise<Omit<HealthStatus, "lastCheck">> {
    const [ansibleOk, ansiblePlaybookOk] = await Promise.all([
      this.checkBinary("ansible"),
      this.checkBinary("ansible-playbook"),
    ]);

    const inventoryPath = resolve(this.ansibleService.getAnsibleProjectPath(), this.ansibleService.getInventoryPath());
    const inventoryExists = existsSync(inventoryPath);

    if (!ansibleOk || !ansiblePlaybookOk) {
      return {
        healthy: false,
        message: "Ansible CLI is not available",
        details: {
          ansibleAvailable: ansibleOk,
          ansiblePlaybookAvailable: ansiblePlaybookOk,
        },
      };
    }

    if (!inventoryExists) {
      return {
        healthy: false,
        degraded: true,
        message: "Ansible inventory file was not found",
        details: {
          inventoryPath,
        },
      };
    }

    return {
      healthy: true,
      message: "Ansible is configured and available",
      details: {
        inventoryPath,
      },
    };
  }

  async executeAction(action: Action): Promise<ExecutionResult> {
    if (!this.initialized) {
      throw new Error("Ansible plugin not initialized");
    }

    const target = Array.isArray(action.target)
      ? action.target[0]
      : action.target;

    if (!target) {
      throw new Error("No target specified for action");
    }

    const streamingCallback = action.metadata?.streamingCallback as
      | {
          onCommand?: (cmd: string) => void;
          onStdout?: (chunk: string) => void;
          onStderr?: (chunk: string) => void;
        }
      | undefined;

    switch (action.type) {
      case "command":
        return await this.ansibleService.runCommand(
          target,
          action.action,
          streamingCallback,
        );
      case "task": {
        if (action.action !== "package") {
          throw new Error(
            `Unsupported ansible task action: ${action.action}. Only 'package' is currently supported.`,
          );
        }

        const packageName = String(action.parameters?.packageName ?? "").trim();
        if (!packageName) {
          throw new Error("packageName is required for ansible package action");
        }

        const ensure =
          action.parameters?.ensure === "absent" ||
          action.parameters?.ensure === "latest"
            ? (action.parameters.ensure as "absent" | "latest")
            : "present";

        const version =
          typeof action.parameters?.version === "string"
            ? action.parameters.version
            : undefined;

        const settings =
          action.parameters?.settings &&
          typeof action.parameters.settings === "object"
            ? (action.parameters.settings as Record<string, unknown>)
            : undefined;

        return await this.ansibleService.installPackage(
          target,
          packageName,
          ensure,
          version,
          settings,
          streamingCallback,
        );
      }
      case "plan": {
        const extraVars =
          action.parameters?.extraVars &&
          typeof action.parameters.extraVars === "object"
            ? (action.parameters.extraVars as Record<string, unknown>)
            : undefined;

        return await this.ansibleService.runPlaybook(
          target,
          action.action,
          extraVars,
          streamingCallback,
        );
      }
      default:
        throw new Error(`Unsupported action type for ansible: ${action.type}`);
    }
  }

  listCapabilities(): Capability[] {
    return [
      {
        name: "command",
        description: "Execute shell commands on target nodes via ansible shell module",
      },
      {
        name: "package",
        description: "Install or remove packages on target nodes via ansible package module",
      },
      {
        name: "playbook",
        description: "Execute ansible playbooks against target nodes",
      },
    ];
  }

  private async checkBinary(binary: "ansible" | "ansible-playbook"): Promise<boolean> {
    return await new Promise<boolean>((resolve) => {
      const child = spawn(binary, ["--version"], { stdio: "pipe" });
      let resolved = false;

      child.on("close", (code) => {
        if (!resolved) {
          resolved = true;
          resolve(code === 0);
        }
      });

      child.on("error", () => {
        if (!resolved) {
          resolved = true;
          resolve(false);
        }
      });

      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          child.kill();
          resolve(false);
        }
      }, 5000);
    });
  }
}