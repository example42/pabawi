# Pabawi Demo — Site Manifest
# Uses roles and profiles pattern with tp for application management.
# Reference: https://github.com/example42/psick

# tp defaults — enable CLI tool and testing on every tp::install
Tp::Install {
  cli_enable  => true,
  test_enable => true,
}

# Default node definition — applies to any node without a specific match
node default {
  # Every node gets the base profile
  include role::base

  # Classify nodes by the 'role' fact (set via trusted external data, role fact or hiera)
  $node_role = pick($facts['trusted']['extensions'],['pp_role'],‘$facts['role'], lookup('role'), 'base')

  include "role::$node_role"
}
