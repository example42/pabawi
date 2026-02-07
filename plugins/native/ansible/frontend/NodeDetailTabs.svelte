<script lang="ts">
  /**
   * Ansible Node Detail Tabs Component
   * Provides node-specific Ansible actions
   */

  export let nodeId: string;

  let activeTab = "command";
  let command = "";
  let selectedPlaybook = "";
  let executing = false;

  const tabs = [
    { id: "command", label: "Execute Command" },
    { id: "playbook", label: "Run Playbook" },
    { id: "facts", label: "Facts" },
  ];

  async function executeCommand() {
    if (!command) return;

    executing = true;
    try {
      console.log("Executing command on node:", nodeId, command);
    } catch (error) {
      console.error("Failed to execute command:", error);
    } finally {
      executing = false;
    }
  }

  async function executePlaybook() {
    if (!selectedPlaybook) return;

    executing = true;
    try {
      console.log("Executing playbook on node:", nodeId, selectedPlaybook);
    } catch (error) {
      console.error("Failed to execute playbook:", error);
    } finally {
      executing = false;
    }
  }
</script>

<div class="node-detail-tabs">
  <div class="tabs">
    {#each tabs as tab}
      <button
        class="tab"
        class:active={activeTab === tab.id}
        on:click={() => (activeTab = tab.id)}
      >
        {tab.label}
      </button>
    {/each}
  </div>

  <div class="tab-content">
    {#if activeTab === "command"}
      <div class="command-tab">
        <h4>Execute Command on {nodeId}</h4>
        <div class="form-group">
          <input
            type="text"
            bind:value={command}
            placeholder="Enter command..."
            disabled={executing}
          />
        </div>
        <button
          class="execute-btn"
          on:click={executeCommand}
          disabled={executing || !command}
        >
          {executing ? "Executing..." : "Execute"}
        </button>
      </div>
    {:else if activeTab === "playbook"}
      <div class="playbook-tab">
        <h4>Run Playbook on {nodeId}</h4>
        <div class="form-group">
          <select bind:value={selectedPlaybook} disabled={executing}>
            <option value="">Select playbook...</option>
            <!-- Playbook options would be loaded dynamically -->
          </select>
        </div>
        <button
          class="execute-btn"
          on:click={executePlaybook}
          disabled={executing || !selectedPlaybook}
        >
          {executing ? "Executing..." : "Execute"}
        </button>
      </div>
    {:else if activeTab === "facts"}
      <div class="facts-tab">
        <h4>Ansible Facts for {nodeId}</h4>
        <p>Facts would be displayed here</p>
      </div>
    {/if}
  </div>
</div>

<style>
  .node-detail-tabs {
    padding: 1rem;
  }

  .tabs {
    display: flex;
    gap: 0.5rem;
    border-bottom: 2px solid #e5e7eb;
    margin-bottom: 1.5rem;
  }

  .tab {
    padding: 0.5rem 1rem;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    cursor: pointer;
    font-size: 0.875rem;
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

  .tab-content h4 {
    font-size: 1rem;
    font-weight: 600;
    margin-bottom: 1rem;
  }

  .form-group {
    margin-bottom: 1rem;
  }

  input,
  select {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    font-size: 0.875rem;
  }

  .execute-btn {
    padding: 0.5rem 1rem;
    background: #2563eb;
    color: white;
    border: none;
    border-radius: 0.375rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s;
  }

  .execute-btn:hover:not(:disabled) {
    background: #1d4ed8;
  }

  .execute-btn:disabled {
    background: #9ca3af;
    cursor: not-allowed;
  }
</style>
