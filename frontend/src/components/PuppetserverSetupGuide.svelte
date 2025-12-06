<script lang="ts">
  let selectedAuth = $state<"token" | "ssl">("token");
  let showAdvanced = $state(false);

  const copyToClipboard = (text: string): void => {
    navigator.clipboard.writeText(text);
  };

  const tokenConfig = `# Puppetserver Integration - Token Authentication
PUPPETSERVER_ENABLED=true
PUPPETSERVER_SERVER_URL=https://puppet.example.com
PUPPETSERVER_PORT=8140
PUPPETSERVER_TOKEN=your-api-token-here
PUPPETSERVER_TIMEOUT=30000
PUPPETSERVER_RETRY_ATTEMPTS=3
PUPPETSERVER_RETRY_DELAY=1000`;

  const sslConfig = `# Puppetserver Integration - SSL Certificate Authentication
PUPPETSERVER_ENABLED=true
PUPPETSERVER_SERVER_URL=https://puppet.example.com
PUPPETSERVER_PORT=8140
PUPPETSERVER_SSL_ENABLED=true
PUPPETSERVER_SSL_CA=/etc/puppetlabs/puppet/ssl/certs/ca.pem
PUPPETSERVER_SSL_CERT=/etc/puppetlabs/puppet/ssl/certs/admin.pem
PUPPETSERVER_SSL_KEY=/etc/puppetlabs/puppet/ssl/private_keys/admin.pem
PUPPETSERVER_SSL_REJECT_UNAUTHORIZED=true`;

  const advancedConfig = `# Advanced Configuration
PUPPETSERVER_INACTIVITY_THRESHOLD=3600
PUPPETSERVER_CACHE_TTL=300000
PUPPETSERVER_CIRCUIT_BREAKER_THRESHOLD=5
PUPPETSERVER_CIRCUIT_BREAKER_TIMEOUT=60000
PUPPETSERVER_CIRCUIT_BREAKER_RESET_TIMEOUT=30000`;
</script>

