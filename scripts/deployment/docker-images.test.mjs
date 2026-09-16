import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dockerfile = readFileSync(new URL("../../Dockerfile", import.meta.url), "utf8");
const publishWorkflow = readFileSync(
  new URL("../../.github/workflows/publish.yml", import.meta.url),
  "utf8",
);
const smokeTest = readFileSync(
  new URL("../supply-chain/image-smoke.sh", import.meta.url),
  "utf8",
);
const scanScript = readFileSync(
  new URL("../supply-chain/scan-image.sh", import.meta.url),
  "utf8",
);
const batteriesIgnore = readFileSync(
  new URL("../supply-chain/trivy-batteries-ignore.yaml", import.meta.url),
  "utf8",
);

test("the default image resolves to the core target", () => {
  const core = dockerfile.indexOf(" AS core\n");
  const batteries = dockerfile.indexOf("FROM core AS batteries");
  const final = dockerfile.indexOf("FROM core AS final");

  assert.ok(core >= 0, "missing core target");
  assert.ok(batteries > core, "batteries must extend core");
  assert.ok(final > batteries, "the final default stage must follow batteries");
  assert.equal(dockerfile.slice(final).trim(), "FROM core AS final");
});

test("the batteries target contains the integration command toolchain", () => {
  const batteries = dockerfile.slice(dockerfile.indexOf("FROM core AS batteries"));

  for (const command of [
    "ansible",
    "curl",
    "git",
    "openssh-client",
    "rsync",
    "sshpass",
    "/usr/local/bin/bolt",
    "/usr/local/bin/facter",
    "/usr/local/bin/puppet",
  ]) {
    assert.match(batteries, new RegExp(command.replaceAll("/", "\\/")));
  }
});

test("release CI builds and publishes both profiles", () => {
  assert.match(publishWorkflow, /profile: \[core, batteries\]/);
  assert.match(publishWorkflow, /target: \$\{\{ matrix\.profile \}\}/);
  assert.match(publishWorkflow, /image-smoke\.sh pabawi:candidate \$\{\{ matrix\.profile \}\}/);
  assert.match(publishWorkflow, /batteries-\$version/);
  assert.match(publishWorkflow, /\$image:batteries"/);
  assert.match(publishWorkflow, /DOCKERHUB_IMAGE: example42\/pabawi/);
  assert.match(publishWorkflow, /secrets\.DOCKERHUB_TOKEN/);
  assert.match(publishWorkflow, /docker push "\$dockerhub_tag"/);
  assert.doesNotMatch(publishWorkflow, /continue-on-error/);
  assert.match(publishWorkflow, /if \[\[ "\$\{\{ matrix\.profile \}\}" = batteries \]\]/);
  assert.match(publishWorkflow, /trivy-batteries-ignore\.yaml/);
});

test("the batteries vulnerability exception is narrow and expiring", () => {
  assert.match(scanScript, /--ignorefile/);
  assert.match(batteriesIgnore, /id: CVE-2026-85396/);
  assert.match(batteriesIgnore, /pkg:gem\/rubyzip@2\.4\.1/);
  assert.match(batteriesIgnore, /rubyzip-2\.4\.1\.gemspec/);
  assert.match(batteriesIgnore, /expired_at: 2026-12-31/);
  assert.equal((batteriesIgnore.match(/\n\s+- id:/g) ?? []).length, 1);
});

test("the core smoke profile rejects integration commands", () => {
  for (const command of ["ansible", "bolt", "facter", "git", "puppet", "ssh"]) {
    assert.match(smokeTest, new RegExp(`\\b${command}\\b`));
  }
  assert.match(smokeTest, /Core image unexpectedly contains/);
});

test("the batteries smoke profile requires every bundled command", () => {
  const batteriesProfile = smokeTest.slice(smokeTest.indexOf("  batteries)"));

  for (const command of [
    "ansible",
    "ansible-inventory",
    "ansible-playbook",
    "bolt",
    "curl",
    "facter",
    "git",
    "puppet",
    "rsync",
    "ssh",
    "sshpass",
  ]) {
    assert.match(batteriesProfile, new RegExp(`\\b${command}\\b`));
  }
});
