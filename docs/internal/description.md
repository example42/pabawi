# Pabawi — Technical Summary

## Overview

Pabawi is a **web-based interface and unified API** for managing Puppet infrastructure through Bolt execution and multiple information sources.

The application provides a **common abstraction layer** and **consistent web API** to execute commands, tasks, and workflows while aggregating data from Bolt, PuppetDB, Puppetserver, and Hiera through a plugin-based architecture.

---

## 1. Goals and Objectives

- Provide a **web-based interface** for Bolt automation and Puppet infrastructure management
- Unify data from **multiple information sources** (Bolt, PuppetDB, Puppetserver, Hiera) through a plugin architecture
- Offer a **REST API** with standardized JSON schemas
- Enable **real-time execution monitoring** with streaming output
- Support **graceful degradation** when integrations are unavailable
- Maintain **strong security** with command whitelisting and expert mode debugging

---

## 2. Plugin-Based Architecture

Pabawi uses a plugin system to integrate multiple tools and data sources:

### Current Integrations (v0.5.0)

| Integration | Type | Priority | Capabilities |
|------------|------|----------|--------------|
| **Bolt** | Execution + Information | 10 | Command/task execution, inventory, facts |
| **PuppetDB** | Information | 10 | Inventory, facts, reports, catalog data |
| **Puppetserver** | Information | 20 | Node certificates, status, catalog compilation |
| **Hiera** | Information | 6 | Hierarchical configuration data, key analysis |

### Plugin Types

- **Execution Tool Plugins**: Execute actions on target nodes (Bolt)
- **Information Source Plugins**: Provide inventory, facts, and node data (PuppetDB, Puppetserver, Hiera)
- **Both**: Plugins that provide execution and information capabilities (Bolt)

---

## 3. Data Model

### Core Entities

- **Node**: A managed infrastructure target (from Bolt inventory or discovered via integrations)
- **Integration**: A data source or execution tool plugin
- **Execution**: A command, task, or plan execution with streaming output
- **Facts**: System information collected from nodes
- **Report**: Puppet run report with metrics and status
- **ExecutionResult**: Normalized outcome with source attribution

---

## 4. Version History

### Version 0.5.0 (Current)

Puppet report filtering, run history visualization, and enhanced expert mode debugging.

**Key Features:**

- Report filtering by status, duration, compile time, and total resources
- Puppet run history visualization with stacked bar charts
- Aggregated run history for all nodes on home page
- Enhanced expert mode with frontend log collection and obfuscation
- Performance metrics (memory, CPU, cache stats)
- Centralized logging service with consistent formatting
- UI configuration options

### Version 0.4.0

Hiera integration for hierarchical configuration data browsing and analysis.

**Key Features:**

- Hiera integration for configuration data exploration
- Key usage analysis and classification
- Hierarchical data resolution with fact interpolation
- Code analysis for Puppet manifests and modules
- Removal of certificate management functionality
- Enhanced plugin architecture with better error handling
- Improved health monitoring and graceful degradation

### Version 0.2.0

PuppetDB integration and plugin architecture.

**Key Features:**

- PuppetDB support for inventory, facts, and reports
- Plugin architecture for integrations
- Multi-source data aggregation

### Version 0.1.0

Initial release with Bolt integration.

**Key Features:**

- Bolt support for inventory, facts, and executions
- Node inventory (optimized for 10-1000+ nodes)
- Node detail page with facts, execution results, commands, and tasks
- Executions results page

For detailed architecture information, see [Architecture Documentation](./architecture.md).

---

## 5. Technical Stack

### Frontend

- **Framework**: Svelte 5 with TypeScript
- **Styling**: Tailwind CSS for utility-first design
- **Build Tool**: Vite for fast development and optimized builds
- **State Management**: Svelte 5 runes (`$state()`, `$effect()`)

**Features:**

- Interactive dashboards for execution monitoring
- Real-time streaming output via Server-Sent Events (SSE)
- Virtual scrolling for large inventories (1000+ nodes)
- Expert mode with frontend log collection and obfuscation

### Backend

- **Language/Runtime**: TypeScript on Node.js
- **Framework**: Express
- **API Specification**: OpenAPI 3.0 (REST)
- **Database**: SQLite for execution history

**Responsibilities:**

- Plugin-based integration management
- Execution orchestration with queue and streaming
- Multi-source data aggregation with priority-based routing
- Structured logging and performance monitoring

### Deployment

- **Container Runtime**: Docker
- **Base Images**: node:alpine (production), node:slim (development)
- **Configuration**: Environment variables (.env)
- **CI/CD**: GitHub Actions for lint, test, build

**Features:**

- Single container serving both API and frontend
- Multi-architecture builds (amd64, arm64)
- Development and production Docker configurations

### Infrastructure

- **Database**: SQLite (execution history with composite indexes)
- **Logging**: Centralized LoggerService with structured metadata
- **Monitoring**: Performance metrics, health checks, expert mode diagnostics
