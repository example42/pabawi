import { describe, it, expect, beforeEach, vi } from "vitest";
import { JournalService, type LiveSource } from "../../src/services/journal/JournalService";
import type { DatabaseAdapter } from "../../src/database/DatabaseAdapter";
import type { CreateJournalEntry } from "../../src/services/journal/types";

function createMockDb(): DatabaseAdapter {
  return {
    query: vi.fn().mockResolvedValue([]),
    queryOne: vi.fn().mockResolvedValue(null),
    execute: vi.fn().mockResolvedValue({ changes: 1 }),
    beginTransaction: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
    withTransaction: vi.fn(),
    initialize: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    isConnected: vi.fn().mockReturnValue(true),
    getDialect: vi.fn().mockReturnValue("sqlite" as const),
    getPlaceholder: vi.fn((_i: number) => "?"),
  };
}

describe("JournalService", () => {
  let db: DatabaseAdapter;
  let service: JournalService;

  beforeEach(() => {
    db = createMockDb();
    service = new JournalService(db);
  });

  describe("recordEvent", () => {
    it("inserts a validated entry and returns an id", async () => {
      const entry: CreateJournalEntry = {
        nodeId: "node-1",
        nodeUri: "proxmox:100",
        eventType: "provision",
        source: "proxmox",
        action: "create_vm",
        summary: "Created VM 100",
      };

      const id = await service.recordEvent(entry);

      expect(id).toBeTruthy();
      expect(typeof id).toBe("string");
      expect(db.execute).toHaveBeenCalledOnce();

      const [sql, params] = (db.execute as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(sql).toContain("INSERT INTO journal_entries");
      expect(params[1]).toBe("node-1");
      expect(params[2]).toBe("proxmox:100");
      expect(params[3]).toBe("provision");
      expect(params[4]).toBe("proxmox");
    });

    it("includes userId and details when provided", async () => {
      const entry: CreateJournalEntry = {
        nodeId: "node-2",
        nodeUri: "aws:us-east-1:i-abc",
        eventType: "start",
        source: "aws",
        action: "start_instance",
        summary: "Started instance",
        details: { instanceId: "i-abc" },
        userId: "user-42",
      };

      await service.recordEvent(entry);

      const [, params] = (db.execute as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(params[7]).toBe(JSON.stringify({ instanceId: "i-abc" }));
      expect(params[8]).toBe("user-42");
    });

    it("rejects invalid source", async () => {
      const entry = {
        nodeId: "node-1",
        nodeUri: "bad:100",
        eventType: "provision",
        source: "invalid_source",
        action: "create",
        summary: "test",
      };

      await expect(service.recordEvent(entry as CreateJournalEntry)).rejects.toThrow();
      expect(db.execute).not.toHaveBeenCalled();
    });

    it("rejects invalid eventType", async () => {
      const entry = {
        nodeId: "node-1",
        nodeUri: "proxmox:100",
        eventType: "invalid_type",
        source: "proxmox",
        action: "create",
        summary: "test",
      };

      await expect(service.recordEvent(entry as CreateJournalEntry)).rejects.toThrow();
      expect(db.execute).not.toHaveBeenCalled();
    });

    it("rejects empty nodeId", async () => {
      const entry = {
        nodeId: "",
        nodeUri: "proxmox:100",
        eventType: "provision",
        source: "proxmox",
        action: "create",
        summary: "test",
      };

      await expect(service.recordEvent(entry as CreateJournalEntry)).rejects.toThrow();
    });
  });

  describe("addNote", () => {
    it("creates a note entry with eventType 'note' and source 'user'", async () => {
      const id = await service.addNote("node-1", "user-1", "Manual observation");

      expect(id).toBeTruthy();
      expect(db.execute).toHaveBeenCalledOnce();

      const [, params] = (db.execute as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(params[1]).toBe("node-1");
      expect(params[2]).toBe("user:node-1");
      expect(params[3]).toBe("note");
      expect(params[4]).toBe("user");
      expect(params[5]).toBe("add_note");
      expect(params[6]).toBe("Manual observation");
      expect(params[8]).toBe("user-1");
    });
  });

  describe("getNodeTimeline", () => {
    it("queries with default pagination", async () => {
      await service.getNodeTimeline("node-1");

      expect(db.query).toHaveBeenCalledOnce();
      const [sql, params] = (db.query as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(sql).toContain("WHERE nodeId IN (?)");
      expect(sql).toContain("ORDER BY timestamp DESC");
      expect(sql).toContain("LIMIT ? OFFSET ?");
      expect(params[0]).toBe("node-1");
      expect(params[1]).toBe(50);
      expect(params[2]).toBe(0);
    });

    it("applies eventType and source filters", async () => {
      await service.getNodeTimeline("node-1", {
        eventType: "provision",
        source: "proxmox",
        limit: 10,
        offset: 5,
      });

      const [sql, params] = (db.query as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(sql).toContain("AND eventType IN (?)");
      expect(sql).toContain("AND source IN (?)");
      expect(params).toEqual(["node-1", "provision", "proxmox", 10, 5]);
    });

    it("applies date range filters", async () => {
      await service.getNodeTimeline("node-1", {
        startDate: "2024-01-01T00:00:00.000Z",
        endDate: "2024-12-31T23:59:59.000Z",
      });

      const [sql, params] = (db.query as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(sql).toContain("AND timestamp >= ?");
      expect(sql).toContain("AND timestamp <= ?");
      expect(params[1]).toBe("2024-01-01T00:00:00.000Z");
      expect(params[2]).toBe("2024-12-31T23:59:59.000Z");
    });

    it("parses JSON details and sets isLive=false", async () => {
      (db.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        {
          id: "e1",
          nodeId: "node-1",
          nodeUri: "proxmox:100",
          eventType: "provision",
          source: "proxmox",
          action: "create_vm",
          summary: "Created VM",
          details: '{"vmid":100}',
          userId: null,
          timestamp: "2024-06-01T00:00:00.000Z",
        },
      ]);

      const entries = await service.getNodeTimeline("node-1");

      expect(entries).toHaveLength(1);
      expect(entries[0].details).toEqual({ vmid: 100 });
      expect(entries[0].isLive).toBe(false);
    });
  });

  describe("searchEntries", () => {
    it("searches summary and details with LIKE", async () => {
      await service.searchEntries("provision");

      expect(db.query).toHaveBeenCalledOnce();
      const [sql, params] = (db.query as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(sql).toContain("WHERE summary LIKE ?");
      expect(sql).toContain("OR details LIKE ?");
      expect(params[0]).toBe("%provision%");
      expect(params[1]).toBe("%provision%");
      expect(params[2]).toBe(50);
      expect(params[3]).toBe(0);
    });

    it("applies custom pagination", async () => {
      await service.searchEntries("error", { limit: 20, offset: 10 });

      const [, params] = (db.query as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(params[2]).toBe(20);
      expect(params[3]).toBe(10);
    });

    it("sets isLive=false on search results", async () => {
      (db.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        {
          id: "e1",
          nodeId: "node-1",
          nodeUri: "proxmox:100",
          eventType: "note",
          source: "user",
          action: "add_note",
          summary: "Found an issue",
          details: "{}",
          userId: "user-1",
          timestamp: "2024-06-01T00:00:00.000Z",
        },
      ]);

      const results = await service.searchEntries("issue");

      expect(results).toHaveLength(1);
      expect(results[0].isLive).toBe(false);
      expect(results[0].details).toEqual({});
    });
  });

  describe("aggregateTimeline", () => {
    function createMockLiveSource(
      events: unknown[] = [],
      initialized = true
    ): LiveSource {
      return {
        getNodeData: vi.fn().mockResolvedValue(events),
        isInitialized: vi.fn().mockReturnValue(initialized),
      };
    }

    it("returns DB events with isLive=false when no live sources", async () => {
      (db.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        {
          id: "db-1",
          nodeId: "node-1",
          nodeUri: "proxmox:100",
          eventType: "provision",
          source: "proxmox",
          action: "create_vm",
          summary: "Created VM",
          details: "{}",
          userId: null,
          timestamp: "2024-06-01T00:00:00.000Z",
        },
      ]);

      const entries = await service.aggregateTimeline("node-1");

      expect(entries).toHaveLength(1);
      expect(entries[0].isLive).toBe(false);
      expect(entries[0].id).toBe("db-1");
    });

    it("merges DB and live events, marking isLive correctly", async () => {
      const liveSources = new Map<string, LiveSource>();
      liveSources.set(
        "puppetdb",
        createMockLiveSource([
          {
            id: "live-1",
            nodeId: "node-1",
            nodeUri: "puppetdb:node-1",
            eventType: "puppet_run",
            action: "apply",
            summary: "Puppet run completed",
            timestamp: "2024-06-02T00:00:00.000Z",
          },
        ])
      );

      const svcWithLive = new JournalService(db, liveSources);

      (db.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        {
          id: "db-1",
          nodeId: "node-1",
          nodeUri: "proxmox:100",
          eventType: "provision",
          source: "proxmox",
          action: "create_vm",
          summary: "Created VM",
          details: "{}",
          userId: null,
          timestamp: "2024-06-01T00:00:00.000Z",
        },
      ]);

      const entries = await svcWithLive.aggregateTimeline("node-1");

      expect(entries).toHaveLength(2);
      // Live event is newer, should come first (descending)
      expect(entries[0].isLive).toBe(true);
      expect(entries[0].id).toBe("live-1");
      expect(entries[0].source).toBe("puppetdb");
      expect(entries[1].isLive).toBe(false);
      expect(entries[1].id).toBe("db-1");
    });

    it("sorts merged results by timestamp descending", async () => {
      const liveSources = new Map<string, LiveSource>();
      liveSources.set(
        "puppetdb",
        createMockLiveSource([
          {
            id: "live-old",
            nodeId: "node-1",
            nodeUri: "puppetdb:node-1",
            eventType: "unknown",
            action: "report",
            summary: "Old live event",
            timestamp: "2024-01-01T00:00:00.000Z",
          },
          {
            id: "live-new",
            nodeId: "node-1",
            nodeUri: "puppetdb:node-1",
            eventType: "unknown",
            action: "report",
            summary: "New live event",
            timestamp: "2024-12-01T00:00:00.000Z",
          },
        ])
      );

      const svcWithLive = new JournalService(db, liveSources);

      (db.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        {
          id: "db-mid",
          nodeId: "node-1",
          nodeUri: "proxmox:100",
          eventType: "start",
          source: "proxmox",
          action: "start_vm",
          summary: "Started VM",
          details: "{}",
          userId: null,
          timestamp: "2024-06-15T00:00:00.000Z",
        },
      ]);

      const entries = await svcWithLive.aggregateTimeline("node-1");

      expect(entries).toHaveLength(3);
      expect(entries[0].id).toBe("live-new");
      expect(entries[1].id).toBe("db-mid");
      expect(entries[2].id).toBe("live-old");
    });

    it("applies limit/offset pagination to merged results", async () => {
      const liveSources = new Map<string, LiveSource>();
      liveSources.set(
        "puppetdb",
        createMockLiveSource([
          {
            id: "live-1",
            nodeId: "node-1",
            nodeUri: "puppetdb:node-1",
            eventType: "unknown",
            action: "report",
            summary: "Live event",
            timestamp: "2024-06-03T00:00:00.000Z",
          },
        ])
      );

      const svcWithLive = new JournalService(db, liveSources);

      (db.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        {
          id: "db-1",
          nodeId: "node-1",
          nodeUri: "proxmox:100",
          eventType: "provision",
          source: "proxmox",
          action: "create_vm",
          summary: "Created VM",
          details: "{}",
          userId: null,
          timestamp: "2024-06-02T00:00:00.000Z",
        },
        {
          id: "db-2",
          nodeId: "node-1",
          nodeUri: "proxmox:101",
          eventType: "start",
          source: "proxmox",
          action: "start_vm",
          summary: "Started VM",
          details: "{}",
          userId: null,
          timestamp: "2024-06-01T00:00:00.000Z",
        },
      ]);

      const entries = await svcWithLive.aggregateTimeline("node-1", {
        limit: 2,
        offset: 1,
      });

      expect(entries).toHaveLength(2);
      // Skipped first (live-1), got db-1 and db-2
      expect(entries[0].id).toBe("db-1");
      expect(entries[1].id).toBe("db-2");
    });

    it("gracefully skips failed live sources", async () => {
      const liveSources = new Map<string, LiveSource>();
      liveSources.set("puppetdb", {
        getNodeData: vi.fn().mockRejectedValue(new Error("Connection refused")),
        isInitialized: vi.fn().mockReturnValue(true),
      });

      const svcWithLive = new JournalService(db, liveSources);

      (db.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        {
          id: "db-1",
          nodeId: "node-1",
          nodeUri: "proxmox:100",
          eventType: "provision",
          source: "proxmox",
          action: "create_vm",
          summary: "Created VM",
          details: "{}",
          userId: null,
          timestamp: "2024-06-01T00:00:00.000Z",
        },
      ]);

      const entries = await svcWithLive.aggregateTimeline("node-1");

      expect(entries).toHaveLength(1);
      expect(entries[0].isLive).toBe(false);
      expect(entries[0].id).toBe("db-1");
    });

    it("skips uninitialized live sources", async () => {
      const liveSources = new Map<string, LiveSource>();
      liveSources.set("puppetdb", createMockLiveSource([], false));

      const svcWithLive = new JournalService(db, liveSources);

      (db.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

      const entries = await svcWithLive.aggregateTimeline("node-1");

      expect(entries).toHaveLength(0);
      expect(liveSources.get("puppetdb")!.getNodeData).not.toHaveBeenCalled();
    });

    it("handles multiple live sources with partial failures", async () => {
      const liveSources = new Map<string, LiveSource>();
      liveSources.set("puppetdb", {
        getNodeData: vi.fn().mockRejectedValue(new Error("timeout")),
        isInitialized: vi.fn().mockReturnValue(true),
      });
      liveSources.set(
        "aws",
        createMockLiveSource([
          {
            id: "aws-1",
            nodeId: "node-1",
            nodeUri: "aws:i-123",
            eventType: "unknown",
            action: "status_check",
            summary: "AWS status",
            timestamp: "2024-06-05T00:00:00.000Z",
          },
        ])
      );

      const svcWithLive = new JournalService(db, liveSources);

      (db.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        {
          id: "db-1",
          nodeId: "node-1",
          nodeUri: "proxmox:100",
          eventType: "provision",
          source: "proxmox",
          action: "create_vm",
          summary: "Created VM",
          details: "{}",
          userId: null,
          timestamp: "2024-06-01T00:00:00.000Z",
        },
      ]);

      const entries = await svcWithLive.aggregateTimeline("node-1");

      expect(entries).toHaveLength(2);
      // AWS live event is newer
      expect(entries[0].isLive).toBe(true);
      expect(entries[0].source).toBe("aws");
      expect(entries[1].isLive).toBe(false);
    });
  });
});
