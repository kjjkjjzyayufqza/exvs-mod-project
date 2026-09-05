param(
    [Parameter(Mandatory = $true)][string]$Version,
    [Parameter(Mandatory = $true)][string]$OutputZip,
    [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
)

$ErrorActionPreference = "Stop"

$releaseDir = Join-Path $RepoRoot "src-tauri\target\release"
$exeCandidates = @(
    (Join-Path $releaseDir "EXVS Mod Project.exe"),
    (Join-Path $releaseDir "app.exe")
)
$exe = $exeCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $exe) {
    throw "Release executable was not found in $releaseDir"
}

$stageRoot = Join-Path $RepoRoot "tmp\release-portable"
$stage = Join-Path $stageRoot "EXVS-Mod-Project-$Version-windows-x64"
if (Test-Path -LiteralPath $stageRoot) {
    Remove-Item -LiteralPath $stageRoot -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $stage | Out-Null
Copy-Item -LiteralPath $exe -Destination (Join-Path $stage "EXVS Mod Project.exe")

$readme = @"
EXVS Mod Project $Version

Portable Windows build.
The NSIS installer from the same GitHub Release is the auto-update package.
"@
Set-Content -LiteralPath (Join-Path $stage "README.txt") -Value $readme -Encoding utf8

$zipPath = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $OutputZip))
$zipDir = Split-Path -Parent $zipPath
if ($zipDir -and -not (Test-Path -LiteralPath $zipDir)) {
    New-Item -ItemType Directory -Force -Path $zipDir | Out-Null
}
if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($stage, $zipPath)
Write-Host "wrote $zipPath"
