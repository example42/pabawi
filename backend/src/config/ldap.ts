import { readFileSync } from 'node:fs';
import { isIP } from 'node:net';
import { X509Certificate } from 'node:crypto';
import { parseLdapDn } from './ldapDn';
import { parseLdapFilter } from './ldapFilter';
import { z } from "zod/v3";

const attribute = z.string().regex(/^(?:[a-zA-Z][a-zA-Z0-9-]*|[0-9]+(?:\.[0-9]+)+)$/);
const hostname = z.string().max(253).refine(value =>
  !isIP(value) && value.includes('.') &&
  value.split('.').every(label => /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(label)),
'Must be an FQDN without protocol, credentials or path');
const dn = z.string().max(8192).refine(value => {
  try { return parseLdapDn(value).length > 0; } catch { return false; }
}, 'Must be a nonempty LDAP DN');
const relativeDn = z.union([z.literal(''), dn]);
const filter = z.string().max(8192).refine(value => {
  if (!value) return true;
  try { return !!parseLdapFilter(value); }
  catch { return false; }
}, 'Must be a complete LDAP filter');
const positive = (max: number): z.ZodNumber => z.number().int().min(1).max(max);

export const LdapConfigSchema = z.object({
  enabled: z.literal(true),
  directoryId: z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/),
  directoryType: z.enum(['ad', 'openldap']),
  displayName: z.string().min(1).max(200).default('LDAP'),
  loginHelpUrl: z.union([z.literal(''), z.string().url().refine(value => {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  }, 'Must be an HTTP(S) link without credentials')]).default(''),
  hostname,
  port: positive(65535),
  failoverEndpoints: z.array(z.object({ hostname, port: positive(65535) }).strict()).max(4).default([]),
  tlsMode: z.enum(['ldaps', 'starttls']).default('ldaps'),
  caFile: z.string().default('').refine(value => {
    if (!value) return true;
    try {
      const pem = readFileSync(value, 'utf8');
      const certificates = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g);
      return !!certificates?.length && certificates.every(cert => !!new X509Certificate(cert));
    } catch { return false; }
  }, 'Must be a readable PEM CA bundle'),
  allowWildcardCertificates: z.boolean().default(false),
  lookupUser: z.union([z.literal(''), dn]).default(''),
  lookupPassword: z.string().default(''),
  anonymousLookup: z.boolean().default(false),
  connectTimeoutSeconds: positive(30).default(10),
  operationTimeoutSeconds: positive(30).default(10),
  requestTimeoutSeconds: positive(60).default(30),
  baseDn: dn,
  userRdn: relativeDn.default(''),
  userObjectClass: attribute,
  userLookupAttr: attribute,
  userIdAttr: attribute,
  userEmailAttr: attribute.default('mail'),
  userDisplayNameAttr: attribute.default('displayName'),
  userGivenNameAttr: attribute.default('givenName'),
  userSurnameAttr: attribute.default('sn'),
  userEligibilityFilter: filter.default(''),
  groupRdn: relativeDn.default(''),
  groupObjectClass: attribute,
  groupMemberAttr: attribute,
  groupIdAttr: attribute,
  groupNameAttr: attribute,
  groupLookupAttr: attribute.default('cn'),
  searchNestedGroups: z.boolean().default(false),
  disableMatchingRuleInChain: z.boolean().default(false),
  nestedGroupMaxDepth: positive(32).default(10),
  groupSearchLimit: positive(500).default(100),
  groupTraversalLimit: positive(10000).default(1000),
  revalidationIntervalSeconds: positive(300).default(300),
  maxConcurrentOperations: positive(100).default(10),
}).superRefine((config, context) => {
  if (config.anonymousLookup ? !!(config.lookupUser || config.lookupPassword) : !(config.lookupUser && config.lookupPassword)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['lookupUser'],
      message: 'Anonymous lookup requires absent credentials; authenticated lookup requires DN and nonempty password' });
  }
  if (config.directoryType === 'openldap' && !config.userEligibilityFilter) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['userEligibilityFilter'],
      message: 'OpenLDAP requires an explicit positive eligibility filter' });
  }
  if (config.groupMemberAttr.toLowerCase() === 'memberuid') {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['groupMemberAttr'], message: 'Only DN-valued membership is supported' });
  }
});
export type LdapConfig = z.infer<typeof LdapConfigSchema>;

