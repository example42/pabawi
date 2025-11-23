import { describe, it, expect, beforeEach } from 'vitest';
import { ExecutionQueue, ExecutionQueueFullError, type QueuedExecution } from '../../src/services/ExecutionQueue';

describe('ExecutionQueue', () => {
  let queue: ExecutionQueue;

  beforeEach(() => {
    queue = new ExecutionQueue(2, 5); // Limit of 2 concurrent, max queue size of 5
  });

  describe('acquire and release', () => {
    it('should allow immediate execution when under limit', async () => {
      const exec1: QueuedExecution = {
        id: 'exec1',
        type: 'command',
        nodeId: 'node1',
        action: 'ls',
        enqueuedAt: new Date(),
      };

      await queue.acquire(exec1);
      expect(queue.isRunning('exec1')).toBe(true);
      expect(queue.isQueued('exec1')).toBe(false);
    });

    it('should queue executions when at limit', async () => {
      const exec1: QueuedExecution = {
        id: 'exec1',
        type: 'command',
        nodeId: 'node1',
        action: 'ls',
        enqueuedAt: new Date(),
      };

      const exec2: QueuedExecution = {
        id: 'exec2',
        type: 'command',
        nodeId: 'node2',
        action: 'pwd',
        enqueuedAt: new Date(),
      };

      const exec3: QueuedExecution = {
        id: 'exec3',
        type: 'task',
        nodeId: 'node3',
        action: 'facts',
        enqueuedAt: new Date(),
      };

      // First two should execute immediately
      await queue.acquire(exec1);
      await queue.acquire(exec2);

      expect(queue.isRunning('exec1')).toBe(true);
      expect(queue.isRunning('exec2')).toBe(true);

      // Third should be queued
      const acquirePromise = queue.acquire(exec3);

      // Give it a moment to queue
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(queue.isQueued('exec3')).toBe(true);
      expect(queue.isRunning('exec3')).toBe(false);

      // Release one execution
      queue.release('exec1');

      // Wait for exec3 to start
      await acquirePromise;

      expect(queue.isRunning('exec3')).toBe(true);
      expect(queue.isQueued('exec3')).toBe(false);
    });

    it('should throw error when queue is full', async () => {
      // Fill up running slots
      await queue.acquire({
        id: 'exec1',
        type: 'command',
        nodeId: 'node1',
        action: 'ls',
        enqueuedAt: new Date(),
      });

      await queue.acquire({
        id: 'exec2',
        type: 'command',
        nodeId: 'node2',
        action: 'pwd',
        enqueuedAt: new Date(),
      });

      // Fill up queue (max 5)
      const queuePromises = [];
      for (let i = 3; i <= 7; i++) {
        queuePromises.push(
          queue.acquire({
            id: `exec${i}`,
            type: 'command',
            nodeId: `node${i}`,
            action: 'whoami',
            enqueuedAt: new Date(),
          })
        );
      }

      // Give them a moment to queue
      await new Promise(resolve => setTimeout(resolve, 10));

      // Try to add one more (should fail)
      await expect(
        queue.acquire({
          id: 'exec8',
          type: 'command',
          nodeId: 'node8',
          action: 'date',
          enqueuedAt: new Date(),
        })
      ).rejects.toThrow(ExecutionQueueFullError);
    });
  });

  describe('getStatus', () => {
    it('should return correct queue status', async () => {
      await queue.acquire({
        id: 'exec1',
        type: 'command',
        nodeId: 'node1',
        action: 'ls',
        enqueuedAt: new Date(),
      });

      const status = queue.getStatus();
      expect(status.running).toBe(1);
      expect(status.queued).toBe(0);
      expect(status.limit).toBe(2);
      expect(status.queue).toHaveLength(0);
    });

    it('should include queued executions in status', async () => {
      // Fill running slots
      await queue.acquire({
        id: 'exec1',
        type: 'command',
        nodeId: 'node1',
        action: 'ls',
        enqueuedAt: new Date(),
      });

      await queue.acquire({
        id: 'exec2',
        type: 'command',
        nodeId: 'node2',
        action: 'pwd',
        enqueuedAt: new Date(),
      });

      // Queue one more
      const exec3Promise = queue.acquire({
        id: 'exec3',
        type: 'task',
        nodeId: 'node3',
        action: 'facts',
        enqueuedAt: new Date(),
      });

      // Give it a moment to queue
      await new Promise(resolve => setTimeout(resolve, 10));

      const status = queue.getStatus();
      expect(status.running).toBe(2);
      expect(status.queued).toBe(1);
      expect(status.queue).toHaveLength(1);
      expect(status.queue[0].id).toBe('exec3');

      // Clean up
      queue.release('exec1');
      await exec3Promise;
    });
  });

  describe('cancel', () => {
    it('should cancel queued execution', async () => {
      // Fill running slots
      await queue.acquire({
        id: 'exec1',
        type: 'command',
        nodeId: 'node1',
        action: 'ls',
        enqueuedAt: new Date(),
      });

      await queue.acquire({
        id: 'exec2',
        type: 'command',
        nodeId: 'node2',
        action: 'pwd',
        enqueuedAt: new Date(),
      });

      // Queue one more
      const exec3Promise = queue.acquire({
        id: 'exec3',
        type: 'task',
        nodeId: 'node3',
        action: 'facts',
        enqueuedAt: new Date(),
      });

      // Give it a moment to queue
      await new Promise(resolve => setTimeout(resolve, 10));

      // Cancel the queued execution
      const cancelled = queue.cancel('exec3');
      expect(cancelled).toBe(true);

      // Promise should reject
      await expect(exec3Promise).rejects.toThrow('Execution cancelled');

      // Should not be in queue anymore
      expect(queue.isQueued('exec3')).toBe(false);
    });

    it('should return false when cancelling non-existent execution', () => {
      const cancelled = queue.cancel('nonexistent');
      expect(cancelled).toBe(false);
    });
  });

  describe('clearQueue', () => {
    it('should clear all queued executions', async () => {
      // Fill running slots
      await queue.acquire({
        id: 'exec1',
        type: 'command',
        nodeId: 'node1',
        action: 'ls',
        enqueuedAt: new Date(),
      });

      await queue.acquire({
        id: 'exec2',
        type: 'command',
        nodeId: 'node2',
        action: 'pwd',
        enqueuedAt: new Date(),
      });

      // Queue two more
      const exec3Promise = queue.acquire({
        id: 'exec3',
        type: 'task',
        nodeId: 'node3',
        action: 'facts',
        enqueuedAt: new Date(),
      });

      const exec4Promise = queue.acquire({
        id: 'exec4',
        type: 'command',
        nodeId: 'node4',
        action: 'whoami',
        enqueuedAt: new Date(),
      });

      // Give them a moment to queue
      await new Promise(resolve => setTimeout(resolve, 10));

      // Clear the queue
      queue.clearQueue();

      // Both promises should reject
      await expect(exec3Promise).rejects.toThrow('Queue cleared');
      await expect(exec4Promise).rejects.toThrow('Queue cleared');

      // Queue should be empty
      const status = queue.getStatus();
      expect(status.queued).toBe(0);
      expect(status.running).toBe(2); // Running executions not affected
    });
  });

  describe('FIFO ordering', () => {
    it('should process queued executions in FIFO order', async () => {
      // Fill running slots
      await queue.acquire({
        id: 'exec1',
        type: 'command',
        nodeId: 'node1',
        action: 'ls',
        enqueuedAt: new Date(),
      });

      await queue.acquire({
        id: 'exec2',
        type: 'command',
        nodeId: 'node2',
        action: 'pwd',
        enqueuedAt: new Date(),
      });

      // Queue three executions with slight delays
      const exec3Promise = queue.acquire({
        id: 'exec3',
        type: 'task',
        nodeId: 'node3',
        action: 'facts',
        enqueuedAt: new Date(Date.now()),
      });

      await new Promise(resolve => setTimeout(resolve, 5));

      const exec4Promise = queue.acquire({
        id: 'exec4',
        type: 'command',
        nodeId: 'node4',
        action: 'whoami',
        enqueuedAt: new Date(Date.now()),
      });

      await new Promise(resolve => setTimeout(resolve, 5));

      const exec5Promise = queue.acquire({
        id: 'exec5',
        type: 'command',
        nodeId: 'node5',
        action: 'date',
        enqueuedAt: new Date(Date.now()),
      });

      // Give them a moment to queue
      await new Promise(resolve => setTimeout(resolve, 10));

      // Release exec1 - exec3 should start (oldest queued)
      queue.release('exec1');
      await exec3Promise;
      expect(queue.isRunning('exec3')).toBe(true);

      // Release exec2 - exec4 should start
      queue.release('exec2');
      await exec4Promise;
      expect(queue.isRunning('exec4')).toBe(true);

      // Release exec3 - exec5 should start
      queue.release('exec3');
      await exec5Promise;
      expect(queue.isRunning('exec5')).toBe(true);
    });
  });
});
