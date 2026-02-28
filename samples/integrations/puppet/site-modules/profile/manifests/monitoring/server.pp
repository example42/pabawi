# @summary Monitoring server profile — Prometheus + Grafana via tp.
#
# Both applications are installed and configured via tp defines.
# Configuration files are managed through Hiera-driven tp::conf.
#
class profile::monitoring::server (
  String $prometheus_retention       = lookup('profile::monitoring::prometheus_retention', default_value => '15d'),
  String $prometheus_scrape_interval = lookup('profile::monitoring::prometheus_scrape_interval', default_value => '15s'),
  Hash   $prometheus_options         = lookup('profile::monitoring::prometheus_options', default_value => {}),
  Hash   $grafana_options            = lookup('profile::monitoring::grafana_options', default_value => {}),
) {

  # Install Prometheus via tp
  tp::install { 'prometheus':
    auto_prereq => true,
  }

  tp::conf { 'prometheus':
    template     => 'profile/monitoring/prometheus.yml.epp',
    options_hash => $prometheus_options + {
      'retention'       => $prometheus_retention,
      'scrape_interval' => $prometheus_scrape_interval,
    },
  }

  # Install Grafana via tp
  tp::install { 'grafana':
    auto_prereq => true,
  }

  if $grafana_options != {} {
    tp::conf { 'grafana':
      template     => 'profile/monitoring/grafana.ini.epp',
      options_hash => $grafana_options,
    }
  }
}
