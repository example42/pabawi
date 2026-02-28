# @summary Load balancer profile — HAProxy via tp.
#
# Installs and configures HAProxy using tp::install and tp::conf.
# Backend servers and frontend listeners are driven by Hiera data.
#
class profile::loadbalancer (
  Hash $haproxy_options = lookup('profile::loadbalancer::haproxy_options', default_value => {}),
  Hash $frontends       = lookup('profile::loadbalancer::frontends', default_value => {}),
  Hash $backends        = lookup('profile::loadbalancer::backends', default_value => {}),
) {

  tp::install { 'haproxy':
    auto_prereq => true,
  }

  if $haproxy_options != {} or $frontends != {} or $backends != {} {
    tp::conf { 'haproxy':
      template     => 'profile/haproxy/haproxy.cfg.epp',
      options_hash => {
        'options'   => $haproxy_options,
        'frontends' => $frontends,
        'backends'  => $backends,
      },
    }
  }
}
