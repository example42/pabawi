# @summary Application server role.
#
class role::appserver {
  include profile::base
  include profile::appserver
}
