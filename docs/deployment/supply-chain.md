# Build inputs and release verification

Pabawi uses Node 24 LTS. Development and CI read the exact patch from `.nvmrc`.
All three Dockerfiles pin their Node and operating-system base images by digest.
The Ubuntu image copies the same Node binary used to build its native addons.
See the [Node release policy](https://nodejs.org/en/about/previous-releases).

Run `npm run install:all` at the repository root. This performs `npm ci` with
scripts disabled, then runs `scripts/supply-chain/install-approved.mjs`.
To change dependencies, use `socket npm install` and review the lockfile diff.
Do not regenerate dependencies independently inside the workspaces.

The root `package-lock.json`, overrides and `.npmrc` govern every image install.
Build stages install the full workspace graph. The production dependency stage
uses `npm ci --workspace=backend --omit=dev --ignore-scripts`. Runtime images
preserve both hoisted and backend-local packages. Backend code runs from
`/app/backend`; its static frontend is `/app/backend/public`.

The script runner reads the existing `lavamoat.allowScripts` map in the root
manifest and checks every installed lockfile package, including workspace and
nested locations, before executing any install hooks. Unreviewed hooks fail the
build. Explicit `false` entries never run. Approved hooks run individually with
npm's automatic adjacent hooks disabled. Implicit node-gyp builds require an
explicit reviewed install script. The repository's installed LavaMoat CLI does
not traverse workspace dependencies, so it is not the build entry point.

Native dependencies compile from source in the target-platform dependency stage
using the pinned image's Node headers. The final image does not include the
compilers. The full reviewed lockfile remains at `/app/root-lock.json`, outside
package-manager lockfile discovery, so image scanners inspect installed packages
rather than interpreting omitted development packages as shipped dependencies.
The frontend dependency SBOM is included at `/app/sbom/frontend.cdx.json`, because
its bundled JavaScript does not retain individual package manifests.

## Local verification

From the repository root:

```bash
node --test scripts/supply-chain/install-approved.test.mjs
docker build -t pabawi:verify .
bash scripts/supply-chain/image-smoke.sh pabawi:verify
docker run --rm -i --entrypoint node pabawi:verify < scripts/supply-chain/dependency-graph.cjs > dependencies.json
bash scripts/supply-chain/scan-image.sh pabawi:verify /tmp/pabawi-image-evidence
```

Repeat with `-f Dockerfile.alpine` and `-f Dockerfile.ubuntu` and distinct tags.
The smoke test checks the non-root Node runtime, bcrypt, an actual SQLite query,
SSH module loading, Bolt task discovery, migrations, HTTP health, frontend delivery
and denial of anonymous inventory requests. It uses disposable container storage
and does not dispatch infrastructure commands.

CI builds all three variants, then performs a second uncached production
installation and compares its dependency graph with the shipped image. The graph
check validates installed versions against the lockfile and root security overrides.
Release CI smoke-tests each architecture, scans the locally exported image, and
pushes that same image without rebuilding. The multi-architecture manifest is
published only after both architecture jobs succeed.

The pinned Trivy scanner produces `sbom.cdx.json` and `vulnerabilities.json` from
the exported image archive. It scans OS, Ruby, Python, Java and JavaScript packages,
including the embedded frontend SBOM. The image digest and dependency inventory
are retained with the reports. High or critical advisories fail the release gate,
including findings without an available fix. Scanner errors also fail the gate.
See [Trivy's SBOM documentation](https://github.com/aquasecurity/trivy/blob/main/docs/guide/supply-chain/sbom.md).

## Triage and reproducibility limits

The release maintainer owns scan triage with the security maintainer. For each
finding, record the artifact digest, advisory, installed and fixed versions,
reachability assessment, remediation owner and disposition. Do not equate an
unreachable-looking dependency with an approved exception. No advisory suppressions
are configured. A blocked gate requires remediation or a separately reviewed,
scoped and expiring exception before release.

The npm graph and base-image inputs are pinned. Distribution packages still come
from live signed repositories, and the Alpine OpenBolt gem dependency tree is resolved by RubyGems.
The Ubuntu variant uses a frozen, checksum-bearing Gemfile.lock, including a
local WinRM file-transfer migration to RubyZip 3.6. See the
[Ubuntu bundle notes](../../docker/bolt/README.md). The Bookworm OpenBolt package version and repository
bootstrap checksum are pinned. These builds do not promise byte-identical OS or
Ruby layers. Preserve the verified image digest and its SBOM for deployment and
rollback; rebuilding the same source later can produce different OS/Ruby packages.
Updating to immutable distribution snapshots and locking the remaining Ruby
dependency sources is required before claiming full-image reproducibility.
