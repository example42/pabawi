# @summary Database profile — PostgreSQL via tp.
#
# Installs PostgreSQL using tp, manages its configuration via
# tp::conf, and creates databases from Hiera data.
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

  # Install PostgreSQL via tp (handles package name per OS)
  tp::install { 'postgresql':
    auto_prereq => true,
  }

  # PostgreSQL main config with tuning parameters from Hiera
  tp::conf { 'postgresql':
    template     => 'profile/postgresql/postgresql.conf.epp',
    options_hash => {
      'listen_addresses' => $listen_addresses,
      'max_connections'  => $max_connections,
      'shared_buffers'   => $shared_buffers,
    },
  }

  # pg_hba.conf — client authentication
  tp::conf { 'postgresql::pg_hba.conf':
    template     => 'profile/postgresql/pg_hba.conf.epp',
    options_hash => {
      'databases' => $databases,
    },
  }
}
