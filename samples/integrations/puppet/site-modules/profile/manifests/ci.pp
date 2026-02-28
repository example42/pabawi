# @summary CI profile — Jenkins controller via tp.
#
# Installs Jenkins using tp::install with upstream repository support.
# Configuration is managed via tp::conf from Hiera data.
#
class profile::ci (
  Hash $jenkins_options = lookup('profile::ci::jenkins_options', default_value => {}),
) {

  tp::install { 'jenkins':
    auto_prereq  => true,
    upstream_repo => true,
  }

  if $jenkins_options != {} {
    tp::conf { 'jenkins':
      template     => 'profile/ci/jenkins.yaml.epp',
      options_hash => $jenkins_options,
    }
  }
}
