/**
 * Puppet Run History Service
 *
 * Service for aggregating and analyzing puppet run history data.
 * Provides methods to get run history for individual nodes or all nodes,
 * with summary statistics and grouping by date and status.
 */

import type { Report } from "../integrations/puppetdb/types";
import type { PuppetDBService } from "../integrations/puppetdb/PuppetDBService";
import type { LoggerService } from "./LoggerService";

/**
 * Run history data grouped by date
 */
export interface RunHistoryData {
  date: string; // ISO date string (YYYY-MM-DD)
  success: number; // count of successful runs (unchanged status)
  failed: number; // count of failed runs
  changed: number; // count of runs with changes
  unchanged: number; // count of unchanged runs (same as success)
}

/**
 * Node-specific run history with summary statistics
 */
export interface NodeRunHistory {
  nodeId: string;
  history: RunHistoryData[];
  summary: {
    totalRuns: number;
    successRate: number; // percentage (0-100)
    avgDuration: number; // in seconds
    lastRun: string; // ISO timestamp
  };
}

/**
 * Service for managing puppet run history data
 */
export class PuppetRunHistoryService {
  private puppetDBService: PuppetDBService;
  private logger?: LoggerService;

  constructor(puppetDBService: PuppetDBService, logger?: LoggerService) {
    this.puppetDBService = puppetDBService;
    this.logger = logger;
  }

  /**
   * Get run history for a specific node
   *
   * @param nodeId - Node identifier (certname)
   * @param days - Number of days to look back (default: 7)
   * @returns Node run history with summary statistics
   */
  async getNodeHistory(nodeId: string, days = 7): Promise<NodeRunHistory> {
    this.log(`Getting run history for node '${nodeId}' for last ${days} days`);

    try {
      // Calculate date range
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Get reports for the node
      // We'll fetch more than we need to ensure we have enough data
      const reports = await this.puppetDBService.getNodeReports(nodeId, days * 10);

      // Filter reports within date range
      const filteredReports = reports.filter((report) => {
        const reportDate = new Date(report.producer_timestamp);
        return reportDate >= startDate && reportDate <= endDate;
      });

      this.log(`Found ${filteredReports.length} reports for node '${nodeId}' in date range`);

      // Group reports by date and status
      const history = this.groupReportsByDate(filteredReports);

      // Calculate summary statistics
      const summary = this.calculateSummary(filteredReports);

      return {
        nodeId,
        history,
        summary,
      };
    } catch (error) {
      this.logError(`Failed to get run history for node '${nodeId}'`, error);
      throw error;
    }
  }

  /**
   * Get aggregated run history for all nodes
   *
   * @param days - Number of days to look back (default: 7)
   * @returns Aggregated run history data
   */
  async getAggregatedHistory(days = 7): Promise<RunHistoryData[]> {
    this.log(`Getting aggregated run history for all nodes for last ${days} days`);

    try {
      // Calculate date range
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Get all reports
      // We'll fetch a large number to get comprehensive data
      const reports = await this.puppetDBService.getAllReports(days * 100);

      // Filter reports within date range
      const filteredReports = reports.filter((report) => {
        const reportDate = new Date(report.producer_timestamp);
        return reportDate >= startDate && reportDate <= endDate;
      });

      this.log(`Found ${filteredReports.length} reports across all nodes in date range`);

      // Group reports by date and status
      const history = this.groupReportsByDate(filteredReports);

      return history;
    } catch (error) {
      this.logError("Failed to get aggregated run history", error);
      throw error;
    }
  }

  /**
   * Group reports by date and status
   *
   * @param reports - Array of reports to group
   * @returns Array of run history data grouped by date
   */
  private groupReportsByDate(reports: Report[]): RunHistoryData[] {
    // Create a map to group reports by date
    const dateMap = new Map<string, RunHistoryData>();

    for (const report of reports) {
      // Extract date from producer_timestamp (YYYY-MM-DD)
      const reportDate = new Date(report.producer_timestamp);
      const dateKey = reportDate.toISOString().split("T")[0];

      // Get or create entry for this date
      if (!dateMap.has(dateKey)) {
        dateMap.set(dateKey, {
          date: dateKey,
          success: 0,
          failed: 0,
          changed: 0,
          unchanged: 0,
        });
      }

      const entry = dateMap.get(dateKey)!;

      // Increment counters based on status
      switch (report.status) {
        case "failed":
          entry.failed++;
          break;
        case "changed":
          entry.changed++;
          break;
        case "unchanged":
          entry.unchanged++;
          entry.success++; // unchanged is considered success
          break;
      }
    }

    // Convert map to array and sort by date
    const history = Array.from(dateMap.values()).sort((a, b) => {
      return a.date.localeCompare(b.date);
    });

    return history;
  }

  /**
   * Calculate summary statistics for reports
   *
   * @param reports - Array of reports to analyze
   * @returns Summary statistics
   */
  private calculateSummary(reports: Report[]): NodeRunHistory["summary"] {
    if (reports.length === 0) {
      return {
        totalRuns: 0,
        successRate: 0,
        avgDuration: 0,
        lastRun: new Date().toISOString(),
      };
    }

    // Count successful runs (unchanged or changed without failures)
    const successfulRuns = reports.filter(
      (report) => report.status === "unchanged" || report.status === "changed"
    ).length;

    // Calculate success rate
    const successRate = (successfulRuns / reports.length) * 100;

    // Calculate average duration
    const totalDuration = reports.reduce((sum, report) => {
      const startTime = new Date(report.start_time).getTime();
      const endTime = new Date(report.end_time).getTime();
      const duration = (endTime - startTime) / 1000; // convert to seconds
      return sum + duration;
    }, 0);

    const avgDuration = totalDuration / reports.length;

    // Get last run timestamp
    const sortedReports = [...reports].sort((a, b) => {
      return (
        new Date(b.producer_timestamp).getTime() -
        new Date(a.producer_timestamp).getTime()
      );
    });

    const lastRun = sortedReports[0].producer_timestamp;

    return {
      totalRuns: reports.length,
      successRate: Math.round(successRate * 100) / 100, // round to 2 decimal places
      avgDuration: Math.round(avgDuration * 100) / 100, // round to 2 decimal places
      lastRun,
    };
  }

  /**
   * Log a message
   *
   * @param message - Message to log
   * @param level - Log level (default: info)
   */
  private log(message: string, level: "info" | "warn" | "error" = "info"): void {
    if (this.logger) {
      switch (level) {
        case "error":
          this.logger.error(message, {
            component: "PuppetRunHistoryService",
          });
          break;
        case "warn":
          this.logger.warn(message, {
            component: "PuppetRunHistoryService",
          });
          break;
        default:
          this.logger.info(message, {
            component: "PuppetRunHistoryService",
          });
      }
    }
  }

  /**
   * Log an error
   *
   * @param message - Error message
   * @param error - Error object
   */
  private logError(message: string, error: unknown): void {
    if (this.logger) {
      this.logger.error(message, {
        component: "PuppetRunHistoryService",
      }, error instanceof Error ? error : undefined);
    }
  }
}
