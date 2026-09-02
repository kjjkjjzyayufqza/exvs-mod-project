import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const version = process.argv[2]?.trim();
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error(`Usage: node stamp-release-version.mjs <semver>, got ${JSON.stringify(version)}`);
}

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const packageJsonPath = join(repoRoot, "package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
packageJson.version = version;
writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);

const tauriConfPath = join(repoRoot, "src-tauri", "tauri.conf.json");
const tauriConf = JSON.parse(readFileSync(tauriConfPath, "utf8"));
tauriConf.version = version;
writeFileSync(tauriConfPath, `${JSON.stringify(tauriConf, null, 2)}\n`);

const cargoTomlPath = join(repoRoot, "src-tauri", "Cargo.toml");
const cargoToml = readFileSync(cargoTomlPath, "utf8");
const stampedCargoToml = cargoToml.replace(
  /^version = "[^"]+"/m,
  `version = "${version}"`,
);
if (stampedCargoToml === cargoToml) {
  throw new Error(`Failed to stamp src-tauri/Cargo.toml with version ${version}`);
}
writeFileSync(cargoTomlPath, stampedCargoToml);

process.stdout.write(`stamped release version ${version}\n`);
