<script lang="ts">
  import {
    getAWSRegions,
    getAWSInstanceTypes,
    getAWSAMIs,
    getAWSVPCs,
    getAWSSubnets,
    getAWSSecurityGroups,
    getAWSKeyPairs,
    provisionAWSInstance,
    type AWSInstanceTypeInfo,
    type AWSAMIInfo,
    type AWSVPCInfo,
    type AWSSubnetInfo,
    type AWSSecurityGroupInfo,
    type AWSKeyPairInfo,
    type AWSProvisionParams,
  } from '../lib/api';
  import { showSuccess, showError } from '../lib/toast.svelte';
  import { logger } from '../lib/logger.svelte';
  import { validateRequired } from '../lib/validation';

  /**
   * AWSProvisionForm Component
   *
   * EC2 provisioning form with cascading selectors:
   * Region → Instance Types (filterable by vCPU/RAM), AMIs (searchable), VPCs → Subnets, Security Groups
   *
   * Validates Requirements: 10.1, 13.1-13.7
   */

  // Form data
  let selectedRegion = $state('');
  let selectedInstanceType = $state('');
  let selectedAMI = $state('');
  let selectedVPC = $state('');
  let selectedSubnet = $state('');
  let selectedSecurityGroups = $state<string[]>([]);
  let selectedKeyPair = $state('');
  let instanceName = $state('');

  let validationErrors = $state<Record<string, string>>({});
  let submitting = $state(false);

  // Dynamic data from AWS API
  let regions = $state<string[]>([]);
  let instanceTypes = $state<AWSInstanceTypeInfo[]>([]);
  let amis = $state<AWSAMIInfo[]>([]);
  let vpcs = $state<AWSVPCInfo[]>([]);
  let subnets = $state<AWSSubnetInfo[]>([]);
  let securityGroups = $state<AWSSecurityGroupInfo[]>([]);
  let keyPairs = $state<AWSKeyPairInfo[]>([]);

  // Loading states
  let loadingRegions = $state(false);
  let loadingInstanceTypes = $state(false);
  let loadingAMIs = $state(false);
  let loadingVPCs = $state(false);
  let loadingSubnets = $state(false);
  let loadingSecurityGroups = $state(false);
  let loadingKeyPairs = $state(false);

  // Instance type filter state
  let minVCpus = $state(0);
  let maxVCpus = $state(0);
  let minRAMGiB = $state(0);
  let maxRAMGiB = $state(0);
  let filterArchitecture = $state('');

  // Derived: unique vCPU and RAM values for range options
  let vcpuOptions = $derived.by(() => {
    const vals = [...new Set(instanceTypes.map(it => it.vCpus))].sort((a, b) => a - b);
    return vals;
  });

  let ramGiBOptions = $derived.by(() => {
    const vals = [...new Set(instanceTypes.map(it => Math.round(it.memoryMiB / 1024)))].sort((a, b) => a - b);
    return vals;
  });

  let architectureOptions = $derived.by(() => {
    return [...new Set(instanceTypes.map(it => it.architecture))].sort();
  });

  // Derived: filtered instance types based on vCPU/RAM/arch selections
  let filteredInstanceTypes = $derived.by(() => {
    return instanceTypes.filter(it => {
      const ramGiB = Math.round(it.memoryMiB / 1024);
      if (minVCpus > 0 && it.vCpus < minVCpus) return false;
      if (maxVCpus > 0 && it.vCpus > maxVCpus) return false;
      if (minRAMGiB > 0 && ramGiB < minRAMGiB) return false;
      if (maxRAMGiB > 0 && ramGiB > maxRAMGiB) return false;
      if (filterArchitecture && it.architecture !== filterArchitecture) return false;
      return true;
    }).sort((a, b) => {
      // Sort by vCPU then RAM
      if (a.vCpus !== b.vCpus) return a.vCpus - b.vCpus;
      return a.memoryMiB - b.memoryMiB;
    });
  });

  // AMI search state
  let amiSearchQuery = $state('');
  let amiSearchTimeout: ReturnType<typeof setTimeout> | null = null;
  let selectedAMIInfo = $state<AWSAMIInfo | null>(null);
  let showAMIResults = $state(false);

  let isFormValid = $derived.by(() => {
    if (!selectedRegion || !selectedAMI) return false;
    return Object.keys(validationErrors).length === 0;
  });

  async function loadRegions(): Promise<void> {
    loadingRegions = true;
    try {
      regions = await getAWSRegions();
    } catch (e) {
      logger.error('AWSProvisionForm', 'loadRegions', 'Failed to fetch regions', e as Error);
      regions = [];
    } finally {
      loadingRegions = false;
    }
  }

  // Load regions on mount
  loadRegions();

  /**
   * Cascade: when region changes, load instance types, AMIs, VPCs, key pairs
   * and reset dependent selections
   */
  async function onRegionChange(region: string): Promise<void> {
    selectedRegion = region;
    // Reset dependent fields
    selectedInstanceType = '';
    selectedAMI = '';
    selectedAMIInfo = null;
    amiSearchQuery = '';
    amis = [];
    selectedVPC = '';
    selectedSubnet = '';
    selectedSecurityGroups = [];
    selectedKeyPair = '';
    instanceTypes = [];
    vpcs = [];
    subnets = [];
    securityGroups = [];
    keyPairs = [];
    // Reset filters
    minVCpus = 0;
    maxVCpus = 0;
    minRAMGiB = 0;
    maxRAMGiB = 0;
    filterArchitecture = '';

    if (!region) return;

    loadingInstanceTypes = true;
    loadingVPCs = true;
    loadingKeyPairs = true;

    const results = await Promise.allSettled([
      getAWSInstanceTypes(region),
      getAWSVPCs(region),
      getAWSKeyPairs(region),
    ]);

    instanceTypes = results[0].status === 'fulfilled' ? results[0].value : [];
    vpcs = results[1].status === 'fulfilled' ? results[1].value : [];
    keyPairs = results[2].status === 'fulfilled' ? results[2].value : [];

    if (results[0].status === 'rejected') logger.error('AWSProvisionForm', 'onRegionChange', 'Failed to fetch instance types', results[0].reason as Error);
    if (results[1].status === 'rejected') logger.error('AWSProvisionForm', 'onRegionChange', 'Failed to fetch VPCs', results[1].reason as Error);
    if (results[2].status === 'rejected') logger.error('AWSProvisionForm', 'onRegionChange', 'Failed to fetch key pairs', results[2].reason as Error);

    loadingInstanceTypes = false;
    loadingVPCs = false;
    loadingKeyPairs = false;
  }

  /**
   * Debounced AMI search — calls backend with search query
   */
  function onAMISearchInput(query: string): void {
    amiSearchQuery = query;
    selectedAMI = '';
    selectedAMIInfo = null;

    if (amiSearchTimeout) clearTimeout(amiSearchTimeout);

    if (!query || query.length < 2 || !selectedRegion) {
      amis = [];
      showAMIResults = false;
      return;
    }

    showAMIResults = true;
    loadingAMIs = true;

    amiSearchTimeout = setTimeout(async () => {
      try {
        amis = await getAWSAMIs(selectedRegion, query);
      } catch (e) {
        logger.error('AWSProvisionForm', 'onAMISearchInput', 'Failed to search AMIs', e as Error);
        amis = [];
      } finally {
        loadingAMIs = false;
      }
    }, 400);
  }

  function selectAMI(ami: AWSAMIInfo): void {
    selectedAMI = ami.imageId;
    selectedAMIInfo = ami;
    amiSearchQuery = ami.name || ami.imageId;
    showAMIResults = false;
    validateField('ami');
  }

  function clearAMISelection(): void {
    selectedAMI = '';
    selectedAMIInfo = null;
    amiSearchQuery = '';
    amis = [];
    showAMIResults = false;
  }

  /**
   * Cascade: when VPC changes, load subnets and security groups
   */
  async function onVPCChange(vpcId: string): Promise<void> {
    selectedVPC = vpcId;
    selectedSubnet = '';
    selectedSecurityGroups = [];
    subnets = [];
    securityGroups = [];

    if (!vpcId || !selectedRegion) return;

    loadingSubnets = true;
    loadingSecurityGroups = true;

    const results = await Promise.allSettled([
      getAWSSubnets(selectedRegion, vpcId),
      getAWSSecurityGroups(selectedRegion, vpcId),
    ]);

    subnets = results[0].status === 'fulfilled' ? results[0].value : [];
    securityGroups = results[1].status === 'fulfilled' ? results[1].value : [];

    if (results[0].status === 'rejected') logger.error('AWSProvisionForm', 'onVPCChange', 'Failed to fetch subnets', results[0].reason as Error);
    if (results[1].status === 'rejected') logger.error('AWSProvisionForm', 'onVPCChange', 'Failed to fetch security groups', results[1].reason as Error);

    loadingSubnets = false;
    loadingSecurityGroups = false;
  }

  function toggleSecurityGroup(groupId: string): void {
    if (selectedSecurityGroups.includes(groupId)) {
      selectedSecurityGroups = selectedSecurityGroups.filter(id => id !== groupId);
    } else {
      selectedSecurityGroups = [...selectedSecurityGroups, groupId];
    }
  }

  function validateField(fieldName: string): void {
    let error: string | null = null;

    switch (fieldName) {
      case 'region':
        error = validateRequired(selectedRegion, 'Region');
        break;
      case 'ami':
        error = validateRequired(selectedAMI, 'AMI');
        break;
    }

    if (error) {
      validationErrors[fieldName] = error;
    } else {
      delete validationErrors[fieldName];
    }
    validationErrors = { ...validationErrors };
  }

  function getVPCDisplayName(vpc: AWSVPCInfo): string {
    const nameTag = vpc.tags?.Name || vpc.tags?.name;
    return nameTag ? `${nameTag} (${vpc.vpcId})` : `${vpc.vpcId} — ${vpc.cidrBlock}`;
  }

  function getSubnetDisplayName(subnet: AWSSubnetInfo): string {
    const nameTag = subnet.tags?.Name || subnet.tags?.name;
    return nameTag
      ? `${nameTag} (${subnet.subnetId} — ${subnet.availabilityZone})`
      : `${subnet.subnetId} — ${subnet.availabilityZone} (${subnet.cidrBlock})`;
  }

  function getSGDisplayName(sg: AWSSecurityGroupInfo): string {
    return `${sg.groupName} (${sg.groupId})`;
  }

  async function handleSubmit(event: Event): Promise<void> {
    event.preventDefault();
    submitting = true;

    try {
      const params: AWSProvisionParams = {
        imageId: selectedAMI,
        region: selectedRegion,
        instanceType: selectedInstanceType || undefined,
        keyName: selectedKeyPair || undefined,
        securityGroupIds: selectedSecurityGroups.length > 0 ? selectedSecurityGroups : undefined,
        subnetId: selectedSubnet || undefined,
        name: instanceName || undefined,
      };

      logger.info('AWSProvisionForm', 'handleSubmit', 'Submitting EC2 provision request', {
        region: params.region,
        imageId: params.imageId,
        instanceType: params.instanceType,
      });

      const response = await provisionAWSInstance(params);

      if (response.result.status === 'success') {
        showSuccess('EC2 instance launched successfully', response.result.output ? String(response.result.output) : undefined);
        logger.info('AWSProvisionForm', 'handleSubmit', 'EC2 provision succeeded');
        // Reset form
        selectedInstanceType = '';
        selectedAMI = '';
        selectedAMIInfo = null;
        amiSearchQuery = '';
        amis = [];
        selectedVPC = '';
        selectedSubnet = '';
        selectedSecurityGroups = [];
        selectedKeyPair = '';
        instanceName = '';
        validationErrors = {};
        minVCpus = 0;
        maxVCpus = 0;
        minRAMGiB = 0;
        maxRAMGiB = 0;
        filterArchitecture = '';
      } else {
        const errorMessage = response.result.error || 'Failed to launch EC2 instance';
        showError('EC2 provisioning failed', errorMessage);
        logger.error('AWSProvisionForm', 'handleSubmit', 'EC2 provision failed', new Error(errorMessage));
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      showError('EC2 provisioning failed', errorMessage);
      logger.error('AWSProvisionForm', 'handleSubmit', 'EC2 provision exception', error as Error);
    } finally {
      submitting = false;
    }
  }
</script>

<form onsubmit={handleSubmit} class="space-y-6">
  <div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
    <!-- Region -->
    <div>
      <label for="aws-region" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
        Region <span class="text-red-500">*</span>
      </label>
      <select
        id="aws-region"
        name="region"
        value={selectedRegion}
        onchange={(e) => { onRegionChange((e.target as HTMLSelectElement).value); validateField('region'); }}
        class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm"
        required
      >
        <option value="">{loadingRegions ? 'Loading regions...' : 'Select a region'}</option>
        {#each regions as region}
          <option value={region}>{region}</option>
        {/each}
      </select>
      {#if validationErrors.region}
        <p class="mt-1 text-sm text-red-600 dark:text-red-400">{validationErrors.region}</p>
      {/if}
    </div>

    <!-- Instance Name -->
    <div>
      <label for="aws-name" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
        Instance Name
      </label>
      <input
        type="text"
        id="aws-name"
        name="name"
        bind:value={instanceName}
        class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm"
        placeholder="my-ec2-instance"
      />
    </div>
  </div>

  <!-- Instance Type Section with vCPU/RAM/Architecture filters -->
  <fieldset class="border border-gray-200 dark:border-gray-600 rounded-md p-4">
    <legend class="text-sm font-medium text-gray-700 dark:text-gray-300 px-1">Instance Type</legend>

    {#if !selectedRegion}
      <p class="text-sm text-gray-500 dark:text-gray-400">Select a region first</p>
    {:else if loadingInstanceTypes}
      <p class="text-sm text-gray-500 dark:text-gray-400">Loading instance types...</p>
    {:else}
      <!-- Filter controls -->
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-5 mb-4">
        <div>
          <label for="filter-min-vcpu" class="block text-xs font-medium text-gray-600 dark:text-gray-400">Min vCPUs</label>
          <select
            id="filter-min-vcpu"
            bind:value={minVCpus}
            class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-xs"
          >
            <option value={0}>Any</option>
            {#each vcpuOptions as v}
              <option value={v}>{v}</option>
            {/each}
          </select>
        </div>
        <div>
          <label for="filter-max-vcpu" class="block text-xs font-medium text-gray-600 dark:text-gray-400">Max vCPUs</label>
          <select
            id="filter-max-vcpu"
            bind:value={maxVCpus}
            class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-xs"
          >
            <option value={0}>Any</option>
            {#each vcpuOptions as v}
              <option value={v}>{v}</option>
            {/each}
          </select>
        </div>
        <div>
          <label for="filter-min-ram" class="block text-xs font-medium text-gray-600 dark:text-gray-400">Min RAM (GiB)</label>
          <select
            id="filter-min-ram"
            bind:value={minRAMGiB}
            class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-xs"
          >
            <option value={0}>Any</option>
            {#each ramGiBOptions as r}
              <option value={r}>{r}</option>
            {/each}
          </select>
        </div>
        <div>
          <label for="filter-max-ram" class="block text-xs font-medium text-gray-600 dark:text-gray-400">Max RAM (GiB)</label>
          <select
            id="filter-max-ram"
            bind:value={maxRAMGiB}
            class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-xs"
          >
            <option value={0}>Any</option>
            {#each ramGiBOptions as r}
              <option value={r}>{r}</option>
            {/each}
          </select>
        </div>
        <div>
          <label for="filter-arch" class="block text-xs font-medium text-gray-600 dark:text-gray-400">Architecture</label>
          <select
            id="filter-arch"
            bind:value={filterArchitecture}
            class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-xs"
          >
            <option value="">Any</option>
            {#each architectureOptions as arch}
              <option value={arch}>{arch}</option>
            {/each}
          </select>
        </div>
      </div>

      <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">
        {filteredInstanceTypes.length} of {instanceTypes.length} types match filters
      </p>

      <!-- Instance type selector -->
      <select
        id="aws-instance-type"
        name="instanceType"
        bind:value={selectedInstanceType}
        class="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm"
      >
        <option value="">Select instance type</option>
        {#each filteredInstanceTypes as it}
          <option value={it.instanceType}>
            {it.instanceType} — {it.vCpus} vCPU, {Math.round(it.memoryMiB / 1024)} GiB RAM, {it.architecture}
          </option>
        {/each}
      </select>
    {/if}
  </fieldset>

  <!-- AMI Search Section -->
  <fieldset class="border border-gray-200 dark:border-gray-600 rounded-md p-4">
    <legend class="text-sm font-medium text-gray-700 dark:text-gray-300 px-1">
      AMI <span class="text-red-500">*</span>
    </legend>

    {#if !selectedRegion}
      <p class="text-sm text-gray-500 dark:text-gray-400">Select a region first</p>
    {:else}
      <div class="relative">
        <div class="flex items-center gap-2">
          <input
            type="text"
            id="aws-ami-search"
            name="amiSearch"
            value={amiSearchQuery}
            oninput={(e) => onAMISearchInput((e.target as HTMLInputElement).value)}
            onfocus={() => { if (amis.length > 0 && !selectedAMI) showAMIResults = true; }}
            placeholder="Search AMIs by name (e.g. ubuntu, amazon-linux, debian)..."
            class="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm"
            autocomplete="off"
          />
          {#if selectedAMI}
            <button
              type="button"
              onclick={clearAMISelection}
              class="shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              aria-label="Clear AMI selection"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          {/if}
        </div>

        {#if loadingAMIs}
          <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">Searching AMIs...</p>
        {/if}

        <!-- Selected AMI badge -->
        {#if selectedAMIInfo}
          <div class="mt-2 p-2 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-md">
            <p class="text-sm font-medium text-blue-800 dark:text-blue-200">{selectedAMIInfo.name || selectedAMIInfo.imageId}</p>
            <p class="text-xs text-blue-600 dark:text-blue-400">
              {selectedAMIInfo.imageId} · {selectedAMIInfo.architecture}{selectedAMIInfo.platform ? ` · ${selectedAMIInfo.platform}` : ''}
            </p>
            {#if selectedAMIInfo.description}
              <p class="text-xs text-blue-500 dark:text-blue-400 mt-1 truncate">{selectedAMIInfo.description}</p>
            {/if}
          </div>
        {/if}

        <!-- Search results dropdown -->
        {#if showAMIResults && !selectedAMI && amis.length > 0}
          <div class="absolute z-10 mt-1 w-full max-h-60 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg">
            {#each amis as ami}
              <button
                type="button"
                onclick={() => selectAMI(ami)}
                class="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700 last:border-b-0"
              >
                <p class="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{ami.name || ami.imageId}</p>
                <p class="text-xs text-gray-500 dark:text-gray-400">
                  {ami.imageId} · {ami.architecture}{ami.platform ? ` · ${ami.platform}` : ''}
                  {#if ami.creationDate}
                    · {ami.creationDate.split('T')[0]}
                  {/if}
                </p>
              </button>
            {/each}
          </div>
        {/if}

        {#if showAMIResults && !loadingAMIs && amis.length === 0 && amiSearchQuery.length >= 2}
          <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">No AMIs found matching "{amiSearchQuery}"</p>
        {/if}
      </div>
    {/if}

    {#if validationErrors.ami}
      <p class="mt-1 text-sm text-red-600 dark:text-red-400">{validationErrors.ami}</p>
    {/if}
  </fieldset>

  <div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
    <!-- VPC -->
    <div>
      <label for="aws-vpc" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
        VPC
      </label>
      <select
        id="aws-vpc"
        name="vpc"
        value={selectedVPC}
        onchange={(e) => onVPCChange((e.target as HTMLSelectElement).value)}
        class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm"
        disabled={!selectedRegion}
      >
        <option value="">{loadingVPCs ? 'Loading...' : selectedRegion ? 'Select a VPC (optional)' : 'Select a region first'}</option>
        {#each vpcs as vpc}
          <option value={vpc.vpcId}>
            {getVPCDisplayName(vpc)}{vpc.isDefault ? ' [default]' : ''}
          </option>
        {/each}
      </select>
    </div>

    <!-- Key Pair -->
    <div>
      <label for="aws-keypair" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
        Key Pair
      </label>
      <select
        id="aws-keypair"
        name="keyPair"
        bind:value={selectedKeyPair}
        class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm"
        disabled={!selectedRegion}
      >
        <option value="">{loadingKeyPairs ? 'Loading...' : selectedRegion ? 'Select a key pair (optional)' : 'Select a region first'}</option>
        {#each keyPairs as kp}
          <option value={kp.keyName}>
            {kp.keyName}{kp.keyType ? ` (${kp.keyType})` : ''}
          </option>
        {/each}
      </select>
    </div>
  </div>

  <!-- Subnet (depends on VPC) -->
  <div>
    <label for="aws-subnet" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
      Subnet
    </label>
    <select
      id="aws-subnet"
      name="subnet"
      bind:value={selectedSubnet}
      class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm"
      disabled={!selectedVPC}
    >
      <option value="">{loadingSubnets ? 'Loading...' : selectedVPC ? 'Select a subnet (optional)' : 'Select a VPC first'}</option>
      {#each subnets as subnet}
        <option value={subnet.subnetId}>
          {getSubnetDisplayName(subnet)} — {subnet.availableIpAddressCount} IPs available
        </option>
      {/each}
    </select>
  </div>

  <!-- Security Groups (depends on VPC, multi-select) -->
  <div>
    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
      Security Groups
    </label>
    {#if !selectedVPC}
      <p class="text-sm text-gray-500 dark:text-gray-400">Select a VPC first to load security groups</p>
    {:else if loadingSecurityGroups}
      <p class="text-sm text-gray-500 dark:text-gray-400">Loading security groups...</p>
    {:else if securityGroups.length === 0}
      <p class="text-sm text-gray-500 dark:text-gray-400">No security groups found for this VPC</p>
    {:else}
      <div class="space-y-2 max-h-48 overflow-y-auto border border-gray-300 dark:border-gray-600 rounded-md p-3 bg-white dark:bg-gray-700">
        {#each securityGroups as sg}
          <label class="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={selectedSecurityGroups.includes(sg.groupId)}
              onchange={() => toggleSecurityGroup(sg.groupId)}
              class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <span class="text-sm text-gray-700 dark:text-gray-300">
              {getSGDisplayName(sg)}
              {#if sg.description}
                <span class="text-gray-500 dark:text-gray-400"> — {sg.description}</span>
              {/if}
            </span>
          </label>
        {/each}
      </div>
      {#if selectedSecurityGroups.length > 0}
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">{selectedSecurityGroups.length} selected</p>
      {/if}
    {/if}
  </div>

  <!-- Submit Button -->
  <div class="flex justify-end">
    <button
      type="submit"
      disabled={!isFormValid || submitting}
      class="inline-flex justify-center rounded-md border border-transparent bg-blue-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
    >
      {#if submitting}
        <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        Launching Instance...
      {:else}
        Launch EC2 Instance
      {/if}
    </button>
  </div>
</form>
