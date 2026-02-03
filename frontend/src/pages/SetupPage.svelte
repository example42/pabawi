<!--
  Setup Page - First Run Admin Creation

  This page appears when no users exist in the system.
  It allows creating the initial administrator account.

  @module pages/SetupPage
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import LoadingSpinner from '../components/LoadingSpinner.svelte';
  import ErrorAlert from '../components/ErrorAlert.svelte';
  import { get, post } from '../lib/api';
  import { showError, showSuccess } from '../lib/toast.svelte';
  import { navigate } from '../lib/router.svelte';

  const pageTitle = 'Pabawi - Initial Setup';

  // ==========================================================================
  // Types
  // ==========================================================================

  interface SetupStatus {
    setupRequired: boolean;
    initialized: boolean;
    userCount: number;
    hasDefaultRoles: boolean;
  }

  interface PasswordPolicy {
    minLength: number;
    requireUppercase: boolean;
    requireLowercase: boolean;
    requireNumbers: boolean;
    requireSpecialChars: boolean;
  }

  interface ValidationResult {
    valid: boolean;
    errors: string[];
  }

  // ==========================================================================
  // State
  // ==========================================================================

  let loading = $state(true);
  let error = $state<string | null>(null);
  let setupStatus = $state<SetupStatus | null>(null);
  let passwordPolicy = $state<PasswordPolicy | null>(null);
  let submitting = $state(false);

  // Form state
  let username = $state('admin');
  let email = $state('');
  let password = $state('');
  let confirmPassword = $state('');
  let displayName = $state('Administrator');

  // Validation state
  let passwordValidation = $state<ValidationResult | null>(null);
  let showPassword = $state(false);
  let showConfirmPassword = $state(false);

  // ==========================================================================
  // Derived State
  // ==========================================================================

  const passwordsMatch = $derived(password === confirmPassword);
  const hasUppercase = $derived(/[A-Z]/.test(password));
  const hasLowercase = $derived(/[a-z]/.test(password));
  const hasNumber = $derived(/\d/.test(password));
  const hasSpecialChar = $derived(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password));
  const formValid = $derived(
    username.length >= 3 &&
    email.includes('@') &&
    passwordValidation?.valid === true &&
    passwordsMatch
  );

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  onMount(() => {
    document.title = pageTitle;
    void checkSetupStatus();
  });

  // ==========================================================================
  // API Functions
  // ==========================================================================

  async function checkSetupStatus(): Promise<void> {
    loading = true;
    error = null;

    try {
      const [statusResponse, policyResponse] = await Promise.all([
        get<SetupStatus>('/api/setup/status'),
        get<{ policy: PasswordPolicy }>('/api/setup/password-policy'),
      ]);

      setupStatus = statusResponse;
      passwordPolicy = policyResponse.policy;

      // If setup is not required, redirect to login
      if (!statusResponse.setupRequired) {
        navigate('/login');
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to check setup status';
    } finally {
      loading = false;
    }
  }

  async function validatePassword(): Promise<void> {
    if (!password) {
      passwordValidation = null;
      return;
    }

    try {
      const result = await post<ValidationResult>('/api/setup/validate-password', { password });
      passwordValidation = result;
    } catch {
      // Local validation fallback
      if (passwordPolicy) {
        const errors: string[] = [];
        if (password.length < passwordPolicy.minLength) {
          errors.push(`Password must be at least ${passwordPolicy.minLength} characters`);
        }
        if (passwordPolicy.requireUppercase && !/[A-Z]/.test(password)) {
          errors.push('Must contain uppercase letter');
        }
        if (passwordPolicy.requireLowercase && !/[a-z]/.test(password)) {
          errors.push('Must contain lowercase letter');
        }
        if (passwordPolicy.requireNumbers && !/\d/.test(password)) {
          errors.push('Must contain number');
        }
        if (passwordPolicy.requireSpecialChars && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
          errors.push('Must contain special character');
        }
        passwordValidation = { valid: errors.length === 0, errors };
      }
    }
  }

  async function handleSubmit(event: SubmitEvent): Promise<void> {
    event.preventDefault();

    if (!formValid || submitting) return;

    submitting = true;
    error = null;

    try {
      await post<{ success: boolean; userId: string }>('/api/setup/admin', {
        username,
        email,
        password,
        displayName,
      });

      showSuccess('Administrator account created successfully!');

      // Redirect to login page
      setTimeout(() => {
        navigate('/login');
      }, 1500);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create administrator account';
      error = message;
      showError(message);
    } finally {
      submitting = false;
    }
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  function getPasswordStrength(): { strength: number; label: string; color: string } {
    if (!password) return { strength: 0, label: '', color: 'gray' };

    let strength = 0;
    if (password.length >= 8) strength += 1;
    if (password.length >= 12) strength += 1;
    if (/[A-Z]/.test(password)) strength += 1;
    if (/[a-z]/.test(password)) strength += 1;
    if (/\d/.test(password)) strength += 1;
    if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) strength += 1;

    if (strength <= 2) return { strength, label: 'Weak', color: 'red' };
    if (strength <= 4) return { strength, label: 'Medium', color: 'yellow' };
    return { strength, label: 'Strong', color: 'green' };
  }
</script>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
  <div class="max-w-md w-full">
    {#if loading}
      <div class="flex justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    {:else if error && !setupStatus}
      <ErrorAlert message={error} onDismiss={() => (error = null)} />
    {:else if setupStatus?.setupRequired}
      <!-- Setup Form -->
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
        <!-- Logo and Header -->
        <div class="text-center mb-8">
          <div class="mx-auto w-16 h-16 bg-gradient-to-br from-orange-500 to-amber-500 rounded-xl flex items-center justify-center mb-4">
            <svg class="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
            </svg>
          </div>
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Welcome to Pabawi</h1>
          <p class="mt-2 text-gray-600 dark:text-gray-400">Create your administrator account to get started</p>
        </div>

        {#if error}
          <div class="mb-6">
            <ErrorAlert message={error} onDismiss={() => (error = null)} />
          </div>
        {/if}

        <form onsubmit={handleSubmit} class="space-y-6">
          <!-- Username -->
          <div>
            <label for="username" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Username
            </label>
            <input
              type="text"
              id="username"
              bind:value={username}
              required
              minlength={3}
              class="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 dark:bg-gray-700 dark:text-white"
              placeholder="admin"
            />
          </div>

          <!-- Display Name -->
          <div>
            <label for="displayName" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Display Name
            </label>
            <input
              type="text"
              id="displayName"
              bind:value={displayName}
              class="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 dark:bg-gray-700 dark:text-white"
              placeholder="Administrator"
            />
          </div>

          <!-- Email -->
          <div>
            <label for="email" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Email Address
            </label>
            <input
              type="email"
              id="email"
              bind:value={email}
              required
              class="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 dark:bg-gray-700 dark:text-white"
              placeholder="admin@example.com"
            />
          </div>

          <!-- Password -->
          <div>
            <label for="password" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Password
            </label>
            <div class="relative mt-1">
              <input
                type={showPassword ? 'text' : 'password'}
                id="password"
                bind:value={password}
                oninput={() => validatePassword()}
                required
                class="block w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 dark:bg-gray-700 dark:text-white"
                placeholder="••••••••••••"
              />
              <button
                type="button"
                onclick={() => (showPassword = !showPassword)}
                class="absolute inset-y-0 right-0 px-3 flex items-center text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                {#if showPassword}
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                {:else}
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                {/if}
              </button>
            </div>

            <!-- Password strength indicator -->
            {#if password}
              {@const strength = getPasswordStrength()}
              <div class="mt-2">
                <div class="flex items-center justify-between text-xs mb-1">
                  <span class="text-gray-500 dark:text-gray-400">Password strength</span>
                  <span class="font-medium text-{strength.color}-600 dark:text-{strength.color}-400">{strength.label}</span>
                </div>
                <div class="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    class="h-full bg-{strength.color}-500 transition-all duration-300"
                    style="width: {(strength.strength / 6) * 100}%"
                  ></div>
                </div>
              </div>
            {/if}

            <!-- Validation errors -->
            {#if passwordValidation && !passwordValidation.valid}
              <ul class="mt-2 text-xs text-red-600 dark:text-red-400 space-y-1">
                {#each passwordValidation.errors as error}
                  <li class="flex items-center gap-1">
                    <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
                    </svg>
                    {error}
                  </li>
                {/each}
              </ul>
            {/if}

            <!-- Password requirements -->
            {#if passwordPolicy}
              <div class="mt-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <p class="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Password Requirements:</p>
                <ul class="text-xs text-gray-500 dark:text-gray-400 space-y-1">
                  <li class="flex items-center gap-2">
                    <span class={password.length >= passwordPolicy.minLength ? 'text-green-500' : ''}>
                      {password.length >= passwordPolicy.minLength ? '✓' : '○'}
                    </span>
                    At least {passwordPolicy.minLength} characters
                  </li>
                  {#if passwordPolicy.requireUppercase}
                    <li class="flex items-center gap-2">
                      <span class:text-green-500={hasUppercase}>{hasUppercase ? '✓' : '○'}</span>
                      One uppercase letter
                    </li>
                  {/if}
                  {#if passwordPolicy.requireLowercase}
                    <li class="flex items-center gap-2">
                      <span class:text-green-500={hasLowercase}>{hasLowercase ? '✓' : '○'}</span>
                      One lowercase letter
                    </li>
                  {/if}
                  {#if passwordPolicy.requireNumbers}
                    <li class="flex items-center gap-2">
                      <span class:text-green-500={hasNumber}>{hasNumber ? '✓' : '○'}</span>
                      One number
                    </li>
                  {/if}
                  {#if passwordPolicy.requireSpecialChars}
                    <li class="flex items-center gap-2">
                      <span class:text-green-500={hasSpecialChar}>{hasSpecialChar ? '✓' : '○'}</span>
                      One special character
                    </li>
                  {/if}
                </ul>
              </div>
            {/if}
          </div>

          <!-- Confirm Password -->
          <div>
            <label for="confirmPassword" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Confirm Password
            </label>
            <div class="relative mt-1">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                id="confirmPassword"
                bind:value={confirmPassword}
                required
                class="block w-full px-3 py-2 pr-10 border rounded-lg shadow-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 dark:bg-gray-700 dark:text-white {!passwordsMatch && confirmPassword ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'}"
                placeholder="••••••••••••"
              />
              <button
                type="button"
                onclick={() => (showConfirmPassword = !showConfirmPassword)}
                class="absolute inset-y-0 right-0 px-3 flex items-center text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                {#if showConfirmPassword}
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                {:else}
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                {/if}
              </button>
            </div>
            {#if !passwordsMatch && confirmPassword}
              <p class="mt-1 text-xs text-red-600 dark:text-red-400">Passwords do not match</p>
            {/if}
          </div>

          <!-- Submit Button -->
          <button
            type="submit"
            disabled={!formValid || submitting}
            class="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {#if submitting}
              <LoadingSpinner size="sm" class="mr-2" />
              Creating Account...
            {:else}
              <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
              Create Administrator Account
            {/if}
          </button>
        </form>

        <!-- Info text -->
        <p class="mt-6 text-xs text-center text-gray-500 dark:text-gray-400">
          This account will have full administrative access to Pabawi.
          <br />
          Make sure to use a strong, unique password.
        </p>

        <!-- Authentication Configuration Help -->
        <div class="mt-6 border-t border-gray-200 dark:border-gray-700 pt-6">
          <details class="group">
            <summary class="flex items-center justify-between cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-orange-600 dark:hover:text-orange-400">
              <span class="flex items-center gap-2">
                <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Authentication Configuration
              </span>
              <svg class="w-5 h-5 text-gray-400 group-open:rotate-180 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            </summary>

            <div class="mt-4 space-y-4 text-xs text-gray-600 dark:text-gray-400">
              <!-- Disable Authentication -->
              <div class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <h4 class="font-semibold text-blue-900 dark:text-blue-300 mb-2 flex items-center gap-2">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  Disable Authentication (Local Development)
                </h4>
                <p class="text-blue-800 dark:text-blue-300 mb-2">
                  If you're running Pabawi on your local workstation and don't need authentication, you can disable it:
                </p>
                <div class="bg-white dark:bg-gray-800 rounded border border-blue-300 dark:border-blue-700 p-2 font-mono text-xs">
                  <code class="text-blue-900 dark:text-blue-200"># In backend/.env</code><br />
                  <code class="text-blue-900 dark:text-blue-200">AUTH_ENABLED=false</code>
                </div>
                <p class="text-blue-800 dark:text-blue-300 mt-2">
                  Then restart the backend server. All features will be accessible without login.
                </p>
              </div>

              <!-- Configure Authentication -->
              <div class="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <h4 class="font-semibold text-gray-900 dark:text-gray-300 mb-2 flex items-center gap-2">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Authentication Configuration Options
                </h4>
                <p class="text-gray-700 dark:text-gray-400 mb-2">
                  Current authentication settings can be configured in <code class="bg-gray-200 dark:bg-gray-700 px-1 rounded">backend/.env</code>:
                </p>
                <div class="bg-white dark:bg-gray-900 rounded border border-gray-300 dark:border-gray-600 p-2 font-mono text-xs space-y-1">
                  <div><code class="text-gray-600 dark:text-gray-500"># Enable/disable authentication</code></div>
                  <div><code class="text-gray-900 dark:text-gray-200">AUTH_ENABLED=true</code></div>
                  <div class="pt-2"><code class="text-gray-600 dark:text-gray-500"># JWT secret (required when auth enabled)</code></div>
                  <div><code class="text-gray-900 dark:text-gray-200">JWT_SECRET=your-secret-key</code></div>
                  <div class="pt-2"><code class="text-gray-600 dark:text-gray-500"># Token expiry (seconds)</code></div>
                  <div><code class="text-gray-900 dark:text-gray-200">JWT_ACCESS_TOKEN_EXPIRY=3600  # 1 hour</code></div>
                  <div><code class="text-gray-900 dark:text-gray-200">JWT_REFRESH_TOKEN_EXPIRY=604800  # 7 days</code></div>
                  <div class="pt-2"><code class="text-gray-600 dark:text-gray-500"># Password policy</code></div>
                  <div><code class="text-gray-900 dark:text-gray-200">PASSWORD_MIN_LENGTH=12</code></div>
                  <div><code class="text-gray-900 dark:text-gray-200">PASSWORD_REQUIRE_UPPERCASE=true</code></div>
                  <div><code class="text-gray-900 dark:text-gray-200">PASSWORD_REQUIRE_LOWERCASE=true</code></div>
                  <div><code class="text-gray-900 dark:text-gray-200">PASSWORD_REQUIRE_NUMBERS=true</code></div>
                  <div><code class="text-gray-900 dark:text-gray-200">PASSWORD_REQUIRE_SPECIAL=true</code></div>
                </div>
              </div>

              <!-- Security Note -->
              <div class="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                <h4 class="font-semibold text-yellow-900 dark:text-yellow-300 mb-2 flex items-center gap-2">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  Security Considerations
                </h4>
                <ul class="text-yellow-800 dark:text-yellow-300 space-y-1 list-disc list-inside">
                  <li>Pabawi can execute privileged operations on your infrastructure</li>
                  <li>For production use, always enable authentication and use strong passwords</li>
                  <li>If exposing to network, deploy behind a reverse proxy with additional authentication</li>
                  <li>Authentication can be disabled for local workstation use only</li>
                </ul>
              </div>

              <!-- Documentation Link -->
              <div class="text-center">
                <a
                  href="https://github.com/yourusername/pabawi/blob/main/docs/configuration.md"
                  target="_blank"
                  class="inline-flex items-center gap-1 text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 font-medium"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                  Full Configuration Documentation
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </div>
            </div>
          </details>
        </div>
      </div>
    {:else}
      <!-- Setup already complete -->
      <div class="text-center py-12">
        <svg class="mx-auto h-16 w-16 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <h2 class="mt-4 text-xl font-semibold text-gray-900 dark:text-white">Setup Complete</h2>
        <p class="mt-2 text-gray-600 dark:text-gray-400">
          Pabawi has already been configured.
        </p>
        <a
          href="/login"
          class="mt-6 inline-flex items-center px-4 py-2 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-orange-600 hover:bg-orange-700"
        >
          Go to Login
        </a>
      </div>
    {/if}
  </div>
</div>
