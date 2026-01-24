<script lang="ts">
/**
 * Puppet Run Chart Component
 *
 * Displays a bar chart visualization of puppet run history.
 * Uses integration colors for status categories and provides tooltips on hover.
 */

import { integrationColors } from '../lib/integrationColors.svelte';

interface RunHistoryData {
  date: string; // ISO date string (YYYY-MM-DD)
  success: number; // count of successful runs (unchanged status)
  failed: number; // count of failed runs
  changed: number; // count of runs with changes
  unchanged: number; // count of unchanged runs (same as success)
}

interface Props {
  data: RunHistoryData[];
  height?: number;
  title?: string;
}

let { data, height = 300, title = 'Puppet Run History' }: Props = $props();

// Load integration colors
$effect(() => {
  void integrationColors.loadColors();
});

// Get colors for status categories
const colors = $derived({
  success: '#10B981', // Green for success/unchanged
  failed: '#EF4444', // Red for failed
  changed: '#F59E0B', // Amber for changed
  unchanged: '#10B981', // Green for unchanged (same as success)
});

// Calculate chart dimensions
const margin = { top: 40, right: 20, bottom: 60, left: 50 };
const chartWidth = $derived(800 - margin.left - margin.right);
const chartHeight = $derived(height - margin.top - margin.bottom);

// Calculate max value for y-axis scaling
const maxValue = $derived(
  Math.max(
    ...data.map((d) => d.success + d.failed + d.changed),
    1 // Minimum of 1 to avoid division by zero
  )
);

// Calculate bar width based on number of data points
const barWidth = $derived(
  data.length > 0 ? Math.min(60, chartWidth / data.length - 10) : 60
);

// Calculate bar spacing
const barSpacing = $derived(chartWidth / Math.max(data.length, 1));

// Format date for display
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Calculate bar heights
function getBarHeight(value: number): number {
  return (value / maxValue) * chartHeight;
}

// Calculate y position for stacked bars
function getYPosition(index: number, segment: 'failed' | 'changed' | 'success'): number {
  const d = data[index];
  let offset = 0;

  if (segment === 'success') {
    offset = 0;
  } else if (segment === 'changed') {
    offset = d.success;
  } else if (segment === 'failed') {
    offset = d.success + d.changed;
  }

  return chartHeight - getBarHeight(offset + (segment === 'failed' ? d.failed : segment === 'changed' ? d.changed : d.success));
}

// Tooltip state
let tooltipVisible = $state(false);
let tooltipX = $state(0);
let tooltipY = $state(0);
let tooltipData = $state<RunHistoryData | null>(null);

function showTooltip(event: MouseEvent, d: RunHistoryData) {
  tooltipVisible = true;
  tooltipX = event.clientX;
  tooltipY = event.clientY;
  tooltipData = d;
}

function hideTooltip() {
  tooltipVisible = false;
  tooltipData = null;
}
</script>

