param(
    [Parameter(Mandatory = $true)][string]$Version,
    [Parameter(Mandatory = $true)][string]$OutputZip,
    [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
)

$ErrorActionPreference = "Stop"

$releaseDir = Join-Path $RepoRoot "src-tauri\target\release"
$exeCandidates = @(
    (Join-Path $releaseDir "app.exe"),
    (Join-Path $releaseDir "EXVS Mod Project.exe")
)
$exe = $exeCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $exe) {
    throw "Release executable was not found in $releaseDir"
}

$stageRoot = Join-Path $RepoRoot "tmp\release-portable\$Version"
$stage = Join-Path $stageRoot "EXVS-Mod-Project-$Version-windows-x64"
if (Test-Path -LiteralPath $stageRoot) {
    $allowedRoot = [System.IO.Path]::GetFullPath((Join-Path $RepoRoot "tmp\release-portable")) + [System.IO.Path]::DirectorySeparatorChar
    $resolvedStage = (Resolve-Path -LiteralPath $stageRoot).Path
    if (-not $resolvedStage.StartsWith($allowedRoot, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Portable staging path is outside $allowedRoot"
    }
    Remove-Item -LiteralPath $stageRoot -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $stage | Out-Null
Copy-Item -LiteralPath $exe -Destination (Join-Path $stage "EXVS Mod Project.exe")

$zipPath = if ([System.IO.Path]::IsPathRooted($OutputZip)) {
    [System.IO.Path]::GetFullPath($OutputZip)
} else {
    [System.IO.Path]::GetFullPath((Join-Path $RepoRoot $OutputZip))
}
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
