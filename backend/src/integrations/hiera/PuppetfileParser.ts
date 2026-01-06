/**
 * PuppetfileParser
 *
 * Parses Puppetfile to extract module dependencies with versions and sources.
 * Supports both Puppet Forge modules and Git-based modules.
 *
 * Requirements: 10.1, 10.5
 */

import * as fs from "fs";
import type { ModuleUpdate } from "./types";

/**
 * Parsed module information from Puppetfile
 */
export interface ParsedModule {
  name: string;
  version: string;
  source: "forge" | "git";
  forgeSlug?: string;
  gitUrl?: string;
  gitRef?: string;
  gitTag?: string;
  gitBranch?: string;
  gitCommit?: string;
  line: number;
}

/**
 * Puppetfile parse result
 */
export interface PuppetfileParseResult {
  success: boolean;
  modules: ParsedModule[];
  forgeUrl?: string;
  moduledir?: string;
  errors: PuppetfileParseError[];
  warnings: string[];
}

/**
 * Puppetfile parse error
 */
export interface PuppetfileParseError {
  message: string;
  line?: number;
  column?: number;
  suggestion?: string;
}

/**
 * PuppetfileParser class for parsing Puppetfile module declarations
 */
export class PuppetfileParser {
  /**
   * Parse a Puppetfile from a file path
   *
   * @param filePath - Path to the Puppetfile
   * @returns Parse result with modules and any errors
   */
  parseFile(filePath: string): PuppetfileParseResult {
    let content: string;

    try {
      content = fs.readFileSync(filePath, "utf-8");
    } catch (error) {
      return {
        success: false,
        modules: [],
        errors: [
          {
            message: `Failed to read Puppetfile: ${this.getErrorMessage(error)}`,
            suggestion: "Ensure the Puppetfile exists and is readable",
          },
        ],
        warnings: [],
      };
    }

    return this.parse(content);
  }

  /**
   * Parse Puppetfile content
   *
   * @param content - Puppetfile content as string
   * @returns Parse result with modules and any errors
   */
  parse(content: string): PuppetfileParseResult {
    const modules: ParsedModule[] = [];
    const errors: PuppetfileParseError[] = [];
    const warnings: string[] = [];
    let forgeUrl: string | undefined;
    let moduledir: string | undefined;

    const lines = content.split("\n");
    let currentModuleLines: string[] = [];
    let currentModuleStartLine = 0;
    let inMultilineModule = false;

    for (let i = 0; i < lines.length; i++) {
      const lineNumber = i + 1;
      const line = lines[i];
      const trimmedLine = line.trim();

      // Skip empty lines and comments
      if (trimmedLine === "" || trimmedLine.startsWith("#")) {
        continue;
      }

      // Parse forge directive
      const forgeMatch = trimmedLine.match(/^forge\s+['"]([^'"]+)['"]/);
      if (forgeMatch) {
        forgeUrl = forgeMatch[1];
        continue;
      }

      // Parse moduledir directive
      const moduledirMatch = trimmedLine.match(/^moduledir\s+['"]([^'"]+)['"]/);
      if (moduledirMatch) {
        moduledir = moduledirMatch[1];
        continue;
      }

      // Handle multi-line module declarations
      if (inMultilineModule) {
        currentModuleLines.push(line);
        // Check if this line ends the module declaration
        if (!this.isLineContinued(line)) {
          const moduleResult = this.parseModuleDeclaration(
            currentModuleLines.join("\n"),
            currentModuleStartLine
          );
          if (moduleResult.module) {
            modules.push(moduleResult.module);
          }
          if (moduleResult.error) {
            errors.push(moduleResult.error);
          }
          if (moduleResult.warning) {
            warnings.push(moduleResult.warning);
          }
          currentModuleLines = [];
          inMultilineModule = false;
        }
        continue;
      }

      // Check for mod declaration start
      if (trimmedLine.startsWith("mod ") || trimmedLine.startsWith("mod(")) {
        currentModuleStartLine = lineNumber;
        currentModuleLines = [line];

        // Check if this is a multi-line declaration
        if (this.isLineContinued(line)) {
          inMultilineModule = true;
        } else {
          const moduleResult = this.parseModuleDeclaration(line, lineNumber);
          if (moduleResult.module) {
            modules.push(moduleResult.module);
          }
          if (moduleResult.error) {
            errors.push(moduleResult.error);
          }
          if (moduleResult.warning) {
            warnings.push(moduleResult.warning);
          }
          currentModuleLines = [];
        }
        continue;
      }

      // Unknown directive - add warning
      if (trimmedLine.length > 0 && !trimmedLine.startsWith("mod")) {
        warnings.push(`Unknown directive at line ${lineNumber}: ${trimmedLine.substring(0, 50)}`);
      }
    }

    // Handle unclosed multi-line module
    if (inMultilineModule && currentModuleLines.length > 0) {
      errors.push({
        message: "Unclosed module declaration",
        line: currentModuleStartLine,
        suggestion: "Ensure all module declarations are properly closed",
      });
    }

    return {
      success: errors.length === 0,
      modules,
      forgeUrl,
      moduledir,
      errors,
      warnings,
    };
  }

