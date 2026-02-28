# @summary Base profile applied to every node.
#
# Manages fundamental system configuration via tp (Tiny Puppet):
# packages, SSH, time synchronisation, firewall, monitoring agent.
#
# Applications are installed with tp::install and configured via
# tp::conf, driven by Hiera data.
#
class profile::base (
  Array[String]  $dns_servers        = lookup('profile::base::dns_servers', default_value => ['8.8.8.8']),
  Array[String]  $dns_search         = lookup('profile::base::dns_search', default_value => []),
  Array[String]  $admin_groups       = lookup('profile::base::admin_groups', default_value => ['sysadmins']),
  Boolean        $manage_repos       = lookup('profile::base::manage_repos', default_value => true),
  Boolean        $monitoring_enabled = lookup('profile::base::monitoring_enabled', default_value => true),
  String         $log_level          = lookup('profile::base::log_level', default_value => 'info'),
  String         $time_service       = lookup('profile::base::time_service', default_value => 'chrony'),
  Hash           $sshd_options       = lookup('profile::base::sshd_options', default_value => {}),
) {

  # --- tp CLI and testing on this node ---
  include tp

  # --- Essential packages ---
  $base_packages = ['curl', 'wget', 'vim', 'git', 'htop', 'jq', 'unzip']
  $base_packages.each |$pkg| {
    tp::install { $pkg:
      auto_prereq => false,
    }
  }

  # --- Time synchronisation (chrony or ntp, driven by Hiera) ---
  tp::install { $time_service:
    auto_prereq => true,
  }

  # --- SSH hardening via tp ---
  tp::install { 'openssh': }

  if $sshd_options != {} {
    tp::conf { 'openssh':
      template     => 'profile/openssh/sshd_config.epp',
      options_hash => $sshd_options,
    }
  }

  # --- Firewall base rules ---
  include profile::firewall

  # --- Monitoring agent ---
  if $monitoring_enabled {
    include profile::monitoring::agent
  }
}
