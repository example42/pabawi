# @summary Monitoring server profile — Prometheus + Grafana.
#
class profile::monitoring::server (
  String $prometheus_retention     = lookup('profile::monitoring::prometheus_retention', default_value => '15d'),
  String $prometheus_scrape_interval = lookup('profile::monitoring::prometheus_scrape_interval', default_value => '15s'),
) {

  include prometheus
  include grafana

  firewall { '401 allow prometheus':
    dport  => 9090,
    proto  => 'tcp',
    action => 'accept',
  }

  firewall { '402 allow grafana':
    dport  => 3000,
    proto  => 'tcp',
    action => 'accept',
  }
}
