#!/usr/bin/env bash
set -euo pipefail
image=${1:?Usage: image-smoke.sh IMAGE}

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
docker run --rm --entrypoint bolt "$image" --version
docker run --rm --entrypoint bolt "$image" task show --format json

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
