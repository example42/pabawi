import { z } from "zod";
import type { ExecutionRecord } from "../database/ExecutionRepository";
import type { IntegrationManager } from "../integrations/IntegrationManager";
import type { BoltService } from "../integrations/bolt/BoltService";
import type { ExecutionResult } from "../integrations/bolt/types";
import type { PackageTaskConfig } from "../config/schema";
import type { BoltCommandWhitelistService } from "../validation/CommandWhitelistService";
import { PackageNameSchema } from "../validation/commonSchemas";
import type { StreamingExecutionManager } from "./StreamingExecutionManager";
import type { JournalService } from "./journal/JournalService";
import { LoggerService } from "./LoggerService";
import { buildPuppetCommand, normalizePuppetExitCodes, PuppetRunBodySchema, recordPuppetJournal } from "./PuppetExecution";
import type { ExecutionSubmission } from "./ExecutionService";

export class ExecutionDispatchError extends Error {
  constructor(message: string) { super(message); this.name = "ExecutionDispatchError"; }
}

const PackageParameters = z.object({
  packageName: PackageNameSchema,
  ensure: z.enum(["present", "absent", "latest"]).default("present"),
  version: z.string().optional(), settings: z.record(z.unknown()).optional(),
});

/** Provider semantics shared by initial submissions and explicit re-execution. */
export class ExecutionDispatcher {
  constructor(
    private readonly integrations: IntegrationManager,
    private readonly bolt: BoltService,
    private readonly packageTasks: PackageTaskConfig[],
    private readonly whitelist: BoltCommandWhitelistService,
    private readonly streaming?: StreamingExecutionManager,
    private readonly journal?: JournalService,
    private readonly logger = new LoggerService(),
  ) {}

  async validateTargets(targets: string[]): Promise<void> {
    const inventory = await this.integrations.getAggregatedInventory();
    if (targets.some(target => !inventory.nodes.some(node => node.id === target || node.name === target))) {
      throw new ExecutionDispatchError("Target is not in the current inventory");
    }
  }

  validate(record: ExecutionSubmission): void {
    const tool = record.executionTool ?? "bolt";
    if (!this.integrations.getExecutionTool(tool)) throw new ExecutionDispatchError(`Execution tool '${tool}' is unavailable`);
    if (record.targetNodes.length !== 1) throw new ExecutionDispatchError("Direct executions require one target; use batch admission for multiple targets");
    switch (record.type) {
      case "command": this.whitelist.validateCommand(record.action); break;
      case "puppet": record.command = buildPuppetCommand(PuppetRunBodySchema.parse(record.parameters ?? {})); break;
      case "package":
        PackageParameters.parse(record.parameters);
        if (tool !== "ansible" && (tool !== "bolt" || !this.packageTasks.some(task => task.name === record.action))) {
          throw new ExecutionDispatchError("Package execution requires a configured Bolt task or Ansible");
        }
        break;
      case "task":
        if (!record.parameters?.playbook && tool === "bolt"
          && !/^[a-z][a-z0-9_]*(::[a-z][a-z0-9_]*)*$/.test(record.action)) throw new ExecutionDispatchError("Invalid task name");
        if (record.parameters?.playbook && (tool !== "ansible"
          || !/^[a-zA-Z0-9][a-zA-Z0-9_\-/.]*\.ya?ml$/.test(record.action) || record.action.includes(".."))) {
          throw new ExecutionDispatchError("Invalid playbook path");
        }
        break;
      case "plan":
        if (tool === "ansible" && (!/^[a-zA-Z0-9][a-zA-Z0-9_\-/.]*\.ya?ml$/.test(record.action) || record.action.includes(".."))) {
          throw new ExecutionDispatchError("Invalid playbook path");
        }
        break;
      default: throw new ExecutionDispatchError("This execution type cannot be dispatched");
    }
  }

  async run(record: ExecutionSubmission, id: string): Promise<ExecutionResult> {
    const tool = record.executionTool ?? "bolt";
    const target = record.targetNodes[0];
    const streamingCallback = this.streaming?.createStreamingCallback(id, record.expertMode ?? false);
    if (record.type === "package") {
      const parameters = PackageParameters.parse(record.parameters);
      if (tool === "bolt") {
        const task = this.packageTasks.find(candidate => candidate.name === record.action);
        if (!task) throw new ExecutionDispatchError("Package task is no longer configured");
        return this.bolt.installPackage(target, record.action, parameters, task.parameterMapping, streamingCallback);
      }
      return this.integrations.executeAction(tool, { type: "task", target, action: "package", parameters, metadata: { streamingCallback } });
    }
    if (record.type === "puppet") {
      const parameters = PuppetRunBodySchema.parse(record.parameters ?? {});
      const result = await this.integrations.executeAction(tool, {
        type: "command", target, action: record.command ?? buildPuppetCommand(parameters), parameters: { sudo: true }, metadata: { streamingCallback },
      });
      normalizePuppetExitCodes(result);
      return result;
    }
    return dispatchExecutionAction(this.integrations, record, { streamingCallback });
  }

  async completed(record: ExecutionRecord): Promise<void> {
    if (record.type !== "puppet") return;
    await recordPuppetJournal(this.journal, record.targetNodes[0], record.executionTool ?? "bolt",
      PuppetRunBodySchema.parse(record.parameters ?? {}), record.status === "success" ? "success" : "failed",
      record.error, record.userId, this.logger);
  }
}

export function dispatchExecutionAction(
  integrations: IntegrationManager,
  record: Pick<ExecutionRecord, "type" | "targetNodes" | "action" | "parameters" | "executionTool">,
  metadata?: Record<string, unknown>,
): Promise<ExecutionResult> {
  const tool = record.executionTool ?? "bolt";
  const playbook = tool === "ansible" && (record.type === "plan" || record.parameters?.playbook === true);
  return integrations.executeAction(tool, {
    type: playbook || record.type === "plan" ? "plan" : record.type === "command" ? "command" : "task",
    target: record.targetNodes[0], action: record.action,
    parameters: playbook ? { extraVars: record.parameters?.extraVars } : record.parameters,
    ...(metadata ? { metadata } : {}),
  });
}
