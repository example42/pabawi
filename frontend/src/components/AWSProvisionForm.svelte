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
   * Region → Instance Types, AMIs, VPCs → Subnets, Security Groups
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
    selectedVPC = '';
    selectedSubnet = '';
    selectedSecurityGroups = [];
    selectedKeyPair = '';
    instanceTypes = [];
    amis = [];
    vpcs = [];
    subnets = [];
    securityGroups = [];
    keyPairs = [];

    if (!region) return;

    loadingInstanceTypes = true;
    loadingAMIs = true;
    loadingVPCs = true;
    loadingKeyPairs = true;

    const results = await Promise.allSettled([
      getAWSInstanceTypes(region),
      getAWSAMIs(region),
      getAWSVPCs(region),
      getAWSKeyPairs(region),
    ]);

    instanceTypes = results[0].status === 'fulfilled' ? results[0].value : [];
    amis = results[1].status === 'fulfilled' ? results[1].value : [];
    vpcs = results[2].status === 'fulfilled' ? results[2].value : [];
    keyPairs = results[3].status === 'fulfilled' ? results[3].value : [];

    if (results[0].status === 'rejected') logger.error('AWSProvisionForm', 'onRegionChange', 'Failed to fetch instance types', results[0].reason as Error);
    if (results[1].status === 'rejected') logger.error('AWSProvisionForm', 'onRegionChange', 'Failed to fetch AMIs', results[1].reason as Error);
    if (results[2].status === 'rejected') logger.error('AWSProvisionForm', 'onRegionChange', 'Failed to fetch VPCs', results[2].reason as Error);
    if (results[3].status === 'rejected') logger.error('AWSProvisionForm', 'onRegionChange', 'Failed to fetch key pairs', results[3].reason as Error);

    loadingInstanceTypes = false;
    loadingAMIs = false;
    loadingVPCs = false;
    loadingKeyPairs = false;
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
        selectedVPC = '';
        selectedSubnet = '';
        selectedSecurityGroups = [];
        selectedKeyPair = '';
        instanceName = '';
        validationErrors = {};
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

    <!-- Instance Type -->
    <div>
      <label for="aws-instance-type" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
        Instance Type
      </label>
      <select
        id="aws-instance-type"
        name="instanceType"
        bind:value={selectedInstanceType}
        class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm"
        disabled={!selectedRegion}
      >
        <option value="">{loadingInstanceTypes ? 'Loading...' : selectedRegion ? 'Select instance type' : 'Select a region first'}</option>
        {#each instanceTypes as it}
          <option value={it.instanceType}>
            {it.instanceType} ({it.vCpus} vCPU, {Math.round(it.memoryMiB / 1024)} GB RAM, {it.architecture})
          </option>
        {/each}
      </select>
    </div>

    <!-- AMI -->
    <div>
      <label for="aws-ami" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
        AMI <span class="text-red-500">*</span>
      </label>
      <select
        id="aws-ami"
        name="ami"
        value={selectedAMI}
        onchange={(e) => { selectedAMI = (e.target as HTMLSelectElement).value; validateField('ami'); }}
        class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm"
        disabled={!selectedRegion}
        required
      >
        <option value="">{loadingAMIs ? 'Loading...' : selectedRegion ? 'Select an AMI' : 'Select a region first'}</option>
        {#each amis as ami}
          <option value={ami.imageId}>
            {ami.name || ami.imageId} ({ami.architecture}{ami.platform ? `, ${ami.platform}` : ''})
          </option>
        {/each}
      </select>
      {#if validationErrors.ami}
        <p class="mt-1 text-sm text-red-600 dark:text-red-400">{validationErrors.ami}</p>
      {/if}
    </div>

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
