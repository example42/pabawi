# @summary Base profile applied to every node.
#
# Manages fundamental system configuration: packages, SSH, NTP,
# firewall defaults, monitoring agent, and user accounts.
#
class profile::base (
  Array[String]  $dns_servers       = lookup('profile::base::dns_servers', default_value => ['8.8.8.8']),
  Array[String]  $dns_search        = lookup('profile::base::dns_search', default_value => []),
  Array[String]  $admin_groups      = lookup('profile::base::admin_groups', default_value => ['sysadmins']),
  Boolean        $manage_repos      = lookup('profile::base::manage_repos', default_value => true),
  Boolean        $monitoring_enabled = lookup('profile::base::monitoring_enabled', default_value => true),
  String         $log_level         = lookup('profile::base::log_level', default_value => 'info'),
) {

  # --- Essential packages ---
  $base_packages = ['curl', 'wget', 'vim', 'git', 'htop', 'jq', 'unzip']
  package { $base_packages:
    ensure => installed,
  }

  # --- NTP ---
  include ntp

  # --- SSH hardening ---
  include ssh

  # --- Firewall base rules ---
  include profile::firewall

  # --- Monitoring agent ---
  if $monitoring_enabled {
    include profile::monitoring::agent
  }
}
