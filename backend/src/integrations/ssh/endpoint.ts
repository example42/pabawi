import type { SSHHost } from './types';

export function resolveSSHEndpoint(host: SSHHost, defaultUser = 'root', defaultPort = 22): {
  hostname: string; port: number; user: string; poolKey: string;
} {
  const url = new URL(host.uri.startsWith('ssh://') ? host.uri : `ssh://${host.uri}`);
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const port = host.port ?? (url.port ? Number(url.port) : defaultPort);
  const user = host.user ?? defaultUser;
  return { hostname, port, user, poolKey: `${user}@${hostname}:${String(port)}` };
}
