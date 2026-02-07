/**
 * AnsibleService - Handles Ansible command execution and inventory management
 */
import type { Node, Facts, ExecutionResult, Playbook, StreamingCallback, AnsibleConfig } from "../types";
export interface AnsibleServiceInterface {
    getInventory(): Promise<Node[]>;
    gatherFacts(nodeId: string): Promise<Facts>;
    runCommand(nodeId: string, command: string, streamingCallback?: StreamingCallback): Promise<ExecutionResult>;
    runPlaybook(nodeId: string, playbookName: string, parameters?: Record<string, unknown>, streamingCallback?: StreamingCallback): Promise<ExecutionResult>;
    listPlaybooks(): Promise<Playbook[]>;
    getPlaybookDetails(playbookName: string): Promise<Playbook | null>;
    getInventoryPath(): string;
    getDefaultTimeout(): number;
}
export declare class AnsibleService implements AnsibleServiceInterface {
    private config;
    private logger;
    constructor(config: AnsibleConfig, logger: {
        info: (message: string, context?: Record<string, unknown>) => void;
        warn: (message: string, context?: Record<string, unknown>) => void;
        error: (message: string, context?: Record<string, unknown>) => void;
        debug: (message: string, context?: Record<string, unknown>) => void;
    });
    /**
     * Get inventory from Ansible
     */
    getInventory(): Promise<Node[]>;
    /**
     * Gather facts from a node using ansible setup module
     */
    gatherFacts(nodeId: string): Promise<Facts>;
    /**
     * Run a command on a node using ansible command module
     */
    runCommand(nodeId: string, command: string, streamingCallback?: StreamingCallback): Promise<ExecutionResult>;
    /**
     * Run an Ansible playbook
     */
    runPlaybook(nodeId: string, playbookName: string, parameters?: Record<string, unknown>, streamingCallback?: StreamingCallback): Promise<ExecutionResult>;
    /**
     * List available playbooks
     */
    listPlaybooks(): Promise<Playbook[]>;
    /**
     * Get playbook details
     */
    getPlaybookDetails(playbookName: string): Promise<Playbook | null>;
    /**
     * Execute an Ansible command with streaming support
     */
    private executeAnsibleCommand;
    getInventoryPath(): string;
    getDefaultTimeout(): number;
}
//# sourceMappingURL=AnsibleService.d.ts.map
