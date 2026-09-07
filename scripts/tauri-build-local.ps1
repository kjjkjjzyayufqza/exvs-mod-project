# Local Windows release build: use every CPU, skip the slow one-codegen-unit LTO profile.
# Publish/CI keeps src-tauri/Cargo.toml (codegen-units=1, thin LTO) for the smaller exe.
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$TauriArgs
)

$ErrorActionPreference = "Stop"
$cores = [Math]::Max(1, [Environment]::ProcessorCount)
$env:CARGO_BUILD_JOBS = "$cores"
$env:CARGO_PROFILE_RELEASE_CODEGEN_UNITS = "16"
$env:CARGO_PROFILE_RELEASE_LTO = "false"

Write-Host "tauri-build-local: CARGO_BUILD_JOBS=$cores CARGO_PROFILE_RELEASE_CODEGEN_UNITS=16 LTO=false"

$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $RepoRoot
& pnpm exec tauri build @TauriArgs
exit $LASTEXITCODE
