<script lang="ts">
  import { onMount } from 'svelte';
  import { authManager } from '../lib/auth.svelte';
  import { authProviders } from '../lib/authProviders.svelte';
  import { get } from '../lib/api';
  import {
    searchLdapGroups, listLdapMappings, createLdapMapping, updateLdapMapping, removeLdapMapping, diagnoseLdap,
    type LdapGroup, type LdapMapping, type LdapDiagnostics,
  } from '../lib/ldapApi';

  let { roleId = null }: { roleId?: string | null } = $props();
  const allowed = $derived(authManager.isAdmin && authManager.hasPermission('rbac', 'admin'));
  let mappings = $state<LdapMapping[]>([]);
  let roles = $state<{ id: string; name: string }[]>([]);
  let groups = $state<LdapGroup[]>([]);
  let query = $state('');
  let searchedQuery = $state('');
  let searched = $state(false);
  let cursor = $state<string | null>(null);
  let selectedGroup = $state('');
  let selectedRole = $state('');
  let username = $state('');
  let selectedGroups = $state<string[]>([]);
  let report = $state<LdapDiagnostics | null>(null);
  let busy = $state(false);
  let error = $state('');
  let notice = $state('');
  const visibleMappings = $derived(roleId ? mappings.filter(m => m.roleId === roleId) : mappings);
  const diagnosticGroups = $derived(mappings.filter((m, i, all) =>
    m.enabled && all.findIndex(other => other.enabled && other.groupSubject === m.groupSubject) === i));

  onMount(() => { if (allowed) void run(load); });

  async function load(): Promise<void> {
    mappings = (await listLdapMappings()).items;
    if (!roleId) {
      const items: { id: string; name: string }[] = [];
      let page = 1;
      let totalPages = 1;
      do {
        const response = await get<{ roles: { id: string; name: string }[]; pagination: { totalPages: number } }>(
          '/api/roles?page=' + String(page) + '&limit=100', { maxRetries: 0 });
        items.push(...response.roles);
        totalPages = response.pagination.totalPages;
        page++;
      } while (page <= totalPages);
      roles = items;
    }
    selectedGroups = selectedGroups.filter(subject => mappings.some(m => m.enabled && m.groupSubject === subject));
  }

  async function run(work: () => Promise<void>): Promise<void> {
    if (!allowed || busy) return;
    busy = true;
    error = '';
    notice = '';
    try { await work(); }
    catch (e) { error = e instanceof Error ? e.message : 'Directory operation failed'; }
    finally { busy = false; }
  }

  async function search(more = false): Promise<void> {
    if (!more) {
      groups = [];
      selectedGroup = '';
      cursor = null;
      searched = false;
      searchedQuery = query;
    }
    const response = await searchLdapGroups(searchedQuery, more ? cursor ?? undefined : undefined);
    groups = more ? [...groups, ...response.items] : response.items;
    cursor = response.nextCursor;
    searched = true;
  }

  async function create(): Promise<void> {
    const targetRole = roleId ?? selectedRole;
    if (!selectedGroup || !targetRole) return;
    await createLdapMapping(selectedGroup, targetRole);
    selectedGroup = '';
    await load();
    notice = 'Directory mapping created. Membership is verified at the next LDAP validation.';
  }

  async function change(mapping: LdapMapping, input: { roleId?: string; enabled?: boolean }): Promise<void> {
    await updateLdapMapping(mapping.id, input);
    await load();
    notice = 'Directory mapping updated.';
  }

  async function remove(mapping: LdapMapping): Promise<void> {
    if (!confirm('Remove the mapping from "' + mapping.groupName + '" to "' + mapping.roleName + '"? Its grants will be withdrawn.')) return;
    await removeLdapMapping(mapping.id);
    await load();
    notice = 'Directory mapping removed.';
  }

  async function diagnose(): Promise<void> {
    report = null;
    const input = username ? { username, ...(selectedGroups.length ? { groupSubjects: selectedGroups } : {}) } : {};
    report = await diagnoseLdap(input);
  }
</script>

