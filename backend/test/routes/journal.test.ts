import express, { Express } from "express";
import request from "supertest";
import { createJournalRouter } from "../../src/routes/journal";
import { DatabaseService } from "../../src/database/DatabaseService";
import { AuthenticationService } from "../../src/services/AuthenticationService";
import { UserService } from "../../src/services/UserService";
import { PermissionService } from "../../src/services/PermissionService";
import { RoleService } from "../../src/services/RoleService";
import { JournalService } from "../../src/services/journal/JournalService";

describe("Journal Router", () => {
  let app: Express;
  let databaseService: DatabaseService;
  let authService: AuthenticationService;
  let userService: UserService;
  let permissionService: PermissionService;
  let roleService: RoleService;
  let journalService: JournalService;
  let adminToken: string;
  let adminUserId: string;
  let regularUserToken: string;

  beforeAll(async () => {
    databaseService = new DatabaseService(":memory:");
    await databaseService.initialize();

    const jwtSecret = "test-secret-key"; // pragma: allowlist secret
    process.env.JWT_SECRET = jwtSecret;
    authService = new AuthenticationService(databaseService.getConnection(), jwtSecret);
    userService = new UserService(databaseService.getConnection(), authService);
    permissionService = new PermissionService(databaseService.getConnection());
    roleService = new RoleService(databaseService.getConnection());
    journalService = new JournalService(databaseService.getConnection());

    app = express();
    app.use(express.json());
    app.use("/api/journal", createJournalRouter(databaseService));
  });

  afterAll(async () => {
    await databaseService.close();
  });

  beforeEach(async () => {
    // Create admin user with journal permissions
    const adminUser = await userService.createUser({
      username: "journal_admin",
      email: "journal_admin@test.com",
      password: "AdminPass123!",
      firstName: "Journal",
      lastName: "Admin",
      isAdmin: false,
    });
    adminUserId = adminUser.id;

    // Ensure journal:read and journal:note permissions exist
    let journalReadPerm;
    let journalNotePerm;
    try {
      journalReadPerm = await permissionService.createPermission({
        resource: "journal",
        action: "read",
        description: "Read journal entries",
      });
    } catch {
      const all = await permissionService.listPermissions();
      journalReadPerm = all.items.find(
        (p) => p.resource === "journal" && p.action === "read"
      );
    }
    try {
      journalNotePerm = await permissionService.createPermission({
        resource: "journal",
        action: "note",
        description: "Add journal notes",
      });
    } catch {
      const all = await permissionService.listPermissions();
      journalNotePerm = all.items.find(
        (p) => p.resource === "journal" && p.action === "note"
      );
    }

    // Create role with journal permissions
    const journalRole = await roleService.createRole({
      name: "JournalAdmin",
      description: "Can read and write journal",
    });

    if (journalReadPerm) {
      await roleService.assignPermissionToRole(journalRole.id, journalReadPerm.id);
    }
    if (journalNotePerm) {
      await roleService.assignPermissionToRole(journalRole.id, journalNotePerm.id);
    }
    await userService.assignRoleToUser(adminUserId, journalRole.id);

    adminToken = await authService.generateToken(adminUser);

    // Create regular user without journal permissions
    const regularUser = await userService.createUser({
      username: "journal_regular",
      email: "journal_regular@test.com",
      password: "RegularPass123!",
      firstName: "Regular",
      lastName: "User",
      isAdmin: false,
    });

    regularUserToken = await authService.generateToken(regularUser);

    // Seed some journal entries for testing
    await journalService.recordEvent({
      nodeId: "node-1",
      nodeUri: "proxmox:node-1",
      eventType: "provision",
      source: "proxmox",
      action: "create_vm",
      summary: "Provisioned VM node-1",
      userId: adminUserId,
    });
    await journalService.recordEvent({
      nodeId: "node-1",
      nodeUri: "proxmox:node-1",
      eventType: "start",
      source: "proxmox",
      action: "start_vm",
      summary: "Started VM node-1",
    });
    await journalService.recordEvent({
      nodeId: "node-2",
      nodeUri: "aws:node-2",
      eventType: "provision",
      source: "aws",
      action: "run_instances",
      summary: "Launched EC2 instance node-2",
    });
  });

  afterEach(async () => {
    const db = databaseService.getConnection();
    await db.execute("DELETE FROM user_roles");
    await db.execute("DELETE FROM role_permissions");
    await db.execute('DELETE FROM users WHERE username IN ("journal_admin", "journal_regular")');
    await db.execute('DELETE FROM roles WHERE name = "JournalAdmin"');
    await db.execute("DELETE FROM journal_entries");
  });

  describe("GET /api/journal/:nodeId", () => {
    it("should return timeline entries for a node", async () => {
      const response = await request(app)
        .get("/api/journal/node-1")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("entries");
      expect(Array.isArray(response.body.entries)).toBe(true);
      expect(response.body.entries.length).toBe(2);
    });

    it("should return 401 when not authenticated", async () => {
      const response = await request(app).get("/api/journal/node-1");
      expect(response.status).toBe(401);
    });

    it("should return 403 when user lacks journal:read permission", async () => {
      const response = await request(app)
        .get("/api/journal/node-1")
        .set("Authorization", `Bearer ${regularUserToken}`);
      expect(response.status).toBe(403);
    });

    it("should return empty entries for unknown node", async () => {
      const response = await request(app)
        .get("/api/journal/unknown-node")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.entries).toEqual([]);
    });

    it("should support pagination via limit and offset", async () => {
      const response = await request(app)
        .get("/api/journal/node-1")
        .set("Authorization", `Bearer ${adminToken}`)
        .query({ limit: 1, offset: 0 });

      expect(response.status).toBe(200);
      expect(response.body.entries.length).toBe(1);
    });

    it("should return 400 for invalid limit", async () => {
      const response = await request(app)
        .get("/api/journal/node-1")
        .set("Authorization", `Bearer ${adminToken}`)
        .query({ limit: 0 });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("POST /api/journal/:nodeId/notes", () => {
    it("should add a manual note to a node", async () => {
      const response = await request(app)
        .post("/api/journal/node-1/notes")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ content: "This is a test note" });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty("id");
    });

    it("should return 401 when not authenticated", async () => {
      const response = await request(app)
        .post("/api/journal/node-1/notes")
        .send({ content: "Unauthorized note" });
      expect(response.status).toBe(401);
    });

    it("should return 403 when user lacks journal:note permission", async () => {
      const response = await request(app)
        .post("/api/journal/node-1/notes")
        .set("Authorization", `Bearer ${regularUserToken}`)
        .send({ content: "Forbidden note" });
      expect(response.status).toBe(403);
    });

    it("should return 400 when content is missing", async () => {
      const response = await request(app)
        .post("/api/journal/node-1/notes")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("should return 400 when content is empty string", async () => {
      const response = await request(app)
        .post("/api/journal/node-1/notes")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ content: "" });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("should persist the note and appear in timeline", async () => {
      await request(app)
        .post("/api/journal/node-1/notes")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ content: "Persisted note" });

      const timeline = await request(app)
        .get("/api/journal/node-1")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(timeline.status).toBe(200);
      const noteEntry = timeline.body.entries.find(
        (e: { summary: string }) => e.summary === "Persisted note"
      );
      expect(noteEntry).toBeDefined();
      expect(noteEntry.eventType).toBe("note");
      expect(noteEntry.source).toBe("user");
    });
  });

  describe("GET /api/journal/search", () => {
    it("should search journal entries by query", async () => {
      const response = await request(app)
        .get("/api/journal/search")
        .set("Authorization", `Bearer ${adminToken}`)
        .query({ q: "Provisioned" });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("entries");
      expect(response.body.entries.length).toBeGreaterThanOrEqual(1);
    });

    it("should return 401 when not authenticated", async () => {
      const response = await request(app)
        .get("/api/journal/search")
        .query({ q: "test" });
      expect(response.status).toBe(401);
    });

    it("should return 403 when user lacks journal:read permission", async () => {
      const response = await request(app)
        .get("/api/journal/search")
        .set("Authorization", `Bearer ${regularUserToken}`)
        .query({ q: "test" });
      expect(response.status).toBe(403);
    });

    it("should return 400 when query parameter q is missing", async () => {
      const response = await request(app)
        .get("/api/journal/search")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("should return empty results for non-matching query", async () => {
      const response = await request(app)
        .get("/api/journal/search")
        .set("Authorization", `Bearer ${adminToken}`)
        .query({ q: "nonexistent_xyz_query" });

      expect(response.status).toBe(200);
      expect(response.body.entries).toEqual([]);
    });

    it("should support pagination in search", async () => {
      const response = await request(app)
        .get("/api/journal/search")
        .set("Authorization", `Bearer ${adminToken}`)
        .query({ q: "node", limit: 1, offset: 0 });

      expect(response.status).toBe(200);
      expect(response.body.entries.length).toBeLessThanOrEqual(1);
    });
  });
});
