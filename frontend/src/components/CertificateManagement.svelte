<script lang="ts">
  import { get, post, del } from '../lib/api';
  import { showSuccess, showError } from '../lib/toast.svelte';
  import LoadingSpinner from './LoadingSpinner.svelte';

  interface Certificate {
    certname: string;
    status: 'signed' | 'requested' | 'revoked';
    fingerprint: string;
    dns_alt_names?: string[];
    authorization_extensions?: Record<string, unknown>;
    not_before?: string;
    not_after?: string;
  }

  interface BulkOperationResult {
    successful: string[];
    failed: Array<{ certname: string; error: string }>;
    total: number;
    successCount: number;
    failureCount: number;
  }

  // State
  let certificates = $state<Certificate[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let searchQuery = $state('');
  let statusFilter = $state<'all' | 'signed' | 'requested' | 'revoked'>('all');
  let selectedCertnames = $state<Set<string>>(new Set());
  let confirmDialog = $state<{ show: boolean; action: 'sign' | 'revoke'; certname?: string; certnames?: string[] }>({
    show: false,
    action: 'sign'
  });
  let bulkOperationInProgress = $state(false);

  // Derived state
  const filteredCertificates = $derived(() => {
    let result = certificates;

    // Filter by status
    if (statusFilter !== 'all') {
      result = result.filter(cert => cert.status === statusFilter);
    }

    // Filter by search query (case-insensitive, partial match)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(cert =>
        cert.certname.toLowerCase().includes(query) ||
        cert.fingerprint.toLowerCase().includes(query)
      );
    }


    return result;
  });

  const activeFilters = $derived(() => {
    const filters: string[] = [];
    if (statusFilter !== 'all') {
      filters.push(`Status: ${statusFilter}`);
    }
    if (searchQuery.trim()) {
      filters.push(`Search: "${searchQuery}"`);
    }
    return filters;
  });

  const hasSelectedCertificates = $derived(selectedCertnames.size > 0);
  const allFilteredSelected = $derived(
    filteredCertificates().length > 0 &&
    filteredCertificates().every(cert => selectedCertnames.has(cert.certname))
  );

  // Load certificates
  async function loadCertificates(): Promise<void> {
    console.log('[CertificateManagement] Loading certificates...');
    try {
      loading = true;
      error = null;
      console.log('[CertificateManagement] Calling API endpoint: /api/integrations/puppetserver/certificates');
      const data = await get<Certificate[]>('/api/integrations/puppetserver/certificates');
      console.log('[CertificateManagement] Received data:', data);
      certificates = data;
      console.log('[CertificateManagement] Successfully loaded', certificates.length, 'certificates');
    } catch (err) {
      console.error('[CertificateManagement] Error loading certificates:', err);

      // Extract detailed error message
      let errorMessage = 'Failed to load certificates';
      if (err instanceof Error) {
        errorMessage = err.message;

        // Check for specific error patterns and provide helpful guidance
        if (errorMessage.includes('Failed to connect')) {
          errorMessage += '\n\n🔧 Troubleshooting:\n' +
            '• Check that Puppetserver is running and accessible\n' +
            '• Verify the Puppetserver URL in your configuration\n' +
            '• Check network connectivity and firewall rules\n' +
            '• Ensure the Puppetserver port (typically 8140) is open\n' +
            '• If using SSL, verify certificate configuration';
        } else if (errorMessage.includes('timeout')) {
          errorMessage += '\n\n🔧 Troubleshooting:\n' +
            '• Puppetserver may be overloaded or slow to respond\n' +
            '• Try the operation again after a few moments\n' +
            '• Check Puppetserver logs for performance issues';
        }
      }

      error = errorMessage;
      console.log('[CertificateManagement] Error state set to:', error);
      showError('Failed to load certificates', error);
    } finally {
      loading = false;
      console.log('[CertificateManagement] Loading complete. Error:', error, 'Certificates:', certificates.length);
    }
  }

  // Sign certificate
  async function signCertificate(certname: string): Promise<void> {
    try {
      await post(`/api/integrations/puppetserver/certificates/${certname}/sign`);
      showSuccess('Certificate signed', `Successfully signed certificate for ${certname}`);
      await loadCertificates();
      selectedCertnames.delete(certname);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to sign certificate';
      const troubleshooting = getTroubleshootingMessage('sign', message);
      showError('Failed to sign certificate', `${message}\n\n${troubleshooting}`);
    }
  }

  // Revoke certificate
  async function revokeCertificate(certname: string): Promise<void> {
    try {
      await del(`/api/integrations/puppetserver/certificates/${certname}`);
      showSuccess('Certificate revoked', `Successfully revoked certificate for ${certname}`);
      await loadCertificates();
      selectedCertnames.delete(certname);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to revoke certificate';
      const troubleshooting = getTroubleshootingMessage('revoke', message);
      showError('Failed to revoke certificate', `${message}\n\n${troubleshooting}`);
    }
  }

  // Bulk sign certificates
  async function bulkSignCertificates(certnames: string[]): Promise<void> {
    try {
      bulkOperationInProgress = true;
      const result = await post<BulkOperationResult>(
        '/api/integrations/puppetserver/certificates/bulk-sign',
        { certnames }
      );

      if (result.failureCount > 0) {
        const failedDetails = result.failed.map(f => `${f.certname}: ${f.error}`).join('\n');
        const troubleshooting = getTroubleshootingMessage('sign', failedDetails);
        showError(
          `Bulk sign completed with errors`,
          `${result.successCount} succeeded, ${result.failureCount} failed\n\nFailed certificates:\n${failedDetails}\n\n${troubleshooting}`
        );
      } else {
        showSuccess('Bulk sign completed', `Successfully signed ${result.successCount} certificates`);
      }

      await loadCertificates();
      selectedCertnames.clear();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to sign certificates';
      const troubleshooting = getTroubleshootingMessage('sign', message);
      showError('Bulk sign failed', `${message}\n\n${troubleshooting}`);
    } finally {
      bulkOperationInProgress = false;
    }
  }

  // Bulk revoke certificates
  async function bulkRevokeCertificates(certnames: string[]): Promise<void> {
    try {
      bulkOperationInProgress = true;
      const result = await post<BulkOperationResult>(
        '/api/integrations/puppetserver/certificates/bulk-revoke',
        { certnames }
      );

      if (result.failureCount > 0) {
        const failedDetails = result.failed.map(f => `${f.certname}: ${f.error}`).join('\n');
        const troubleshooting = getTroubleshootingMessage('revoke', failedDetails);
        showError(
          `Bulk revoke completed with errors`,
          `${result.successCount} succeeded, ${result.failureCount} failed\n\nFailed certificates:\n${failedDetails}\n\n${troubleshooting}`
        );
      } else {
        showSuccess('Bulk revoke completed', `Successfully revoked ${result.successCount} certificates`);
      }

      await loadCertificates();
      selectedCertnames.clear();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to revoke certificates';
      const troubleshooting = getTroubleshootingMessage('revoke', message);
      showError('Bulk revoke failed', `${message}\n\n${troubleshooting}`);
    } finally {
      bulkOperationInProgress = false;
    }
  }

  // Handle confirmation dialog
  function showConfirmDialog(action: 'sign' | 'revoke', certname?: string, certnames?: string[]): void {
    confirmDialog = { show: true, action, certname, certnames };
  }

  function closeConfirmDialog(): void {
    confirmDialog = { show: false, action: 'sign' };
  }

  async function handleConfirm(): Promise<void> {
    if (confirmDialog.certname) {
      if (confirmDialog.action === 'sign') {
        await signCertificate(confirmDialog.certname);
      } else {
        await revokeCertificate(confirmDialog.certname);
      }
    } else if (confirmDialog.certnames) {
      if (confirmDialog.action === 'sign') {
        await bulkSignCertificates(confirmDialog.certnames);
      } else {
        await bulkRevokeCertificates(confirmDialog.certnames);
      }
    }
    closeConfirmDialog();
  }

  // Toggle certificate selection
  function toggleCertificate(certname: string): void {
    if (selectedCertnames.has(certname)) {
      selectedCertnames.delete(certname);
    } else {
      selectedCertnames.add(certname);
    }
    selectedCertnames = new Set(selectedCertnames);
  }

  // Toggle all filtered certificates
  function toggleAllFiltered(): void {
    if (allFilteredSelected) {
      filteredCertificates().forEach(cert => selectedCertnames.delete(cert.certname));
    } else {
      filteredCertificates().forEach(cert => selectedCertnames.add(cert.certname));
    }
    selectedCertnames = new Set(selectedCertnames);
  }

  // Clear filter
  function clearFilter(filterType: 'status' | 'search'): void {
    if (filterType === 'status') {
      statusFilter = 'all';
    } else {
      searchQuery = '';
    }
  }

  // Format date
  function formatDate(dateString?: string): string {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return dateString;
    }
  }

  // Get status badge color
  function getStatusColor(status: 'signed' | 'requested' | 'revoked'): string {
    switch (status) {
      case 'signed':
        return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400';
      case 'requested':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400';
      case 'revoked':
        return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400';
    }
  }

  // Get troubleshooting message based on error
  function getTroubleshootingMessage(operation: 'sign' | 'revoke', errorMessage: string): string {
    const lowerError = errorMessage.toLowerCase();

    // Connection errors
    if (lowerError.includes('connection') || lowerError.includes('econnrefused') || lowerError.includes('network')) {
      return '🔧 Troubleshooting:\n' +
        '• Check that Puppetserver is running and accessible\n' +
        '• Verify the Puppetserver URL in your configuration\n' +
        '• Check network connectivity and firewall rules\n' +
        '• Ensure the Puppetserver port (typically 8140) is open';
    }

    // Authentication errors
    if (lowerError.includes('auth') || lowerError.includes('unauthorized') || lowerError.includes('forbidden') || lowerError.includes('401') || lowerError.includes('403')) {
      return '🔧 Troubleshooting:\n' +
        '• Verify your authentication credentials are correct\n' +
        '• Check that your token or certificate has not expired\n' +
        '• Ensure you have the necessary permissions for certificate operations\n' +
        '• Review Puppetserver authentication configuration';
    }

    // Certificate already signed
    if (operation === 'sign' && (lowerError.includes('already signed') || lowerError.includes('duplicate'))) {
      return '🔧 Troubleshooting:\n' +
        '• This certificate has already been signed\n' +
        '• Refresh the certificate list to see the current status\n' +
        '• If you need to re-sign, revoke the certificate first';
    }

    // Certificate not found
    if (lowerError.includes('not found') || lowerError.includes('404')) {
      return '🔧 Troubleshooting:\n' +
        '• The certificate may have been removed or never existed\n' +
        '• Refresh the certificate list to see current certificates\n' +
        '• Verify the certname is correct';
    }

    // Invalid certname
    if (lowerError.includes('invalid') && lowerError.includes('certname')) {
      return '🔧 Troubleshooting:\n' +
        '• The certname format is invalid\n' +
        '• Certnames should be valid DNS names (e.g., node.example.com)\n' +
        '• Check for special characters or spaces in the certname';
    }

    // Timeout errors
    if (lowerError.includes('timeout') || lowerError.includes('timed out')) {
      return '🔧 Troubleshooting:\n' +
        '• Puppetserver may be overloaded or slow to respond\n' +
        '• Try the operation again after a few moments\n' +
        '• Check Puppetserver logs for performance issues\n' +
        '• Consider increasing timeout settings if this persists';
    }

    // SSL/TLS errors
    if (lowerError.includes('ssl') || lowerError.includes('tls') || lowerError.includes('certificate')) {
      return '🔧 Troubleshooting:\n' +
        '• Verify SSL certificate configuration\n' +
        '• Check that CA certificates are properly configured\n' +
        '• Ensure certificate validation settings are correct\n' +
        '• Review Puppetserver SSL/TLS configuration';
    }

    // Generic troubleshooting
    return '🔧 Troubleshooting:\n' +
      '• Check Puppetserver logs for detailed error information\n' +
      '• Verify Puppetserver is running and accessible\n' +
      '• Ensure you have the necessary permissions\n' +
      '• Try refreshing the certificate list and retrying the operation';
  }

  // Load certificates on mount
  $effect(() => {
    loadCertificates();
  });
