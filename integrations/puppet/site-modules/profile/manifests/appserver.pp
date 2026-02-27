# @summary Application server profile.
#
# Manages the application deployment user, directory structure, and JVM settings.
#
class profile::appserver (
  String  $jvm_heap_size          = lookup('profile::appserver::jvm_heap_size', default_value => '1g'),
  Integer $app_port               = lookup('profile::appserver::app_port', default_value => 8080),
  String  $deploy_user            = lookup('profile::appserver::deploy_user', default_value => 'deploy'),
  String  $deploy_group           = lookup('profile::appserver::deploy_group', default_value => 'deploy'),
  String  $app_root               = lookup('profile::appserver::app_root', default_value => '/opt/app'),
  String  $health_check_path      = lookup('profile::appserver::health_check_path', default_value => '/health'),
  Integer $health_check_interval  = lookup('profile::appserver::health_check_interval', default_value => 30),
) {

  group { $deploy_group:
    ensure => present,
    system => true,
  }

  user { $deploy_user:
    ensure     => present,
    gid        => $deploy_group,
    home       => $app_root,
    managehome => true,
    shell      => '/bin/bash',
    system     => true,
  }

  file { [$app_root, "${app_root}/releases", "${app_root}/shared", "${app_root}/shared/log"]:
    ensure => directory,
    owner  => $deploy_user,
    group  => $deploy_group,
    mode   => '0755',
  }

  # Firewall — allow app port
  firewall { "300 allow app port ${app_port}":
    dport  => $app_port,
    proto  => 'tcp',
    action => 'accept',
  }
}
