<script lang="ts">
  import { showSuccess, showError } from '../lib/toast.svelte';

  let config = $state({
    accessKeyId: '',
    secretAccessKey: '',
    region: 'us-east-1',
    sessionToken: '',
    endpoint: '',
    regions: '',
    profile: '',
  });

  let showAdvanced = $state(false);
  let copied = $state(false);

  /** Sensitive env var keys that should be masked in the preview */
  const sensitiveKeys = new Set(['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN']);

  function generateEnvSnippet(): string {
    const lines: string[] = [
      '# AWS Integration Configuration',
      'AWS_ENABLED=true',
      `AWS_DEFAULT_REGION=${config.region || 'us-east-1'}`,
      `AWS_ACCESS_KEY_ID=${config.accessKeyId || 'AKIAIOSFODNN7EXAMPLE'}`, // pragma: allowlist secret
      `AWS_SECRET_ACCESS_KEY=${config.secretAccessKey || 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'}`, // pragma: allowlist secret
    ];

    if (config.sessionToken) {
      lines.push(`AWS_SESSION_TOKEN=${config.sessionToken}`);
    }

    if (config.regions) {
      lines.push(`AWS_REGIONS=${config.regions}`);
    }

    if (config.endpoint) {
      lines.push(`AWS_ENDPOINT=${config.endpoint}`);
    }

    if (config.profile) {
      lines.push(`AWS_PROFILE=${config.profile}`);
    }

    return lines.join('\n');
  }

  function maskSensitiveValues(snippet: string): string {
    return snippet
      .split('\n')
      .map((line) => {
        if (line.startsWith('#')) return line;
        const eqIndex = line.indexOf('=');
        if (eqIndex === -1) return line;
        const key = line.substring(0, eqIndex);
        if (sensitiveKeys.has(key)) {
          const value = line.substring(eqIndex + 1);
          const placeholders = ['AKIAIOSFODNN7EXAMPLE', 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY']; // pragma: allowlist secret
          if (value && !placeholders.includes(value)) {
            return `${key}=${'*'.repeat(Math.min(value.length, 20))}`;
          }
        }
        return line;
      })
      .join('\n');
  }

  const envSnippet = $derived(generateEnvSnippet());
  const maskedSnippet = $derived(maskSensitiveValues(envSnippet));

  async function copyToClipboard(): Promise<void> {
    try {
      await navigator.clipboard.writeText(envSnippet);
      copied = true;
      showSuccess('Copied to clipboard');
      setTimeout(() => { copied = false; }, 2000);
    } catch {
      showError('Failed to copy — please select and copy manually');
    }
  }

  function validateForm(): boolean {
    if (!config.accessKeyId) return false;
    if (!config.secretAccessKey) return false;
    if (!config.region) return false;
    return true;
  }

  const isFormValid = $derived(validateForm());

  const cliTest = $derived(
    `# Verify AWS CLI credentials
aws sts get-caller-identity

# List EC2 instances in the configured region
aws ec2 describe-instances --region ${config.region || 'us-east-1'} --query 'Reservations[].Instances[].InstanceId'`
  );
</script>

<div class="max-w-4xl mx-auto px-4 py-8 bg-gray-50 dark:bg-gray-900 min-h-screen">
  <div class="mb-8">
    <h2 class="text-3xl font-bold text-gray-900 dark:text-white mb-4">AWS Integration Setup</h2>
    <p class="text-lg text-gray-600 dark:text-gray-400 leading-relaxed">
      Generate a <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">.env</code> snippet to configure Pabawi for AWS EC2 provisioning and management.
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

        <button
          class="flex items-center gap-2 px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          onclick={() => (showAdvanced = !showAdvanced)}
        >
          <span class="text-sm">{showAdvanced ? "▼" : "▶"}</span>
          <span>Advanced Settings</span>
        </button>

        {#if showAdvanced}
          <div class="mt-4 p-4 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 space-y-4">
            <div>
              <label for="aws-regions" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Additional Regions
              </label>
              <input
                id="aws-regions"
                type="text"
                bind:value={config.regions}
                placeholder="us-west-2, eu-west-1"
                class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Comma-separated list of additional regions for multi-region inventory</p>
            </div>

            <div>
              <label for="aws-endpoint" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Custom Endpoint
              </label>
              <input
                id="aws-endpoint"
                type="text"
                bind:value={config.endpoint}
                placeholder="https://ec2.custom-endpoint.example.com"
                class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Override the default AWS endpoint (for LocalStack, MinIO, etc.)</p>
            </div>

            <div>
              <label for="aws-profile" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                AWS Profile
              </label>
              <input
                id="aws-profile"
                type="text"
                bind:value={config.profile}
                placeholder="default"
                class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Named profile from ~/.aws/credentials</p>
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-blue-200 dark:border-blue-700 shadow-sm mb-6 ring-2 ring-blue-100 dark:ring-blue-900">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 2: Copy Environment Variables</h3>
      <p class="text-gray-700 dark:text-gray-300 mb-4">
        Copy the generated snippet below and paste it into your <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">backend/.env</code> file, then restart the application.
      </p>

      <div class="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
        <div class="flex justify-between items-center px-4 py-3 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
          <span class="font-medium text-gray-900 dark:text-white text-sm">.env Configuration</span>
          <button
            class="px-4 py-1.5 text-white text-sm rounded transition-colors flex items-center gap-2 {copied
              ? 'bg-green-600'
              : 'bg-blue-600 hover:bg-blue-700'}"
            onclick={copyToClipboard}
          >
            {#if copied}
              ✓ Copied
            {:else}
              📋 Copy to Clipboard
            {/if}
          </button>
        </div>
        <pre class="bg-gray-900 text-green-400 p-4 text-sm font-mono overflow-x-auto whitespace-pre-wrap">{maskedSnippet}</pre>
      </div>

      {#if isFormValid}
        <div class="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 rounded-r-lg">
          <p class="text-sm text-gray-700 dark:text-gray-300">
            <strong>Next:</strong> Paste into <code class="bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded text-xs">backend/.env</code> and restart the application. Then check the <strong>Integration Status</strong> dashboard to verify the connection.
          </p>
        </div>
      {:else}
        <div class="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-500 rounded-r-lg">
          <p class="text-sm text-gray-700 dark:text-gray-300">
            Fill in the required fields above to generate a complete snippet.
          </p>
        </div>
      {/if}
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 3: Create IAM User (Recommended)</h3>
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
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 4: Validate with AWS CLI</h3>
      <p class="text-gray-700 dark:text-gray-300 mb-4">Test your credentials using the AWS CLI before configuring Pabawi:</p>

      <div class="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
        <div class="flex justify-between items-center px-4 py-3 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
          <span class="font-medium text-gray-900 dark:text-white text-sm">AWS CLI Test Commands</span>
          <button
            class="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
            onclick={() => { navigator.clipboard.writeText(cliTest); showSuccess('Copied to clipboard'); }}
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
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 5: Restart and Verify</h3>
      <p class="text-gray-700 dark:text-gray-300 mb-4">After pasting the snippet into <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">backend/.env</code>, restart the backend:</p>
      <div class="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm space-y-1 mb-4">
        <div>cd backend</div>
        <div>npm run dev</div>
      </div>
      <ol class="list-decimal list-inside space-y-2 text-gray-700 dark:text-gray-300">
        <li>Open the <strong>Integration Status</strong> dashboard in Pabawi</li>
        <li>Confirm <strong>AWS</strong> status is connected</li>
        <li>Use the <strong>Test Connection</strong> button on the dashboard to verify</li>
        <li>Navigate to <strong>Provision</strong> page to launch EC2 instances</li>
      </ol>
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
