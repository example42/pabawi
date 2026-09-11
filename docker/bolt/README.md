# Ubuntu OpenBolt dependency bundle

The Ubuntu image installs OpenBolt 5.1.0 through the checked-in Gemfile and frozen,
checksum-bearing Gemfile.lock. Bundler is pinned to 2.6.9. The lock includes amd64
and arm64 Linux platforms. Package updates must regenerate and review the lock,
then pass the archive regression, image smoke checks and image vulnerability scan.

## WinRM file-transfer migration

Upstream winrm-fs 1.3.5 requires RubyZip 2 and uses the old positional `Zip::Entry`
constructor. RubyZip versions before 3.4.0 are affected by CVE-2026-85396.
There is no newer winrm-fs release in RubyGems as of 2026-09-11.

`prepare-winrm-fs.rb` verifies the SHA-256 of the original winrm-fs 1.3.5 gem,
extracts its source and migrates the constructor to RubyZip 3 named arguments.
It preserves the year-2000 timestamp and requests best compression on the entry.
The generated gem specification requires RubyZip 3.6 and carries the distinct
local version `1.3.5.pabawi.1`. The exact selected RubyZip release is 3.6.0.
The original source and license remain in the resulting bundle.

This is a local source patch, with no runtime monkey-patching or scanner exception.
Do not simply relax the original dependency constraint: the positional constructor
would fail when preparing directory uploads. Retire the local version when an
upstream release supports the patched RubyZip API and passes the same tests.

`test-winrm-rubyzip.rb` exercises the actual WinRM directory-upload preparation,
checks the archive contents, UTF-8 filename flag, timestamp and upload metadata,
then verifies that an archive cannot write into a sibling directory sharing the
extraction-directory prefix. It runs during the Ubuntu image build. These are
local tests; they do not establish interoperability with a real Windows host.

References:

- [RubyZip migration guide](https://github.com/rubyzip/rubyzip/wiki/Updating-to-version-3.x)
- [RubyZip changelog](https://github.com/rubyzip/rubyzip/blob/main/Changelog.md)
- [WinRM FS 1.3.5 dependencies](https://rubygems.org/gems/winrm-fs/versions/1.3.5)

## Validation

From the repository root:

```bash
docker build -f Dockerfile.ubuntu -t pabawi:ubuntu-verify .
bash scripts/supply-chain/image-smoke.sh pabawi:ubuntu-verify
docker run --rm --entrypoint ruby pabawi:ubuntu-verify /opt/bolt/test-winrm-rubyzip.rb
docker run --rm -i --entrypoint ruby pabawi:ubuntu-verify < docker/bolt/dependency-graph.rb
bash scripts/supply-chain/scan-image.sh pabawi:ubuntu-verify /tmp/pabawi-ubuntu-evidence
```
