# @summary Monitoring role — Prometheus + Grafana server.
#
class role::monitoring {
  include profile::base
  include profile::monitoring::server
}
