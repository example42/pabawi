import { ldapDnEquals, ldapDnWithinScope, parseLdapDn } from '../config/ldapDn';
import {
  AndFilter, OrFilter, EqualityFilter, ExtensibleFilter, SubstringFilter,
  InappropriateMatchingError, InvalidCredentialsError,
  SizeLimitExceededError, TimeLimitExceededError, UnavailableCriticalExtensionError,
} from 'ldapts';
import type { Entry, Filter, SearchOptions } from 'ldapts';
import type { LdapConfig } from '../config/ldap';
import { parseLdapFilter } from '../config/ldapFilter';
import type { LoggerService } from './LoggerService';
import { LdapDirectoryError } from './ldap/LdapDirectoryError';
import { canonicalUuid, guidToSubject, subjectToGuid } from './ldap/identity';
import { adPolicyAttributes, attributeValues, checkAdEligibility, textAttribute } from './ldap/policy';
import { openLdapConnection } from './ldap/transport';
import type { LdapConnection, LdapConnector, LdapEndpoint } from './ldap/transport';

export { LdapDirectoryError } from './ldap/LdapDirectoryError';

export interface LdapDirectoryUser {
  subject: string; dn: string; loginName: string; displayName: string;
  email: string | null; firstName: string; lastName: string;
}
export interface LdapDirectoryGroup { subject: string; dn: string; name: string }
export interface LdapDirectoryResult { user: LdapDirectoryUser; groupSubjects: string[] }
export interface LdapDiagnosticStage {
  stage: 'tls' | 'lookup' | 'identity' | 'eligibility' | 'groups';
  status: 'passed' | 'failed'; durationMs: number; code?: string;
}
export interface LdapDiagnostics {
  authenticated: false; stages: LdapDiagnosticStage[]; groupSubjects?: string[];
}
interface Transaction {
  signal: AbortSignal; endpoint: LdapEndpoint; lookup: LdapConnection;
  connections: LdapConnection[];
}

function safeDirectoryError(error: unknown): LdapDirectoryError {
  if (error instanceof LdapDirectoryError) return error;
  if (error instanceof InvalidCredentialsError) return new LdapDirectoryError('INVALID_CREDENTIALS');
  if (error instanceof SizeLimitExceededError) return new LdapDirectoryError('LIMIT_EXCEEDED');
  if (error instanceof TimeLimitExceededError) return new LdapDirectoryError('TIMEOUT');
  return new LdapDirectoryError('UNAVAILABLE');
}

export class LdapDirectoryService {
  private active = 0;
  private readonly userBase: string;
  private readonly groupBase: string;
  private readonly eligibilityFilter: Filter | undefined;

  constructor(
    private readonly config: LdapConfig,
    private readonly logger: LoggerService,
    private readonly connect: LdapConnector = openLdapConnection,
  ) {
    this.eligibilityFilter = config.userEligibilityFilter ? parseLdapFilter(config.userEligibilityFilter) : undefined;
    this.userBase = [config.userRdn, config.baseDn].filter(Boolean).join(',');
    this.groupBase = [config.groupRdn, config.baseDn].filter(Boolean).join(',');
  }

  public async authenticate(loginName: string, password: string, mappedGroups: readonly string[] = []): Promise<LdapDirectoryResult> {
    if (!loginName || !password || Buffer.byteLength(loginName) > 1024 || Buffer.byteLength(password) > 4096) {
      throw new LdapDirectoryError('INVALID_CREDENTIALS');
    }
    return this.transaction('authenticate', async tx => {
      const before = await this.user(tx, this.equality(this.config.userLookupAttr, loginName), true);
      const userBind = await this.connect(this.config, tx.endpoint, tx.signal);
      if (tx.signal.aborted) { userBind.close(); throw new LdapDirectoryError('TIMEOUT'); }
      tx.connections.push(userBind);
      tx.signal.throwIfAborted();
      await userBind.bind(before.dn, password);
      userBind.close();
      // A reused login or moved locator must not substitute another immutable identity after bind.
      let after: LdapDirectoryUser;
      try { after = await this.user(tx, this.subjectFilter(this.config.userIdAttr, before.subject), false); }
      catch (error) {
        if (error instanceof LdapDirectoryError && error.code === 'INELIGIBLE') throw new LdapDirectoryError('IDENTITY_CHANGED');
        throw error;
      }
      if (before.subject !== after.subject || before.loginName !== after.loginName ||
          !ldapDnEquals(before.dn, after.dn)) {
        throw new LdapDirectoryError('IDENTITY_CHANGED');
      }
      return { user: after, groupSubjects: await this.memberships(tx, after.dn, mappedGroups) };
    });
  }

