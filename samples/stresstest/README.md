# Pabawi Stress Test Inventories

Large-scale inventories for stress testing the Pabawi web interface with thousands of nodes across Ansible, Bolt, and SSH formats.

## Structure

```
stresstest/
├── generate.js              # Node.js generator script (configurable)
├── ansible/
│   └── inventory/
│       └── hosts.yml        # Ansible YAML inventory
├── bolt/
│   ├── bolt-project.yaml    # Bolt project config
│   └── inventory.yaml       # Bolt inventory
└── ssh/
    └── config               # SSH config file
```

## Pre-Generated (Default: 2,000 Nodes)

The included files contain **2,000 nodes** distributed across:

| Dimension     | Values                                                                                         |
|---------------|------------------------------------------------------------------------------------------------|
| Environments  | production (45%), staging (20%), development (15%), qa (10%), performance (10%)                 |
| Datacenters   | us-east-1, us-west-2, eu-west-1, eu-central-1, ap-southeast-1, ap-northeast-1, sa-east-1, af-south-1 |
| Roles         | webserver, loadbalancer, appserver, database, cache, queue, monitoring, logging, ci, storage, edge, bastion, dns, windows |
| Transports    | SSH (default), WinRM (windows nodes)                                                           |
| OS Families   | Debian, RedHat, Windows                                                                        |

## Regenerate with Different Sizes

```bash
# Default: 2,000 nodes
node generate.js

# Custom sizes
node generate.js 1000
node generate.js 5000
node generate.js 10000
```

The generator distributes nodes realistically across environments, datacenters, and roles using weighted distributions.

## Using with Pabawi

Point Pabawi's integration paths to these directories:

```env
# .env — Ansible integration
ANSIBLE_INVENTORY_PATH=./samples/stresstest/ansible/inventory/hosts.yml

# .env — Bolt integration
BOLT_PROJECT_PATH=./samples/stresstest/bolt

# .env — SSH integration (if applicable)
SSH_CONFIG_PATH=./samples/stresstest/ssh/config
```

Or copy the files to your existing integration directories:

```bash
# Ansible
cp samples/stresstest/ansible/inventory/hosts.yml samples/integrations/ansible/inventory/hosts.yml

# Bolt
cp samples/stresstest/bolt/inventory.yaml samples/integrations/bolt/inventory.yaml

# SSH
cp samples/stresstest/ssh/config samples/integrations/ssh/config
```

## Node Naming Convention

```
{role-prefix}-{env-short}-{datacenter}-{index}.stress.acme.internal
```

Examples:

- `web-prod-us-east-1-1.stress.acme.internal`
- `db-stg-eu-west-1-3.stress.acme.internal`
- `app-dev-us-west-2-12.stress.acme.internal`
- `win-prod-us-east-1-1.stress.acme.internal`

## IP Addressing

Each datacenter gets a `/16` subnet, with the third octet indicating the role tier:

| Octet | Tier           | Roles                                |
|-------|----------------|--------------------------------------|
| .0    | Security       | bastion, dns                         |
| .1    | Frontend       | webserver, loadbalancer              |
| .2    | Application    | appserver                            |
| .3    | Data           | database, cache, queue               |
| .4    | Infrastructure | monitoring, logging                  |
| .5    | CI/CD          | ci                                   |
| .6    | Storage        | storage                              |
| .7    | Edge           | edge (CDN/cache)                     |
| .9    | Windows        | windows (IIS, AD)                    |

## Limitations

- IP addresses wrap at `.254` per subnet segment, so very large node counts (~10K+) may produce fewer nodes than requested.
- Windows nodes are excluded from the SSH config (they use WinRM).
- The inventories use fictional IPs and hostnames — they won't resolve in DNS.
