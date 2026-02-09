<script lang="ts">
  /**
   * Ansible Plugin Home Page
   * Provides overview and quick access to Ansible capabilities
   */

  let activeTab = $state("inventory");

  const tabs = [
    { id: "inventory", label: "Inventory" },
    { id: "playbooks", label: "Playbooks" },
    { id: "executions", label: "Executions" },
  ];
</script>

<div class="ansible-home">
  <div class="header">
    <h1>Ansible</h1>
    <p>Remote execution and inventory management with Ansible</p>
  </div>

  <div class="tabs">
    {#each tabs as tab}
      <button
        class="tab"
        class:active={activeTab === tab.id}
        onclick={() => (activeTab = tab.id)}
      >
        {tab.label}
      </button>
    {/each}
  </div>

  <div class="tab-content">
    {#if activeTab === "inventory"}
      <div class="inventory-tab">
        <h2>Inventory</h2>
        <p>View and manage nodes from Ansible inventory</p>
        <!-- Inventory viewer component would go here -->
      </div>
    {:else if activeTab === "playbooks"}
      <div class="playbooks-tab">
        <h2>Playbooks</h2>
        <p>Browse and execute Ansible playbooks</p>
        <!-- Playbook browser component would go here -->
      </div>
    {:else if activeTab === "executions"}
      <div class="executions-tab">
        <h2>Execution History</h2>
        <p>View past command and playbook executions</p>
        <!-- Execution history component would go here -->
      </div>
    {/if}
  </div>
</div>

<style>
  .ansible-home {
    padding: 2rem;
  }

  .header {
    margin-bottom: 2rem;
  }

  .header h1 {
    font-size: 2rem;
    font-weight: bold;
    margin-bottom: 0.5rem;
  }

  .header p {
    color: #666;
  }

  .tabs {
    display: flex;
    gap: 0.5rem;
    border-bottom: 2px solid #e5e7eb;
    margin-bottom: 2rem;
  }

  .tab {
    padding: 0.75rem 1.5rem;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    cursor: pointer;
    font-size: 1rem;
    color: #6b7280;
    transition: all 0.2s;
  }

  .tab:hover {
    color: #111827;
  }

  .tab.active {
    color: #2563eb;
    border-bottom-color: #2563eb;
  }

  .tab-content {
    padding: 1rem 0;
  }

  .tab-content h2 {
    font-size: 1.5rem;
    font-weight: 600;
    margin-bottom: 0.5rem;
  }

  .tab-content p {
    color: #6b7280;
  }
</style>
