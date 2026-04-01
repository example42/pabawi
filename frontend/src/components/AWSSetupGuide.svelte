<script lang="ts">
  import { onMount } from 'svelte';
  import { saveIntegrationConfig, getIntegrationConfig, testAWSConnection } from '../lib/api';
  import { showSuccess, showError } from '../lib/toast.svelte';
  import { logger } from '../lib/logger.svelte';

  let config = $state({
    accessKeyId: '',
    secretAccessKey: '',
    region: 'us-east-1',
    sessionToken: '',
  });

  let testResult = $state<{ success: boolean; message: string } | null>(null);
  let testing = $state(false);
  let saving = $state(false);
  let loadingConfig = $state(true);

  onMount(async () => {
    try {
      const effective = await getIntegrationConfig('aws');
      if (effective) {
        config.accessKeyId = String(effective.accessKeyId ?? '');
        config.secretAccessKey = String(effective.secretAccessKey ?? '');
        config.region = String(effective.region ?? 'us-east-1');
        config.sessionToken = String(effective.sessionToken ?? '');
      }
    } catch {
      // No existing config — start fresh
    } finally {
      loadingConfig = false;
    }
  });

  const copyToClipboard = (text: string): void => {
    navigator.clipboard.writeText(text);
    showSuccess('Copied to clipboard');
  };

  async function handleTestConnection(): Promise<void> {
    testing = true;
    testResult = null;

    try {
      const result = await testAWSConnection();
      testResult = result;

      if (result.success) {
        showSuccess('AWS connection successful');
        logger.info('AWS connection test succeeded', { region: config.region });
      } else {
        showError(`Connection failed: ${result.message}`);
        logger.warn('AWS connection test failed', { region: config.region, message: result.message });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      testResult = { success: false, message };
      showError(`Connection test failed: ${message}`);
      logger.error('AWS connection test error', { error });
    } finally {
      testing = false;
    }
  }

  async function handleSaveConfiguration(): Promise<void> {
    saving = true;

    try {
      const configPayload: Record<string, unknown> = {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
        region: config.region,
      };
      if (config.sessionToken) {
        configPayload.sessionToken = config.sessionToken;
      }

      await saveIntegrationConfig('aws', configPayload);
      showSuccess('AWS configuration saved successfully');
      logger.info('AWS configuration saved', { region: config.region });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      showError(`Failed to save configuration: ${message}`);
      logger.error('AWS configuration save error', { error });
    } finally {
      saving = false;
    }
  }

  function validateForm(): boolean {
    if (!config.accessKeyId) return false;
    if (!config.secretAccessKey) return false;
    if (!config.region) return false;
    return true;
  }

  const isFormValid = $derived(validateForm());

  const envExample = `# AWS Integration Configuration
AWS_ENABLED=true
AWS_ACCESS_KEY_ID=${config.accessKeyId || 'AKIAIOSFODNN7EXAMPLE'}  # pragma: allowlist secret
AWS_SECRET_ACCESS_KEY=${config.secretAccessKey || 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'}  # pragma: allowlist secret
AWS_DEFAULT_REGION=${config.region || 'us-east-1'}
# Optional: Session token for temporary credentials
# AWS_SESSION_TOKEN=your_session_token_here`;

  const cliTest = `# Verify AWS CLI credentials
aws sts get-caller-identity

# List EC2 instances in the configured region
aws ec2 describe-instances --region ${config.region || 'us-east-1'} --query 'Reservations[].Instances[].InstanceId'

# List available regions
aws ec2 describe-regions --query 'Regions[].RegionName' --output text`;
</script>

<div class="max-w-4xl mx-auto px-4 py-8 bg-gray-50 dark:bg-gray-900 min-h-screen">
  <div class="mb-8">
    <h2 class="text-3xl font-bold text-gray-900 dark:text-white mb-4">AWS Integration Setup</h2>
    <p class="text-lg text-gray-600 dark:text-gray-400 leading-relaxed">
      Configure Pabawi to provision and manage EC2 instances on your AWS account.
    </p>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Prerequisites</h3>
      <ul class="space-y-2 text-gray-700 dark:text-gray-300">
        <li class="flex items-start">
          <span class="text-blue-500 mr-2">•</span>
          An AWS account with EC2 access
        </li>
        <li class="flex items-start">
          <span class="text-blue-500 mr-2">•</span>
          IAM user or role with EC2 permissions (ec2:RunInstances, ec2:DescribeInstances, ec2:StartInstances, ec2:StopInstances, ec2:RebootInstances, ec2:TerminateInstances)
        </li>
        <li class="flex items-start">
          <span class="text-blue-500 mr-2">•</span>
          Access Key ID and Secret Access Key (or temporary session credentials)
        </li>
        <li class="flex items-start">
          <span class="text-blue-500 mr-2">•</span>
          Network connectivity to AWS API endpoints
        </li>
      </ul>
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 1: Configure Credentials</h3>

      <div class="space-y-4">
        <div>
          <label for="aws-access-key" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Access Key ID *
          </label>
          <input
            id="aws-access-key"
            type="text"
            bind:value={config.accessKeyId}
            placeholder="AKIAIOSFODNN7EXAMPLE"
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
          />
        </div>

        <div>
          <label for="aws-secret-key" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Secret Access Key *
          </label>
          <input
            id="aws-secret-key"
            type="password"
            bind:value={config.secretAccessKey}
            placeholder="••••••••••••••••••••"
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div>
          <label for="aws-region" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Default Region *
          </label>
          <input
            id="aws-region"
            type="text"
            bind:value={config.region}
            placeholder="us-east-1"
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">AWS region for API calls (e.g., us-east-1, eu-west-1)</p>
        </div>

        <div>
          <label for="aws-session-token" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Session Token (optional)
          </label>
          <input
            id="aws-session-token"
            type="password"
            bind:value={config.sessionToken}
            placeholder="Optional — for temporary credentials only"
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Required only when using temporary security credentials (STS)</p>
        </div>

        <div class="flex gap-3 pt-4">
          <button
            onclick={handleTestConnection}
            disabled={!isFormValid || testing}
            class="px-4 py-2 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-400 text-white rounded-lg transition-colors disabled:cursor-not-allowed flex items-center gap-2"
          >
            {#if testing}
              <span class="animate-spin">⏳</span>
              Testing...
            {:else}
              🔍 Test Connection
            {/if}
          </button>

          <button
            onclick={handleSaveConfiguration}
            disabled={!isFormValid || saving}
            class="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors disabled:cursor-not-allowed flex items-center gap-2"
          >
            {#if saving}
              <span class="animate-spin">⏳</span>
              Saving...
            {:else}
              💾 Save Configuration
            {/if}
          </button>
        </div>

        {#if testResult}
          <div class="mt-4 p-4 rounded-lg {testResult.success
            ? 'bg-green-50 dark:bg-green-900/20 border-l-4 border-green-500'
            : 'bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500'}">
            <p class="text-sm {testResult.success ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}">
              <strong>{testResult.success ? '✓ Success:' : '✗ Failed:'}</strong> {testResult.message}
            </p>
          </div>
        {/if}
      </div>
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 2: Create IAM User (Recommended)</h3>
      <p class="text-gray-700 dark:text-gray-300 mb-4">
        Create a dedicated IAM user with least-privilege permissions for Pabawi:
      </p>
      <ol class="list-decimal list-inside space-y-2 text-gray-700 dark:text-gray-300 mb-4">
        <li>Open the AWS IAM Console</li>
        <li>Create a new IAM user (e.g., <strong>pabawi-ec2</strong>)</li>
        <li>Attach the <strong>AmazonEC2FullAccess</strong> managed policy (or a custom policy with only required actions)</li>
        <li>Generate an Access Key under Security Credentials</li>
        <li>Copy the Access Key ID and Secret Access Key</li>
      </ol>
      <div class="p-4 bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 rounded-r-lg">
        <p class="text-sm text-gray-700 dark:text-gray-300">
          <strong>Tip:</strong> For production, use a custom IAM policy with only the specific EC2 actions Pabawi needs, rather than full EC2 access.
        </p>
      </div>
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 3: Environment Variables (Alternative)</h3>
      <p class="text-gray-700 dark:text-gray-300 mb-4">
        Alternatively, configure via environment variables in <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">backend/.env</code>:
      </p>

      <div class="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
        <div class="flex justify-between items-center px-4 py-3 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
          <span class="font-medium text-gray-900 dark:text-white text-sm">AWS Configuration</span>
          <button
            class="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
            onclick={() => copyToClipboard(envExample)}
          >
            📋 Copy
          </button>
        </div>
        <pre class="bg-gray-900 text-green-400 p-4 text-sm font-mono overflow-x-auto">{envExample}</pre>
      </div>
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 4: Validate with AWS CLI</h3>
      <p class="text-gray-700 dark:text-gray-300 mb-4">Test your credentials using the AWS CLI before configuring Pabawi:</p>

      <div class="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
        <div class="flex justify-between items-center px-4 py-3 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
          <span class="font-medium text-gray-900 dark:text-white text-sm">AWS CLI Test Commands</span>
          <button
            class="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
            onclick={() => copyToClipboard(cliTest)}
          >
            📋 Copy
          </button>
        </div>
        <pre class="bg-gray-900 text-green-400 p-4 text-sm font-mono overflow-x-auto">{cliTest}</pre>
      </div>
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Features Available</h3>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div class="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg text-center">
          <span class="text-3xl block mb-2">☁️</span>
          <h4 class="font-medium text-gray-900 dark:text-white mb-1">EC2 Provisioning</h4>
          <p class="text-sm text-gray-600 dark:text-gray-400">Launch and configure EC2 instances</p>
        </div>
        <div class="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg text-center">
          <span class="text-3xl block mb-2">⚡</span>
          <h4 class="font-medium text-gray-900 dark:text-white mb-1">Lifecycle Management</h4>
          <p class="text-sm text-gray-600 dark:text-gray-400">Start, stop, reboot, and terminate</p>
        </div>
        <div class="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg text-center">
          <span class="text-3xl block mb-2">📋</span>
          <h4 class="font-medium text-gray-900 dark:text-white mb-1">Inventory Discovery</h4>
          <p class="text-sm text-gray-600 dark:text-gray-400">View EC2 instances across regions</p>
        </div>
      </div>
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Troubleshooting</h3>

      <div class="space-y-4">
        <details class="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
          <summary class="px-4 py-3 bg-gray-50 dark:bg-gray-700 cursor-pointer font-medium text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-600">
            Authentication Failed
          </summary>
          <div class="p-4 text-gray-700 dark:text-gray-300">
            <p class="mb-3"><strong>Error:</strong> "AWS authentication failed" or "InvalidClientTokenId"</p>
            <ul class="space-y-2 list-disc list-inside">
              <li>Verify Access Key ID and Secret Access Key are correct</li>
              <li>Check that the IAM user is active and not disabled</li>
              <li>Ensure the access key has not been rotated or deleted</li>
              <li>For temporary credentials, verify the session token is still valid</li>
            </ul>
          </div>
        </details>

        <details class="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
          <summary class="px-4 py-3 bg-gray-50 dark:bg-gray-700 cursor-pointer font-medium text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-600">
            Permission Denied
          </summary>
          <div class="p-4 text-gray-700 dark:text-gray-300">
            <p class="mb-3"><strong>Error:</strong> "UnauthorizedOperation" or "AccessDenied"</p>
            <ul class="space-y-2 list-disc list-inside">
              <li>Verify the IAM user has the required EC2 permissions</li>
              <li>Check for restrictive IAM policies or SCPs</li>
              <li>Ensure the region is enabled in your AWS account</li>
              <li>Review CloudTrail logs for detailed permission errors</li>
            </ul>
          </div>
        </details>

        <details class="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
          <summary class="px-4 py-3 bg-gray-50 dark:bg-gray-700 cursor-pointer font-medium text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-600">
            Connection Timeout
          </summary>
          <div class="p-4 text-gray-700 dark:text-gray-300">
            <p class="mb-3"><strong>Error:</strong> "Connection timeout" or "NetworkingError"</p>
            <ul class="space-y-2 list-disc list-inside">
              <li>Check network connectivity to AWS API endpoints</li>
              <li>Verify proxy settings if behind a corporate firewall</li>
              <li>Ensure DNS resolution works for AWS service endpoints</li>
              <li>Check if the region endpoint is accessible from your network</li>
            </ul>
          </div>
        </details>
      </div>
    </div>
  </div>

  <div class="mt-8 text-center">
    <p class="text-gray-600 dark:text-gray-400">
      For detailed documentation, see the AWS Integration guide in the documentation.
    </p>
  </div>
</div>