<div class="puppet-run-chart">
  <h3 class="text-lg font-semibold mb-4">{title}</h3>

  {#if data.length === 0}
    <div class="flex items-center justify-center h-64 bg-gray-50 rounded-lg border border-gray-200">
      <p class="text-gray-500">No run history data available</p>
    </div>
  {:else}
    <div class="chart-container relative">
      <svg
        width="100%"
        height={height}
        viewBox="0 0 800 {height}"
        preserveAspectRatio="xMidYMid meet"
        class="w-full"
      >
        <!-- Chart title and legend -->
        <g transform="translate({margin.left}, 20)">
          <g class="legend" transform="translate({chartWidth - 200}, 0)">
            <rect x="0" y="0" width="15" height="15" fill={colors.success} />
            <text x="20" y="12" class="text-xs fill-gray-700">Success</text>

            <rect x="80" y="0" width="15" height="15" fill={colors.changed} />
            <text x="100" y="12" class="text-xs fill-gray-700">Changed</text>

            <rect x="170" y="0" width="15" height="15" fill={colors.failed} />
            <text x="190" y="12" class="text-xs fill-gray-700">Failed</text>
          </g>
        </g>

        <!-- Chart area -->
        <g transform="translate({margin.left}, {margin.top})">
          <!-- Y-axis -->
          <line
            x1="0"
            y1="0"
            x2="0"
            y2={chartHeight}
            stroke="#E5E7EB"
            stroke-width="2"
          />

          <!-- Y-axis labels -->
          {#each [0, 0.25, 0.5, 0.75, 1] as tick}
            <g transform="translate(0, {chartHeight - tick * chartHeight})">
              <line x1="-5" y1="0" x2="0" y2="0" stroke="#9CA3AF" stroke-width="1" />
              <text x="-10" y="5" text-anchor="end" class="text-xs fill-gray-600">
                {Math.round(tick * maxValue)}
              </text>
              <line
                x1="0"
                y1="0"
                x2={chartWidth}
                y2="0"
                stroke="#F3F4F6"
                stroke-width="1"
                stroke-dasharray="4"
              />
            </g>
          {/each}

          <!-- X-axis -->
          <line
            x1="0"
            y1={chartHeight}
            x2={chartWidth}
            y2={chartHeight}
            stroke="#E5E7EB"
            stroke-width="2"
          />

          <!-- Bars -->
          {#each data as d, i}
            {@const x = i * barSpacing + (barSpacing - barWidth) / 2}
            {@const total = d.success + d.changed + d.failed}

            <!-- Bar group for hover -->
            <g
              role="button"
              tabindex="0"
              class="bar-group cursor-pointer"
              onmouseenter={(e) => showTooltip(e, d)}
              onmouseleave={hideTooltip}
            >
              <!-- Success segment -->
              {#if d.success > 0}
                <rect
                  x={x}
                  y={getYPosition(i, 'success')}
                  width={barWidth}
                  height={getBarHeight(d.success)}
                  fill={colors.success}
                  class="transition-opacity hover:opacity-80"
                />
              {/if}

              <!-- Changed segment -->
              {#if d.changed > 0}
                <rect
                  x={x}
                  y={getYPosition(i, 'changed')}
                  width={barWidth}
                  height={getBarHeight(d.changed)}
                  fill={colors.changed}
                  class="transition-opacity hover:opacity-80"
                />
              {/if}

              <!-- Failed segment -->
              {#if d.failed > 0}
                <rect
                  x={x}
                  y={getYPosition(i, 'failed')}
                  width={barWidth}
                  height={getBarHeight(d.failed)}
                  fill={colors.failed}
                  class="transition-opacity hover:opacity-80"
                />
              {/if}

              <!-- Invisible overlay for better hover detection -->
              <rect
                x={x}
                y="0"
                width={barWidth}
                height={chartHeight}
                fill="transparent"
              />
            </g>

            <!-- X-axis label -->
            <text
              x={x + barWidth / 2}
              y={chartHeight + 20}
              text-anchor="middle"
              class="text-xs fill-gray-600"
              transform="rotate(-45, {x + barWidth / 2}, {chartHeight + 20})"
            >
              {formatDate(d.date)}
            </text>
          {/each}
        </g>
      </svg>

      <!-- Tooltip -->
      {#if tooltipVisible && tooltipData}
        <div
          class="tooltip fixed z-50 bg-gray-900 text-white px-3 py-2 rounded shadow-lg text-sm pointer-events-none"
          style="left: {tooltipX + 10}px; top: {tooltipY + 10}px;"
        >
          <div class="font-semibold mb-1">{formatDate(tooltipData.date)}</div>
          <div class="space-y-1">
            <div class="flex items-center gap-2">
              <div class="w-3 h-3 rounded" style="background-color: {colors.success}"></div>
              <span>Success: {tooltipData.success}</span>
            </div>
            <div class="flex items-center gap-2">
              <div class="w-3 h-3 rounded" style="background-color: {colors.changed}"></div>
              <span>Changed: {tooltipData.changed}</span>
            </div>
            <div class="flex items-center gap-2">
              <div class="w-3 h-3 rounded" style="background-color: {colors.failed}"></div>
              <span>Failed: {tooltipData.failed}</span>
            </div>
            <div class="border-t border-gray-700 pt-1 mt-1">
              <span class="font-semibold">Total: {tooltipData.success + tooltipData.changed + tooltipData.failed}</span>
            </div>
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .puppet-run-chart {
    width: 100%;
  }

  .chart-container {
    width: 100%;
    overflow-x: auto;
  }

  .bar-group:hover rect {
    filter: brightness(1.1);
  }

  .tooltip {
    max-width: 250px;
  }
</style>
