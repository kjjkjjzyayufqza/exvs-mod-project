import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { checkReleaseVersion, stampReleaseVersion } from "./stamp-release-version.mjs";

const artifacts = resolve(dirname(fileURLToPath(import.meta.url)), "../../tmp/release-script-tests");
const paths = ["package.json", "src-tauri/tauri.conf.json", "src-tauri/Cargo.toml", "src-tauri/Cargo.lock"];

function fixture(t) {
  mkdirSync(artifacts, { recursive: true });
  const root = mkdtempSync(join(artifacts, "version-"));
  mkdirSync(join(root, "src-tauri"));
  writeFileSync(join(root, paths[0]), '{"version":"0.1.5","scripts":{"keep":"untouched"}}\n');
  writeFileSync(join(root, paths[1]), '{"version":"0.1.5","productName":"Keep"}\n');
  writeFileSync(join(root, paths[2]), '[package]\r\nname = "app"\r\nversion = "0.1.5"\r\n\r\n[dependencies]\r\nother = { version = "7.8.9" }\r\n');
  writeFileSync(join(root, paths[3]), '# Lockfile\r\nversion = 4\r\n\r\n[[package]]\r\nname = "app"\r\nversion = "0.1.5"\r\n\r\n[[package]]\r\nname = "other"\r\nversion = "7.8.9"\r\n');
  t.after(() => rmSync(root, { recursive: true }));
  return root;
}

function snapshot(root) {
  return paths.map((path) => readFileSync(join(root, path), "utf8"));
}

test("explicit version updates all four files and preserves dependencies and scripts", (t) => {
  const root = fixture(t);
  assert.equal(stampReleaseVersion("0.1.6", root), "0.1.6");
  assert.equal(checkReleaseVersion(root), "0.1.6");
  const files = snapshot(root);
  assert.equal(JSON.parse(files[0]).scripts.keep, "untouched");
  assert.equal(JSON.parse(files[1]).productName, "Keep");
  assert.match(files[2], /other = \{ version = "7.8.9" \}/);
  assert.match(files[3], /name = "other"\r\nversion = "7.8.9"/);
  stampReleaseVersion("0.1.6", root);
  assert.deepEqual(snapshot(root), files, "reapplying the same version is a no-op");
});

test("patch is the default; minor and major reset lower components", (t) => {
  const root = fixture(t);
  assert.equal(stampReleaseVersion(undefined, root), "0.1.6");
  assert.equal(stampReleaseVersion("minor", root), "0.2.0");
  assert.equal(stampReleaseVersion("major", root), "1.0.0");
});

test("invalid versions never modify any file", (t) => {
  const root = fixture(t);
  const before = snapshot(root);
  for (const value of ["", "v0.1.6", "01.2.3", "0.1.6-beta", "1.2", "1.2.9007199254740992"]) {
    assert.throws(() => stampReleaseVersion(value, root));
    assert.deepEqual(snapshot(root), before);
  }
});

test("malformed lockfile is rejected before any version file is written", (t) => {
  const root = fixture(t);
  writeFileSync(join(root, paths[3]), 'version = 4\n');
  const before = snapshot(root);
  assert.throws(() => stampReleaseVersion("0.1.6", root), /exactly one local package/);
  assert.deepEqual(snapshot(root), before);
});

test("check reports mismatches without changing files", (t) => {
  const root = fixture(t);
  writeFileSync(join(root, paths[0]), '{"version":"0.0.0"}\n');
  const before = snapshot(root);
  assert.throws(() => checkReleaseVersion(root), /Version files disagree/);
  assert.deepEqual(snapshot(root), before);
});