export function parseLdapConfig(env: NodeJS.ProcessEnv): LdapConfig | undefined {
  const bool = (name: string, value: string | undefined): boolean => {
    if (value === undefined || value === 'false') return false;
    if (value === 'true') return true;
    throw new Error(name + ' must be true or false');
  };
  if (!bool('LDAP_ENABLED', env.LDAP_ENABLED)) return undefined;
  const integer = (value: string | undefined): number | undefined =>
    value === undefined ? undefined : /^\d+$/.test(value) ? Number(value) : NaN;
  const ad = env.LDAP_DIRECTORY_TYPE === 'ad';
  let endpoints: unknown = [];
  if (env.LDAP_FAILOVER_ENDPOINTS !== undefined) {
    try { endpoints = JSON.parse(env.LDAP_FAILOVER_ENDPOINTS) as unknown; }
    catch { throw new Error('LDAP_FAILOVER_ENDPOINTS must be a JSON array'); }
  }
  return LdapConfigSchema.parse({
    enabled: true, directoryId: env.LDAP_DIRECTORY_ID, directoryType: env.LDAP_DIRECTORY_TYPE,
    displayName: env.LDAP_DISPLAY_NAME, loginHelpUrl: env.LDAP_LOGIN_HELP_URL,
    hostname: env.LDAP_HOSTNAME,
    port: env.LDAP_PORT === undefined ? (env.LDAP_TLS_MODE === 'starttls' ? 389 : 636) : integer(env.LDAP_PORT),
    failoverEndpoints: endpoints, tlsMode: env.LDAP_TLS_MODE, caFile: env.LDAP_CA_FILE,
    allowWildcardCertificates: bool('LDAP_ALLOW_WILDCARD_CERTIFICATES', env.LDAP_ALLOW_WILDCARD_CERTIFICATES),
    lookupUser: env.LDAP_LOOKUP_USER, lookupPassword: env.LDAP_LOOKUP_PASSWORD,
    anonymousLookup: bool('LDAP_ANONYMOUS_LOOKUP', env.LDAP_ANONYMOUS_LOOKUP),
    connectTimeoutSeconds: integer(env.LDAP_CONNECT_TIMEOUT_SECONDS),
    operationTimeoutSeconds: integer(env.LDAP_OPERATION_TIMEOUT_SECONDS),
    requestTimeoutSeconds: integer(env.LDAP_REQUEST_TIMEOUT_SECONDS),
    baseDn: env.LDAP_BASE_DN, userRdn: env.LDAP_USER_RDN,
    userObjectClass: env.LDAP_USER_OBJECT_CLASS ?? (ad ? 'user' : 'inetOrgPerson'),
    userLookupAttr: env.LDAP_USER_LOOKUP_ATTR ?? (ad ? 'sAMAccountName' : 'uid'),
    userIdAttr: env.LDAP_USER_ID_ATTR ?? (ad ? 'objectGUID' : 'entryUUID'),
    userEmailAttr: env.LDAP_USER_EMAIL_ATTR, userDisplayNameAttr: env.LDAP_USER_DISPLAY_NAME_ATTR,
    userGivenNameAttr: env.LDAP_USER_GIVEN_NAME_ATTR, userSurnameAttr: env.LDAP_USER_SURNAME_ATTR,
    userEligibilityFilter: env.LDAP_USER_ELIGIBILITY_FILTER, groupRdn: env.LDAP_GROUP_RDN,
    groupObjectClass: env.LDAP_GROUP_OBJECT_CLASS ?? (ad ? 'group' : 'groupOfUniqueNames'),
    groupMemberAttr: env.LDAP_GROUP_MEMBER_ATTR ?? (ad ? 'member' : 'uniqueMember'),
    groupIdAttr: env.LDAP_GROUP_ID_ATTR ?? (ad ? 'objectGUID' : 'entryUUID'),
    groupNameAttr: env.LDAP_GROUP_NAME_ATTR ?? (ad ? 'name' : 'displayName'),
    groupLookupAttr: env.LDAP_GROUP_LOOKUP_ATTR,
    searchNestedGroups: bool('LDAP_SEARCH_NESTED_GROUPS', env.LDAP_SEARCH_NESTED_GROUPS),
    disableMatchingRuleInChain: bool('LDAP_DISABLE_MATCHING_RULE_IN_CHAIN', env.LDAP_DISABLE_MATCHING_RULE_IN_CHAIN),
    nestedGroupMaxDepth: integer(env.LDAP_NESTED_GROUP_MAX_DEPTH),
    groupSearchLimit: integer(env.LDAP_GROUP_SEARCH_LIMIT),
    groupTraversalLimit: integer(env.LDAP_GROUP_TRAVERSAL_LIMIT),
    revalidationIntervalSeconds: integer(env.LDAP_REVALIDATION_INTERVAL_SECONDS),
    maxConcurrentOperations: integer(env.LDAP_MAX_CONCURRENT_OPERATIONS),
  });
}