<div class="setup-guide">
  <div class="guide-header">
    <h2>Puppetserver Integration Setup</h2>
    <p class="subtitle">
      Configure Pabawi to connect to your Puppetserver for certificate
      management, catalog compilation, and node monitoring.
    </p>
  </div>

  <div class="card">
    <div class="setup-section">
      <h3>Prerequisites</h3>
      <ul>
        <li>A running Puppetserver instance (version 6.x or 7.x)</li>
        <li>Network access to the Puppetserver API (default port 8140)</li>
        <li>Authentication credentials (token or SSL certificates)</li>
      </ul>
    </div>
  </div>

  <div class="card">
    <div class="setup-section">
      <h3>Step 1: Choose Authentication Method</h3>

      <div class="auth-selector">
        <button
          class="auth-option"
          class:selected={selectedAuth === "token"}
          onclick={() => (selectedAuth = "token")}
        >
          <div class="option-header">
            <span class="option-icon">🔑</span>
            <span class="option-title">Token Authentication</span>
          </div>
          <p class="option-description">Recommended - Easier to rotate</p>
        </button>

        <button
          class="auth-option"
          class:selected={selectedAuth === "ssl"}
          onclick={() => (selectedAuth = "ssl")}
        >
          <div class="option-header">
            <span class="option-icon">🔒</span>
            <span class="option-title">SSL Certificate</span>
          </div>
          <p class="option-description">More secure for production</p>
        </button>
      </div>

      {#if selectedAuth === "token"}
        <div class="auth-instructions">
          <h4>Generate API Token</h4>
          <p>Run these commands on your Puppetserver:</p>
          <div class="code-block">
            <code>puppet access login --lifetime 1y</code>
            <code>puppet access show</code>
          </div>
        </div>
      {:else}
        <div class="auth-instructions">
          <h4>Locate SSL Certificates</h4>
          <p>Default certificate locations on Puppetserver:</p>
          <div class="code-block">
            <code>CA: /etc/puppetlabs/puppet/ssl/certs/ca.pem</code>
            <code>Cert: /etc/puppetlabs/puppet/ssl/certs/admin.pem</code>
            <code>Key: /etc/puppetlabs/puppet/ssl/private_keys/admin.pem</code>
          </div>
        </div>
      {/if}
    </div>
  </div>

  <div class="card">
    <div class="setup-section">
      <h3>Step 2: Configure Environment Variables</h3>
      <p>Add these variables to your <code>backend/.env</code> file:</p>

      <div class="config-block">
        <div class="config-header">
          <span class="config-title">
            {selectedAuth === "token"
              ? "Token Authentication Config"
              : "SSL Certificate Config"}
          </span>
          <button
            class="copy-button"
            onclick={() =>
              copyToClipboard(
                selectedAuth === "token" ? tokenConfig : sslConfig
              )}
          >
            📋 Copy
          </button>
        </div>
        <pre class="config-content">{selectedAuth === "token"
            ? tokenConfig
            : sslConfig}</pre>
      </div>

      <button
        class="advanced-toggle"
        onclick={() => (showAdvanced = !showAdvanced)}
      >
        {showAdvanced ? "▼" : "▶"} Advanced Configuration (Optional)
      </button>

      {#if showAdvanced}
        <div class="config-block">
          <div class="config-header">
            <span class="config-title">Advanced Options</span>
            <button class="copy-button" onclick={() => copyToClipboard(advancedConfig)}>
              📋 Copy
            </button>
          </div>
          <pre class="config-content">{advancedConfig}</pre>
        </div>

        <div class="config-explanation">
          <h4>Configuration Options:</h4>
          <ul>
            <li>
              <strong>INACTIVITY_THRESHOLD</strong>: Seconds before a node is
              marked inactive (default: 3600)
            </li>
            <li>
              <strong>CACHE_TTL</strong>: Cache duration in milliseconds
              (default: 300000)
            </li>
            <li>
              <strong>CIRCUIT_BREAKER_*</strong>: Resilience settings for
              connection failures
            </li>
          </ul>
        </div>
      {/if}
    </div>
  </div>

  <div class="card">
    <div class="setup-section">
      <h3>Step 3: Restart Backend Server</h3>
      <p>Apply the configuration by restarting the backend:</p>
      <div class="code-block">
        <code>cd backend</code>
        <code>npm run dev</code>
      </div>
    </div>
  </div>

  <div class="card">
    <div class="setup-section">
      <h3>Step 4: Verify Connection</h3>
      <p>Check the integration status:</p>
      <ol>
        <li>Navigate to the <strong>Integrations</strong> page</li>
        <li>Look for "Puppetserver" in the list</li>
        <li>Status should show "healthy" with a green indicator</li>
      </ol>

      <p>Or test via API:</p>
      <div class="code-block">
        <code
          >curl http://localhost:3000/api/integrations/puppetserver/health</code
        >
      </div>
    </div>
  </div>

  <div class="card">
    <div class="setup-section">
      <h3>Features Available</h3>
      <div class="features-grid">
        <div class="feature">
          <span class="feature-icon">📜</span>
          <h4>Certificate Management</h4>
          <p>Sign, revoke, and manage node certificates</p>
        </div>
        <div class="feature">
          <span class="feature-icon">📊</span>
          <h4>Node Monitoring</h4>
          <p>Track node status and activity</p>
        </div>
        <div class="feature">
          <span class="feature-icon">📦</span>
          <h4>Catalog Operations</h4>
          <p>Compile and compare catalogs</p>
        </div>
        <div class="feature">
          <span class="feature-icon">🌍</span>
          <h4>Environment Management</h4>
          <p>Deploy and manage environments</p>
        </div>
      </div>
    </div>
  </div>

  <div class="card">
    <div class="setup-section troubleshooting">
      <h3>Troubleshooting</h3>

      <details>
        <summary>Connection Errors</summary>
        <div class="troubleshooting-content">
          <p><strong>Error:</strong> "Failed to connect to Puppetserver"</p>
          <ul>
            <li>Verify network connectivity and firewall rules</li>
            <li>
              Test connection: <code
                >curl -k https://puppet.example.com:8140/status/v1/simple</code
              >
            </li>
            <li>Check PUPPETSERVER_SERVER_URL is correct</li>
          </ul>
        </div>
      </details>

      <details>
        <summary>Authentication Errors</summary>
        <div class="troubleshooting-content">
          <p><strong>Error:</strong> "Authentication failed"</p>
          <ul>
            <li>
              For token auth: Run <code>puppet access show</code> to verify token
            </li>
            <li>For SSL auth: Check certificate paths and permissions</li>
            <li>Ensure certificates are readable by the backend process</li>
          </ul>
        </div>
      </details>

      <details>
        <summary>SSL Certificate Errors</summary>
        <div class="troubleshooting-content">
          <p><strong>Error:</strong> "SSL certificate verification failed"</p>
          <ul>
            <li>
              For self-signed certs: Set <code
                >PUPPETSERVER_SSL_REJECT_UNAUTHORIZED=false</code
              >
            </li>
            <li>Or add CA certificate to system trusted store</li>
            <li>Verify certificate paths are correct</li>
          </ul>
        </div>
      </details>
    </div>
  </div>

  <div class="guide-footer">
    <p>
      For detailed documentation, see <a
        href="/docs/PUPPETSERVER_SETUP.md"
        target="_blank">PUPPETSERVER_SETUP.md</a
      >
    </p>
  </div>
</div>

<style>
  .setup-guide {
    max-width: 900px;
    margin: 0 auto;
    padding: 2rem;
    background: #f5f5f5;
    min-height: 100vh;
  }

  .card {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    margin-bottom: 1.5rem;
    box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
  }

  .guide-header {
    margin-bottom: 2rem;
  }

  .guide-header h2 {
    font-size: 2rem;
    font-weight: 600;
    margin-bottom: 0.5rem;
    color: #1a1a1a;
  }

  .subtitle {
    font-size: 1.1rem;
    color: #666;
    line-height: 1.6;
  }

  .setup-section {
    padding: 1.5rem;
  }

  .setup-section h3 {
    font-size: 1.5rem;
    font-weight: 600;
    margin-bottom: 1rem;
    color: #1a1a1a;
  }

  .setup-section h4 {
    font-size: 1.2rem;
    font-weight: 500;
    margin: 1rem 0 0.5rem;
    color: #1a1a1a;
  }

  .setup-section ul,
  .setup-section ol {
    margin: 1rem 0;
    padding-left: 1.5rem;
    color: #333;
  }

  .setup-section li {
    margin: 0.5rem 0;
    line-height: 1.6;
  }

  .auth-selector {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    margin: 1rem 0;
  }

  .auth-option {
    padding: 1.5rem;
    border: 2px solid #e0e0e0;
    border-radius: 8px;
    background: #f9f9f9;
    cursor: pointer;
    transition: all 0.2s;
    text-align: left;
    color: #333;
  }

  .auth-option:hover {
    border-color: #007bff;
    background: #fff;
  }

  .auth-option.selected {
    border-color: #007bff;
    background: #e3f2fd;
  }

  .option-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .option-icon {
    font-size: 1.5rem;
  }

  .option-title {
    font-size: 1.1rem;
    font-weight: 600;
  }

  .option-description {
    font-size: 0.9rem;
    color: #666;
    margin: 0;
  }

  .auth-instructions {
    margin-top: 1.5rem;
    padding: 1rem;
    background: #f9f9f9;
    border-radius: 6px;
    color: #333;
  }

  .code-block {
    background: #2d2d2d;
    color: #f8f8f2;
    padding: 1rem;
    border-radius: 6px;
    margin: 1rem 0;
    font-family: "Monaco", "Menlo", "Courier New", monospace;
    font-size: 0.9rem;
  }

  .code-block code {
    display: block;
    margin: 0.25rem 0;
  }

  .config-block {
    margin: 1rem 0;
    border: 1px solid #e0e0e0;
    border-radius: 6px;
    overflow: hidden;
  }

  .config-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    background: #f5f5f5;
    border-bottom: 1px solid #e0e0e0;
  }

  .config-title {
    font-weight: 600;
    font-size: 0.9rem;
  }

  .copy-button {
    padding: 0.25rem 0.75rem;
    background: var(--color-primary, #007bff);
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.85rem;
    transition: background 0.2s;
  }

  .copy-button:hover {
    background: var(--color-primary-dark, #0056b3);
  }

  .config-content {
    padding: 1rem;
    margin: 0;
    background: var(--color-bg-code, #2d2d2d);
    color: var(--color-text-code, #f8f8f2);
    font-family: "Monaco", "Menlo", "Courier New", monospace;
    font-size: 0.85rem;
    line-height: 1.6;
    overflow-x: auto;
  }

  .advanced-toggle {
    margin: 1rem 0;
    padding: 0.5rem 1rem;
    background: transparent;
    border: 1px solid var(--color-border, #e0e0e0);
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9rem;
    transition: all 0.2s;
  }

  .advanced-toggle:hover {
    background: var(--color-bg-secondary, #f9f9f9);
  }

  .config-explanation {
    margin-top: 1rem;
    padding: 1rem;
    background: var(--color-bg-info, #e3f2fd);
    border-left: 4px solid var(--color-primary, #007bff);
    border-radius: 4px;
  }

  .features-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
    margin: 1rem 0;
  }

  .feature {
    padding: 1rem;
    background: var(--color-bg-secondary, #f9f9f9);
    border-radius: 6px;
    text-align: center;
  }

  .feature-icon {
    font-size: 2rem;
    display: block;
    margin-bottom: 0.5rem;
  }

  .feature h4 {
    font-size: 1rem;
    margin: 0.5rem 0;
  }

  .feature p {
    font-size: 0.85rem;
    color: var(--color-text-secondary, #666);
    margin: 0;
  }

  .troubleshooting details {
    margin: 1rem 0;
    border: 1px solid var(--color-border, #e0e0e0);
    border-radius: 6px;
    overflow: hidden;
  }

  .troubleshooting summary {
    padding: 1rem;
    background: var(--color-bg-secondary, #f9f9f9);
    cursor: pointer;
    font-weight: 600;
    user-select: none;
  }

  .troubleshooting summary:hover {
    background: var(--color-bg-hover, #f0f0f0);
  }

  .troubleshooting-content {
    padding: 1rem;
  }

  .troubleshooting-content code {
    background: var(--color-bg-code-inline, #f5f5f5);
    padding: 0.2rem 0.4rem;
    border-radius: 3px;
    font-family: "Monaco", "Menlo", "Courier New", monospace;
    font-size: 0.85rem;
  }

  .guide-footer {
    margin-top: 2rem;
    padding: 1rem;
    text-align: center;
    color: var(--color-text-secondary, #666);
  }

  .guide-footer a {
    color: var(--color-primary, #007bff);
    text-decoration: none;
  }

  .guide-footer a:hover {
    text-decoration: underline;
  }

  code {
    background: var(--color-bg-code-inline, #f5f5f5);
    padding: 0.2rem 0.4rem;
    border-radius: 3px;
    font-family: "Monaco", "Menlo", "Courier New", monospace;
    font-size: 0.9em;
  }
</style>
