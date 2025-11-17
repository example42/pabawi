# Unified Remote Execution Interface — Technical Summary

## Overview

This document summarizes the technical design for a **web interface and unified API** that orchestrates remote execution tools such as **Bolt**, **Ansible**, and future adapters (e.g., Salt, Chef, Terraform).

The objective is to provide a **common abstraction layer** and **consistent web API** to execute commands, tasks, workflows, and facts collection operations across heterogeneous automation backends.

---

## 1. Goals and Objectives

- Provide a **web-based orchestration layer** for remote execution tools.
- Abstract differences between tools into a **shared action model**.
- Offer a **REST API** with standardized JSON schemas.
- Enable **UI integration** for command execution, inventory browsing, and log visualization.
- Support **multiple adapters** via a plugin architecture.
- Design with strong security principles

---

## 2.  Common Concepts Across Infrastructure Automation Tools

| Concept | Bolt | Ansible | Salt | Terraform | Chef | Puppet | Fabric | PowerShell DSC | CFEngine | Capistrano | Unified Abstraction |
|----------|------|----------|------|-----------|------|--------|--------|----------------|----------|------------|----------------------|
| **Inventory** | inventory.yaml | inventory.ini / hosts | roster file / nodegroups | providers + resources | nodes.json / knife search | nodes.pp / PuppetDB | fabfile hosts list | Configuration data | hosts in promises | deploy.rb servers | ExecutionTarget |
| **Command Execution** | `bolt command run` | `ansible -m command` | `salt '*' cmd.run` | N/A (declarative) | `knife ssh 'cmd'` | N/A (declarative) | `fab run:'cmd'` | `Invoke-Command` | `cf-runagent` | `cap invoke:cmd` | RunCommand |
| **Task Execution** | `bolt task run` | `ansible -m <module>` | `salt '*' state.single` | `terraform apply` | `chef-client -o recipe` | `puppet agent -t` | `@task def name()` | `Start-DscConfiguration` | `cf-agent` | `cap task_name` | RunTask |
| **Workflow Execution** | `bolt plan run` | `ansible-playbook playbook.yml` | `salt '*' state.apply` | `terraform plan/apply` | `chef-client -r runlist` | `puppet apply manifest.pp` | `fab deploy` | Configuration Script | Policy execution | `cap production deploy` | RunWorkflow |
| **Facts Gathering** | `bolt inventory show` | `ansible -m setup` / `gather_facts` | `salt '*' grains.items` | `terraform show/state` | `ohai` | `facter` | Custom functions | `Get-DscConfiguration` | `cf-promises --show-vars` | Custom rake tasks | GatherFacts |
| **Credentials** | bolt-project.yaml transport | ansible.cfg / vault / inventory vars | pillar / master config | provider blocks / env vars | knife.rb / data bags | hiera / eyaml | SSH config / env vars | Credentials in MOF | Encrypted files | SSH keys / config | CredentialProfile |
| **Variables/Parameters** | vars in plan/inventory | host_vars / group_vars / extra-vars | pillar / grains | variables.tf / tfvars | attributes / data bags | hiera / params | env dict / config | Configuration data | variables in promises | set :var, value | ExecutionParameters |
| **State/Idempotency** | Tasks can be idempotent | Modules are idempotent | States are idempotent | Resources are idempotent | Resources converge | Resources converge | Manual implementation | DSC resources converge | Promises converge | Manual implementation | StateManagement |
| **Result Output** | JSON / human | JSON / YAML / human | YAML / JSON / text | JSON / HCL | JSON / text | YAML / JSON | stdout / custom | PowerShell objects | Text / JSON | stdout / logs | ExecutionResult |
| **Remote Execution** | SSH / WinRM / Docker | SSH / WinRM | ZeroMQ / SSH | Provider APIs | SSH / WinRM | Puppet Server / SSH | SSH / paramiko | WinRM / PowerShell Remoting | cf-serverd protocol | SSH / SCP | TransportProtocol |
| **Configuration Format** | YAML | YAML | YAML / SLS | HCL | Ruby DSL | Puppet DSL | Python | PowerShell / MOF | CFEngine language | Ruby DSL | ConfigurationLanguage |
| **Templating** | EPP / ERB | Jinja2 | Jinja2 / Mako | HCL interpolation | ERB | EPP / ERB | Jinja2 / Python f-strings | PowerShell strings | Mustache / CFEngine | ERB | TemplateEngine |

---

## 3. Unified Data Model

### Entities

- **Tool**: Describes an automation backend (Bolt, Ansible, etc.).  
- **Target**: A host or endpoint to execute actions on.  
- **CredentialProfile**: Secure reference to authentication data.  
- **ExecutionContext**: Scope of a single execution (tool, targets, vars).  
- **Action**: Logical execution unit (command, task, plan).  
- **ExecutionResult**: Normalized outcome across all targets.

---

## 4. Implementation steps

Version 0.1.0 - Simple web interface serving the Bolt environment of the local cwd, it directly uses credentials, inventory files and modules found on the local existing directory of the Bolt user.
Implements Bolt support for Inventory, Facts, and Executions.
The web interface should provide the following pages:

- Nodes inventory (able to adapt efficently to from dozens to thousands of nodes)
- Node detail page (where to see facts, execution resuts, run commands and tasks)
- Executions results page (summary of all executions and link to drill down for details)

Version 0.2.0 - Add PuppetDB support for Inventory, Facts and reports add Puppet support for Executions

Version 0.3.0 - Add Ansible support for Inventory, Facts and Executions

Version 0.4.0 - Implement workflows logic

Version 0.x.0 - Add support for other tools

Version 1.0.0 - Add multitenant support, with centralized authentication and authorisation

---

## 5 Technical stack

### Frontend

- Framework: Svelte — chosen for its lightweight reactivity model and minimal runtime overhead.
- Styling: Tailwind CSS — enables utility-first, consistent design and rapid UI prototyping.
- Build Tool: Vite — ensures fast hot-reload and optimized production builds.

Features:

- Interactive dashboards for execution monitoring
- Real-time log streaming (WebSocket/SSE integration)
= Modular components for tool adapters (Bolt, Ansible, etc.)

### Backend

- Language/Runtime: Typescript / ???
- API Specification: OpenAPI 3.0 (REST)

Responsibilities:

- Abstract dispatch of actions to adapters (Bolt, Ansible, etc.)
- Execution orchestration, result normalization, and persistence
- Authentication, RBAC, and audit logging

### Containerization & Deployment

- Container Runtime: Docker
- Base Image: node:alpine (for production builds)
- Container Orchestration (optional): Kubernetes for scaling and adapter isolation

Features:

- Single container serving both API and frontend
- Configurable through environment variables (.env)
- Ready for CI/CD pipelines (e.g., GitHub Actions, GitLab CI)

### Additional Tooling

- Database: PostgreSQL or SQLite (for metadata and results)
- Secrets Management: HashiCorp Vault (optional - TO DEFINE)
- Observability: OpenTelemetry for distributed tracing and Prometheus metrics
