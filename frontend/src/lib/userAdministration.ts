export interface UserAdministrationMetadata {
  profileReadOnly: boolean;
  sources: { provider: 'local' | 'ldap' | 'entra-id'; name: string; directoryId?: string; loginName?: string }[];
}

export interface UserRoleSource {
  roleId: string; source: 'manual' | 'ldap' | 'entra-id'; directoryId?: string; groupName?: string;
}