</script>

<div class="certificate-management">
  <!-- Header -->
  <div class="mb-6">
    <h2 class="text-2xl font-bold text-gray-900 dark:text-white">Certificate Management</h2>
    <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
      Manage Puppetserver CA certificates
    </p>
  </div>

  <!-- Search and Filter Bar -->
  <div class="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
    <!-- Search -->
    <div class="flex-1">
      <label for="search" class="sr-only">Search certificates</label>
      <div class="relative">
        <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
          <svg class="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <input
          id="search"
          type="text"
          bind:value={searchQuery}
          placeholder="Search by certname or fingerprint..."
          class="block w-full rounded-md border border-gray-300 bg-white py-2 pl-10 pr-3 text-sm placeholder-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-500"
        />
      </div>
    </div>

    <!-- Status Filter -->
    <div class="flex items-center gap-2">
      <label for="status-filter" class="text-sm font-medium text-gray-700 dark:text-gray-300">
        Status:
      </label>
      <select
        id="status-filter"
        bind:value={statusFilter}
        class="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
      >
        <option value="all">All</option>
        <option value="signed">Signed</option>
        <option value="requested">Requested</option>
        <option value="revoked">Revoked</option>
      </select>
    </div>

    <!-- Refresh Button -->
    <button
      type="button"
      onclick={loadCertificates}
      disabled={loading}
      class="inline-flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600"
    >
      <svg class="h-4 w-4 {loading ? 'animate-spin' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
      Refresh
    </button>
  </div>

  <!-- Active Filters -->
  {#if activeFilters().length > 0}
    <div class="mb-4 flex flex-wrap items-center gap-2">
      <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Active filters:</span>
      {#each activeFilters() as filter}
        <span class="inline-flex items-center gap-1 rounded-full bg-primary-100 px-3 py-1 text-sm text-primary-800 dark:bg-primary-900/20 dark:text-primary-400">
          {filter}
          <button
            type="button"
            onclick={() => clearFilter(filter.startsWith('Status') ? 'status' : 'search')}
            aria-label="Clear filter"
            class="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-primary-200 dark:hover:bg-primary-800"
          >
            <svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </span>
      {/each}
    </div>
  {/if}

  <!-- Bulk Actions -->
  {#if hasSelectedCertificates}
    <div class="mb-4 rounded-md bg-primary-50 p-4 dark:bg-primary-900/10">
      <div class="flex items-center justify-between">
        <span class="text-sm font-medium text-primary-900 dark:text-primary-300">
          {selectedCertnames.size} certificate{selectedCertnames.size !== 1 ? 's' : ''} selected
        </span>
        <div class="flex gap-2">
          <button
            type="button"
            onclick={() => showConfirmDialog('sign', undefined, Array.from(selectedCertnames))}
            disabled={bulkOperationInProgress}
            class="inline-flex items-center gap-2 rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {#if bulkOperationInProgress}
              <svg class="h-4 w-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            {:else}
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            {/if}
            Sign Selected
          </button>
          <button
            type="button"
            onclick={() => showConfirmDialog('revoke', undefined, Array.from(selectedCertnames))}
            disabled={bulkOperationInProgress}
            class="inline-flex items-center gap-2 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {#if bulkOperationInProgress}
              <svg class="h-4 w-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            {:else}
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            {/if}
            Revoke Selected
          </button>
        </div>
      </div>
      {#if bulkOperationInProgress}
        <div class="mt-3">
          <div class="flex items-center gap-2 text-sm text-primary-700 dark:text-primary-400">
            <svg class="h-4 w-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>Processing certificates... Please wait.</span>
          </div>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Loading State -->
  {#if loading && certificates.length === 0}
    <div class="flex items-center justify-center py-12">
      <LoadingSpinner />
    </div>
  {:else if error && certificates.length === 0}
    <!-- Error State -->
    <div class="rounded-md bg-red-50 p-4 dark:bg-red-900/10">
      <div class="flex">
        <svg class="h-5 w-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div class="ml-3 flex-1">
          <h3 class="text-sm font-medium text-red-800 dark:text-red-400">Error loading certificates</h3>
          <p class="mt-1 text-sm text-red-700 dark:text-red-300">{error}</p>
          <div class="mt-3">
            <button
              type="button"
              onclick={loadCertificates}
              class="inline-flex items-center gap-2 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
            >
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Retry
            </button>
          </div>
        </div>
      </div>
    </div>
  {:else if filteredCertificates().length === 0}
    <!-- Empty State -->
    <div class="rounded-md bg-gray-50 p-8 text-center dark:bg-gray-800">
      <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <h3 class="mt-2 text-sm font-medium text-gray-900 dark:text-white">No certificates found</h3>
      <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
        {activeFilters().length > 0 ? 'Try adjusting your filters' : 'No certificates available'}
      </p>
    </div>
  {:else}
    <!-- Certificate Table -->
    <div class="overflow-hidden rounded-lg border border-gray-200 bg-white shadow dark:border-gray-700 dark:bg-gray-800">
      <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
        <thead class="bg-gray-50 dark:bg-gray-900">
          <tr>
            <th scope="col" class="w-12 px-4 py-3">
              <input
                type="checkbox"
                checked={allFilteredSelected}
                onchange={toggleAllFiltered}
                class="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700"
              />
            </th>
            <th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Certname
            </th>
            <th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Status
            </th>
            <th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Fingerprint
            </th>
            <th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Expiration
            </th>
            <th scope="col" class="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Actions
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
          {#each filteredCertificates() as cert (cert.certname)}
            <tr class="hover:bg-gray-50 dark:hover:bg-gray-700">
              <td class="px-4 py-4">
                <input
                  type="checkbox"
                  checked={selectedCertnames.has(cert.certname)}
                  onchange={() => toggleCertificate(cert.certname)}
                  class="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700"
                />
              </td>
              <td class="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">
                {cert.certname}
              </td>
              <td class="whitespace-nowrap px-6 py-4">
                <span class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium {getStatusColor(cert.status)}">
                  {cert.status}
                </span>
              </td>
              <td class="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                <code class="rounded bg-gray-100 px-2 py-1 text-xs dark:bg-gray-700">
                  {cert.fingerprint.substring(0, 16)}...
                </code>
              </td>
              <td class="whitespace-nowrap px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                {formatDate(cert.not_after)}
              </td>
              <td class="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                <div class="flex justify-end gap-2">
                  {#if cert.status === 'requested'}
                    <button
                      type="button"
                      onclick={() => showConfirmDialog('sign', cert.certname)}
                      class="inline-flex items-center gap-1 rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
                    >
                      <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Sign
                    </button>
                  {/if}
                  {#if cert.status === 'signed'}
                    <button
                      type="button"
                      onclick={() => showConfirmDialog('revoke', cert.certname)}
                      class="inline-flex items-center gap-1 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
                    >
                      <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      Revoke
                    </button>
                  {/if}
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <!-- Results Count -->
    <div class="mt-4 text-sm text-gray-600 dark:text-gray-400">
      Showing {filteredCertificates().length} of {certificates.length} certificates
    </div>
  {/if}

  <!-- Confirmation Dialog -->
  {#if confirmDialog.show}
    <div class="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      <div class="flex min-h-screen items-end justify-center px-4 pb-20 pt-4 text-center sm:block sm:p-0">
        <!-- Background overlay -->
        <button
          type="button"
          class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
          onclick={closeConfirmDialog}
          aria-label="Close dialog"
        ></button>

        <!-- Center modal -->
        <span class="hidden sm:inline-block sm:h-screen sm:align-middle" aria-hidden="true">&#8203;</span>

        <div class="inline-block transform overflow-hidden rounded-lg bg-white text-left align-bottom shadow-xl transition-all dark:bg-gray-800 sm:my-8 sm:w-full sm:max-w-lg sm:align-middle">
          <div class="bg-white px-4 pb-4 pt-5 dark:bg-gray-800 sm:p-6 sm:pb-4">
            <div class="sm:flex sm:items-start">
              <div class="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full {confirmDialog.action === 'sign' ? 'bg-green-100 dark:bg-green-900/20' : 'bg-red-100 dark:bg-red-900/20'} sm:mx-0 sm:h-10 sm:w-10">
                {#if confirmDialog.action === 'sign'}
                  <svg class="h-6 w-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                {:else}
                  <svg class="h-6 w-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                {/if}
              </div>
              <div class="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left">
                <h3 class="text-lg font-medium leading-6 text-gray-900 dark:text-white" id="modal-title">
                  {confirmDialog.action === 'sign' ? 'Sign Certificate' : 'Revoke Certificate'}
                </h3>
                <div class="mt-2">
                  <div class="text-sm text-gray-500 dark:text-gray-400">
                    {#if confirmDialog.certname}
                      <p>Are you sure you want to {confirmDialog.action} the certificate for <strong>{confirmDialog.certname}</strong>?</p>
                    {:else if confirmDialog.certnames}
                      <p>Are you sure you want to {confirmDialog.action} {confirmDialog.certnames.length} certificate{confirmDialog.certnames.length !== 1 ? 's' : ''}?</p>
                      <ul class="mt-2 max-h-32 overflow-y-auto rounded border border-gray-200 bg-gray-50 p-2 text-xs dark:border-gray-700 dark:bg-gray-900">
                        {#each confirmDialog.certnames as certname}
                          <li class="py-1">{certname}</li>
                        {/each}
                      </ul>
                    {/if}
                  </div>
                  {#if confirmDialog.action === 'revoke'}
                    <p class="mt-2 text-sm font-medium text-red-600 dark:text-red-400">
                      This action cannot be undone.
                    </p>
                  {/if}
                </div>
              </div>
            </div>
          </div>
          <div class="bg-gray-50 px-4 py-3 dark:bg-gray-900 sm:flex sm:flex-row-reverse sm:px-6">
            <button
              type="button"
              onclick={handleConfirm}
              class="inline-flex w-full justify-center rounded-md px-4 py-2 text-base font-medium text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 sm:ml-3 sm:w-auto sm:text-sm {confirmDialog.action === 'sign' ? 'bg-green-600 hover:bg-green-700 focus:ring-green-500' : 'bg-red-600 hover:bg-red-700 focus:ring-red-500'}"
            >
              {confirmDialog.action === 'sign' ? 'Sign' : 'Revoke'}
            </button>
            <button
              type="button"
              onclick={closeConfirmDialog}
              class="mt-3 inline-flex w-full justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-base font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 sm:ml-0 sm:mt-0 sm:w-auto sm:text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>
