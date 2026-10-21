import { readFileSync } from 'node:fs';
import { connect as tcpConnect } from 'node:net';
import type { Socket } from 'node:net';
import { connect as tlsConnect, checkServerIdentity, getCACertificates } from 'node:tls';
import type { ConnectionOptions, PeerCertificate, TLSSocket } from 'node:tls';
import { Client, MessageParser, MessageResponseStatus, SearchResponse, SearchEntry, StatusCodeParser, PagedResultsControl } from 'ldapts';
import type { SearchOptions, SearchResult } from 'ldapts';
import type { LdapConfig } from '../../config/ldap';
import { LdapDirectoryError } from './LdapDirectoryError';

export interface LdapEndpoint { hostname: string; port: number }
export interface LdapConnection {
  bind(dn: string, password: string): Promise<void>;
  search(base: string, options: SearchOptions): Promise<SearchResult>;
  close(): void;
}
export type LdapConnector = (config: LdapConfig, endpoint: LdapEndpoint, signal: AbortSignal) => Promise<LdapConnection>;

export function verifyLdapHostname(host: string, certificate: PeerCertificate, allowWildcard: boolean): Error | undefined {
  const normalError = checkServerIdentity(host, certificate);
  if (normalError || allowWildcard) return normalError;
  // Only reject wildcard identities that could match this endpoint, not unrelated SANs.
  const identities = certificate.subjectaltname
    ? certificate.subjectaltname.split(', ').filter(value => value.startsWith('DNS:')).map(value => value.slice(4))
    : [certificate.subject.CN].flat();
  const wildcardUsed = identities.some(identity => !!identity && identity.includes('*') &&
    !checkServerIdentity(host, { subjectaltname: 'DNS:' + identity } as PeerCertificate));
  return wildcardUsed ? new LdapDirectoryError('UNAVAILABLE') : undefined;
}

export const openLdapConnection: LdapConnector = async (config, endpoint, signal) => {
  const sockets = new Set<Socket>();
  let client: Client | undefined;
  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    signal.removeEventListener('abort', close);
    // Unbind clears library credential references; destruction also interrupts pending operations.
    if (client) void client.unbind().catch(() => undefined);
    for (const socket of sockets) socket.destroy();
    sockets.clear();
  };
  const track = <T extends Socket>(socket: T): T => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    return socket;
  };
  signal.addEventListener('abort', close, { once: true });
  const tlsOptions: ConnectionOptions = {
    minVersion: 'TLSv1.2', rejectUnauthorized: true, servername: endpoint.hostname,
    checkServerIdentity: (host, certificate) => verifyLdapHostname(host, certificate, config.allowWildcardCertificates),
    ...(config.caFile ? { ca: [...getCACertificates('default'), readFileSync(config.caFile, 'utf8')] } : {}),
  };
  try {
    signal.throwIfAborted();
    const socket = config.tlsMode === 'ldaps'
      ? track(tlsConnect({ ...tlsOptions, host: endpoint.hostname, port: endpoint.port }))
      : track(tcpConnect({ host: endpoint.hostname, port: endpoint.port }));
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { close(); reject(new LdapDirectoryError('TIMEOUT')); },
        config.connectTimeoutSeconds * 1000);
      const abort = (): void => { done(new LdapDirectoryError('TIMEOUT')); };
      signal.addEventListener('abort', abort, { once: true });
      const done = (error?: Error): void => {
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
        socket.removeListener('error', done);
        if (error) reject(error); else resolve();
      };
      socket.once('error', done);
      socket.once(config.tlsMode === 'ldaps' ? 'secureConnect' : 'connect', () => { done(); });
    });
    let secureTransport: Socket = socket;
    let supplied = false;
    const existingSocket = (): Socket => {
      signal.throwIfAborted();
      if (closed || supplied) throw new LdapDirectoryError('UNAVAILABLE');
      supplied = true;
      return socket;
    };
    const secureSocket = (options: ConnectionOptions): TLSSocket => {
      signal.throwIfAborted();
      if (closed) throw new LdapDirectoryError('UNAVAILABLE');
      if (config.tlsMode === 'ldaps') return existingSocket() as TLSSocket;
      if (options.socket !== socket) throw new LdapDirectoryError('UNAVAILABLE');
      secureTransport = track(tlsConnect(options));
      return secureTransport as TLSSocket;
    };
    client = new Client({
      url: (config.tlsMode === 'ldaps' ? 'ldaps://' : 'ldap://') + endpoint.hostname + ':' + String(endpoint.port),
      connectTimeout: config.connectTimeoutSeconds * 1000,
      timeout: config.operationTimeoutSeconds * 1000, strictDN: true, autoRebind: false,
      // ldapts 9.2 uses (port, host, options) for LDAPS and (options) for StartTLS.
      createConnection: existingSocket,
      createSecureConnection: ((portOrOptions: number | ConnectionOptions): TLSSocket =>
        secureSocket(typeof portOrOptions === 'number' ? tlsOptions : portOrOptions)),
      ...(config.tlsMode === 'ldaps' ? { tlsOptions } : {}),
    });
    if (config.tlsMode === 'starttls') await client.startTLS(tlsOptions);
    signal.throwIfAborted();
    const connectedClient = client;
    // ldapts suppresses sizeLimitExceeded when a request specifies sizeLimit.
    // Observe the server status so truncated authentication data can never be accepted.
    const parser = new MessageParser();
    let searchError: Error | undefined;
    const readSearchError = (): Error | undefined => searchError;
    let searchLimit = 0;
    let entryCount = 0;
    parser.on('error', () => { searchError = new LdapDirectoryError('INCOMPLETE_RESULT'); close(); });
    parser.on('message', message => {
      if (message instanceof SearchEntry && ++entryCount > searchLimit) {
        searchError = new LdapDirectoryError('LIMIT_EXCEEDED');
        close();
      }
      if (message instanceof SearchResponse && message.controls?.some(control =>
        control instanceof PagedResultsControl && !!control.value?.cookie?.length)) {
        searchError = new LdapDirectoryError('INCOMPLETE_RESULT');
      }
      if (message instanceof SearchResponse && message.status !== MessageResponseStatus.Success) {
        searchError = StatusCodeParser.parse(message);
      }
    });
    secureTransport.prependListener('data', (data: Buffer) => { parser.read(data, new Map()); });
    return {
      bind: async (dn, password): Promise<void> => {
        signal.throwIfAborted();
        if (closed) throw new LdapDirectoryError('UNAVAILABLE');
        await connectedClient.bind(dn, password);
        signal.throwIfAborted();
      },
      search: async (base, options): Promise<SearchResult> => {
        signal.throwIfAborted();
        if (closed) throw new LdapDirectoryError('UNAVAILABLE');
        searchError = undefined;
        entryCount = 0;
        searchLimit = options.sizeLimit ?? 0;
        let result: SearchResult;
        try { result = await connectedClient.search(base, options); }
        catch (error) { throw readSearchError() ?? error; }
        const serverError = readSearchError();
        if (serverError) throw serverError;
        signal.throwIfAborted();
        return result;
      },
      close,
    };
  } catch (error) {
    close();
    throw error;
  }
};
