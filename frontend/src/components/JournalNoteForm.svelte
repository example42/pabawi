<script lang="ts">
  import { addJournalNote } from '../lib/api';
  import { showError, showSuccess } from '../lib/toast.svelte';

  interface Props {
    nodeId: string;
    onNoteAdded?: () => void;
  }

  let { nodeId, onNoteAdded }: Props = $props();

  let content = $state('');
  let submitting = $state(false);

  async function handleSubmit(event: Event): Promise<void> {
    event.preventDefault();
    const trimmed = content.trim();
    if (!trimmed) return;

    submitting = true;
    try {
      await addJournalNote(nodeId, trimmed);
      showSuccess('Note added to journal');
      content = '';
      onNoteAdded?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to add note';
      showError('Failed to add note', msg);
    } finally {
      submitting = false;
    }
  }
</script>

<form class="flex gap-2" onsubmit={handleSubmit}>
  <textarea
    class="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400 dark:focus:border-primary-400 dark:focus:ring-primary-400 resize-none"
    rows="2"
    placeholder="Add a note to this node's journal..."
    bind:value={content}
    disabled={submitting}
    maxlength="5000"
  ></textarea>
  <button
    type="submit"
    class="self-end rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-primary-500 dark:hover:bg-primary-600"
    disabled={submitting || !content.trim()}
  >
    {#if submitting}
      Adding...
    {:else}
      Add Note
    {/if}
  </button>
</form>
