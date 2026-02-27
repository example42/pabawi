# @summary Webserver profile — Nginx.
#
# Installs and configures Nginx with virtual hosts defined in Hiera.
#
class profile::webserver (
  Hash    $vhosts             = lookup('profile::webserver::vhosts', default_value => {}),
  String  $worker_processes   = lookup('profile::webserver::worker_processes', default_value => 'auto'),
  Integer $worker_connections = lookup('profile::webserver::worker_connections', default_value => 1024),
  Integer $keepalive_timeout  = lookup('profile::webserver::keepalive_timeout', default_value => 65),
  String  $ssl_protocols      = lookup('profile::webserver::ssl_protocols', default_value => 'TLSv1.2 TLSv1.3'),
) {

  class { 'nginx':
    worker_processes   => $worker_processes,
    worker_connections => $worker_connections,
    keepalive_timeout  => $keepalive_timeout,
  }

  # Open HTTP/HTTPS in firewall
  firewall { '100 allow http':
    dport  => 80,
    proto  => 'tcp',
    action => 'accept',
  }
  firewall { '101 allow https':
    dport  => 443,
    proto  => 'tcp',
    action => 'accept',
  }

  # Create vhosts from Hiera data
  $vhosts.each |$servername, $config| {
    nginx::resource::server { $servername:
      listen_port => $config['port'],
      ssl         => $config['ssl'],
      www_root    => $config['docroot'],
    }
  }
}
