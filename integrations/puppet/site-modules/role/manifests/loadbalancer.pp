# @summary Load balancer role — HAProxy nodes.
#
class role::loadbalancer {
  include profile::base
  include haproxy
}
