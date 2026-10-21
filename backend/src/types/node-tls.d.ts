import 'node:tls';

// The supported Node 24 runtime exposes this API; the repository uses Node 20 types.
declare module 'node:tls' {
  export function getCACertificates(type?: 'default' | 'system' | 'bundled' | 'extra'): string[];
}