  /**
   * Check if a line continues to the next line
   */
  private isLineContinued(line: string): boolean {
    const trimmed = line.trim();
    // Line continues if it ends with comma, backslash, or has unclosed braces/parens
    if (trimmed.endsWith(",") || trimmed.endsWith("\\")) {
      return true;
    }
    // Check for unclosed hash/array
    const openBraces = (trimmed.match(/{/g) || []).length;
    const closeBraces = (trimmed.match(/}/g) || []).length;
    if (openBraces > closeBraces) {
      return true;
    }
    return false;
  }

  /**
   * Parse a single module declaration
   */
  private parseModuleDeclaration(
    declaration: string,
    lineNumber: number
  ): { module?: ParsedModule; error?: PuppetfileParseError; warning?: string } {
    // Normalize the declaration (remove newlines, extra spaces)
    const normalized = declaration.replace(/\s+/g, " ").trim();

    // Try to parse as simple forge module: mod 'author/name', 'version'
    const simpleForgeMatch = normalized.match(
      /^mod\s+['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*$/
    );
    if (simpleForgeMatch) {
      const moduleName = simpleForgeMatch[1];
      const version = simpleForgeMatch[2];
      return {
        module: {
          name: this.normalizeModuleName(moduleName),
          version,
          source: "forge",
          forgeSlug: moduleName,
          line: lineNumber,
        },
      };
    }

    // Try to parse as forge module without version: mod 'author/name'
    const forgeNoVersionMatch = normalized.match(/^mod\s+['"]([^'"]+)['"]\s*$/);
    if (forgeNoVersionMatch) {
      const moduleName = forgeNoVersionMatch[1];
      return {
        module: {
          name: this.normalizeModuleName(moduleName),
          version: "latest",
          source: "forge",
          forgeSlug: moduleName,
          line: lineNumber,
        },
        warning: `Module '${moduleName}' at line ${lineNumber} has no version specified`,
      };
    }

    // Try to parse as git module: mod 'name', :git => 'url', ...
    const gitMatch = normalized.match(
      /^mod\s+['"]([^'"]+)['"]\s*,\s*:git\s*=>\s*['"]([^'"]+)['"]/
    );
    if (gitMatch) {
      const moduleName = gitMatch[1];
      const gitUrl = gitMatch[2];

      // Extract git ref options
      const tagMatch = normalized.match(/:tag\s*=>\s*['"]([^'"]+)['"]/);
      const branchMatch = normalized.match(/:branch\s*=>\s*['"]([^'"]+)['"]/);
      const refMatch = normalized.match(/:ref\s*=>\s*['"]([^'"]+)['"]/);
      const commitMatch = normalized.match(/:commit\s*=>\s*['"]([^'"]+)['"]/);

      const version = tagMatch?.[1] || branchMatch?.[1] || refMatch?.[1] || commitMatch?.[1] || "HEAD";

      return {
        module: {
          name: moduleName,
          version,
          source: "git",
          gitUrl,
          gitTag: tagMatch?.[1],
          gitBranch: branchMatch?.[1],
          gitRef: refMatch?.[1],
          gitCommit: commitMatch?.[1],
          line: lineNumber,
        },
      };
    }

    // Try to parse as local module: mod 'name', :local => true
    const localMatch = normalized.match(
      /^mod\s+['"]([^'"]+)['"]\s*,\s*:local\s*=>\s*true/
    );
    if (localMatch) {
      return {
        module: {
          name: localMatch[1],
          version: "local",
          source: "git", // Treat local as git-like (not from forge)
          line: lineNumber,
        },
      };
    }

    // Could not parse the module declaration
    return {
      error: {
        message: `Failed to parse module declaration: ${normalized.substring(0, 100)}`,
        line: lineNumber,
        suggestion: "Check the module declaration syntax",
      },
    };
  }

  /**
   * Normalize module name to consistent format
   * Converts 'author-name' to 'author/name'
   */
  private normalizeModuleName(name: string): string {
    // If already has slash, return as-is
    if (name.includes("/")) {
      return name;
    }
    // Convert hyphen to slash for author-module format
    const parts = name.split("-");
    if (parts.length >= 2) {
      return `${parts[0]}/${parts.slice(1).join("-")}`;
    }
    return name;
  }

  /**
   * Convert parsed modules to ModuleUpdate format
   */
  toModuleUpdates(modules: ParsedModule[]): ModuleUpdate[] {
    return modules.map((mod) => ({
      name: mod.name,
      currentVersion: mod.version,
      latestVersion: mod.version, // Will be updated by update detection
      source: mod.source,
      hasSecurityAdvisory: false, // Will be updated by security check
    }));
  }

  /**
   * Get a formatted error summary from parse result
   *
   * @param result - Parse result
   * @returns Formatted error message or null if no errors
   */
  getErrorSummary(result: PuppetfileParseResult): string | null {
    if (result.success && result.errors.length === 0) {
      return null;
    }

    const errorMessages = result.errors.map((err) => {
      let msg = err.message;
      if (err.line) {
        msg = `Line ${err.line}: ${msg}`;
      }
      if (err.suggestion) {
        msg += ` (${err.suggestion})`;
      }
      return msg;
    });

    return `Puppetfile parse errors:\n${errorMessages.join("\n")}`;
  }

  /**
   * Validate a Puppetfile and return detailed validation result
   *
   * @param filePath - Path to the Puppetfile
   * @returns Validation result with detailed error information
   */
  validate(filePath: string): PuppetfileValidationResult {
    const parseResult = this.parseFile(filePath);

    const issues: PuppetfileValidationIssue[] = [];

    // Convert errors to issues
    for (const error of parseResult.errors) {
      issues.push({
        severity: "error",
        message: error.message,
        line: error.line,
        column: error.column,
        suggestion: error.suggestion,
      });
    }

    // Convert warnings to issues
    for (const warning of parseResult.warnings) {
      // Extract line number from warning if present
      const lineMatch = warning.match(/line (\d+)/i);
      issues.push({
        severity: "warning",
        message: warning,
        line: lineMatch ? parseInt(lineMatch[1], 10) : undefined,
      });
    }

    // Add additional validation checks
    for (const mod of parseResult.modules) {
      // Check for modules without version pinning
      if (mod.version === "latest") {
        issues.push({
          severity: "warning",
          message: `Module '${mod.name}' has no version pinned`,
          line: mod.line,
          suggestion: "Pin module versions for reproducible builds",
        });
      }

      // Check for git modules without specific ref
      if (mod.source === "git" && mod.version === "HEAD") {
        issues.push({
          severity: "warning",
          message: `Git module '${mod.name}' has no tag, branch, or commit specified`,
          line: mod.line,
          suggestion: "Specify a tag, branch, or commit for reproducible builds",
        });
      }
    }

    return {
      valid: parseResult.success && issues.filter((i) => i.severity === "error").length === 0,
      modules: parseResult.modules,
      issues,
      forgeUrl: parseResult.forgeUrl,
      moduledir: parseResult.moduledir,
    };
  }

  /**
   * Extract error message from unknown error
   */
  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}

/**
 * Puppetfile validation issue
 */
export interface PuppetfileValidationIssue {
  severity: "error" | "warning" | "info";
  message: string;
  line?: number;
  column?: number;
  suggestion?: string;
}

/**
 * Puppetfile validation result
 */
export interface PuppetfileValidationResult {
  valid: boolean;
  modules: ParsedModule[];
  issues: PuppetfileValidationIssue[];
  forgeUrl?: string;
  moduledir?: string;
}
