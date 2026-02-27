# @summary Base role — applied to every node.
#
# Includes only the base profile. All other roles inherit from this.
#
class role::base {
  include profile::base
}
