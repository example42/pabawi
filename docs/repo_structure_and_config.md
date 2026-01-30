# Repository Configuration and Dotfiles

This document describes the various configuration files, dotfiles, and directories in the repository that are not part of the core application code, tests, or standard documentation. These files handle development environment setup, CI/CD, linting, formatting, and deployment.

## Root Directory Files

### Git & Version Control

* **`.gitignore`**: Specifies files and directories that Git should ignore. This includes dependency directories (`node_modules/`), build outputs (`dist/`, `build/`), environment variables (`.env`), logs, and IDE-specific settings.
* **`.gitattributes`**: Defines attributes for paths in the repository, such as line ending handling (CRLF vs. LF) for specific file types.
* **`.secrets.baseline`**: A baseline file for the `detect-secrets` tool. It records potential secrets that were present when the tool was set up, allowing pre-commit hooks to flag *new* secrets without flagging existing ones (which should be rotated/removed eventually).

### Linting & Formatting

* **`eslint.config.js`**: Configuration for **ESLint**, the JavaScript/TypeScript linting utility. It sets up rules for code quality, including unused variable checks, type consistency, and explicit return types. It uses `typescript-eslint` for strict type checking on both backend and frontend.
* **`.markdownlint.json`**: Configuration for **markdownlint**, a tool to check Markdown style. It disables certain strict rules (like line length limits `MD013` and multiple headers with same content `MD024`) to adapt to the project's documentation style.
* **`.pre-commit-config.yaml`**: Configuration for **pre-commit**, a framework for managing git hooks. It defines a set of checks that run automatically before every commit, including:
  * **File checks**: Trailing whitespace, end-of-file fixer, YAML/JSON validity, large file checks, merge conflict markers.
  * **Security**: `detect-secrets` to prevent committing API keys or passwords.
  * **Linting**: Runs `eslint` locally.
  * **Type Checking**: Runs `tsc` (TypeScript compiler) for both backend and frontend to ensure no type errors.
  * **Custom checks**: A script to prevent duplicate or backup files (e.g., `*.bak`, `*_old`).
  * **Docker**: `hadolint` to check Dockerfile best practices.
  * **Markdown**: `markdownlint` to fix and format Markdown files.
  * **Shell**: `shellcheck` for shell script static analysis.
  * **Commit Messages**: Enforces [Conventional Commits](https://www.conventionalcommits.org/) standards.

### Environment & Development

* **`.env`**: (Git-ignored) Contains local environment variables for the application, such as database paths, port numbers, and API keys.
* **`.env.example`**: A template for the `.env` file. It lists all required environment variables with example values. Developers should copy this to `.env` and adjust as needed.
* **`docker-compose.yml`**: Defines the multi-container Docker application. It sets up the main `app` service, mounts volumes for persistence (`data/`, `bolt-project/`), and configures networking (`pabawi-network`).
* **`Dockerfile`**, **`Dockerfile.alpine`**, **`Dockerfile.ubuntu`**: Instructions for building the application's Docker image.
  * **`Dockerfile`**: The main multi-stage build file. It builds the frontend (Vite) and backend (TypeScript) separately, then combines them into a production image based on Ubuntu 24.04. It installs Node.js, Puppet, and Bolt.

### Testing

* **`playwright.config.ts`**: Configuration for **Playwright**, the end-to-end (E2E) testing framework. It configures browsers (Chromium), base URLs, reporting formats, and the local dev server command (`npm run dev:fullstack`) to start the app before testing.

## Configuration Directories

### `.devcontainer/`

Configures the [VS Code Dev Container](https://code.visualstudio.com/docs/devcontainers/containers) environment. This allows developers to open the project in a fully configured Docker container with all tools installed.

* **`devcontainer.json`**: The main config file. It:
  * Sets the Docker Compose file to use.
  * Installs VS Code extensions (ESLint, Prettier, Svelte, Docker).
  * Configures editor settings (format on save).
  * Forward ports (3000, 5173).
  * Runs `npm install` for root, backend, and frontend immediately after creation.

### `.github/`

Contains GitHub-specific configuration.

* **`workflows/`**: (Directory) Contains GitHub Actions CI/CD pipeline definitions (YAML files) that automate testing, building, and deployment on push/PR.
* **`copilot-instructions.md`**: Instructions specifically for GitHub Copilot to understand the project context and coding standards.

### `.kiro/`

Kiro has been used extensively for Pabawi development, in this directory are present all project files and most of the generated docs.

Subdirs:

* **`specs/`**, the directory where Kiro stores its files for Spc driven development. Subdirs for each implementation plan
* **`hooks/`**, the directory which Kiro uses to trigger hooks under certain conditions
* **`steering/`** the directory which Kiro uses to define project structure, best practices and coding guidelines
* **`todo/`**, **`done/`**, **`undo/`**, custom dirs (not Kiro native) used to store notes about things to do
* **`scripts/`**, custom dir for scripts used by Kiro during development and testing
* **`summaries/`** Custom dir where Kiro is instructed to save the summaries of its coding sessions.

### `.vscode/`

Contains local workspace settings for VS Code.

* **`settings.json`**: Workspace-specific settings that override global editor settings (e.g., specific file associations or hiding certain files).

### `bolt-project/`

Contains the configuration for **Bolt**, the automation tool this application manages.

* It acts as the "project root" for Bolt executions within the app.
* **`bolt.yaml`** (likely inside): Would define project-level configuration for Bolt.

### `scripts/`

Contains utility scripts for maintenance, build, or deployment.

* **`docker-entrypoint.sh`**: The script executed when the Docker container starts. It checks permissions on the `/data` directory and ensures the SQLite database file exists before starting the main application.
