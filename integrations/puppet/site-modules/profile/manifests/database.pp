# @summary Database profile — PostgreSQL.
#
# Installs PostgreSQL, creates databases, and configures backups.
#
class profile::database (
  String  $postgres_version      = lookup('profile::database::postgres_version', default_value => '16'),
  String  $listen_addresses      = lookup('profile::database::listen_addresses', default_value => 'localhost'),
  Integer $max_connections       = lookup('profile::database::max_connections', default_value => 100),
  String  $shared_buffers        = lookup('profile::database::shared_buffers', default_value => '256MB'),
  Hash    $databases             = lookup('profile::database::databases', default_value => {}),
  Boolean $backup_enabled        = lookup('profile::database::backup_enabled', default_value => false),
  String  $backup_schedule       = lookup('profile::database::backup_schedule', default_value => '0 2 * * *'),
  Integer $backup_retention_days = lookup('profile::database::backup_retention_days', default_value => 7),
) {

  class { 'postgresql::globals':
    version => $postgres_version,
  }

  class { 'postgresql::server':
    listen_addresses => $listen_addresses,
  }

  # Firewall — allow PostgreSQL
  firewall { '200 allow postgresql':
    dport  => 5432,
    proto  => 'tcp',
    action => 'accept',
  }

  # Create databases from Hiera
  $databases.each |$dbname, $config| {
    postgresql::server::db { $dbname:
      user     => $config['owner'],
      encoding => pick($config['encoding'], 'UTF8'),
      locale   => pick($config['locale'], 'en_US.UTF-8'),
    }
  }
}
