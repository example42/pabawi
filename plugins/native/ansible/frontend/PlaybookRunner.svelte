<script lang="ts">
  /**
   * Ansible Playbook Runner Component
   * Allows users to select and execute Ansible playbooks
   */

  let selectedPlaybook = "";
  let selectedTargets: string[] = [];
  let parameters: Record<string, string> = {};
  let executing = false;

  async function executePlaybook() {
    if (!selectedPlaybook || selectedTargets.length === 0) {
      return;
    }

    executing = true;
    try {
      // API call would go here
      console.log("Executing playbook:", {
        playbook: selectedPlaybook,
        targets: selectedTargets,
        parameters,
      });
    } catch (error) {
      console.error("Failed to execute playbook:", error);
    } finally {
      executing = false;
    }
  }
</script>

<div class="playbook-runner">
  <h3>Run Ansible Playbook</h3>

  <div class="form-group">
    <label for="playbook">Playbook</label>
    <select id="playbook" bind:value={selectedPlaybook} disabled={executing}>
      <option value="">Select a playbook...</option>
      <!-- Playbook options would be loaded dynamically -->
    </select>
  </div>

  <div class="form-group">
    <label for="targets">Target Nodes</label>
    <input
      id="targets"
      type="text"
      placeholder="Enter node names or groups"
      disabled={executing}
    />
  </div>

  <div class="form-group">
    <label>Extra Variables (optional)</label>
    <textarea
      placeholder='{"key": "value"}'
      rows="4"
      disabled={executing}
    ></textarea>
  </div>

  <button
    class="execute-btn"
    on:click={executePlaybook}
    disabled={executing || !selectedPlaybook || selectedTargets.length === 0}
  >
    {executing ? "Executing..." : "Execute Playbook"}
  </button>
</div>

<style>
  .playbook-runner {
    padding: 1.5rem;
    background: white;
    border-radius: 0.5rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  h3 {
    font-size: 1.25rem;
    font-weight: 600;
    margin-bottom: 1.5rem;
  }

  .form-group {
    margin-bottom: 1.5rem;
  }

  label {
    display: block;
    font-weight: 500;
    margin-bottom: 0.5rem;
    color: #374151;
  }

  select,
  input,
  textarea {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    font-size: 0.875rem;
  }

  select:focus,
  input:focus,
  textarea:focus {
    outline: none;
    border-color: #2563eb;
    ring: 2px;
    ring-color: #2563eb;
  }

  .execute-btn {
    width: 100%;
    padding: 0.75rem;
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