{#if allowed}
  <section aria-label="LDAP administration" class="my-6 space-y-5 rounded-lg bg-white dark:bg-gray-800 p-5 shadow text-gray-900 dark:text-white">
    <h2 class="text-lg font-semibold">{authProviders.ldap?.name ?? 'LDAP'}: directory access</h2>
    <p class="text-sm">Map selected directory groups directly to roles. Searching does not import users. Stored mappings remain available during directory outages.</p>
    {#if error}<p role="alert" class="text-red-700 dark:text-red-300">{error}</p>{/if}
    {#if notice}<p role="status" class="text-green-700 dark:text-green-300">{notice}</p>{/if}
    <button class="inline-flex items-center justify-center rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm font-medium bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed" type="button" disabled={busy} onclick={() => run(load)}>Reload mappings</button>
    <form onsubmit={(event) => { event.preventDefault(); void run(() => search()); }} class="space-y-2">
      <label class="block" for={'ldap-query-' + (roleId ?? 'all')}>Search directory groups</label>
      <input id={'ldap-query-' + (roleId ?? 'all')} bind:value={query} required maxlength="1024" disabled={busy}
        class="w-full rounded border p-2 bg-white dark:bg-gray-900" />
      <button class="inline-flex items-center justify-center rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm font-medium bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed" type="submit" disabled={busy || !query}>Search groups</button>
    </form>
    {#if searched && groups.length === 0}<p>No directory groups found.</p>{/if}
    {#if groups.length}
      <form onsubmit={(event) => { event.preventDefault(); void run(create); }} class="space-y-2">
        <label class="block" for={'ldap-group-' + (roleId ?? 'all')}>Directory group</label>
        <select id={'ldap-group-' + (roleId ?? 'all')} bind:value={selectedGroup} disabled={busy} required class="w-full rounded border p-2 bg-white dark:bg-gray-900">
          <option value="">Select a group</option>
          {#each groups as group (group.subject)}<option value={group.subject}>{group.name} ({group.dn})</option>{/each}
        </select>
        {#if !roleId}
          <label class="block" for="ldap-role">Pabawi role</label>
          <select id="ldap-role" bind:value={selectedRole} disabled={busy} required class="w-full rounded border p-2 bg-white dark:bg-gray-900">
            <option value="">Select a role</option>
            {#each roles as role (role.id)}<option value={role.id}>{role.name}</option>{/each}
          </select>
        {/if}
        <button class="inline-flex items-center justify-center rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm font-medium bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed" type="submit" disabled={busy || !selectedGroup || !(roleId ?? selectedRole)}>Create mapping</button>
      </form>
    {/if}
    {#if cursor}<button class="inline-flex items-center justify-center rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm font-medium bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed" type="button" disabled={busy} onclick={() => run(() => search(true))}>More groups</button>{/if}

    <h3 class="font-medium">Stored group mappings</h3>
    {#if visibleMappings.length === 0}<p>No directory mappings for this role selection.</p>{/if}
    <ul class="space-y-3">
      {#each visibleMappings as mapping (mapping.id)}
        <li class="rounded border dark:border-gray-600 p-3 space-y-2">
          <p>{mapping.groupName} to {mapping.roleName}: {mapping.enabled ? 'Enabled' : 'Disabled'}</p>
          <p class="text-xs break-all">LDAP / {mapping.directoryId} / {mapping.groupSubject}<br />{mapping.groupDn}</p>
          {#if !roleId}
            <label class="block">Mapped role
              <select value={mapping.roleId} disabled={busy} onchange={(e) => run(() => change(mapping, { roleId: e.currentTarget.value }))}
                class="rounded border p-2 bg-white dark:bg-gray-900">
                {#each roles as role (role.id)}<option value={role.id}>{role.name}</option>{/each}
              </select>
            </label>
          {/if}
          <div class="flex gap-4">
            <button class="inline-flex items-center justify-center rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm font-medium bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed" type="button" disabled={busy} onclick={() => run(() => change(mapping, { enabled: !mapping.enabled }))}>
              {mapping.enabled ? 'Disable' : 'Enable'} mapping for {mapping.groupName}
            </button>
            <button class="inline-flex items-center justify-center rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm font-medium bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed" type="button" disabled={busy} onclick={() => run(() => remove(mapping))}>Remove mapping for {mapping.groupName}</button>
          </div>
        </li>
      {/each}
    </ul>

    <h3 class="font-medium">Restricted directory diagnostics</h3>
    <p class="text-sm">Uses the configured lookup account. This does not verify a user password or sign the user in.</p>
    <form onsubmit={(event) => { event.preventDefault(); void run(diagnose); }} class="space-y-2">
      <label class="block" for={'ldap-diagnostic-user-' + (roleId ?? 'all')}>Exact directory username (optional)</label>
      <input id={'ldap-diagnostic-user-' + (roleId ?? 'all')} bind:value={username} maxlength="1024" disabled={busy}
        class="w-full rounded border p-2 bg-white dark:bg-gray-900" />
      <fieldset disabled={busy || !username}>
        <legend>Check membership in enabled mapped groups (up to 20)</legend>
        {#each diagnosticGroups as mapping (mapping.groupSubject)}
          <label class="block">
            <input type="checkbox" bind:group={selectedGroups} value={mapping.groupSubject}
              disabled={!selectedGroups.includes(mapping.groupSubject) && selectedGroups.length >= 20} />
            {mapping.groupName}
          </label>
        {/each}
      </fieldset>
      <button class="inline-flex items-center justify-center rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm font-medium bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed" type="submit" disabled={busy}>Run directory diagnostics</button>
    </form>
    {#if busy}<p role="status">Directory operation in progress...</p>{/if}
    {#if report}
      <div role="status" class="rounded-md bg-gray-50 dark:bg-gray-900 p-3 text-sm space-y-2">
        <p>Lookup diagnostic result. No password authentication performed.</p>
        <ul>
          {#each report.stages as stage}
            <li class:text-red-600={stage.status === 'failed'} class:text-green-700={stage.status === 'passed'}>{stage.stage}: {stage.status} ({stage.durationMs} ms){stage.code ? ', ' + stage.code : ''}</li>
          {/each}
        </ul>
        {#if report.groupSubjects}
          <p>Matched selected groups: {report.groupSubjects.length}</p>
          <ul>{#each report.groupSubjects as subject}<li>{diagnosticGroups.find(m => m.groupSubject === subject)?.groupName ?? subject}</li>{/each}</ul>
        {/if}
      </div>
    {/if}
  </section>
{/if}
