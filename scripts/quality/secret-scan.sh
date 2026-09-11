#!/usr/bin/env bash
#
# Secret scan over the whole tracked tree.
#
# The pre-commit hook excludes docs, backend tests, frontend test files and the
# e2e fixtures, so a credential committed under one of those paths passes every
# local check (finding I10). This scans them too and compares the findings with
# the reviewed baseline, ignoring the baseline's own timestamp so a clean tree
# is reported as clean.
#
#   bash scripts/quality/secret-scan.sh            # fail on anything new
#   bash scripts/quality/secret-scan.sh --update   # record findings as reviewed
#
# Update only after reading each new finding. The baseline is a list of things
# a human decided are not secrets, not a list of things to wave through.
set -euo pipefail

if ! command -v detect-secrets >/dev/null 2>&1; then
  echo "detect-secrets is not on PATH. Install it with:" >&2
  echo "  pip install detect-secrets==1.5.0" >&2
  exit 1
fi

baseline=".secrets.baseline"
# Plain mktemp: BSD and GNU disagree about a -t argument without X's.
work="$(mktemp)"
trap 'rm -f "$work"' EXIT

cp "$baseline" "$work"

# package-lock.json is excluded for runtime, not for policy: it is large and
# holds integrity hashes, which are not credentials.
git ls-files -z | grep -zv '^package-lock.json$' | xargs -0 detect-secrets scan --baseline "$work"

if [ "${1:-}" = "--update" ]; then
  cp "$work" "$baseline"
  echo "Baseline updated. Review every added entry before committing it."
  exit 0
fi

python3 - "$baseline" "$work" <<'PY'
import json
import sys

def findings(path):
    with open(path, encoding="utf-8") as handle:
        results = json.load(handle)["results"]
    return {
        (filename, entry["type"], entry.get("hashed_secret"))
        for filename, entries in results.items()
        for entry in entries
    }

reviewed = findings(sys.argv[1])
observed = findings(sys.argv[2])

added = sorted(observed - reviewed)
if added:
    print(f"{len(added)} unreviewed potential secret(s):")
    for filename, kind, _ in added:
        print(f"  {filename}: {kind}")
    print("\nRemove the credential, or mark the line with a `pragma: allowlist secret`")
    print("comment if it is not one, then re-run with --update.")
    sys.exit(1)

cleared = sorted(reviewed - observed)
if cleared:
    print(f"{len(cleared)} baseline entries no longer present. Refresh with --update.")

print(f"Secret scan clean: {len(observed)} reviewed findings across the tracked tree.")
PY
