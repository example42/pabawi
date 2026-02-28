# @summary Load balancer role — HAProxy via tp.
#
class role::loadbalancer {
  include profile::base
  include profile::loadbalancer
}
