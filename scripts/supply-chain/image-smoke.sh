#!/usr/bin/env bash
set -euo pipefail
image=${1:?Usage: image-smoke.sh IMAGE}
profile=${2:?Usage: image-smoke.sh IMAGE core|batteries|bolt}

case "$profile" in
  core)
    docker run --rm --entrypoint sh "$image" -c '
      for command in ansible ansible-inventory ansible-playbook bolt facter git puppet rsync ssh sshpass; do
        if command -v "$command" >/dev/null 2>&1; then
          echo "Core image unexpectedly contains $command" >&2
          exit 1
        fi
      done
    '
    ;;
  batteries)
    docker run --rm --entrypoint sh "$image" -c '
      for command in ansible ansible-inventory ansible-playbook bolt curl facter git puppet rsync ssh sshpass; do
        command -v "$command" >/dev/null
      done
    '
    docker run --rm --entrypoint bolt "$image" --version
    docker run --rm --entrypoint bolt "$image" task show --format json
    docker run --rm --entrypoint ansible "$image" --version
    docker run --rm --entrypoint ansible-inventory "$image" --version
    docker run --rm --entrypoint ansible-playbook "$image" --version
    docker run --rm --entrypoint puppet "$image" --version
    docker run --rm --entrypoint facter "$image" --version
    docker run --rm --entrypoint ssh "$image" -V
    ;;
  bolt)
    docker run --rm --entrypoint bolt "$image" --version
    docker run --rm --entrypoint bolt "$image" task show --format json
    ;;
  *)
    echo "Unknown image profile: $profile" >&2
    exit 2
    ;;
esac

docker run --rm --entrypoint node "$image" -e '
const assert = require("node:assert/strict");
assert.equal(process.versions.node, "24.21.0");
assert.notEqual(process.getuid(), 0);
const bcrypt = require("bcrypt");
assert.ok(bcrypt.compareSync("smoke", bcrypt.hashSync("smoke", 4)));
const db = new (require("sqlite3").Database)(":memory:");
db.get("SELECT 42 AS answer", (err, row) => {
  assert.ifError(err); assert.equal(row.answer, 42); db.close();
});
assert.equal(typeof require("ssh2").Client, "function");
require("pg");
'

container=$(docker run -d -e JWT_SECRET="$(openssl rand -hex 32)" "$image")
trap 'docker logs "$container"; docker stop "$container" >/dev/null' EXIT
for ((attempt=0; attempt<60; attempt++)); do
  if docker exec "$container" node -e '
    (async () => {
      const assert = require("node:assert/strict");
      const health = await fetch("http://127.0.0.1:3000/api/health");
      assert.equal(health.status, 200);
      const page = await fetch("http://127.0.0.1:3000/");
      assert.equal(page.status, 200);
      assert.match(await page.text(), /<html/);
      const inventory = await fetch("http://127.0.0.1:3000/api/inventory");
      assert.equal(inventory.status, 401);
    })().catch(() => process.exit(1));
  '; then
    exit 0
  fi
  sleep 1
done
exit 1
