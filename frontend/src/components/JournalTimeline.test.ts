/**
 * Unit tests for JournalTimeline and JournalNoteForm components
 * Validates Requirements: 23.1, 23.3, 24.1
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import JournalTimeline from './JournalTimeline.svelte';
import JournalNoteForm from './JournalNoteForm.svelte';
import type { JournalEntry } from '../lib/api';

// Mock the API module (for JournalNoteForm)
vi.mock('../lib/api', () => ({
  addJournalNote: vi.fn(),
  getErrorGuidance: vi.fn().mockReturnValue({ message: 'Error', guidance: 'Try again' }),
}));

// Mock the auth module
vi.mock('../lib/auth.svelte', () => ({
  authManager: {
    getAuthHeader: vi.fn().mockReturnValue('Bearer test-token'),
  },
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

/**
 * Helper to create a mock SSE stream response.
 * Encodes SSE events as a ReadableStream for fetch mock.
 */
function createSSEStream(events: { event: string; data: unknown }[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const chunks: string[] = [];

  for (const evt of events) {
    chunks.push(`event: ${evt.event}\ndata: ${JSON.stringify(evt.data)}\n\n`);
  }

  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index]));
        index++;
      } else {
        controller.close();
      }
    },
  });
}

function mockFetchSSE(events: { event: string; data: unknown }[]): void {
  const stream = createSSEStream(events);
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
    ok: true,
    body: stream,
  } as unknown as Response);
}

describe('JournalTimeline Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders loading state initially', () => {
    // Mock fetch that never resolves to keep loading state
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}));
    render(JournalTimeline, { props: { nodeId: 'node-1', active: true } });
    // Before SSE init event, the component shows "Starting journal load…"
    expect(screen.getByText('Starting journal load…')).toBeTruthy();
  });

  it('renders timeline entries after loading', async () => {
    mockFetchSSE([
      { event: 'init', data: { sources: ['proxmox', 'puppetdb', 'user'] } },
      { event: 'batch', data: { source: 'proxmox', entries: [mockEntries[0]] } },
      { event: 'batch', data: { source: 'puppetdb', entries: [mockEntries[1]] } },
      { event: 'batch', data: { source: 'user', entries: [mockEntries[2]] } },
      { event: 'complete', data: {} },
    ]);

    render(JournalTimeline, { props: { nodeId: 'node-1', active: true } });

    await waitFor(() => {
      expect(screen.getByText('VM provisioned successfully')).toBeTruthy();
      expect(screen.getByText('Puppet run completed with changes')).toBeTruthy();
      expect(screen.getByText('Scheduled for maintenance window')).toBeTruthy();
    });
  });

  it('displays isLive badge for live entries', async () => {
    mockFetchSSE([
      { event: 'init', data: { sources: ['puppetdb'] } },
      { event: 'batch', data: { source: 'puppetdb', entries: [mockEntries[1]] } },
      { event: 'complete', data: {} },
    ]);

    render(JournalTimeline, { props: { nodeId: 'node-1', active: true } });

    await waitFor(() => {
      expect(screen.getByText('Live')).toBeTruthy();
    });
  });

  it('displays source badges', async () => {
    mockFetchSSE([
      { event: 'init', data: { sources: ['proxmox', 'puppetdb', 'user'] } },
      { event: 'batch', data: { source: 'proxmox', entries: [mockEntries[0]] } },
      { event: 'batch', data: { source: 'puppetdb', entries: [mockEntries[1]] } },
      { event: 'batch', data: { source: 'user', entries: [mockEntries[2]] } },
      { event: 'complete', data: {} },
    ]);

    render(JournalTimeline, { props: { nodeId: 'node-1', active: true } });

    await waitFor(() => {
      expect(screen.getByText('Proxmox')).toBeTruthy();
      expect(screen.getByText('PuppetDB')).toBeTruthy();
      expect(screen.getByText('User')).toBeTruthy();
    });
  });

  it('displays event type labels', async () => {
    mockFetchSSE([
      { event: 'init', data: { sources: ['proxmox', 'puppetdb', 'user'] } },
      { event: 'batch', data: { source: 'proxmox', entries: [mockEntries[0]] } },
      { event: 'batch', data: { source: 'puppetdb', entries: [mockEntries[1]] } },
      { event: 'batch', data: { source: 'user', entries: [mockEntries[2]] } },
      { event: 'complete', data: {} },
    ]);

    render(JournalTimeline, { props: { nodeId: 'node-1', active: true } });

    await waitFor(() => {
      expect(screen.getByText('Provisioned')).toBeTruthy();
      expect(screen.getByText('Puppet Run')).toBeTruthy();
      expect(screen.getByText('Note')).toBeTruthy();
    });
  });

  it('renders empty state when no entries', async () => {
    mockFetchSSE([
      { event: 'init', data: { sources: ['proxmox'] } },
      { event: 'batch', data: { source: 'proxmox', entries: [] } },
      { event: 'complete', data: {} },
    ]);

    render(JournalTimeline, { props: { nodeId: 'node-1', active: true } });

    await waitFor(() => {
      expect(screen.getByText('No journal entries found for this node.')).toBeTruthy();
    });
  });

  it('renders error state on stream failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as unknown as Response);

    render(JournalTimeline, { props: { nodeId: 'node-1', active: true } });

    await waitFor(() => {
      expect(screen.getByText(/Failed to load journal/)).toBeTruthy();
    });
  });

  it('shows entry count after stream completes', async () => {
    mockFetchSSE([
      { event: 'init', data: { sources: ['proxmox'] } },
      { event: 'batch', data: { source: 'proxmox', entries: mockEntries } },
      { event: 'complete', data: {} },
    ]);

    render(JournalTimeline, { props: { nodeId: 'node-1', active: true } });

    await waitFor(() => {
      expect(screen.getByText('3 events')).toBeTruthy();
    });
  });

  it('does not start stream when active is false', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    render(JournalTimeline, { props: { nodeId: 'node-1', active: false } });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('calls fetch with correct nodeId in URL', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      body: createSSEStream([
        { event: 'init', data: { sources: [] } },
        { event: 'complete', data: {} },
      ]),
    } as unknown as Response);

    render(JournalTimeline, { props: { nodeId: 'test-node-42', active: true } });

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/journal/test-node-42/stream',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Accept': 'text/event-stream',
            'Authorization': 'Bearer test-token',
          }),
        })
      );
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
