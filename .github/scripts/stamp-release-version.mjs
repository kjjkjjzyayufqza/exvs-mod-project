import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const versionField = /^version\s*=\s*"([^"]+)"/m;

function parseVersion(value) {
  if (typeof value !== "string" || !semver.test(value)) {
    throw new Error(`Expected a release version such as 0.1.6, got ${value}`);
  }
  const parts = value.split(".").map(Number);
  if (!parts.every(Number.isSafeInteger)) throw new Error("Version component is too large");
  return parts;
}

function readVersionFiles(root) {
  const paths = ["package.json", "src-tauri/tauri.conf.json", "src-tauri/Cargo.toml", "src-tauri/Cargo.lock"];
  const originals = paths.map((path) => readFileSync(join(root, path), "utf8"));
  const packageJson = JSON.parse(originals[0]);
  const tauriConf = JSON.parse(originals[1]);
  const cargoPackage = originals[2].match(/^\[package\][ \t]*\r?\n[\s\S]*?(?=^\[|(?![\s\S]))/m)?.[0];
  const cargoName = cargoPackage?.match(/^name\s*=\s*"([^"]+)"/m)?.[1];
  const cargoVersion = cargoPackage?.match(versionField)?.[1];
  if (!cargoName || !cargoVersion) throw new Error("Cargo.toml must have a named, versioned [package]");
  const lockSections = originals[3].split(/(?=^\[\[package\]\])/m);
  const matching = lockSections.flatMap((section, index) =>
    section.match(/^name\s*=\s*"([^"]+)"/m)?.[1] === cargoName && !/^source\s*=/m.test(section)
      ? [index] : []);
  if (matching.length !== 1) throw new Error(`Cargo.lock must contain exactly one local package ${cargoName}`);
  const lockIndex = matching[0];
  const lockVersion = lockSections[lockIndex].match(versionField)?.[1];
  const versions = [packageJson.version, tauriConf.version, cargoVersion, lockVersion];
  versions.forEach(parseVersion);
  return { paths, originals, packageJson, tauriConf, cargoPackage, lockSections, lockIndex, versions };
}

export function checkReleaseVersion(root = defaultRoot) {
  const { versions } = readVersionFiles(root);
  if (!versions.every((value) => value === versions[0])) {
    throw new Error(`Version files disagree (${versions.join(", ")}); run pnpm version:bump <version>`);
  }
  return versions[0];
}

export function stampReleaseVersion(request = "patch", root = defaultRoot) {
  const files = readVersionFiles(root);
  let version = request;
  if (["patch", "minor", "major"].includes(request)) {
    const parts = parseVersion(files.tauriConf.version);
    const index = { major: 0, minor: 1, patch: 2 }[request];
    parts[index] += 1;
    parts.fill(0, index + 1);
    version = parts.join(".");
  }
  parseVersion(version);
  files.packageJson.version = version;
  files.tauriConf.version = version;
  const replacement = `version = "${version}"`;
  files.lockSections[files.lockIndex] = files.lockSections[files.lockIndex].replace(versionField, replacement);
  const contents = [
    `${JSON.stringify(files.packageJson, null, 2)}\n`,
    `${JSON.stringify(files.tauriConf, null, 2)}\n`,
    files.originals[2].replace(files.cargoPackage, files.cargoPackage.replace(versionField, replacement)),
    files.lockSections.join(""),
  ];
  // Validate every input before writing. Restore exact originals if a write fails.
  const written = [];
  try {
    files.paths.forEach((path, index) => {
      if (contents[index] === files.originals[index]) return;
      written.push(index);
      writeFileSync(join(root, path), contents[index]);
    });
  } catch (error) {
    for (const index of written.reverse()) writeFileSync(join(root, files.paths[index]), files.originals[index]);
    throw error;
  }
  return version;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length > 1) throw new Error("Expected at most one version or bump argument");
    if (args[0] === "--help") {
      console.log("Usage: pnpm version:bump [patch|minor|major|X.Y.Z] (default: patch)\nUpdates version files only. --check validates without writing.");
    } else if (args[0] === "--check") {
      console.log(`Version ${checkReleaseVersion()} is synchronized across four files.`);
    } else {
      console.log(`Updated four version files to ${stampReleaseVersion(args[0])}.`);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
