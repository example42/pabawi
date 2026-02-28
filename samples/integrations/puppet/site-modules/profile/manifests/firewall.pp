# @summary Firewall base profile via tp.
#
# Manages iptables/nftables service and rule files through tp::install
# and tp::conf. Rules are generated from Hiera-driven parameters
# using an EPP template.
#
class profile::firewall (
  String        $default_policy      = lookup('profile::firewall::default_policy', default_value => 'drop'),
  Array[String] $allowed_ssh_sources = lookup('profile::firewall::allowed_ssh_sources', default_value => ['0.0.0.0/0']),
  Hash          $extra_rules         = lookup('profile::firewall::extra_rules', default_value => {}),
) {

  # Install iptables service via tp
  tp::install { 'iptables': }

  # Manage the iptables rules file from an EPP template
  tp::conf { 'iptables':
    template     => 'profile/firewall/iptables_rules.epp',
    options_hash => {
      'default_policy'      => $default_policy,
      'allowed_ssh_sources' => $allowed_ssh_sources,
      'extra_rules'         => $extra_rules,
    },
  }
}
