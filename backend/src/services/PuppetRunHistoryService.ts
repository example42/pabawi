/**
 * Puppet Run History Service
 *
 * Service for aggregating and analyzing run history data from reporting plugins.
 * Provides methods to get run history for individual nodes or all nodes,
 * with summary statistics and grouping by date and status.
 *
 * This service is plugin-agnostic and works with any plugin that provides
 * report data through the standard Report interface.
 */

/**
 * Generic report interface for run history
 * Plugins should provide reports that conform to this interface
 */
export interface Report {
  producer_timestamp: string;
  start_time: string;
  end_time: string;
  status: 'success' | 'failed' | 'changed' | 'unchanged';
  metrics: {
    resources: {
      total: number;
    };
    time: {
      catalog_application?: number;
    };
  };
}

/**
 * Interface for services that provide report data
 */
export interface ReportProvider {
  getNodeReportCountsByDateAndStatus(
    nodeId: string,
    startDate: string,
    endDate: string
  ): Promise<Array<{ date: string; status: string; count: number }>>;

  getNodeReports(nodeId: string, limit: number): Promise<Report[]>;

  getReportCountsByDateAndStatus(
    startDate: string,
    endDate: string
  ): Promise<Array<{ date: string; status: string; count: number }>>;
}

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
 * Service for managing run history data from reporting plugins
 */
export class PuppetRunHistoryService {
  private reportProvider: ReportProvider;
  private logger?: LoggerService;

  constructor(reportProvider: ReportProvider, logger?: LoggerService) {
    this.reportProvider = reportProvider;
    this.logger = logger;
  }

  /**
   * Get run history for a specific node
   *
   * Uses the report provider's aggregate query for efficient chart data,
   * and fetches a small number of recent reports for summary statistics.
   *
   * @param nodeId - Node identifier (certname)
   * @param days - Number of days to look back (default: 7)
   * @returns Node run history with summary statistics
   */
  async getNodeHistory(nodeId: string, days = 7): Promise<NodeRunHistory> {
    this.log(`Getting run history for node '${nodeId}' for last ${String(days)} days`);

    try {
      // Calculate date range
      const endDate = new Date();
      // Set end date to end of today
      endDate.setHours(23, 59, 59, 999);

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      // Set start date to beginning of that day
      startDate.setHours(0, 0, 0, 0);

      // Use the efficient aggregate query to get counts by date and status
      const counts = await this.reportProvider.getNodeReportCountsByDateAndStatus(
        nodeId,
        startDate.toISOString(),
        endDate.toISOString()
      );

      this.log(`Got ${String(counts.length)} date/status combinations for node '${nodeId}'`);

      // Convert counts to RunHistoryData format
      const history = this.convertCountsToHistory(counts, startDate, endDate);

      // Fetch a small number of recent reports for summary statistics
      // We only need enough to calculate avgDuration and get lastRun
      const recentReports = await this.reportProvider.getNodeReports(nodeId, 10);

      // Filter to date range for accurate summary
      const filteredReports = recentReports.filter((report) => {
        const reportDate = new Date(report.producer_timestamp);
        return reportDate >= startDate && reportDate <= endDate;
      });

      // Calculate summary statistics from counts and recent reports
      const summary = this.calculateSummaryFromCounts(counts, filteredReports);

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
   * Uses the report provider's aggregate query to efficiently get counts grouped by date and status.
   * This avoids fetching all reports and instead queries only the counts needed.
   *
   * @param days - Number of days to look back (default: 7)
   * @returns Aggregated run history data
   */
  async getAggregatedHistory(days = 7): Promise<RunHistoryData[]> {
    this.log(`Getting aggregated run history for all nodes for last ${String(days)} days`);

    try {
      // Calculate date range
      const endDate = new Date();
      // Set end date to end of today
      endDate.setHours(23, 59, 59, 999);

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      // Set start date to beginning of that day
      startDate.setHours(0, 0, 0, 0);

      // Use the efficient aggregate query to get counts by date and status
      const counts = await this.reportProvider.getReportCountsByDateAndStatus(
        startDate.toISOString(),
        endDate.toISOString()
      );

      this.log(`Got ${String(counts.length)} date/status combinations from report provider`);

      // Convert counts to RunHistoryData format
      const history = this.convertCountsToHistory(counts, startDate, endDate);

      return history;
    } catch (error) {
      this.logError("Failed to get aggregated run history", error);
      throw error;
    }
  }

  /**
   * Convert report counts by date/status to RunHistoryData format
   *
   * @param counts - Array of counts from PuppetDB
   * @param startDate - Start date of the range
   * @param endDate - End date of the range
   * @returns Array of run history data with all days filled in
   */
  private convertCountsToHistory(
    counts: { date: string; status: string; count: number }[],
    startDate: Date,
    endDate: Date
  ): RunHistoryData[] {
    // Pre-populate all days with zero counts
    const dateMap = new Map<string, RunHistoryData>();
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const dateKey = currentDate.toISOString().split("T")[0];
      dateMap.set(dateKey, {
        date: dateKey,
        success: 0,
        failed: 0,
        changed: 0,
        unchanged: 0,
      });
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Fill in the counts from PuppetDB
    for (const { date, status, count } of counts) {
      const entry = dateMap.get(date);
      if (!entry) continue;

      switch (status) {
        case "failed":
          entry.failed += count;
          break;
        case "changed":
          entry.changed += count;
          break;
        case "unchanged":
          entry.unchanged += count;
          entry.success += count; // unchanged is considered success
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
   * Log a message
   *
   * Uses counts for totalRuns and successRate, and recent reports for avgDuration and lastRun.
   *
   * @param counts - Array of counts from PuppetDB aggregate query
   * @param recentReports - Array of recent reports for duration/lastRun calculation
   * @returns Summary statistics
   */
  private calculateSummaryFromCounts(
    counts: { date: string; status: string; count: number }[],
    recentReports: Report[]
  ): NodeRunHistory["summary"] {
    // Calculate totals from counts
    let totalRuns = 0;
    let successfulRuns = 0;

    for (const { status, count } of counts) {
      totalRuns += count;
      if (status === "unchanged" || status === "changed") {
        successfulRuns += count;
      }
    }

    if (totalRuns === 0) {
      return {
        totalRuns: 0,
        successRate: 0,
        avgDuration: 0,
        lastRun: new Date().toISOString(),
      };
    }

    // Calculate success rate from counts
    const successRate = (successfulRuns / totalRuns) * 100;

    // Calculate average duration from recent reports (if available)
    let avgDuration = 0;
    if (recentReports.length > 0) {
      const totalDuration = recentReports.reduce((sum, report) => {
        const startTime = new Date(report.start_time).getTime();
        const endTime = new Date(report.end_time).getTime();
        const duration = (endTime - startTime) / 1000; // convert to seconds
        return sum + duration;
      }, 0);
      avgDuration = totalDuration / recentReports.length;
    }

    // Get last run timestamp from recent reports
    let lastRun = new Date().toISOString();
    if (recentReports.length > 0) {
      const sortedReports = [...recentReports].sort((a, b) => {
        return (
          new Date(b.producer_timestamp).getTime() -
          new Date(a.producer_timestamp).getTime()
        );
      });
      lastRun = sortedReports[0].producer_timestamp;
    }

    return {
      totalRuns,
      successRate: Math.round(successRate * 100) / 100,
      avgDuration: Math.round(avgDuration * 100) / 100,
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
