# @summary Webserver role — Nginx frontend nodes.
#
class role::webserver {
  include profile::base
  include profile::webserver
}
