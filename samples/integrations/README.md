# Pabawi Sample Integrations

Sample configurations for Bolt, Ansible, Puppet, and SSH to use as default paths for demo and development purposes.

These inventories model a realistic multi-tier infrastructure:

## Infrastructure Layout

### Environments

- **production** — Live customer-facing systems across two datacenters (us-east-1, eu-west-1)
- **staging** — Pre-production mirror for validation
- **development** — Developer sandbox and CI/CD

### Node Roles

- **webservers** — Nginx/HAProxy frontend (Ubuntu 22.04)
- **appservers** — Application backends: Rails, Java, Node.js (Ubuntu 22.04, RHEL 9)
- **databases** — PostgreSQL primary/replica, Redis cluster (RHEL 9)
- **monitoring** — Prometheus, Grafana, Alertmanager (Ubuntu 22.04)
- **ci** — Jenkins controller + agents (Ubuntu 22.04)
- **edge** — CDN/cache nodes at PoPs (Debian 12)
- **windows** — Active Directory, IIS servers (Windows Server 2022)
- **network** — Switches, firewalls (managed via SSH/API)

### Directory Structure

```
samples/integrations/
├── bolt/
│   ├── bolt-project.yaml      # Bolt project config
│   └── inventory.yaml         # Bolt inventory with groups, transports
├── ansible/
│   ├── ansible.cfg            # Ansible defaults
│   └── inventory/
│       ├── hosts.yml          # YAML inventory with groups and vars
│       └── host_vars/
│           ├── db-primary-prod-1.acme.internal.yml
│           └── win-ad-prod-1.acme.internal.yml
├── puppet/                    # Puppet control repo (role/profile pattern)
│   ├── environment.conf       # Environment configuration
│   ├── Puppetfile             # r10k module dependencies
│   ├── hiera.yaml             # Hiera 5 hierarchy configuration
│   ├── manifests/
│   │   └── site.pp            # Main site manifest with node classification
│   ├── data/                  # Hiera data
│   │   ├── common.yaml
│   │   ├── environments/      # Per-environment overrides
│   │   ├── roles/             # Per-role data
│   │   ├── datacenters/       # Per-datacenter data
│   │   ├── os/                # Per-OS family data
│   │   └── nodes/             # Per-node overrides
│   └── site-modules/          # Site-specific modules
│       ├── profile/           # Profile classes (technology wrappers)
│       └── role/              # Role classes (business roles)
└── ssh/
    └── config                 # SSH config with Host/Match blocks
```

## Usage

Set environment variables pointing to these paths:

```bash
# Bolt
BOLT_PROJECT_PATH=./samples/integrations/bolt

# Ansible
ANSIBLE_CONFIG=./samples/integrations/ansible/ansible.cfg

# Puppet (control repo / r10k environment)
PUPPET_CONTROL_REPO=./samples/integrations/puppet

# SSH
SSH_CONFIG_PATH=./samples/integrations/ssh/config
```

## Notes

- All hostnames use the `.acme.internal` domain (RFC 6762 safe)
- IP ranges use `10.0.0.0/8` and `172.16.0.0/12` (RFC 1918)
- SSH keys reference `~/.ssh/id_ed25519` (common modern default)
- Windows nodes use WinRM transport with NTLM
- Network devices use a dedicated `netadmin` user