  public async revalidate(subject: string, mappedGroups: readonly string[] = []): Promise<LdapDirectoryResult> {
    const identityFilter = this.subjectFilter(this.config.userIdAttr, subject);
    return this.transaction('revalidate', async tx => {
      const user = await this.user(tx, identityFilter, false);
      if (user.subject !== canonicalUuid(subject)) throw new LdapDirectoryError('IDENTITY_CHANGED');
      return { user, groupSubjects: await this.memberships(tx, user.dn, mappedGroups) };
    });
  }

  public async searchGroups(query: string): Promise<LdapDirectoryGroup[]> {
    if (!query || Buffer.byteLength(query) > 1024) throw new LdapDirectoryError('LIMIT_EXCEEDED');
    return this.transaction('searchGroups', async tx => {
      const filter = this.and(this.equality('objectClass', this.config.groupObjectClass),
        new OrFilter({ filters: [...new Set([this.config.groupLookupAttr, this.config.groupNameAttr])]
          .map(attribute => new SubstringFilter({ attribute, any: [query] })) }));
      const entries = await this.search(tx, this.groupBase, filter, this.groupAttributes(), this.config.groupSearchLimit);
      return entries.map(entry => this.group(entry));
    });
  }

  public async resolveGroup(subject: string): Promise<LdapDirectoryGroup> {
    const filter = this.subjectFilter(this.config.groupIdAttr, subject);
    return this.transaction('resolveGroup', async tx => this.resolveGroupInTransaction(tx, filter));
  }

  public async diagnose(input: { username?: string; groupSubjects?: string[] }): Promise<LdapDiagnostics> {
    const started = Date.now();
    const stages: LdapDiagnosticStage[] = [];
    const result: LdapDiagnostics = { authenticated: false, stages };
    try {
      await this.transaction('diagnose', async tx => {
        const username = input.username;
        if (username === undefined) return;
        if (!username || Buffer.byteLength(username) > 1024) throw new LdapDirectoryError('LIMIT_EXCEEDED');
        const subject = await this.diagnosticStage(stages, 'identity', async () => {
          const entries = await this.search(tx, this.userBase,
            this.and(this.equality('objectClass', this.config.userObjectClass), this.equality(this.config.userLookupAttr, username)),
            [this.config.userIdAttr], 2);
          if (entries.length !== 1) throw new LdapDirectoryError('INVALID_IDENTITY');
          if (!this.inScope(entries[0].dn, this.userBase)) throw new LdapDirectoryError('INCOMPLETE_RESULT');
          return this.identity(entries[0], this.config.userIdAttr);
        });
        const user = await this.diagnosticStage(stages, 'eligibility', () => this.user(tx, this.subjectFilter(this.config.userIdAttr, subject), false));
        const groups = input.groupSubjects;
        if (groups?.length) {
          result.groupSubjects = await this.diagnosticStage(stages, 'groups', async () => {
            for (const subject of groups) await this.resolveGroupInTransaction(tx, this.subjectFilter(this.config.groupIdAttr, subject));
            return this.memberships(tx, user.dn, groups);
          });
        }
      }, stages);
    } catch (error) {
      const code = safeDirectoryError(error).code;
      const failed = stages.find(stage => stage.status === 'failed');
      if (failed) {
        failed.code = code;
        failed.durationMs = Math.max(failed.durationMs, Date.now() - started - stages.filter(stage => stage.status === 'passed')
          .reduce((sum, stage) => sum + stage.durationMs, 0));
      } else stages.push({ stage: 'lookup', status: 'failed', durationMs: Date.now() - started, code });
      delete result.groupSubjects;
    }
    // Aborted protocol promises can settle later; their bookkeeping must not change the returned report.
    return { ...result, stages: stages.map(stage => ({ ...stage })) };
  }

