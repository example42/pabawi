<script lang="ts">
  /**
   * Ansible Command Executor Component
   * Allows users to execute ad-hoc commands via Ansible
   */

  let command = "";
  let selectedTargets: string[] = [];
  let executing = false;
  let output = "";

  async function executeCommand() {
    if (!command || selectedTargets.length === 0) {
      return;
    }

    executing = true;
    output = "";
    try {
      // API call would go here
      console.log("Executing command:", {
        command,
        targets: selectedTargets,
      });
      output = "Command execution started...";
    } catch (error) {
      console.error("Failed to execute command:", error);
      output = `Error: ${error}`;
    } finally {
      executing = false;
    }
  }
</script>

<div class="command-executor">
  <h3>Execute Command</h3>

  <div class="form-group">
    <label for="command">Command</label>
    <input
      id="command"
      type="text"
      bind:value={command}
      placeholder="Enter shell command..."
      disabled={executing}
    />
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

  <button
    class="execute-btn"
    on:click={executeCommand}
    disabled={executing || !command || selectedTargets.length === 0}
  >
    {executing ? "Executing..." : "Execute Command"}
  </button>

  {#if output}
    <div class="output">
      <h4>Output</h4>
      <pre>{output}</pre>
    </div>
  {/if}
</div>

<style>
  .command-executor {
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

  input {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    font-size: 0.875rem;
  }

  input:focus {
    outline: none;
    border-color: #2563eb;
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

  .output {
    margin-top: 1.5rem;
    padding: 1rem;
    background: #f9fafb;
    border-radius: 0.375rem;
  }

  .output h4 {
    font-size: 1rem;
    font-weight: 600;
    margin-bottom: 0.5rem;
  }

  .output pre {
    font-family: monospace;
    font-size: 0.875rem;
    white-space: pre-wrap;
    word-wrap: break-word;
  }
</style>
