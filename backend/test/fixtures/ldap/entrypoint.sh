#!/bin/bash
set -eu
mkdir -p /fixture/tls /fixture/db
openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 2 \
  -subj /CN=Pabawi-LDAP-fixture-CA -keyout /fixture/tls/ca.key -out /fixture/tls/ca.pem
openssl req -newkey rsa:2048 -nodes -subj /CN=localhost.localdomain \
  -keyout /fixture/tls/server.key -out /fixture/tls/server.csr
printf 'subjectAltName=DNS:localhost.localdomain,DNS:*.fixture.test\nextendedKeyUsage=serverAuth\n' > /fixture/tls/extensions
openssl x509 -req -in /fixture/tls/server.csr -CA /fixture/tls/ca.pem \
  -CAkey /fixture/tls/ca.key -CAcreateserial -days 2 -sha256 \
  -extfile /fixture/tls/extensions -out /fixture/tls/server.pem
cat > /fixture/slapd.conf <<'CONF'
include /etc/ldap/schema/core.schema
include /etc/ldap/schema/cosine.schema
include /etc/ldap/schema/inetorgperson.schema
pidfile /fixture/slapd.pid
argsfile /fixture/slapd.args
modulepath /usr/lib/ldap
moduleload back_mdb
TLSCACertificateFile /fixture/tls/ca.pem
TLSCertificateFile /fixture/tls/server.pem
TLSCertificateKeyFile /fixture/tls/server.key
TLSProtocolMin 3.3
database mdb
maxsize 10485760
suffix "dc=example,dc=test"
rootdn "cn=admin,dc=example,dc=test"
rootpw fixture-admin
directory /fixture/db
access to attrs=userPassword
  by anonymous auth
  by * none
access to *
  by dn.exact="cn=reader,dc=example,dc=test" read
  by * none
CONF
slapadd -f /fixture/slapd.conf -l /fixture/seed.ldif
exec slapd -f /fixture/slapd.conf -h "ldap://0.0.0.0:1389 ldaps://0.0.0.0:1636" -d 0
