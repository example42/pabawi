# @summary Monitoring agent profile — Prometheus node_exporter.
#
# Installs node_exporter on every monitored node.
#
class profile::monitoring::agent (
  Integer $node_exporter_port = lookup('profile::monitoring::node_exporter_port', default_value => 9100),
) {

  package { 'prometheus-node-exporter':
    ensure => installed,
  }

  service { 'prometheus-node-exporter':
    ensure => running,
    enable => true,
  }

  # Firewall — allow Prometheus scraping
  firewall { "400 allow node_exporter port ${node_exporter_port}":
    dport  => $node_exporter_port,
    proto  => 'tcp',
    action => 'accept',
  }
}
