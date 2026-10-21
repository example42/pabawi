FROM debian@sha256:7fa362f5e7c036d7f45621a6c721c03493cdcb5889adfcd65587759e34fe4c6f
RUN mkdir /downloads && apt-get update \
 && apt-get --download-only --no-install-recommends install -y slapd ldap-utils openssl \
 && cp /var/cache/apt/archives/*.deb /downloads/ \
 && DEBIAN_FRONTEND=noninteractive apt-get --no-install-recommends install -y slapd ldap-utils openssl
COPY entrypoint.sh seed.ldif /fixture/
ENTRYPOINT ["bash", "/fixture/entrypoint.sh"]
