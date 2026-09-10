import { afterEach, describe, expect, it, vi } from "vitest";
import { authManager } from "./auth.svelte";
import { hasProvisioningPermission, hasPermission } from "./permissions";

function login(): void {
  authManager.setAuthDataFromSso({
    token: "permission-test-access", refreshToken: "permission-test-refresh",
    user: { id: "scoped", username: "scoped", email: "scoped@test.local", firstName: "Scoped", lastName: "User", isAdmin: false, isActive: true, createdAt: "", updatedAt: "", lastLoginAt: null },
  });
}

afterEach(async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
  await authManager.logout();
  vi.unstubAllGlobals();
});

describe("permission state", () => {
  it("denies provisioning before permissions are loaded", () => {
    login();
    expect(hasProvisioningPermission()).toBe(false);
  });
  it("uses the backend scope without granting another provider", async () => {
    login();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ permissions: [
      { resource: "provisioning", action: "read" }, { resource: "aws", action: "read" }, { resource: "aws", action: "provision" },
    ] }) }));
    await authManager.refreshPermissions();
    expect(hasProvisioningPermission()).toBe(true);
    expect(hasPermission("provision", "aws")).toBe(true);
    expect(hasPermission("provision", "azure")).toBe(false);
  });
  it("does not restore grants from a response arriving after logout", async () => {
    login();
    let complete!: (value: unknown) => void;
    const pending = new Promise(resolve => { complete = resolve; });
    vi.stubGlobal("fetch", vi.fn().mockReturnValueOnce(pending).mockResolvedValue({ ok: true, json: async () => ({}) }));
    const loading = authManager.refreshPermissions();
    await authManager.logout();
    complete({ ok: true, json: async () => ({ permissions: [{ resource: "aws", action: "provision" }] }) });
    await loading;
    expect(hasPermission("provision", "aws")).toBe(false);
  });
});
