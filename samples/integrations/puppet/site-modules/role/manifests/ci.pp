# @summary CI role — Jenkins controller via tp.
#
class role::ci {
  include profile::base
  include profile::ci
}
