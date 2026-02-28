# @summary Webserver profile — Nginx via tp.
#
# Installs and configures Nginx using tp::install and tp::conf.
# Virtual hosts and tuning parameters are driven by Hiera.
#
class profile::webserver (
  Hash    $vhosts             = lookup('profile::webserver::vhosts', default_value => {}),
  Hash    $nginx_options      = lookup('profile::webserver::nginx_options', default_value => {}),
  String  $ssl_protocols      = lookup('profile::webserver::ssl_protocols', default_value => 'TLSv1.2 TLSv1.3'),
) {

  # Install Nginx with upstream repo support
  tp::install { 'nginx':
    auto_prereq => true,
  }

  # Main nginx.conf from Hiera-driven options
  if $nginx_options != {} {
    tp::conf { 'nginx':
      template     => 'profile/nginx/nginx.conf.epp',
      options_hash => $nginx_options + { 'ssl_protocols' => $ssl_protocols },
    }
  }

  # Create vhost config files from Hiera data
  $vhosts.each |$servername, $config| {
    tp::conf { "nginx::${servername}.conf":
      template     => 'profile/nginx/vhost.conf.epp',
      options_hash => $config + { 'servername' => $servername },
      base_dir     => 'conf',
    }
  }
}
