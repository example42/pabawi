export type LdapDirectoryErrorCode =
  | 'INVALID_CREDENTIALS' | 'INELIGIBLE' | 'IDENTITY_CHANGED' | 'INVALID_IDENTITY'
  | 'POLICY_UNREADABLE' | 'INCOMPLETE_RESULT' | 'LIMIT_EXCEEDED' | 'BUSY' | 'TIMEOUT' | 'UNAVAILABLE';

export class LdapDirectoryError extends Error {
  constructor(public readonly code: LdapDirectoryErrorCode) {
    super('LDAP directory operation failed: ' + code);
    this.name = 'LdapDirectoryError';
  }
}
