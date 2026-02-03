# PermissionGuard Component Examples

Part of v1.0.0 Modular Plugin Architecture (Phase 4, Step 20)

The `PermissionGuard`, `RequireAuth`, and `AdminOnly` components provide declarative permission-based rendering in Svelte 5.

## PermissionGuard

### Basic Capability Check

```svelte
<script>
  import { PermissionGuard } from "$lib/components";
</script>

<PermissionGuard capability="command.execute">
  <CommandExecutor />
</PermissionGuard>
```

### Multiple Capabilities (Any)

Show content if user has ANY of the listed capabilities:

```svelte
<PermissionGuard capabilities={["bolt.command", "bolt.task"]} mode="any">
  <BoltInterface />
</PermissionGuard>
```

### Multiple Capabilities (All)

Show content only if user has ALL listed capabilities:

```svelte
<PermissionGuard capabilities={["inventory.read", "facts.read"]} mode="all">
  <NodeDetailView />
</PermissionGuard>
```

### Role-Based Check

```svelte
<PermissionGuard role="operator">
  <OperatorDashboard />
</PermissionGuard>
```

### Custom Fallback

```svelte
<PermissionGuard capability="admin.settings">
  <AdminSettingsPanel />
  {#snippet fallback()}
    <div class="p-4 bg-yellow-100 rounded">
      <p>You need admin privileges to access settings.</p>
      <a href="/contact-admin">Request Access</a>
    </div>
  {/snippet}
</PermissionGuard>
```

### Silent Mode

Don't show anything when permission denied:

```svelte
<PermissionGuard capability="debug.view" silent={true}>
  <DebugPanel />
</PermissionGuard>
```

### Inverted Check

Show content when user does NOT have the capability:

```svelte
<PermissionGuard capability="premium.features" invert={true}>
  <UpgradePrompt />
</PermissionGuard>
```

### Custom Loading State

```svelte
<PermissionGuard capability="reports.view">
  <ReportsPage />
  {#snippet loading()}
    <div class="animate-pulse">
      <div class="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
      <div class="h-64 bg-gray-200 rounded"></div>
    </div>
  {/snippet}
</PermissionGuard>
```

### Without Auth Requirement

Allow viewing for unauthenticated users but check permission if authenticated:

```svelte
<PermissionGuard capability="inventory.read" requireAuth={false}>
  <PublicInventoryView />
</PermissionGuard>
```

## RequireAuth

Simplified component for auth-only checks.

### Basic Usage

```svelte
<script>
  import { RequireAuth } from "$lib/components";
</script>

<RequireAuth>
  <UserDashboard />
</RequireAuth>
```

### With Redirect

Automatically redirect to login page:

```svelte
<RequireAuth redirectTo="/login">
  <ProtectedContent />
</RequireAuth>
```

### Custom Fallback

```svelte
<RequireAuth>
  <Dashboard />
  {#snippet fallback()}
    <div class="text-center py-8">
      <h2>Welcome, Guest!</h2>
      <p>Sign in to access your personalized dashboard.</p>
      <button onclick={() => router.navigate('/login')}>
        Sign In
      </button>
    </div>
  {/snippet}
</RequireAuth>
```

## AdminOnly

Simplified component for admin-only content.

### Basic Usage

```svelte
<script>
  import { AdminOnly } from "$lib/components";
</script>

<AdminOnly>
  <SystemConfiguration />
</AdminOnly>
```

### Silent Admin Check

For optional admin features that shouldn't show a denial message:

```svelte
<AdminOnly silent={true}>
  <AdminQuickActions />
</AdminOnly>
```

### Custom Fallback

```svelte
<AdminOnly>
  <UserManagement />
  {#snippet fallback()}
    <p class="text-gray-500">
      Contact your system administrator for user management access.
    </p>
  {/snippet}
</AdminOnly>
```

## Composing Guards

Guards can be nested for complex permission requirements:

```svelte
<RequireAuth>
  <PermissionGuard capability="inventory.read">
    <InventoryList />
    
    <!-- Only show delete button if user can delete -->
    <PermissionGuard capability="inventory.delete" silent={true}>
      <DeleteButton />
    </PermissionGuard>
  </PermissionGuard>
</RequireAuth>
```

## Programmatic Permission Checks

For non-rendering permission checks, use the auth store directly:

```svelte
<script>
  import { auth, useCapability } from "$lib/auth.svelte";
  
  // Reactive capability check
  const canEdit = useCapability("document.edit");
  
  // One-time check
  function handleAction() {
    if (auth.hasCapability("action.execute")) {
      // Perform action
    }
  }
</script>

<button disabled={!canEdit.value}>
  Edit Document
</button>
```

## Integration with Plugin Widgets

Permission guards work seamlessly with the plugin widget system:

```svelte
<script>
  import { PermissionGuard } from "$lib/components";
  import { WidgetSlot } from "$lib/plugins";
  
  let userCapabilities = $state(['bolt.*', 'inventory.read']);
</script>

<!-- Widget slot already filters by capability -->
<WidgetSlot 
  slot="dashboard" 
  {userCapabilities}
/>

<!-- Additional guard for specific section -->
<PermissionGuard capability="admin.dashboard">
  <WidgetSlot 
    slot="admin-dashboard" 
    {userCapabilities}
  />
</PermissionGuard>
```
