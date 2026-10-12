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

# Standalone CLIs ship beside the app. Motion FBX compose stays embedded in the
# executable (include_str of tools/motion_fbx_compose.py) and is not copied here.
$cliDir = Join-Path $RepoRoot "src-tauri"
Push-Location -LiteralPath $cliDir
try {
    cargo build --release --bin exvs2_json --bin fhm2d_extract
    if ($LASTEXITCODE -ne 0) { throw "failed to build exvs2_json and fhm2d_extract" }
}
finally {
    Pop-Location
}

$stageTools = Join-Path $stage "tools"
New-Item -ItemType Directory -Force -Path $stageTools | Out-Null
Copy-Item -LiteralPath (Join-Path $releaseDir "exvs2_json.exe") -Destination (Join-Path $stageTools "exvs2-json.exe")
Copy-Item -LiteralPath (Join-Path $releaseDir "fhm2d_extract.exe") -Destination (Join-Path $stageTools "fhm2d_extract.exe")

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

$archive = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
try {
    $entryNames = @(
        $archive.Entries | ForEach-Object { $_.FullName.Replace('\', '/') }
    )
    foreach ($required in @(
            "EXVS Mod Project.exe",
            "tools/exvs2-json.exe",
            "tools/fhm2d_extract.exe"
        )) {
        if ($entryNames -notcontains $required) {
            throw "Portable ZIP is missing $required. Entries: $($entryNames -join ', ')"
        }
    }
    foreach ($forbidden in @(
            "tools/README_motion_fbx_compose.md",
            "tools/motion_fbx_compose.py"
        )) {
        if ($entryNames -contains $forbidden) {
            throw "Portable ZIP must not contain $forbidden"
        }
    }
    $toolEntries = @($entryNames | Where-Object { $_ -like "tools/*" -and $_ -ne "tools/" })
    $allowedTools = @("tools/exvs2-json.exe", "tools/fhm2d_extract.exe")
    foreach ($entry in $toolEntries) {
        if ($allowedTools -notcontains $entry) {
            throw "Portable ZIP tools folder has unexpected entry $entry"
        }
    }
}
finally {
    $archive.Dispose()
}

Write-Host "wrote $zipPath"
