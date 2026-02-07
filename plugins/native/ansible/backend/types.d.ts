/**
 * Type definitions for Ansible plugin
 */
export interface Node {
    id: string;
    name: string;
    uri?: string;
    transport?: string;
    config?: Record<string, unknown>;
    source?: string;
    groups?: string[];
    metadata?: Record<string, unknown>;
}
export interface Facts {
    [key: string]: unknown;
}
export interface ExecutionResult {
    id: string;
    type: "command" | "task" | "facts" | "puppet" | "package" | "playbook" | "script";
    targetNodes: string[];
    action: string;
    parameters?: Record<string, unknown>;
    status: "running" | "success" | "failed" | "partial";
    startedAt: string;
    completedAt?: string;
    results: NodeResult[];
    error?: string;
    command?: string;
    expertMode?: boolean;
    stdout?: string;
    stderr?: string;
}
export interface NodeResult {
    nodeId: string;
    status: "success" | "failed";
    output?: {
        stdout?: string;
        stderr?: string;
        exitCode?: number;
    };
    value?: unknown;
    error?: string;
    duration: number;
}
export interface Playbook {
    name: string;
    path: string;
    description?: string;
    tags?: string[];
    variables?: PlaybookVariable[];
}
export interface PlaybookVariable {
    name: string;
    description?: string;
    required: boolean;
    default?: unknown;
    type?: string;
}
export interface StreamingCallback {
    (chunk: {
        nodeId: string;
        stream: "stdout" | "stderr";
        data: string;
        timestamp: string;
    }): void;
}
export interface AnsibleConfig {
    inventoryPath: string;
    playbookPath: string;
    defaultTimeout: number;
    ansibleConfig?: string;
}
//# sourceMappingURL=types.d.ts.map
