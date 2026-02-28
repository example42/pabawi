#!/usr/bin/env node
// ===========================================================================
// Pabawi Stress Test Inventory Generator
//
// Generates Ansible, Bolt, and SSH inventories with configurable node counts
// for stress testing the Pabawi web interface.
//
// Usage:
//   node generate.js [total-nodes]    # default: 2000
//   node generate.js 5000
//   node generate.js 10000
// ===========================================================================

import { writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOTAL_NODES = parseInt(process.argv[2] || "2000", 10);

// ---------------------------------------------------------------------------
// Infrastructure topology definition
// ---------------------------------------------------------------------------
const ENVIRONMENTS = [
  { name: "production", weight: 0.45 },
  { name: "staging", weight: 0.2 },
  { name: "qa", weight: 0.1 },
  { name: "development", weight: 0.15 },
  { name: "performance", weight: 0.1 },
];

const DATACENTERS = [
  { name: "us-east-1", subnet: "10.100", region: "us-east" },
  { name: "us-west-2", subnet: "10.101", region: "us-west" },
  { name: "eu-west-1", subnet: "10.200", region: "eu-west" },
  { name: "eu-central-1", subnet: "10.201", region: "eu-central" },
  { name: "ap-southeast-1", subnet: "10.150", region: "ap-southeast" },
  { name: "ap-northeast-1", subnet: "10.151", region: "ap-northeast" },
  { name: "sa-east-1", subnet: "10.170", region: "sa-east" },
  { name: "af-south-1", subnet: "10.180", region: "af-south" },
];

const ROLES = [
  {
    name: "webserver",
    prefix: "web",
    weight: 0.18,
    tier: "frontend",
    app: "nginx",
    os: "Debian",
    user: "deploy",
    subnetOctet: 1,
  },
  {
    name: "loadbalancer",
    prefix: "lb",
    weight: 0.06,
    tier: "frontend",
    app: "haproxy",
    os: "Debian",
    user: "deploy",
    subnetOctet: 1,
  },
  {
    name: "appserver",
    prefix: "app",
    weight: 0.2,
    tier: "application",
    app: "rails",
    os: "Debian",
    user: "app",
    subnetOctet: 2,
  },
  {
    name: "database",
    prefix: "db",
    weight: 0.12,
    tier: "data",
    app: "postgresql",
    os: "RedHat",
    user: "dbadmin",
    subnetOctet: 3,
  },
  {
    name: "cache",
    prefix: "cache",
    weight: 0.08,
    tier: "data",
    app: "redis",
    os: "Debian",
    user: "app",
    subnetOctet: 3,
  },
  {
    name: "queue",
    prefix: "mq",
    weight: 0.05,
    tier: "data",
    app: "rabbitmq",
    os: "Debian",
    user: "app",
    subnetOctet: 3,
  },
  {
    name: "monitoring",
    prefix: "mon",
    weight: 0.06,
    tier: "infrastructure",
    app: "prometheus",
    os: "Debian",
    user: "monitor",
    subnetOctet: 4,
  },
  {
    name: "logging",
    prefix: "log",
    weight: 0.04,
    tier: "infrastructure",
    app: "elasticsearch",
    os: "Debian",
    user: "logadmin",
    subnetOctet: 4,
  },
  {
    name: "ci",
    prefix: "ci",
    weight: 0.04,
    tier: "infrastructure",
    app: "jenkins",
    os: "Debian",
    user: "jenkins",
    subnetOctet: 5,
  },
  {
    name: "storage",
    prefix: "stor",
    weight: 0.05,
    tier: "data",
    app: "minio",
    os: "RedHat",
    user: "storage",
    subnetOctet: 6,
  },
  {
    name: "edge",
    prefix: "edge",
    weight: 0.04,
    tier: "frontend",
    app: "varnish",
    os: "Debian",
    user: "deploy",
    subnetOctet: 7,
  },
  {
    name: "bastion",
    prefix: "bastion",
    weight: 0.02,
    tier: "security",
    app: "sshd",
    os: "Debian",
    user: "admin",
    subnetOctet: 0,
  },
  {
    name: "dns",
    prefix: "dns",
    weight: 0.03,
    tier: "infrastructure",
    app: "bind",
    os: "Debian",
    user: "admin",
    subnetOctet: 0,
  },
  {
    name: "windows",
    prefix: "win",
    weight: 0.03,
    tier: "application",
    app: "iis",
    os: "Windows",
    user: "Administrator",
    subnetOctet: 9,
    transport: "winrm",
  },
];

const DOMAIN = "stress.acme.internal";

// ---------------------------------------------------------------------------
// Node generation
// ---------------------------------------------------------------------------
function generateNodes() {
  const nodes = [];
  let ipCounter = {};

  for (const env of ENVIRONMENTS) {
    const envNodeCount = Math.round(TOTAL_NODES * env.weight);
    // Distribute across DCs — production uses all, others use fewer
    const envDCs =
      env.name === "production"
        ? DATACENTERS
        : env.name === "staging"
          ? DATACENTERS.slice(0, 4)
          : DATACENTERS.slice(0, 2);

    for (const role of ROLES) {
      const roleCount = Math.max(
        1,
        Math.round(envNodeCount * role.weight)
      );
      const nodesPerDC = Math.max(1, Math.round(roleCount / envDCs.length));

      for (const dc of envDCs) {
        for (let i = 1; i <= nodesPerDC; i++) {
          const key = `${dc.subnet}.${role.subnetOctet}`;
          if (!ipCounter[key]) ipCounter[key] = 1;
          const hostNum = ipCounter[key]++;
          const ip = `${dc.subnet}.${role.subnetOctet}.${hostNum}`;

          // Skip if IP octet overflows
          if (hostNum > 254) continue;

          const envShort =
            env.name === "production"
              ? "prod"
              : env.name === "staging"
                ? "stg"
                : env.name === "development"
                  ? "dev"
                  : env.name === "performance"
                    ? "perf"
                    : env.name;

          const hostname = `${role.prefix}-${envShort}-${dc.name}-${i}`;
          const fqdn = `${hostname}.${DOMAIN}`;

          nodes.push({
            fqdn,
            hostname,
            ip,
            environment: env.name,
            role: role.name,
            prefix: role.prefix,
            datacenter: dc.name,
            region: dc.region,
            tier: role.tier,
            application: role.app,
            os_family: role.os,
            user: role.user,
            transport: role.transport || "ssh",
            index: i,
          });

          if (nodes.length >= TOTAL_NODES) break;
        }
        if (nodes.length >= TOTAL_NODES) break;
      }
      if (nodes.length >= TOTAL_NODES) break;
    }
    if (nodes.length >= TOTAL_NODES) break;
  }

  return nodes.slice(0, TOTAL_NODES);
}

// ---------------------------------------------------------------------------
// Ansible inventory generator
// ---------------------------------------------------------------------------
function generateAnsible(nodes) {
  const lines = [];
  lines.push(
    "# ===========================================================================",
    `# Pabawi Stress Test — Ansible Inventory (${nodes.length} nodes)`,
    `# Generated: ${new Date().toISOString()}`,
    "# ===========================================================================",
    "",
    "all:",
    "  vars:",
    "    ansible_python_interpreter: auto_silent",
    "    ntp_servers:",
    "      - 0.pool.ntp.org",
    "      - 1.pool.ntp.org",
    `    dns_domain: ${DOMAIN}`,
    "",
    "  children:"
  );

  // Group by environment → role
  const envGroups = {};
  for (const node of nodes) {
    const envKey = node.environment;
    const roleKey = `${envKey}_${node.role}s`;
    if (!envGroups[envKey]) envGroups[envKey] = {};
    if (!envGroups[envKey][roleKey]) envGroups[envKey][roleKey] = [];
    envGroups[envKey][roleKey].push(node);
  }

  for (const [env, roleMap] of Object.entries(envGroups)) {
    lines.push(`    ${env}:`, `      vars:`, `        env: ${env}`);

    // Add env-specific vars
    if (env === "production") {
      lines.push(
        "        puppet_environment: production",
        "        monitoring_enabled: true"
      );
    }

    lines.push("      children:");

    for (const [roleGroup, roleNodes] of Object.entries(roleMap)) {
      lines.push(`        ${roleGroup}:`, `          hosts:`);

      for (const n of roleNodes) {
        lines.push(
          `            ${n.fqdn}:`,
          `              ansible_host: ${n.ip}`,
          `              role: ${n.role}`,
          `              datacenter: ${n.datacenter}`,
          `              tier: ${n.tier}`,
          `              application: ${n.application}`,
          `              os_family: ${n.os_family}`
        );

        if (n.transport === "winrm") {
          lines.push(
            "              ansible_connection: winrm",
            "              ansible_winrm_transport: ntlm"
          );
        }
      }
    }
  }

  // Add datacenter groups (cross-environment)
  lines.push("", "    # --- Datacenter groups (cross-environment) ---");
  const dcGroups = {};
  for (const n of nodes) {
    if (!dcGroups[n.datacenter]) dcGroups[n.datacenter] = [];
    dcGroups[n.datacenter].push(n);
  }

  for (const [dc, dcNodes] of Object.entries(dcGroups)) {
    const groupName = `dc_${dc.replace(/-/g, "_")}`;
    lines.push(`    ${groupName}:`, `      hosts:`);
    for (const n of dcNodes) {
      lines.push(`        ${n.fqdn}: {}`);
    }
  }

  // Add OS groups
  lines.push("", "    # --- OS family groups ---");
  const osGroups = {};
  for (const n of nodes) {
    if (!osGroups[n.os_family]) osGroups[n.os_family] = [];
    osGroups[n.os_family].push(n);
  }

  for (const [os, osNodes] of Object.entries(osGroups)) {
    const groupName = `os_${os.toLowerCase()}`;
    lines.push(`    ${groupName}:`, `      hosts:`);
    for (const n of osNodes) {
      lines.push(`        ${n.fqdn}: {}`);
    }
    if (os === "Windows") {
      lines.push(
        "      vars:",
        "        ansible_connection: winrm",
        "        ansible_winrm_transport: ntlm"
      );
    }
  }

  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Bolt inventory generator
// ---------------------------------------------------------------------------
function generateBolt(nodes) {
  const lines = [];
  lines.push(
    "# ===========================================================================",
    `# Pabawi Stress Test — Bolt Inventory (${nodes.length} nodes)`,
    `# Generated: ${new Date().toISOString()}`,
    "# ===========================================================================",
    "",
    "groups:"
  );

  // Group by environment → role
  const envGroups = {};
  for (const node of nodes) {
    const envKey = node.environment;
    const roleKey = `${node.role}s`;
    if (!envGroups[envKey]) envGroups[envKey] = {};
    if (!envGroups[envKey][roleKey]) envGroups[envKey][roleKey] = [];
    envGroups[envKey][roleKey].push(node);
  }

  for (const [env, roleMap] of Object.entries(envGroups)) {
    lines.push(`  - name: ${env}`, "    groups:");

    for (const [roleGroup, roleNodes] of Object.entries(roleMap)) {
      const groupName = `${env}_${roleGroup}`;
      lines.push(`      - name: ${groupName}`, "        targets:");

      for (const n of roleNodes) {
        lines.push(
          `          - name: ${n.fqdn}`,
          `            uri: ${n.ip}`,
          `            alias: ${n.hostname}`,
          "            vars:",
          `              role: ${n.role}`,
          `              datacenter: ${n.datacenter}`,
          `              tier: ${n.tier}`,
          `              os_family: ${n.os_family}`,
          `              application: ${n.application}`
        );
      }

      // Group-level config
      const sampleNode = roleNodes[0];
      if (sampleNode.transport === "winrm") {
        lines.push(
          "        config:",
          "          transport: winrm",
          "          winrm:",
          "            ssl: false"
        );
      } else {
        lines.push(
          "        config:",
          "          ssh:",
          `            user: ${sampleNode.user}`
        );
      }
    }
  }

  // Global config
  lines.push(
    "",
    "config:",
    "  transport: ssh",
    "  ssh:",
    "    user: deploy",
    "    host-key-check: false",
    "    connect-timeout: 30",
    "    disconnect-timeout: 5"
  );

  return lines.join("\n") + "\n";
}

function generateBoltProject() {
  return `# Bolt project for stress testing
---
name: pabawi-stresstest
inventoryfile: inventory.yaml
`;
}

// ---------------------------------------------------------------------------
// SSH config generator
// ---------------------------------------------------------------------------
function generateSSH(nodes) {
  const lines = [];
  lines.push(
    "# ===========================================================================",
    `# Pabawi Stress Test — SSH Configuration (${nodes.length} nodes)`,
    `# Generated: ${new Date().toISOString()}`,
    "# ===========================================================================",
    "",
    "# ----- Global Defaults -----",
    "Host *",
    "    IdentityFile ~/.ssh/id_ed25519",
    "    ServerAliveInterval 60",
    "    ServerAliveCountMax 3",
    "    StrictHostKeyChecking no",
    "    UserKnownHostsFile /dev/null",
    "    LogLevel ERROR",
    "    Compression yes",
    "    ControlMaster auto",
    "    ControlPath /tmp/ssh-%r@%h:%p",
    "    ControlPersist 600",
    "    AddKeysToAgent yes",
    ""
  );

  // Group by environment for readability
  const envGroups = {};
  for (const n of nodes) {
    if (!envGroups[n.environment]) envGroups[n.environment] = [];
    envGroups[n.environment].push(n);
  }

  for (const [env, envNodes] of Object.entries(envGroups)) {
    lines.push(
      `# ===========================================================================`,
      `# ${env.toUpperCase()}`,
      `# ===========================================================================`
    );

    // Sub-group by role
    const roleGroups = {};
    for (const n of envNodes) {
      if (!roleGroups[n.role]) roleGroups[n.role] = [];
      roleGroups[n.role].push(n);
    }

    for (const [role, roleNodes] of Object.entries(roleGroups)) {
      lines.push(`# --- ${role} ---`);

      for (const n of roleNodes) {
        if (n.transport === "winrm") continue; // skip Windows in SSH config

        lines.push(
          `Host ${n.hostname}`,
          `    HostName ${n.ip}`,
          `    User ${n.user}`,
          ""
        );
      }

      // Pattern match for role group in this env
      const envShort =
        env === "production"
          ? "prod"
          : env === "staging"
            ? "stg"
            : env === "development"
              ? "dev"
              : env === "performance"
                ? "perf"
                : env;
      const sampleNode = roleNodes[0];
      if (sampleNode.transport !== "winrm") {
        lines.push(
          `Host ${sampleNode.prefix}-${envShort}-*`,
          `    User ${sampleNode.user}`,
          `    ForwardAgent no`,
          ""
        );
      }
    }
  }

  // Datacenter-based proxy/bastion patterns
  lines.push(
    "# ===========================================================================",
    "# BASTION / JUMP HOST PATTERNS",
    "# ===========================================================================",
    ""
  );

  for (const dc of DATACENTERS) {
    lines.push(
      `Host bastion-${dc.name}`,
      `    HostName ${dc.subnet}.0.1`,
      `    User admin`,
      `    ForwardAgent yes`,
      ""
    );
  }

  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
console.log(`Generating stress test inventories for ${TOTAL_NODES} nodes...`);
const nodes = generateNodes();
console.log(`Generated ${nodes.length} nodes across:`);

// Stats
const envStats = {};
const roleStats = {};
const dcStats = {};
for (const n of nodes) {
  envStats[n.environment] = (envStats[n.environment] || 0) + 1;
  roleStats[n.role] = (roleStats[n.role] || 0) + 1;
  dcStats[n.datacenter] = (dcStats[n.datacenter] || 0) + 1;
}

console.log("\nEnvironments:");
for (const [k, v] of Object.entries(envStats))
  console.log(`  ${k}: ${v} nodes`);
console.log("\nRoles:");
for (const [k, v] of Object.entries(roleStats))
  console.log(`  ${k}: ${v} nodes`);
console.log("\nDatacenters:");
for (const [k, v] of Object.entries(dcStats))
  console.log(`  ${k}: ${v} nodes`);

// Write files
const ansibleDir = join(__dirname, "ansible", "inventory");
const boltDir = join(__dirname, "bolt");
const sshDir = join(__dirname, "ssh");

mkdirSync(ansibleDir, { recursive: true });
mkdirSync(boltDir, { recursive: true });
mkdirSync(sshDir, { recursive: true });

writeFileSync(join(ansibleDir, "hosts.yml"), generateAnsible(nodes));
writeFileSync(join(boltDir, "inventory.yaml"), generateBolt(nodes));
writeFileSync(join(boltDir, "bolt-project.yaml"), generateBoltProject());
writeFileSync(join(sshDir, "config"), generateSSH(nodes));

console.log(`\nFiles written:`);
console.log(`  ansible/inventory/hosts.yml`);
console.log(`  bolt/inventory.yaml`);
console.log(`  bolt/bolt-project.yaml`);
console.log(`  ssh/config`);
console.log(`\nDone!`);
