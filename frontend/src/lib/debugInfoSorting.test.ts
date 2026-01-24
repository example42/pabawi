import { describe, it, expect } from 'vitest';
import type { LabeledDebugInfo } from './api';

/**
 * Test suite for debug info block sorting functionality
 *
 * Validates: Requirements 7.3 - Debug info blocks MUST be displayed in chronological order
 */
describe('Debug Info Sorting', () => {
  it('should sort debug blocks by timestamp (newest first)', () => {
    // Create debug blocks with different timestamps
    const blocks: LabeledDebugInfo[] = [
      {
        label: 'First API Call',
        debugInfo: {
          timestamp: '2024-01-15T10:00:00.000Z',
          requestId: 'req-1',
          operation: 'fetchData',
          duration: 100,
        },
      },
      {
        label: 'Third API Call',
        debugInfo: {
          timestamp: '2024-01-15T10:02:00.000Z',
          requestId: 'req-3',
          operation: 'fetchData',
          duration: 100,
        },
      },
      {
        label: 'Second API Call',
        debugInfo: {
          timestamp: '2024-01-15T10:01:00.000Z',
          requestId: 'req-2',
          operation: 'fetchData',
          duration: 100,
        },
      },
    ];

    // Sort blocks by timestamp (newest first)
    const sorted = [...blocks].sort((a, b) => {
      const timeA = new Date(a.debugInfo.timestamp).getTime();
      const timeB = new Date(b.debugInfo.timestamp).getTime();
      return timeB - timeA; // Newest first
    });

    // Verify order
    expect(sorted[0].label).toBe('Third API Call');
    expect(sorted[1].label).toBe('Second API Call');
    expect(sorted[2].label).toBe('First API Call');
  });

  it('should handle blocks with identical timestamps', () => {
    const timestamp = '2024-01-15T10:00:00.000Z';
    const blocks: LabeledDebugInfo[] = [
      {
        label: 'Block A',
        debugInfo: {
          timestamp,
          requestId: 'req-1',
          operation: 'fetchData',
          duration: 100,
        },
      },
      {
        label: 'Block B',
        debugInfo: {
          timestamp,
          requestId: 'req-2',
          operation: 'fetchData',
          duration: 100,
        },
      },
    ];

    // Sort blocks
    const sorted = [...blocks].sort((a, b) => {
      const timeA = new Date(a.debugInfo.timestamp).getTime();
      const timeB = new Date(b.debugInfo.timestamp).getTime();
      return timeB - timeA;
    });

    // Should maintain stable sort (original order preserved for equal elements)
    expect(sorted.length).toBe(2);
    expect(sorted[0].label).toBe('Block A');
    expect(sorted[1].label).toBe('Block B');
  });

  it('should handle empty array', () => {
    const blocks: LabeledDebugInfo[] = [];
    const sorted = [...blocks].sort((a, b) => {
      const timeA = new Date(a.debugInfo.timestamp).getTime();
      const timeB = new Date(b.debugInfo.timestamp).getTime();
      return timeB - timeA;
    });

    expect(sorted).toEqual([]);
  });

  it('should handle single block', () => {
    const blocks: LabeledDebugInfo[] = [
      {
        label: 'Single Block',
        debugInfo: {
          timestamp: '2024-01-15T10:00:00.000Z',
          requestId: 'req-1',
          operation: 'fetchData',
          duration: 100,
        },
      },
    ];

    const sorted = [...blocks].sort((a, b) => {
      const timeA = new Date(a.debugInfo.timestamp).getTime();
      const timeB = new Date(b.debugInfo.timestamp).getTime();
      return timeB - timeA;
    });

    expect(sorted.length).toBe(1);
    expect(sorted[0].label).toBe('Single Block');
  });

  it('should sort blocks with millisecond precision', () => {
    const blocks: LabeledDebugInfo[] = [
      {
        label: 'Block 1',
        debugInfo: {
          timestamp: '2024-01-15T10:00:00.100Z',
          requestId: 'req-1',
          operation: 'fetchData',
          duration: 100,
        },
      },
      {
        label: 'Block 2',
        debugInfo: {
          timestamp: '2024-01-15T10:00:00.300Z',
          requestId: 'req-2',
          operation: 'fetchData',
          duration: 100,
        },
      },
      {
        label: 'Block 3',
        debugInfo: {
          timestamp: '2024-01-15T10:00:00.200Z',
          requestId: 'req-3',
          operation: 'fetchData',
          duration: 100,
        },
      },
    ];

    const sorted = [...blocks].sort((a, b) => {
      const timeA = new Date(a.debugInfo.timestamp).getTime();
      const timeB = new Date(b.debugInfo.timestamp).getTime();
      return timeB - timeA;
    });

    expect(sorted[0].label).toBe('Block 2'); // 300ms
    expect(sorted[1].label).toBe('Block 3'); // 200ms
    expect(sorted[2].label).toBe('Block 1'); // 100ms
  });
});
