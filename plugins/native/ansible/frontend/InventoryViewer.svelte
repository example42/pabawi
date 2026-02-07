<script lang="ts">
  /**
   * Ansible Inventory Viewer Component
   * Displays nodes from Ansible inventory
   */

  let nodes: any[] = [];
  let loading = false;
  let selectedGroup = "all";

  async function loadInventory() {
    loading = true;
    try {
      // API call would go here
      console.log("Loading inventory for group:", selectedGroup);
      nodes = [];
    } catch (error) {
      console.error("Failed to load inventory:", error);
    } finally {
      loading = false;
    }
  }

  $: if (selectedGroup) {
    loadInventory();
  }
</script>

<div class="inventory-viewer">
  <div class="header">
    <h3>Ansible Inventory</h3>
    <div class="controls">
      <select bind:value={selectedGroup}>
        <option value="all">All Nodes</option>
        <!-- Group options would be loaded dynamically -->
      </select>
      <button on:click={loadInventory} disabled={loading}>
        {loading ? "Loading..." : "Refresh"}
      </button>
    </div>
  </div>

  {#if loading}
    <div class="loading">Loading inventory...</div>
  {:else if nodes.length === 0}
    <div class="empty">No nodes found in inventory</div>
  {:else}
    <div class="nodes-grid">
      {#each nodes as node}
        <div class="node-card">
          <div class="node-name">{node.name}</div>
          <div class="node-info">
            {#if node.groups && node.groups.length > 0}
              <div class="groups">
                {#each node.groups as group}
                  <span class="group-badge">{group}</span>
                {/each}
              </div>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .inventory-viewer {
    padding: 1.5rem;
    background: white;
    border-radius: 0.5rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
  }

  h3 {
    font-size: 1.25rem;
    font-weight: 600;
  }

  .controls {
    display: flex;
    gap: 0.5rem;
  }

  select,
  button {
    padding: 0.5rem 1rem;
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    cursor: pointer;
  }

  button {
    background: #2563eb;
    color: white;
    border-color: #2563eb;
  }

  button:hover:not(:disabled) {
    background: #1d4ed8;
  }

  button:disabled {
    background: #9ca3af;
    cursor: not-allowed;
  }

  .loading,
  .empty {
    padding: 2rem;
    text-align: center;
    color: #6b7280;
  }

  .nodes-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 1rem;
  }

  .node-card {
    padding: 1rem;
    border: 1px solid #e5e7eb;
    border-radius: 0.375rem;
    transition: box-shadow 0.2s;
  }

  .node-card:hover {
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  }

  .node-name {
    font-weight: 600;
    margin-bottom: 0.5rem;
  }

  .groups {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }

  .group-badge {
    padding: 0.125rem 0.5rem;
    background: #dbeafe;
    color: #1e40af;
    border-radius: 0.25rem;
    font-size: 0.75rem;
  }
</style>
