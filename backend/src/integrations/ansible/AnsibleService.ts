import { randomUUID } from "crypto";
import { spawn, type ChildProcess } from "child_process";
import type { ExecutionResult } from "../bolt/types";

export interface StreamingCallback {
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
  onCommand?: (command: string) => void;
}

interface CommandExecutionResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  command: string;
}

export class AnsibleService {
  private readonly ansibleProjectPath: string;
  private readonly inventoryPath: string;
  private readonly defaultTimeout: number;

  constructor(
    ansibleProjectPath: string,
    inventoryPath: string,
    defaultTimeout = 300000,
  ) {
    this.ansibleProjectPath = ansibleProjectPath;
    this.inventoryPath = inventoryPath;
    this.defaultTimeout = defaultTimeout;
  }

  public getAnsibleProjectPath(): string {
    return this.ansibleProjectPath;
  }

  public getInventoryPath(): string {
    return this.inventoryPath;
  }

  public async runCommand(
    nodeId: string,
    command: string,
    streamingCallback?: StreamingCallback,
  ): Promise<ExecutionResult> {
    const startedAt = new Date().toISOString();
    const startMs = Date.now();

    const args = [
      nodeId,
      "-i",
      this.inventoryPath,
      "-m",
      "shell",
      "-a",
      command,
    ];

    const exec = await this.executeCommand("ansible", args, streamingCallback);
    const completedAt = new Date().toISOString();
    const status = exec.success ? "success" : "failed";
    const duration = Math.max(Date.now() - startMs, 0);
    const errorMessage = !exec.success
      ? exec.stderr || exec.stdout || "Ansible command execution failed"
      : undefined;

    return {
      id: randomUUID(),
      type: "command",
      targetNodes: [nodeId],
      action: command,
      status,
      startedAt,
      completedAt,
      results: [
        {
          nodeId,
          status,
          output: {
            stdout: exec.stdout,
            stderr: exec.stderr,
            exitCode: exec.exitCode ?? undefined,
          },
          error: errorMessage,
          duration,
        },
      ],
      error: errorMessage,
      command: exec.command,
      stdout: exec.stdout,
      stderr: exec.stderr,
    };
  }

  public async installPackage(
    nodeId: string,
    packageName: string,
    ensure: "present" | "absent" | "latest",
    version?: string,
    settings?: Record<string, unknown>,
    streamingCallback?: StreamingCallback,
  ): Promise<ExecutionResult> {
    const startedAt = new Date().toISOString();
    const startMs = Date.now();

    const moduleArgs: Record<string, unknown> = {
      name: version ? `${packageName}-${version}` : packageName,
      state: ensure,
      ...(settings ?? {}),
    };

    const args = [
      nodeId,
      "-i",
      this.inventoryPath,
      "-m",
      "package",
      "-a",
      JSON.stringify(moduleArgs),
    ];

    const exec = await this.executeCommand("ansible", args, streamingCallback);
    const completedAt = new Date().toISOString();
    const status = exec.success ? "success" : "failed";
    const duration = Math.max(Date.now() - startMs, 0);
    const errorMessage = !exec.success
      ? exec.stderr || exec.stdout || "Ansible package installation failed"
      : undefined;

    return {
      id: randomUUID(),
      type: "task",
      targetNodes: [nodeId],
      action: "ansible.builtin.package",
      parameters: {
        packageName,
        ensure,
        version,
        settings,
      },
      status,
      startedAt,
      completedAt,
      results: [
        {
          nodeId,
          status,
          output: {
            stdout: exec.stdout,
            stderr: exec.stderr,
            exitCode: exec.exitCode ?? undefined,
          },
          error: errorMessage,
          duration,
        },
      ],
      error: errorMessage,
      command: exec.command,
      stdout: exec.stdout,
      stderr: exec.stderr,
    };
  }

  public async runPlaybook(
    nodeId: string,
    playbookPath: string,
    extraVars?: Record<string, unknown>,
    streamingCallback?: StreamingCallback,
  ): Promise<ExecutionResult> {
    const startedAt = new Date().toISOString();
    const startMs = Date.now();

    const args = [
      "-i",
      this.inventoryPath,
      playbookPath,
      "--limit",
      nodeId,
    ];

    if (extraVars && Object.keys(extraVars).length > 0) {
      args.push("--extra-vars", JSON.stringify(extraVars));
    }

    const exec = await this.executeCommand(
      "ansible-playbook",
      args,
      streamingCallback,
    );

    const completedAt = new Date().toISOString();
    const status = exec.success ? "success" : "failed";
    const duration = Math.max(Date.now() - startMs, 0);
    const errorMessage = !exec.success
      ? exec.stderr || exec.stdout || "Ansible playbook execution failed"
      : undefined;

    return {
      id: randomUUID(),
      type: "task",
      targetNodes: [nodeId],
      action: playbookPath,
      parameters: {
        playbook: true,
        extraVars,
      },
      status,
      startedAt,
      completedAt,
      results: [
        {
          nodeId,
          status,
          output: {
            stdout: exec.stdout,
            stderr: exec.stderr,
            exitCode: exec.exitCode ?? undefined,
          },
          error: errorMessage,
          duration,
        },
      ],
      error: errorMessage,
      command: exec.command,
      stdout: exec.stdout,
      stderr: exec.stderr,
    };
  }

  private async executeCommand(
    binary: "ansible" | "ansible-playbook",
    args: string[],
    streamingCallback?: StreamingCallback,
  ): Promise<CommandExecutionResult> {
    if (streamingCallback?.onCommand) {
      streamingCallback.onCommand(this.buildCommandString(binary, args));
    }

    const timeout = this.defaultTimeout;

    return new Promise((resolve, reject) => {
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      let childProcess: ChildProcess | null = null;

      const timeoutId = setTimeout(() => {
        timedOut = true;
        if (childProcess) {
          childProcess.kill("SIGTERM");
          setTimeout(() => {
            if (childProcess && !childProcess.killed) {
              childProcess.kill("SIGKILL");
            }
          }, 5000);
        }
      }, timeout);

      try {
        childProcess = spawn(binary, args, {
          cwd: this.ansibleProjectPath,
          env: process.env,
          shell: false,
        });

        if (childProcess.stdout) {
          childProcess.stdout.on("data", (data: Buffer) => {
            const chunk = data.toString();
            stdout += chunk;
            if (streamingCallback?.onStdout) {
              streamingCallback.onStdout(chunk);
            }
          });
        }

        if (childProcess.stderr) {
          childProcess.stderr.on("data", (data: Buffer) => {
            const chunk = data.toString();
            stderr += chunk;
            if (streamingCallback?.onStderr) {
              streamingCallback.onStderr(chunk);
            }
          });
        }

        childProcess.on("close", (exitCode: number | null) => {
          clearTimeout(timeoutId);

          if (timedOut) {
            reject(
              new Error(
                `${binary} execution exceeded timeout of ${String(timeout)}ms`,
              ),
            );
            return;
          }

          resolve({
            success: exitCode === 0,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            exitCode,
            command: this.buildCommandString(binary, args),
          });
        });

        childProcess.on("error", (error: Error) => {
          clearTimeout(timeoutId);
          reject(
            new Error(`Failed to execute ${binary} command: ${error.message}`),
          );
        });
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private buildCommandString(binary: string, args: string[]): string {
    const escapedArgs = args.map((arg) => {
      if (arg.includes(" ") || arg.includes('"') || arg.includes("'")) {
        return `"${arg.replace(/"/g, '\\"')}"`;
      }
      return arg;
    });

    return `${binary} ${escapedArgs.join(" ")}`;
  }
}