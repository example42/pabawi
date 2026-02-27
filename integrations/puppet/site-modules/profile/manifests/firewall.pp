# @summary Firewall base profile.
#
# Sets up default firewall rules: allow established connections,
# allow SSH, allow ICMP, drop everything else.
#
class profile::firewall (
  String        $default_policy      = lookup('profile::firewall::default_policy', default_value => 'drop'),
  Array[String] $allowed_ssh_sources = lookup('profile::firewall::allowed_ssh_sources', default_value => ['0.0.0.0/0']),
) {

  resources { 'firewall':
    purge => true,
  }

  # Allow loopback
  firewall { '000 accept all loopback':
    proto   => 'all',
    iniface => 'lo',
    action  => 'accept',
  }

  # Allow established/related connections
  firewall { '001 accept established related':
    proto  => 'all',
    state  => ['RELATED', 'ESTABLISHED'],
    action => 'accept',
  }

  # Allow ICMP
  firewall { '002 accept icmp':
    proto  => 'icmp',
    action => 'accept',
  }

  # Allow SSH from permitted sources
  $allowed_ssh_sources.each |$index, $source| {
    firewall { "010 allow ssh from ${source}":
      dport  => 22,
      proto  => 'tcp',
      source => $source,
      action => 'accept',
    }
  }

  # Default drop
  firewall { '999 drop all other input':
    proto  => 'all',
    action => $default_policy,
  }
}