  private async diagnosticStage<T>(stages: LdapDiagnosticStage[], stage: LdapDiagnosticStage['stage'], work: () => Promise<T>): Promise<T> {
    const started = Date.now();
    const entry: LdapDiagnosticStage = { stage, status: 'failed', durationMs: 0, code: 'TIMEOUT' };
    stages.push(entry);
    try {
      const result = await work();
      entry.status = 'passed';
      entry.durationMs = Date.now() - started;
      delete entry.code;
      return result;
    } catch (error) {
      entry.code = safeDirectoryError(error).code;
      entry.durationMs = Date.now() - started;
      throw error;
    }
  }

  private async transaction<T>(operation: string, work: (tx: Transaction) => Promise<T>, stages?: LdapDiagnosticStage[]): Promise<T> {
    if (this.active >= this.config.maxConcurrentOperations) throw new LdapDirectoryError('BUSY');
    this.active++;
    const started = Date.now();
    const controller = new AbortController();
    const connections: LdapConnection[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new LdapDirectoryError('TIMEOUT')); },
        this.config.requestTimeoutSeconds * 1000);
    });
    const run = async (): Promise<T> => {
      let lookup: LdapConnection | undefined;
      let selected: LdapEndpoint | undefined;
      const endpoints = [{ hostname: this.config.hostname, port: this.config.port }, ...this.config.failoverEndpoints];
      const establish = async (): Promise<void> => {
        for (const [index, endpoint] of endpoints.entries()) {
          controller.signal.throwIfAborted();
          try {
            const connection = await this.connect(this.config, endpoint, controller.signal);
            if (controller.signal.aborted) { connection.close(); controller.signal.throwIfAborted(); }
            lookup = connection;
            connections.push(connection);
            selected = endpoint;
            if (index > 0) this.logger.info('LDAP endpoint failover', {
              component: 'LdapDirectoryService', operation, metadata: { directoryId: this.config.directoryId, endpointIndex: index },
            });
            break;
          } catch (error) {
            if (controller.signal.aborted) throw new LdapDirectoryError('TIMEOUT');
            const code = error instanceof Error ? (error as NodeJS.ErrnoException).code : undefined;
            const transient = code && ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH', 'EAI_AGAIN', 'ENOTFOUND'].includes(code);
            if (!transient && !(error instanceof LdapDirectoryError && error.code === 'TIMEOUT')) {
              throw new LdapDirectoryError('UNAVAILABLE');
            }
          }
        }
        if (!lookup || !selected) throw new LdapDirectoryError('UNAVAILABLE');
      };
      if (stages) await this.diagnosticStage(stages, 'tls', establish);
      else await establish();
      if (!lookup || !selected) throw new LdapDirectoryError('UNAVAILABLE');
      // Failover ends before any credential-bearing bind. User passwords are never retried.
      const lookupConnection = lookup;
      const bind = async (): Promise<void> => {
        try { await lookupConnection.bind(this.config.lookupUser, this.config.lookupPassword); }
        catch (error) {
          // A service credential failure says nothing about the submitted user's password.
          if (error instanceof InvalidCredentialsError) throw new LdapDirectoryError('UNAVAILABLE');
          throw error;
        }
      };
      if (stages) await this.diagnosticStage(stages, 'lookup', bind);
      else await bind();
      return work({ signal: controller.signal, endpoint: selected, lookup, connections });
    };
    try {
      const result = await Promise.race([run(), deadline]);
      this.logger.debug('LDAP operation completed', {
        component: 'LdapDirectoryService', operation, metadata: { directoryId: this.config.directoryId, durationMs: Date.now() - started },
      });
      return result;
    } catch (error) {
      const safeError = controller.signal.aborted ? new LdapDirectoryError('TIMEOUT') : safeDirectoryError(error);
      this.logger.warn('LDAP operation failed', {
        component: 'LdapDirectoryService', operation, metadata: { directoryId: this.config.directoryId,
        reason: safeError.code, durationMs: Date.now() - started },
      });
      throw safeError;
    } finally {
      if (timer) clearTimeout(timer);
      controller.abort();
      for (const connection of connections) connection.close();
      this.active--;
    }
  }

  private equality(attribute: string, value: string | Buffer): EqualityFilter {
    return new EqualityFilter({ attribute, value });
  }

  private subjectFilter(attribute: string, subject: string): Filter {
    return this.equality(attribute, this.config.directoryType === 'ad' ? subjectToGuid(subject) : canonicalUuid(subject));
  }

  private and(...filters: (Filter | undefined)[]): Filter {
    return new AndFilter({ filters: filters.filter((filter): filter is Filter => filter !== undefined) });
  }

  private async search(tx: Transaction, base: string, filter: Filter, attributes: string[], limit: number): Promise<Entry[]> {
    tx.signal.throwIfAborted();
    const options: SearchOptions = {
      scope: 'sub', derefAliases: 'never', filter, attributes, sizeLimit: limit,
      paged: false, timeLimit: this.config.operationTimeoutSeconds,
      explicitBufferAttributes: this.config.directoryType === 'ad' ? [this.config.userIdAttr, this.config.groupIdAttr] : [],
    };
    const result = await tx.lookup.search(base, options);
    tx.signal.throwIfAborted();
    if (result.searchReferences.length) throw new LdapDirectoryError('INCOMPLETE_RESULT');
    if (result.searchEntries.length > limit) throw new LdapDirectoryError('LIMIT_EXCEEDED');
    return result.searchEntries;
  }

  private identity(entry: Entry, attribute: string): string {
    const values = attributeValues(entry, attribute);
    if (values.length !== 1) throw new LdapDirectoryError('INVALID_IDENTITY');
    const value = values[0];
    if (this.config.directoryType === 'ad') {
      if (!Buffer.isBuffer(value)) throw new LdapDirectoryError('INVALID_IDENTITY');
      return guidToSubject(value);
    }
    if (typeof value !== 'string') throw new LdapDirectoryError('INVALID_IDENTITY');
    return canonicalUuid(value);
  }

  private async user(tx: Transaction, identityFilter: Filter, credentials: boolean): Promise<LdapDirectoryUser> {
    const c = this.config;
    const entries = await this.search(tx, this.userBase,
      this.and(this.equality('objectClass', c.userObjectClass), identityFilter, this.eligibilityFilter),
      [c.userIdAttr, c.userLookupAttr, c.userEmailAttr, c.userDisplayNameAttr, c.userGivenNameAttr, c.userSurnameAttr,
        ...(c.directoryType === 'ad' ? adPolicyAttributes : [])], 2);
    if (entries.length !== 1) throw new LdapDirectoryError(credentials ? 'INVALID_CREDENTIALS'
      : entries.length === 0 ? 'INELIGIBLE' : 'INCOMPLETE_RESULT');
    const entry = entries[0];
    const subject = this.identity(entry, c.userIdAttr);
    if (c.directoryType === 'ad') checkAdEligibility(entry);
    const loginName = textAttribute(entry, c.userLookupAttr, true);
    if (!loginName || !this.inScope(entry.dn, this.userBase)) throw new LdapDirectoryError('INVALID_IDENTITY');
    return { subject, dn: entry.dn, loginName,
      email: textAttribute(entry, c.userEmailAttr),
      displayName: textAttribute(entry, c.userDisplayNameAttr) ?? loginName,
      firstName: textAttribute(entry, c.userGivenNameAttr) ?? '',
      lastName: textAttribute(entry, c.userSurnameAttr) ?? '' };
  }

  private groupAttributes(): string[] {
    const c = this.config;
    return [c.groupIdAttr, c.groupNameAttr, c.groupLookupAttr,
      ...(c.directoryType === 'openldap' ? [c.groupMemberAttr] : [])];
  }

  private inScope(dn: string, base: string): boolean {
    return ldapDnWithinScope(dn, base);
  }

  private group(entry: Entry): LdapDirectoryGroup {
    if (!this.inScope(entry.dn, this.groupBase)) throw new LdapDirectoryError('INCOMPLETE_RESULT');
    if (this.config.directoryType === 'openldap') {
      for (const member of attributeValues(entry, this.config.groupMemberAttr)) {
        if (typeof member !== 'string' || /#'[01]*'B$/i.test(member)) {
          throw new LdapDirectoryError('INCOMPLETE_RESULT');
        }
        try { if (parseLdapDn(member).length === 0) throw new LdapDirectoryError('INCOMPLETE_RESULT'); }
        catch { throw new LdapDirectoryError('INCOMPLETE_RESULT'); }
      }
    }
    const name = textAttribute(entry, this.config.groupNameAttr) ?? textAttribute(entry, this.config.groupLookupAttr, true);
    if (!name) throw new LdapDirectoryError('INVALID_IDENTITY');
    return { subject: this.identity(entry, this.config.groupIdAttr), dn: entry.dn, name };
  }

  private async resolveGroupInTransaction(tx: Transaction, filter: Filter): Promise<LdapDirectoryGroup> {
    const entries = await this.search(tx, this.groupBase,
      this.and(this.equality('objectClass', this.config.groupObjectClass), filter), this.groupAttributes(), 2);
    if (entries.length !== 1) throw new LdapDirectoryError('INVALID_IDENTITY');
    return this.group(entries[0]);
  }

  private async memberships(tx: Transaction, userDn: string, subjects: readonly string[]): Promise<string[]> {
    if (subjects.length > this.config.groupTraversalLimit) throw new LdapDirectoryError('LIMIT_EXCEEDED');
    const mapped = new Set(subjects.map(canonicalUuid));
    if (!mapped.size) return [];
    const c = this.config;
    const visited: LdapDirectoryGroup[] = [];
    const visitedSubjects = new Set<string>();
    const frontier = [{ dn: userDn, depth: 0 }];
    // Reverse membership searches avoid downloading AD ranged member lists entirely.
    for (const current of frontier) {
      const parents = await this.search(tx, this.groupBase,
        this.and(this.equality('objectClass', c.groupObjectClass), this.equality(c.groupMemberAttr, current.dn)),
        this.groupAttributes(), c.groupTraversalLimit - visited.length + 1);
      for (const entry of parents) {
        const group = this.group(entry);
        if (visitedSubjects.has(group.subject)) {
          if (!visited.some(previous => previous.subject === group.subject && ldapDnEquals(previous.dn, group.dn))) {
            throw new LdapDirectoryError('IDENTITY_CHANGED');
          }
          continue;
        }
        if (visited.length >= c.groupTraversalLimit || (c.searchNestedGroups && current.depth >= c.nestedGroupMaxDepth)) {
          throw new LdapDirectoryError('LIMIT_EXCEEDED');
        }
        visitedSubjects.add(group.subject);
        visited.push(group);
        if (c.searchNestedGroups) frontier.push({ dn: group.dn, depth: current.depth + 1 });
      }
      if (!c.searchNestedGroups) break;
    }
    const result = visited.filter(group => mapped.has(group.subject)).map(group => group.subject);
    if (c.directoryType === 'ad' && c.searchNestedGroups && !c.disableMatchingRuleInChain) {
      // Bounded traversal proves scope and completeness first. The AD rule is only a checked optimization.
      try {
        const entries = await this.search(tx, this.groupBase,
          this.and(this.equality('objectClass', c.groupObjectClass),
            new ExtensibleFilter({ matchType: c.groupMemberAttr, rule: '1.2.840.113556.1.4.1941', value: userDn })),
          this.groupAttributes(), c.groupTraversalLimit);
        const chain = new Set(entries.map(entry => this.group(entry).subject));
        if (chain.size !== visitedSubjects.size || [...visitedSubjects].some(subject => !chain.has(subject))) {
          throw new LdapDirectoryError('INCOMPLETE_RESULT');
        }
      } catch (error) {
        if (!(error instanceof InappropriateMatchingError || error instanceof UnavailableCriticalExtensionError)) throw error;
      }
    }
    return result;
  }
}
