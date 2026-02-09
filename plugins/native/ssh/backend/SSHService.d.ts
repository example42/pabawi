/**
 * SSH Service
 *
 * Provides SSH connectivity and command execution functionality.
 * Reads SSH configuration from ~/.ssh/config and manages SSH connections.
 *
 * @module plugins/native/ssh/backend/SSHService
 */
/**
 * Node interface
 */
export interface Node {
    id: string;
    name: string;
    uri: string;
    transport: "ssh";
    config: {
        hostname?: string;
        port?: number;
        user?: string;
        identityFile?: string;
        groups?: string[];
        [key: string]: unknown;
    };
}
/**
 * Execution result interface
 */
export interface ExecutionResult {
    id: string;
    type: "command";
    targetNodes: string[];
    action: string;
    status: "success" | "failed" | "partial";
    startedAt: string;
    completedAt?: string;
    results: NodeResult[];
    error?: string;
    command?: string;
    expertMode?: boolean;
}
/**
 * Node result interface
 */
export interface NodeResult {
    nodeId: string;
    status: "success" | "failed";
    output?: {
        stdout?: string;
        stderr?: string;
        exitCode?: number;
    };
    error?: string;
    duration: number;
}
/**
 * Streaming callback interface
 */
export interface StreamingCallback {
    onStdout?: (chunk: string) => void;
    onStderr?: (chunk: string) => void;
    onCommand?: (command: string) => void;
}
/**
 * SSH Service
 *
 * Manages SSH connections and command execution
 */
export declare class SSHService {
    private sshConfigPath;
    private defaultTimeout;
    constructor(config?: {
        sshConfigPath?: string;
        timeout?: number;
    });
    /**
     * Parse SSH config file and return nodes
     */
    getInventory(): Promise<Node[]>;
    /**
     * Parse SSH config content into nodes
     */
    private parseSSHConfig;
    /**
     * Finalize node configuration
     */
    private finalizeNode;
    /**
     * Execute command on a remote node via SSH
     */
    runCommand(nodeId: string, command: string, streamingCallback?: StreamingCallback): Promise<ExecutionResult>;
    /**
     * Build SSH command arguments
     */
    private buildSSHArgs;
    /**
     * Execute SSH command
     */
    private executeSSH;
    /**
     * Get SSH config path
     */
    getSSHConfigPath(): string;
    /**
     * Get default timeout
     */
    getDefaultTimeout(): number;
}
//# sourceMappingURL=SSHService.d.ts.map
