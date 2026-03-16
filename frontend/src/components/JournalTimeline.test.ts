/**
 * Unit tests for JournalTimeline and JournalNoteForm components
 * Validates Requirements: 23.1, 23.3, 24.1
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import JournalTimeline from './JournalTimeline.svelte';
import JournalNoteForm from './JournalNoteForm.svelte';
import type { JournalEntry } from '../lib/api';

// Mock the API module
vi.mock('../lib/api', () => ({
  getJournalTimeline: vi.fn(),
  addJournalNote: vi.fn(),
  getErrorGuidance: vi.fn().mockReturnValue({ message: 'Error', guidance: 'Try again' }),
}));

// Mock the toast module
vi.mock('../lib/toast.svelte', () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
  showInfo: vi.fn(),
  showWarning: vi.fn(),
}));

import * as api from '../lib/api';
import * as toast from '../lib/toast.svelte';

const mockEntries: JournalEntry[] = [
  {
    id: 'entry-1',
    nodeId: 'node-1',
    nodeUri: 'bolt://node1.example.com',
    eventType: 'provision',
    source: 'proxmox',
    action: 'create_vm',
    summary: 'VM provisioned successfully',
    details: {},
    userId: 'user-1',
    timestamp: new Date().toISOString(),
    isLive: false,
  },
  {
    id: 'entry-2',
    nodeId: 'node-1',
    nodeUri: 'bolt://node1.example.com',
    eventType: 'puppet_run',
    source: 'puppetdb',
    action: 'puppet_run',
    summary: 'Puppet run completed with changes',
    details: {},
    userId: null,
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    isLive: true,
  },
  {
    id: 'entry-3',
    nodeId: 'node-1',
    nodeUri: 'bolt://node1.example.com',
    eventType: 'note',
    source: 'user',
    action: 'add_note',
    summary: 'Scheduled for maintenance window',
    details: {},
    userId: 'user-1',
    timestamp: new Date(Date.now() - 86400000).toISOString(),
    isLive: false,
  },
];

describe('JournalTimeline Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', () => {
    vi.mocked(api.getJournalTimeline).mockReturnValue(new Promise(() => {}));
    render(JournalTimeline, { props: { nodeId: 'node-1' } });
    expect(screen.getByText('Loading journal timeline...')).toBeTruthy();
  });

  it('renders timeline entries after loading', async () => {
    vi.mocked(api.getJournalTimeline).mockResolvedValue(mockEntries);
    render(JournalTimeline, { props: { nodeId: 'node-1' } });

    await waitFor(() => {
      expect(screen.getByText('VM provisioned successfully')).toBeTruthy();
      expect(screen.getByText('Puppet run completed with changes')).toBeTruthy();
      expect(screen.getByText('Scheduled for maintenance window')).toBeTruthy();
    });
  });

  it('displays isLive badge for live entries', async () => {
    vi.mocked(api.getJournalTimeline).mockResolvedValue(mockEntries);
    render(JournalTimeline, { props: { nodeId: 'node-1' } });

    await waitFor(() => {
      expect(screen.getByText('Live')).toBeTruthy();
    });
  });

  it('displays source badges', async () => {
    vi.mocked(api.getJournalTimeline).mockResolvedValue(mockEntries);
    render(JournalTimeline, { props: { nodeId: 'node-1' } });

    await waitFor(() => {
      expect(screen.getByText('Proxmox')).toBeTruthy();
      expect(screen.getByText('PuppetDB')).toBeTruthy();
      expect(screen.getByText('User')).toBeTruthy();
    });
  });

  it('displays event type labels', async () => {
    vi.mocked(api.getJournalTimeline).mockResolvedValue(mockEntries);
    render(JournalTimeline, { props: { nodeId: 'node-1' } });

    await waitFor(() => {
      expect(screen.getByText('Provisioned')).toBeTruthy();
      expect(screen.getByText('Puppet Run')).toBeTruthy();
      expect(screen.getByText('Note')).toBeTruthy();
    });
  });

  it('renders empty state when no entries', async () => {
    vi.mocked(api.getJournalTimeline).mockResolvedValue([]);
    render(JournalTimeline, { props: { nodeId: 'node-1' } });

    await waitFor(() => {
      expect(screen.getByText('No journal entries yet for this node.')).toBeTruthy();
    });
  });

  it('renders error state on API failure', async () => {
    vi.mocked(api.getJournalTimeline).mockRejectedValue(new Error('Network error'));
    render(JournalTimeline, { props: { nodeId: 'node-1' } });

    await waitFor(() => {
      expect(screen.getByText('Failed to load journal')).toBeTruthy();
    });
  });

  it('shows Load More button when page is full', async () => {
    // Return exactly PAGE_SIZE (20) entries to indicate more are available
    const fullPage = Array.from({ length: 20 }, (_, i) => ({
      ...mockEntries[0],
      id: `entry-${i}`,
      summary: `Entry ${i}`,
    }));
    vi.mocked(api.getJournalTimeline).mockResolvedValue(fullPage);
    render(JournalTimeline, { props: { nodeId: 'node-1' } });

    await waitFor(() => {
      expect(screen.getByText('Load More')).toBeTruthy();
    });
  });

  it('hides Load More when fewer than PAGE_SIZE entries returned', async () => {
    vi.mocked(api.getJournalTimeline).mockResolvedValue(mockEntries);
    render(JournalTimeline, { props: { nodeId: 'node-1' } });

    await waitFor(() => {
      expect(screen.getByText('VM provisioned successfully')).toBeTruthy();
    });
    expect(screen.queryByText('Load More')).toBeNull();
  });

  it('calls API with correct nodeId', async () => {
    vi.mocked(api.getJournalTimeline).mockResolvedValue([]);
    render(JournalTimeline, { props: { nodeId: 'test-node-42' } });

    await waitFor(() => {
      expect(api.getJournalTimeline).toHaveBeenCalledWith('test-node-42', {
        limit: 20,
        offset: 0,
      });
    });
  });
});

describe('JournalNoteForm Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders textarea and submit button', () => {
    render(JournalNoteForm, { props: { nodeId: 'node-1' } });
    expect(screen.getByPlaceholderText("Add a note to this node's journal...")).toBeTruthy();
    expect(screen.getByText('Add Note')).toBeTruthy();
  });

  it('disables submit button when textarea is empty', () => {
    render(JournalNoteForm, { props: { nodeId: 'node-1' } });
    const button = screen.getByText('Add Note');
    expect(button.hasAttribute('disabled')).toBe(true);
  });

  it('calls addJournalNote on submit', async () => {
    vi.mocked(api.addJournalNote).mockResolvedValue({ id: 'new-note-1' });
    const onNoteAdded = vi.fn();
    render(JournalNoteForm, { props: { nodeId: 'node-1', onNoteAdded } });

    const textarea = screen.getByPlaceholderText("Add a note to this node's journal...");
    await fireEvent.input(textarea, { target: { value: 'Test note content' } });

    const button = screen.getByText('Add Note');
    await fireEvent.click(button);

    await waitFor(() => {
      expect(api.addJournalNote).toHaveBeenCalledWith('node-1', 'Test note content');
      expect(onNoteAdded).toHaveBeenCalled();
      expect(toast.showSuccess).toHaveBeenCalledWith('Note added to journal');
    });
  });

  it('shows error toast on API failure', async () => {
    vi.mocked(api.addJournalNote).mockRejectedValue(new Error('Server error'));
    render(JournalNoteForm, { props: { nodeId: 'node-1' } });

    const textarea = screen.getByPlaceholderText("Add a note to this node's journal...");
    await fireEvent.input(textarea, { target: { value: 'Test note' } });

    const button = screen.getByText('Add Note');
    await fireEvent.click(button);

    await waitFor(() => {
      expect(toast.showError).toHaveBeenCalledWith('Failed to add note', 'Server error');
    });
  });
});
