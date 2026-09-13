# Windows releases

Agent guidance: [AGENTS.md](../AGENTS.md). Releases target OB and earlier.

## Update version files

```powershell
pnpm version:bump          # Next patch from tauri.conf.json
pnpm version:bump minor    # Next minor, patch becomes zero
pnpm version:bump major    # Next major, minor and patch become zero
pnpm version:bump 0.1.6    # Set an exact version
pnpm version:bump --check  # Check consistency without writing
```

The command runs `.github/scripts/stamp-release-version.mjs`. It updates only
`package.json`, `src-tauri/tauri.conf.json`, `[package].version` in
`src-tauri/Cargo.toml`, and the local `app` entry in `src-tauri/Cargo.lock`.
It does not build, create commits/tags, access GitHub, or change dependency
versions. Setting the same version again succeeds without rewriting files.
All inputs are checked before the first write.

## Build and publish

Review and commit the version change and the code intended for release, then:

```powershell
pnpm release:publish
# Optional custom release notes:
pnpm release:publish -NotesFile tmp/release-notes.md
# Build and sign locally without uploading:
pnpm release:publish -SkipUpload
```

`pnpm release:windows` remains an alias. The publisher uses the synchronized
version already present in the files; it never bumps or reverts them. Tracked
changes must be committed. A clean worktree can be used when other work is
pending in the main checkout.

Requirements: Windows, pnpm, the Rust/Tauri build tools, authenticated `gh`
with release write access, and the existing updater signing key in
`TAURI_SIGNING_PRIVATE_KEY` or gitignored `.local/tauri-updater.key`.
An optional password comes from `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` or
`.local/tauri-updater.key.password`. An absent password means an empty one.
The public application does not require an embedded GitHub access token.

The command builds the Release profile, checks the EXE version, creates and
signs the portable ZIP, pushes a tag for the exact build commit, and uploads
the ZIP, signature, and `latest.json` to a draft release. It marks the release
published/latest only after all three assets are uploaded. Failures leave a
draft for inspection and never publish an incomplete updater manifest.
Artifacts and notes are under `tmp/release-local/<version>/`.
