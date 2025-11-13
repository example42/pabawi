import { spawn, type ChildProcess } from 'child_process';
import {
  type BoltExecutionResult,
  type BoltExecutionOptions,
  type BoltJsonOutput,
  type Node,
  BoltExecutionError,
  BoltTimeoutError,
  BoltParseError,
  BoltInventoryNotFoundError,
} from './types';

/**
 * Service for executing Bolt CLI commands with timeout handling,
 * JSON output parsing, and error capture
 */
export class BoltService {
  private readonly defaultTimeout: number;
  private readonly boltProjectPath: string;

  constructor(boltProjectPath: string, defaultTimeout: number = 300000) {
    this.boltProjectPath = boltProjectPath;
    this.defaultTimeout = defaultTimeout;
  }

  /**
   * Execute a Bolt CLI command with timeout handling
   * 
   * @param args - Command line arguments for Bolt CLI
   * @param options - Execution options including timeout and working directory
   * @returns Promise resolving to execution result
   * @throws BoltTimeoutError if execution exceeds timeout
   * @throws BoltExecutionError if Bolt returns non-zero exit code
   */
  public async executeCommand(
    args: string[],
    options: BoltExecutionOptions = {}
  ): Promise<BoltExecutionResult> {
    const timeout = options.timeout ?? this.defaultTimeout;
    const cwd = options.cwd ?? this.boltProjectPath;

    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      let childProcess: ChildProcess | null = null;

      // Set up timeout
      const timeoutId = setTimeout(() => {
        timedOut = true;
        if (childProcess) {
          childProcess.kill('SIGTERM');
          // Force kill after 5 seconds if SIGTERM doesn't work
          setTimeout(() => {
            if (childProcess && !childProcess.killed) {
              childProcess.kill('SIGKILL');
            }
          }, 5000);
        }
      }, timeout);

      try {
        // Spawn Bolt process
        childProcess = spawn('bolt', args, {
          cwd,
          env: process.env,
          shell: false,
        });

        // Capture stdout
        if (childProcess.stdout) {
          childProcess.stdout.on('data', (data: Buffer) => {
            stdout += data.toString();
          });
        }

        // Capture stderr
        if (childProcess.stderr) {
          childProcess.stderr.on('data', (data: Buffer) => {
            stderr += data.toString();
          });
        }

        // Handle process completion
        childProcess.on('close', (exitCode: number | null) => {
          clearTimeout(timeoutId);

          if (timedOut) {
            reject(
              new BoltTimeoutError(
                `Bolt command execution exceeded timeout of ${timeout}ms`,
                timeout
              )
            );
            return;
          }

          const result: BoltExecutionResult = {
            success: exitCode === 0,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            exitCode,
          };

          if (exitCode !== 0) {
            result.error = stderr.trim() || `Bolt command failed with exit code ${exitCode}`;
          }

          resolve(result);
        });

        // Handle process errors
        childProcess.on('error', (error: Error) => {
          clearTimeout(timeoutId);
          reject(
            new BoltExecutionError(
              `Failed to execute Bolt command: ${error.message}`,
              null,
              stderr.trim(),
              stdout.trim()
            )
          );
        });
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  /**
   * Execute a Bolt CLI command and parse JSON output
   * 
   * @param args - Command line arguments for Bolt CLI (should include --format json)
   * @param options - Execution options
   * @returns Promise resolving to parsed JSON output
   * @throws BoltParseError if JSON parsing fails
   * @throws BoltExecutionError if Bolt returns non-zero exit code
   * @throws BoltTimeoutError if execution exceeds timeout
   */
  public async executeCommandWithJsonOutput(
    args: string[],
    options: BoltExecutionOptions = {}
  ): Promise<BoltJsonOutput> {
    // Ensure --format json is included in args
    if (!args.includes('--format') && !args.includes('json')) {
      args = [...args, '--format', 'json'];
    }

    const result = await this.executeCommand(args, options);

    if (!result.success) {
      throw new BoltExecutionError(
        result.error || 'Bolt command failed',
        result.exitCode,
        result.stderr,
        result.stdout
      );
    }

    return this.parseJsonOutput(result.stdout);
  }

  /**
   * Parse JSON output from Bolt CLI
   * 
   * @param output - Raw stdout from Bolt CLI
   * @returns Parsed JSON object
   * @throws BoltParseError if parsing fails
   */
  public parseJsonOutput(output: string): BoltJsonOutput {
    if (!output || output.trim().length === 0) {
      throw new BoltParseError(
        'Bolt command returned empty output',
        output,
        new Error('Empty output')
      );
    }

    try {
      return JSON.parse(output) as BoltJsonOutput;
    } catch (error) {
      throw new BoltParseError(
        'Failed to parse Bolt JSON output',
        output,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Get the Bolt project path
   */
  public getBoltProjectPath(): string {
    return this.boltProjectPath;
  }

  /**
   * Get the default timeout
   */
  public getDefaultTimeout(): number {
    return this.defaultTimeout;
  }

  /**
   * Retrieve inventory from Bolt
   * 
   * Executes `bolt inventory show --format json` and transforms the output
   * into an array of Node objects
   * 
   * @returns Promise resolving to array of nodes
   * @throws BoltInventoryNotFoundError if inventory file is not found
   * @throws BoltExecutionError if Bolt command fails
   * @throws BoltParseError if JSON parsing fails
   */
  public async getInventory(): Promise<Node[]> {
    try {
      const jsonOutput = await this.executeCommandWithJsonOutput([
        'inventory',
        'show',
        '--format',
        'json',
      ]);

      return this.transformInventoryToNodes(jsonOutput);
    } catch (error) {
      // Check if error is due to missing inventory file
      if (error instanceof BoltExecutionError) {
        const errorMessage = error.stderr.toLowerCase();
        if (
          errorMessage.includes('inventory file') ||
          errorMessage.includes('could not find') ||
          errorMessage.includes('no such file')
        ) {
          throw new BoltInventoryNotFoundError(
            'Bolt inventory file not found. Ensure inventory.yaml exists in the Bolt project directory.'
          );
        }
      }
      throw error;
    }
  }

  /**
   * Transform Bolt inventory JSON output to Node array
   * 
   * @param jsonOutput - Raw JSON output from Bolt inventory command
   * @returns Array of Node objects
   */
  private transformInventoryToNodes(jsonOutput: BoltJsonOutput): Node[] {
    const nodes: Node[] = [];

    // Bolt inventory output structure: { "targets": [...], "groups": [...] }
    // or it can be a flat object with node names as keys
    if (typeof jsonOutput !== 'object' || jsonOutput === null) {
      return nodes;
    }

    // Handle targets array format
    if (Array.isArray(jsonOutput.targets)) {
      for (const target of jsonOutput.targets) {
        const node = this.parseInventoryTarget(target);
        if (node) {
          nodes.push(node);
        }
      }
      return nodes;
    }

    // Handle flat object format where keys are node names
    for (const [nodeName, nodeData] of Object.entries(jsonOutput)) {
      if (typeof nodeData === 'object' && nodeData !== null) {
        const node = this.parseInventoryTarget({ name: nodeName, ...nodeData });
        if (node) {
          nodes.push(node);
        }
      }
    }

    return nodes;
  }

  /**
   * Parse a single inventory target into a Node object
   * 
   * @param target - Raw target data from Bolt inventory
   * @returns Node object or null if parsing fails
   */
  private parseInventoryTarget(target: unknown): Node | null {
    if (typeof target !== 'object' || target === null) {
      return null;
    }

    const targetObj = target as Record<string, unknown>;

    // Extract node name
    const name = typeof targetObj.name === 'string' ? targetObj.name : null;
    if (!name) {
      return null;
    }

    // Extract URI
    const uri = typeof targetObj.uri === 'string' ? targetObj.uri : name;

    // Extract transport (default to 'ssh' if not specified)
    let transport: 'ssh' | 'winrm' | 'docker' | 'local' = 'ssh';
    if (typeof targetObj.transport === 'string') {
      const transportValue = targetObj.transport.toLowerCase();
      if (
        transportValue === 'ssh' ||
        transportValue === 'winrm' ||
        transportValue === 'docker' ||
        transportValue === 'local'
      ) {
        transport = transportValue;
      }
    }

    // Extract config
    const config: Node['config'] = {};
    if (typeof targetObj.config === 'object' && targetObj.config !== null) {
      const configObj = targetObj.config as Record<string, unknown>;
      Object.assign(config, configObj);
    }

    // Extract common config fields from top level if not in config object
    if (typeof targetObj.user === 'string' && !config.user) {
      config.user = targetObj.user;
    }
    if (typeof targetObj.port === 'number' && !config.port) {
      config.port = targetObj.port;
    }

    // Generate ID from name (use name as-is for ID)
    const id = name;

    return {
      id,
      name,
      uri,
      transport,
      config,
    };
  }
}
