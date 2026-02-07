<!--
  Widget Slot Component

  Renders widgets in designated slots with support for different layouts.
  Features:
  - Grid, stack, and tabs layouts
  - Lazy loading of widget components
  - Permission-based widget filtering
  - Error boundaries for individual widgets
  - Loading states with skeletons
  - Responsive grid layouts

  @module lib/plugins/WidgetSlot
  @version 1.0.0
-->
<script lang="ts">
  import { onMount } from "svelte";
  import type { Component } from "svelte";
  import type { LoadedWidget, WidgetSlot as WidgetSlotType, WidgetSize } from "./types";
  import { getWidgetRegistry } from "./WidgetRegistry.svelte";
  import { getPluginLoader } from "./PluginLoader";
  import { logger } from "../logger.svelte";
  import LoadingSpinner from "../../components/LoadingSpinner.svelte";

  // ==========================================================================
  // Types
  // ==========================================================================

  /**
   * Layout mode for widget rendering
   */
  type LayoutMode = "grid" | "stack" | "tabs";

  /**
   * Widget render state
   */
  interface WidgetRenderState {
    widget: LoadedWidget;
    component: Component | null;
    loading: boolean;
    error: string | null;
  }

  // ==========================================================================
  // Props
  // ==========================================================================

  interface Props {
    /** Slot identifier for widget filtering */
    slot: WidgetSlotType;
    /** Layout mode: grid, stack, or tabs */
    layout?: LayoutMode;
    /** User capabilities for permission filtering */
    userCapabilities?: string[];
    /** Number of grid columns (for grid layout) */
    columns?: 1 | 2 | 3 | 4;
    /** Gap between widgets (tailwind spacing) */
    gap?: "2" | "4" | "6" | "8";
    /** Show empty state when no widgets */
    showEmptyState?: boolean;
    /** Custom empty state message */
    emptyMessage?: string;
    /** Enable debug mode */
    debug?: boolean;
    /** Additional CSS classes */
    class?: string;
  }

  let {
    slot,
    layout = "grid",
    userCapabilities = [],
    columns = 2,
    gap = "4",
    showEmptyState = true,
    emptyMessage = "No widgets available for this section",
    debug = false,
    class: className = "",
  }: Props = $props();

  // ==========================================================================
  // State
  // ==========================================================================

  const registry = getWidgetRegistry();
  const loader = getPluginLoader();

  // Track widget render states
  let widgetStates = $state<Map<string, WidgetRenderState>>(new Map());

  // Track active tab (for tabs layout)
  let activeTabId = $state<string | null>(null);

  // Registry version counter to trigger reactivity when widgets change
  let registryVersion = $state(0);
  let registryUpdateTimer: ReturnType<typeof setTimeout> | null = null;

  // Subscribe to registry events to trigger re-renders (debounced)
  onMount(() => {
    const unsubscribe = registry.subscribe((event) => {
      // Debounce registry updates to prevent excessive re-renders
      if (
        event.type === "widget:registered" ||
        event.type === "widget:unregistered" ||
        event.type === "widget:updated" ||
        event.type === "registry:refreshed" ||
        event.type === "registry:cleared"
      ) {
        // Clear existing timer
        if (registryUpdateTimer) {
          clearTimeout(registryUpdateTimer);
        }

        // Set new timer to batch updates
        registryUpdateTimer = setTimeout(() => {
          registryVersion++;
          registryUpdateTimer = null;
          if (debug) {
            log("debug", `Registry event: ${event.type}, triggering re-render (debounced)`);
          }
        }, 100); // 100ms debounce
      }
    });

    return () => {
      if (registryUpdateTimer) {
        clearTimeout(registryUpdateTimer);
      }
      unsubscribe();
    };
  });

  // ==========================================================================
  // Derived State
  // ==========================================================================

  // Get widgets for this slot with permission filtering
  // The registryVersion dependency ensures re-calculation when registry changes
  let widgets = $derived.by(() => {
    // Access registryVersion to establish reactive dependency
    void registryVersion;
    const slotWidgets = registry.getWidgetsForSlot(slot, userCapabilities);
    console.log(`[WidgetSlot] Slot '${slot}' query result: ${slotWidgets.length} widgets`,
      slotWidgets.map(w => w.id));
    console.log(`[WidgetSlot] Registry widget count: ${registry.widgetCount}`);
    console.log(`[WidgetSlot] User capabilities:`, userCapabilities);
    if (debug) {
      log("debug", `Found ${slotWidgets.length} widgets for slot: ${slot}`);
    }
    return slotWidgets;
  });

  // Set default active tab when widgets change
  $effect(() => {
    if (layout === "tabs" && widgets.length > 0 && !activeTabId) {
      activeTabId = widgets[0].id;
    }
  });

  // Load widget components when widgets change
  // Track which widgets we've already started loading to prevent duplicates
  let loadedWidgetIds = $state(new Set<string>());

  $effect(() => {
    const currentWidgets = widgets;
    for (const widget of currentWidgets) {
      // Skip if we've already started loading this widget
      if (loadedWidgetIds.has(widget.id)) {
        continue;
      }

      // Only load if not already loaded or loading
      const existing = widgetStates.get(widget.id);
      if (!existing?.component && !existing?.loading) {
        loadedWidgetIds.add(widget.id);
        loadedWidgetIds = new Set(loadedWidgetIds); // Trigger reactivity
        loadWidgetComponent(widget);
      }
    }
  });

  // ==========================================================================
  // Widget Loading
  // ==========================================================================

  /**
   * Load a widget's component lazily
   */
  async function loadWidgetComponent(widget: LoadedWidget): Promise<void> {
    // Skip if already loaded or loading
    const existing = widgetStates.get(widget.id);
    if (existing?.component || existing?.loading) {
      if (debug) {
        log("debug", `Skipping load for ${widget.id} - already ${existing.component ? 'loaded' : 'loading'}`);
      }
      return;
    }

    if (debug) {
      log("debug", `Starting load for widget: ${widget.id}`);
    }

    // Set loading state
    widgetStates.set(widget.id, {
      widget,
      component: null,
      loading: true,
      error: null,
    });
    widgetStates = new Map(widgetStates); // Trigger reactivity

    try {
      // Check if already loaded in registry
      if (widget.componentRef) {
        widgetStates.set(widget.id, {
          widget,
          component: widget.componentRef,
          loading: false,
          error: null,
        });
        widgetStates = new Map(widgetStates);
        if (debug) {
          log("debug", `Used cached component for widget: ${widget.id}`);
        }
        return;
      }

      // Load via plugin loader
      const component = await loader.loadWidgetComponent(widget.id);

      if (component) {
        widgetStates.set(widget.id, {
          widget,
          component,
          loading: false,
          error: null,
        });
        log("debug", `Loaded component for widget: ${widget.id}`);
      } else {
        widgetStates.set(widget.id, {
          widget,
          component: null,
          loading: false,
          error: "Failed to load widget component",
        });
        log("warn", `Failed to load component for widget: ${widget.id}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      widgetStates.set(widget.id, {
        widget,
        component: null,
        loading: false,
        error: errorMessage,
      });
      log("error", `Error loading widget: ${widget.id}`, { error: errorMessage });
    }

    widgetStates = new Map(widgetStates); // Trigger reactivity
  }

  /**
   * Retry loading a failed widget
   */
  function retryLoad(widgetId: string): void {
    const state = widgetStates.get(widgetId);
    if (state?.widget) {
      widgetStates.delete(widgetId);
      widgetStates = new Map(widgetStates);
      loadWidgetComponent(state.widget);
    }
  }

  // ==========================================================================
  // Layout Helpers
  // ==========================================================================

  /**
   * Get CSS classes for widget size in grid layout
   */
  function getWidgetSizeClasses(size: WidgetSize): string {
    switch (size) {
      case "small":
        return "col-span-1";
      case "medium":
        return "col-span-1 md:col-span-1";
      case "large":
        return "col-span-1 md:col-span-2";
      case "full":
        return "col-span-full";
      default:
        return "col-span-1";
    }
  }

  /**
   * Get grid columns CSS class
   */
  function getGridColumnsClass(): string {
    switch (columns) {
      case 1:
        return "grid-cols-1";
      case 2:
        return "grid-cols-1 md:grid-cols-2";
      case 3:
        return "grid-cols-1 md:grid-cols-2 lg:grid-cols-3";
      case 4:
        return "grid-cols-1 md:grid-cols-2 lg:grid-cols-4";
      default:
        return "grid-cols-1 md:grid-cols-2";
    }
  }

  /**
   * Switch active tab
   */
  function setActiveTab(widgetId: string): void {
    activeTabId = widgetId;
  }

  // ==========================================================================
  // Logging
  // ==========================================================================

  function log(
    level: "debug" | "info" | "warn" | "error",
    message: string,
    data?: Record<string, unknown>
  ): void {
    if (!debug && level === "debug") return;

    const component = "WidgetSlot";
    const operation = slot;
    switch (level) {
      case "debug":
        logger.debug(component, operation, message, data);
        break;
      case "info":
        logger.info(component, operation, message, data);
        break;
      case "warn":
        logger.warn(component, operation, message, data);
        break;
      case "error":
        logger.error(component, operation, message, undefined, data);
        break;
    }
  }
</script>

<!-- ========================================================================== -->
<!-- Template -->
<!-- ========================================================================== -->

{#if widgets.length === 0}
  <!-- Empty State -->
  {#if showEmptyState}
    <div
      class="flex flex-col items-center justify-center p-8 text-center text-gray-500 dark:text-gray-400 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg {className}"
    >
      <svg
        class="w-12 h-12 mb-3 text-gray-400 dark:text-gray-500"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
        />
      </svg>
      <p class="text-sm">{emptyMessage}</p>
    </div>
  {/if}
{:else if layout === "grid"}
  <!-- Grid Layout -->
  <div class="grid {getGridColumnsClass()} gap-{gap} {className}">
    {#each widgets as widget (widget.id)}
      {@const state = widgetStates.get(widget.id)}
      <div class="{getWidgetSizeClasses(widget.size)} min-h-[100px]">
        <!-- Widget Container -->
        <div
          class="h-full bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden"
        >
          <!-- Widget Header -->
          <div
            class="flex items-center justify-between px-4 py-2 bg-gray-50 dark:bg-gray-750 border-b border-gray-200 dark:border-gray-700"
          >
            <div class="flex items-center gap-2">
              {#if widget.icon}
                <span class="text-gray-500 dark:text-gray-400">{widget.icon}</span>
              {/if}
              <h3 class="text-sm font-medium text-gray-700 dark:text-gray-200">
                {widget.name}
              </h3>
            </div>
            {#if debug}
              <span
                class="text-xs text-gray-400 dark:text-gray-500 font-mono"
              >
                {widget.id}
              </span>
            {/if}
          </div>

          <!-- Widget Content -->
          <div class="p-4">
            {#if state?.loading}
              <!-- Loading State -->
              <div class="flex items-center justify-center py-8">
                <LoadingSpinner size="md" message="Loading widget..." />
              </div>
            {:else if state?.error}
              <!-- Error State -->
              <div
                class="flex flex-col items-center justify-center py-6 text-center"
              >
                <svg
                  class="w-10 h-10 text-red-400 mb-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <p class="text-sm text-red-600 dark:text-red-400 mb-2">
                  {state.error}
                </p>
                <button
                  type="button"
                  class="text-xs text-primary-600 dark:text-primary-400 hover:underline"
                  onclick={() => retryLoad(widget.id)}
                >
                  Try again
                </button>
              </div>
            {:else if state?.component}
              <!-- Render Widget Component -->
              {@const WidgetComponent = state.component}
              <WidgetComponent {widget} />
            {:else}
              <!-- Pending State -->
              <div class="animate-pulse">
                <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2"></div>
                <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
              </div>
            {/if}
          </div>
        </div>
      </div>
    {/each}
  </div>
{:else if layout === "stack"}
  <!-- Stack Layout -->
  <div class="flex flex-col gap-{gap} {className}">
    {#each widgets as widget (widget.id)}
      {@const state = widgetStates.get(widget.id)}
      <div
        class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden"
      >
        <!-- Widget Header -->
        <div
          class="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-750 border-b border-gray-200 dark:border-gray-700"
        >
          <div class="flex items-center gap-2">
            {#if widget.icon}
              <span class="text-gray-500 dark:text-gray-400">{widget.icon}</span>
            {/if}
            <h3 class="text-sm font-medium text-gray-700 dark:text-gray-200">
              {widget.name}
            </h3>
          </div>
          {#if debug}
            <span class="text-xs text-gray-400 dark:text-gray-500 font-mono">
              {widget.id}
            </span>
          {/if}
        </div>

        <!-- Widget Content -->
        <div class="p-4">
          {#if state?.loading}
            <div class="flex items-center justify-center py-8">
              <LoadingSpinner size="md" message="Loading widget..." />
            </div>
          {:else if state?.error}
            <div class="flex flex-col items-center justify-center py-6 text-center">
              <svg
                class="w-10 h-10 text-red-400 mb-2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <p class="text-sm text-red-600 dark:text-red-400 mb-2">{state.error}</p>
              <button
                type="button"
                class="text-xs text-primary-600 dark:text-primary-400 hover:underline"
                onclick={() => retryLoad(widget.id)}
              >
                Try again
              </button>
            </div>
          {:else if state?.component}
            {@const WidgetComponent = state.component}
            <WidgetComponent {widget} />
          {:else}
            <div class="animate-pulse">
              <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2"></div>
              <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
            </div>
          {/if}
        </div>
      </div>
    {/each}
  </div>
{:else if layout === "tabs"}
  <!-- Tabs Layout -->
  <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden {className}">
    <!-- Tab Headers -->
    <div
      class="flex border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-750 overflow-x-auto"
    >
      {#each widgets as widget (widget.id)}
        <button
          type="button"
          class="flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors
            {activeTabId === widget.id
              ? 'text-primary-600 dark:text-primary-400 border-b-2 border-primary-600 dark:border-primary-400 bg-white dark:bg-gray-800 -mb-px'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}"
          onclick={() => setActiveTab(widget.id)}
        >
          {#if widget.icon}
            <span>{widget.icon}</span>
          {/if}
          {widget.name}
        </button>
      {/each}
    </div>

    <!-- Tab Content -->
    <div class="p-4">
      {#each widgets as widget (widget.id)}
        {@const state = widgetStates.get(widget.id)}
        {#if activeTabId === widget.id}
          {#if state?.loading}
            <div class="flex items-center justify-center py-12">
              <LoadingSpinner size="lg" message="Loading widget..." />
            </div>
          {:else if state?.error}
            <div class="flex flex-col items-center justify-center py-12 text-center">
              <svg
                class="w-12 h-12 text-red-400 mb-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <p class="text-sm text-red-600 dark:text-red-400 mb-3">{state.error}</p>
              <button
                type="button"
                class="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                onclick={() => retryLoad(widget.id)}
              >
                Try again
              </button>
            </div>
          {:else if state?.component}
            {@const WidgetComponent = state.component}
            <WidgetComponent {widget} />
          {:else}
            <div class="animate-pulse py-8">
              <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-3"></div>
              <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mb-3"></div>
              <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3"></div>
            </div>
          {/if}
        {/if}
      {/each}
    </div>
  </div>
{/if}

<!-- Debug Panel -->
{#if debug && widgets.length > 0}
  <div
    class="mt-4 p-3 bg-gray-100 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 text-xs font-mono"
  >
    <div class="text-gray-500 dark:text-gray-400 mb-2">
      <strong>Debug: WidgetSlot</strong> | Slot: {slot} | Layout: {layout} | Widgets: {widgets.length}
    </div>
    <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
      {#each widgets as widget}
        {@const state = widgetStates.get(widget.id)}
        <div class="p-2 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
          <div class="font-medium text-gray-700 dark:text-gray-300 truncate">{widget.id}</div>
          <div class="text-gray-500 dark:text-gray-400">
            State: {state?.loading ? "loading" : state?.error ? "error" : state?.component ? "loaded" : "pending"}
          </div>
          <div class="text-gray-500 dark:text-gray-400">Size: {widget.size}</div>
        </div>
      {/each}
    </div>
  </div>
{/if}
