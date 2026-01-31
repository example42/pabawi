import { BasePlugin } from "../BasePlugin";
import { ExecutionToolPlugin } from "../types";
import { IntegrationManager } from "../IntegrationManager";
import { CommandWhitelistService } from "../../services/CommandWhitelistService";
import { LoggerService } from "../../services/LoggerService";
import { ExpertModeService } from "../../services/ExpertModeService";
import { ExecutionQueue } from "../../services/ExecutionQueue";
import { PackageOperation, PackageResult } from "./types";

export class PackageManagerPlugin
  extends BasePlugin
  implements ExecutionToolPlugin
{
  private integrationManager: IntegrationManager;
  private commandWhitelist: CommandWhitelistService;
  private logger: LoggerService;
  private expertMode: ExpertModeService;
  private executionQueue: ExecutionQueue;

  constructor(
    integrationManager: IntegrationManager,
    commandWhitelist: CommandWhitelistService,
    logger: LoggerService,
    expertMode: ExpertModeService,
    executionQueue: ExecutionQueue
  ) {
    super();
    this.integrationManager = integrationManager;
    this.commandWhitelist = commandWhitelist;
    this.logger = logger;
    this.expertMode = expertMode;
    this.executionQueue = executionQueue;
  }

  async initialize(): Promise<void> {
    this.logger.info("Initializing PackageManagerPlugin", { component: "PackageManagerPlugin" });
    // No specific init needed beyond base
  }

  async healthCheck(): Promise<boolean> {
    try {
      // Check if execution tool is available
      this.integrationManager.getExecutionTool();
      return true;
    } catch {
      return false;
    }
  }

  async executePackageOperation(operation: PackageOperation, targets: string[], expertMode: boolean): Promise<string> {
    this.logger.info("Executing package operation", {
      component: "PackageManagerPlugin",
      operation: operation.action,
      package: operation.packageName,
      targets
    });

    // Assuming single target for simplicity (as per API)
    const target = targets[0];
    const facts = await this.integrationManager.getNodeData(target);
    const osFamily = facts?.os?.family?.toLowerCase() || 'unknown';
    const command = this.buildCommand(operation, osFamily);

    // Validate command
    if (!this.commandWhitelist.isAllowed(command)) {
      throw new Error(`Command not allowed: ${command}`);
    }

    // Queue the execution asynchronously
    const executionId = await this.executionQueue.addExecution(
      async () => {
        const executionTool = this.integrationManager.getExecutionTool();
        return await executionTool.executeCommand(command, [target], {});
      },
      target,
      'package'
    );

    if (expertMode) {
      this.expertMode.attachDebugInfo({ executionId, command, osFamily }, { operation, targets });
    }

    return executionId;
  }

  private buildCommand(operation: PackageOperation, osFamily: string): string {
    const pkg = operation.packageName;
    const version = operation.version ? `=${operation.version}` : '';
    switch (osFamily) {
      case 'debian':
      case 'ubuntu':
        switch (operation.action) {
          case 'install': return `apt update && apt install -y ${pkg}${version}`;
          case 'uninstall': return `apt remove -y ${pkg}`;
          case 'update': return `apt update && apt upgrade -y ${pkg}`;
          case 'list': return `apt list --installed | grep ${pkg}`;
          default: throw new Error(`Unsupported action: ${operation.action}`);
        }
      case 'redhat':
      case 'centos':
        switch (operation.action) {
          case 'install': return `yum install -y ${pkg}${version}`;
          case 'uninstall': return `yum remove -y ${pkg}`;
          case 'update': return `yum update -y ${pkg}`;
          case 'list': return `yum list installed | grep ${pkg}`;
          default: throw new Error(`Unsupported action: ${operation.action}`);
        }
      case 'windows':
        switch (operation.action) {
          case 'install': return `choco install ${pkg} -y`;
          case 'uninstall': return `choco uninstall ${pkg} -y`;
          case 'update': return `choco upgrade ${pkg} -y`;
          case 'list': return `choco list --local-only | findstr ${pkg}`;
          default: throw new Error(`Unsupported action: ${operation.action}`);
        }
      case 'darwin':
        switch (operation.action) {
          case 'install': return `brew install ${pkg}${version}`;
          case 'uninstall': return `brew uninstall ${pkg}`;
          case 'update': return `brew upgrade ${pkg}`;
          case 'list': return `brew list | grep ${pkg}`;
          default: throw new Error(`Unsupported action: ${operation.action}`);
        }
      default:
        throw new Error(`Unsupported OS family: ${osFamily}`);
    }
  }
}
