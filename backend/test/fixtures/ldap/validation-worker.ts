import { DatabaseService } from '../../../src/database/DatabaseService';
import { AuthenticationService } from '../../../src/services/AuthenticationService';
import { UserService } from '../../../src/services/UserService';
import { LdapMappingService } from '../../../src/services/LdapMappingService';
import { LdapAuthenticationService } from '../../../src/services/LdapAuthenticationService';
import type { LdapAuthenticationProof } from '../../../src/services/LdapAuthenticationService';
import type { LdapConfig } from '../../../src/config/ldap';
import type { LdapDirectoryResult } from '../../../src/services/LdapDirectoryService';

interface Input {
  databasePath: string; dialect: 'sqlite' | 'postgres'; databaseUrl: string;
  config: LdapConfig; proof: LdapAuthenticationProof; result: LdapDirectoryResult;
}

process.once('message', (input: Input) => {
  void (async () => {
    const database = new DatabaseService(input.databasePath, input.dialect, input.databaseUrl);
    try {
      await database.initialize();
      const db = database.getAdapter();
      const users = new UserService(db, new AuthenticationService(db, 'ldap-authentication-fixture-jwt-secret')); // pragma: allowlist secret
      const directory = {
        authenticate: async () => input.result,
        revalidate: async () => {
          const released = new Promise<void>(resolve => process.once('message', () => { resolve(); }));
          process.send!({ type: 'reading', pid: process.pid });
          await released;
          return input.result;
        },
      };
      const mappings = new LdapMappingService(db, input.config.directoryId, {
        resolveGroup: async subject => ({ subject, dn: 'cn=operators,dc=example,dc=test', name: 'Operators' }),
      });
      const service = new LdapAuthenticationService(db, input.config, directory, mappings, users);
      await service.initialize();
      const proof = input.proof;
      await service.assertEligible(proof.user.id, proof.identityId, proof.directoryId, proof.sessionVersion, true);
      process.send!({ type: 'done', code: 'ok' });
    } catch (error) {
      const code = error instanceof Error && 'code' in error ? String(error.code) : 'UNEXPECTED_ERROR';
      process.send!({ type: 'done', code });
    } finally {
      await database.close();
      process.disconnect();
    }
  })();
});
