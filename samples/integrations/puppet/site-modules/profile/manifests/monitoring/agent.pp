# @summary Monitoring agent profile — Prometheus node_exporter via tp.
#
# Installs and manages node_exporter on every monitored node using tp.
# The tp::install define handles package name resolution per OS,
# service management, and testing.
#
class profile::monitoring::agent (
  Integer $node_exporter_port = lookup('profile::monitoring::node_exporter_port', default_value => 9100),
) {

  # tp handles package name, service name, and paths per OS
  tp::install { 'prometheus-node-exporter': }
}
