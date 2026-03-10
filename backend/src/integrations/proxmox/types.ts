/**
 * Proxmox Virtual Environment Integration Types
 *
 * Type definitions for the Proxmox VE integration plugin.
 */

import type { Capability } from "../types";

/**
 * Proxmox configuration
 */
export interface ProxmoxConfig {
  host: string;
  port?: number;
  username?: string;
  password?: string;
  realm?: string;
  token?: string;
  ssl?: ProxmoxSSLConfig;
  timeout?: number;
}

/**
 * SSL configuration for Proxmox client
 */
export interface ProxmoxSSLConfig {
  rejectUnauthorized?: boolean;
  ca?: string;
  cert?: string;
  key?: string;
}

/**
 * Proxmox guest (VM or LXC) from API
 */
export interface ProxmoxGuest {
  vmid: number;
  name: string;
  node: string;
  type: "qemu" | "lxc";
  status: "running" | "stopped" | "paused";
  maxmem?: number;
  maxdisk?: number;
  cpus?: number;
  uptime?: number;
  netin?: number;
  netout?: number;
  diskread?: number;
  diskwrite?: number;
}

/**
 * Proxmox guest configuration
 */
export interface ProxmoxGuestConfig {
  vmid: number;
  name: string;
  hostname?: string;
  cores: number;
  memory: number;
  sockets?: number;
  cpu?: string;
  bootdisk?: string;
  scsihw?: string;
  ostype?: string;
  net0?: string;
  net1?: string;
  ide2?: string;
  [key: string]: unknown;
}

/**
 * Proxmox guest status
 */
export interface ProxmoxGuestStatus {
  status: "running" | "stopped" | "paused";
  vmid: number;
  uptime?: number;
  cpus?: number;
  maxmem?: number;
  mem?: number;
  maxdisk?: number;
  disk?: number;
  netin?: number;
  netout?: number;
  diskread?: number;
  diskwrite?: number;
}

/**
 * VM creation parameters
 */
export interface VMCreateParams {
  vmid: number;
  name: string;
  node: string;
  cores?: number;
  memory?: number;
  sockets?: number;
  cpu?: string;
  scsi0?: string;
  ide2?: string;
  net0?: string;
  ostype?: string;
  [key: string]: unknown;
}

/**
 * LXC creation parameters
 */
export interface LXCCreateParams {
  vmid: number;
  hostname: string;
  node: string;
  ostemplate: string;
  cores?: number;
  memory?: number;
  rootfs?: string;
  net0?: string;
  password?: string;
  [key: string]: unknown;
}

/**
 * Proxmox task status
 */
export interface ProxmoxTaskStatus {
  status: "running" | "stopped";
  exitstatus?: string;
  type: string;
  node: string;
  pid: number;
  pstart: number;
  starttime: number;
  upid: string;
}

/**
 * Provisioning capability interface
 */
export interface ProvisioningCapability extends Capability {
  operation: "create" | "destroy";
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  maxAttempts: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryableErrors: string[];
}

/**
 * Proxmox error classes
 */
export class ProxmoxError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: unknown
  ) {
    super(message);
    this.name = "ProxmoxError";
  }
}

export class ProxmoxAuthenticationError extends ProxmoxError {
  constructor(message: string, details?: unknown) {
    super(message, "PROXMOX_AUTH_ERROR", details);
    this.name = "ProxmoxAuthenticationError";
  }
}

export class ProxmoxConnectionError extends ProxmoxError {
  constructor(message: string, details?: unknown) {
    super(message, "PROXMOX_CONNECTION_ERROR", details);
    this.name = "ProxmoxConnectionError";
  }
}
