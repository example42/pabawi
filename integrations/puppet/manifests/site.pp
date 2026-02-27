# Pabawi Demo — Site Manifest
# This is the main entry point for Puppet catalog compilation.
# Nodes are classified by role using the role/profile pattern.

# Default node definition — applies to any node without a specific match
node default {
  # Every node gets the base profile
  include role::base

  # Classify nodes by the 'role' fact (set via trusted external data or facter)
  $node_role = pick($facts['role'], 'base')

  case $node_role {
    'webserver':    { include role::webserver }
    'appserver':    { include role::appserver }
    'database':     { include role::database }
    'monitoring':   { include role::monitoring }
    'loadbalancer': { include role::loadbalancer }
    'ci':           { include role::ci }
    default:        {} # role::base already included above
  }
}
