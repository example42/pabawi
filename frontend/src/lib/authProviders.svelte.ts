import { get } from './api';

export interface ProvidersResponse {
  local: boolean;
  entraId?: { enabled: boolean; name: string };
  ldap?: { enabled: boolean; name: string; loginHelpUrl: string };
}

function safeHelpUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

class AuthProviders {
  local = $state(true);
  entraId = $state<ProvidersResponse['entraId']>(undefined);
  ldap = $state<ProvidersResponse['ldap']>(undefined);
  error = $state(false);
  isDiscovering = $state(false);
  get ldapHelpUrl(): string | null { return safeHelpUrl(this.ldap?.loginHelpUrl); }

  async discover(): Promise<void> {
    this.isDiscovering = true;
    this.error = false;
    try {
      const response = await get<ProvidersResponse>('/api/auth/providers', {
        timeout: 5000, maxRetries: 0, showRetryNotifications: false,
      });
      this.local = response.local;
      this.entraId = response.entraId;
      this.ldap = response.ldap;
    } catch {
      this.local = true;
      this.entraId = undefined;
      this.ldap = undefined;
      this.error = true;
    } finally { this.isDiscovering = false; }
  }
}

export const authProviders = new AuthProviders();
