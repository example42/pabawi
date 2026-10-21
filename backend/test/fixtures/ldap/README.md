# OpenLDAP test fixture

This fixture contains synthetic accounts only. It uses OpenLDAP from a pinned
Debian base, generates a short-lived CA and certificate on startup, and provides
a read-only lookup account. Its configured ACL hides password values.

From the repository root:

~~~bash
docker build -t pabawi-ldap-fixture:package3 backend/test/fixtures/ldap
docker run --detach --name pabawi-ldap-p3-openldap --pull never \
  -p 127.0.0.1::1389 -p 127.0.0.1::1636 pabawi-ldap-fixture:package3
docker port pabawi-ldap-p3-openldap
mkdir -p /tmp/pabawi-ldap-fixture-tls /tmp/pabawi-ldap-fixture-downloads
docker cp pabawi-ldap-p3-openldap:/fixture/tls/ca.pem /tmp/pabawi-ldap-fixture-tls/ca.pem
docker cp pabawi-ldap-p3-openldap:/downloads/. /tmp/pabawi-ldap-fixture-downloads
clamscan -r /tmp/pabawi-ldap-fixture-downloads
~~~

Use the published 1636 and 1389 ports, respectively:

~~~bash
TEST_LDAP_LDAPS_PORT=PORT_1636 \
TEST_LDAP_STARTTLS_PORT=PORT_1389 \
TEST_LDAP_CA_FILE=/tmp/pabawi-ldap-fixture-tls/ca.pem \
npm run test --workspace=backend -- test/integration/ldap-directory.test.ts
docker stop pabawi-ldap-p3-openldap
~~~

The fixture uses FQDN localhost.localdomain, which must resolve to loopback.
The test skips when the three TEST_LDAP variables are absent. An ordinary full
backend test run therefore does not constitute directory interoperability evidence.
Containers, image and temporary artifacts are retained for inspection.

The service is read-only. Fixture setup uses slapadd before starting slapd.
The test credentials are fixture-reader, fixture-user and fixture-admin. They have
no meaning outside this disposable directory. No real AD interoperability is
claimed by this fixture.
