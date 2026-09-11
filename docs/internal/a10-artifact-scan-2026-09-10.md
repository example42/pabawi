# A10 artifact scan review: 2026-09-10

A [2026-09-11 follow-up](a10-follow-up-2026-09-11.md) records npm remediation and
a clean high/critical scan for the Ubuntu candidate. The counts below describe
the original September 10 artifacts.

Status: build controls and runtime migration implemented; release blocked by the
findings below. No vulnerability exceptions are approved. Full-image reproducibility
also remains incomplete because distribution repositories and Ruby transitive
dependencies are not locked.

Scanned locally on Linux arm64 with Trivy 0.69.3 from its pinned container digest.
Counts are package/advisory occurrences, not unique CVEs or demonstrated exploits.
The scanner database and reports were retrieved on 2026-09-10.

| Image | Critical | High | Medium | Low | Unknown |
| --- | ---: | ---: | ---: | ---: | ---: |
| bookworm | 16 | 125 | 238 | 165 | 15 |
| alpine | 0 | 14 | 28 | 15 | 0 |
| ubuntu | 0 | 8 | 62 | 10 | 0 |

## Disposition

- Bookworm: distribution packages account for 15 critical and 109 high findings.
  The bundled OpenBolt Ruby tree adds one critical and five high findings,
  including concurrent-ruby, faraday, jwt, resolv and rubyzip. Eleven further
  high occurrences are in JavaScript dependencies, including npm bundled in the
  Node base. Many distribution findings have no fixed version in the scan.
  A supported runtime alone does not make this image release-ready.
- Alpine: two high findings affect libcrypto3/libssl3 3.5.7-r0; the scanner
  identifies 3.5.8-r0 as fixed. Eleven high JavaScript occurrences and the
  rubyzip finding remain. Coordinate a base refresh and dependency updates.
- Ubuntu: seven high JavaScript occurrences affect fast-uri 3.1.2 and
  ip-address 10.2.0. The eighth is rubyzip 2.4.1, for which the scanner
  identifies version 3.4.0 or later. Upgrading RubyZip across its major version
  requires checking OpenBolt compatibility rather than overriding it blindly.
- All high and critical findings remain blocking. These are advisory matches,
  not an assertion that each vulnerable function is reachable. No reachability
  assumption has been used to downgrade or suppress a finding.

The root npm audit now reports 20 affected packages: seven high, eleven moderate
and two low. The prior audit had 32, including one critical. Security overrides
were updated to tar 7.5.22, brace-expansion 1.1.18 and smol-toml 1.8.0 through
Socket. Two stale nested tar lock entries were removed before regeneration;
the final installed graph contains only the reviewed tar version.

## Evidence

Raw image inventories, CycloneDX SBOMs, vulnerability JSON, dependency graphs
and repeat-install graphs are in `/tmp/pabawi-a10-final/<variant>/` for this
local session. Per-advisory dispositions are in
`/tmp/pabawi-a10-final/triage.json`. CI retains JSON evidence as workflow artifacts;
the large image archives and scanner databases are not committed to Git.

- bookworm: `sha256:1abac7c24970500664b5d4b3d76955f9c6f09137e3af8b4557553d9e6885cff2`
- alpine: `sha256:91cb5a5c81774774ea1a464a0f3085087c4a2a750f2e92b86cfe272748109e1a`
- ubuntu: `sha256:b933c4c536f3f0b4f3686d1b0f7ce6142fbb895febfd2226ae10c2b1c2bce7e9`

Validation: all three images built and passed native-module, Bolt task-discovery,
database migration, HTTP/frontend and anonymous-access smoke checks. Their
production dependency graphs matched independent uncached installations.
The Node 24 backend suite passed 3,579 tests (20 skipped, one todo); frontend
passed 1,000 tests. Four install-policy tests passed, including rejection before
any script executes. The first full-suite attempt had a test-copy harness error;
the counts above are from the corrected run.

Local image checks covered arm64. The release workflow tests amd64 and arm64,
but that remote workflow was not run in this session. No image was published.
See [build policy](../deployment/supply-chain.md) for verification commands
and the remaining reproducibility limitations.

A10 final static checks: lint, backend TypeScript, shell syntax, shellcheck,
workflow YAML parsing and `git diff --check` passed. The first lint attempt
was killed with exit 137 under concurrent image/test load; the isolated rerun
passed. Existing frontend build warnings remain.

ClamAV 1.5.4 completed scans of all three exported image archives, scanner
databases/reports, the downloaded Trivy image and the OpenVox repository package
with no infected files reported. The large-artifact scan used expanded archive
limits and scanned 7.69 GiB of content. This is an antivirus result, not an
advisory clearance; all release-blocking Trivy findings remain open.
