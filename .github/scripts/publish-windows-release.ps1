# Local Windows x64 zip build + GitHub Release upload.
# Usage: pnpm release:windows
# Optional: pwsh -File .github/scripts/publish-windows-release.ps1 -Version 0.1.1
#
# Required local secrets (gitignored, never commit):
#   .local/tauri-updater.key
#   .local/exvs-updater-github.token  (PAT with Contents: Read on this private repo)

param(
    [string]$Version,
    [switch]$SkipUpload
)

$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location -LiteralPath $RepoRoot

$OwnerRepo = "kjjkjjzyayufqza/exvs-mod-project"
$KeyFile = Join-Path $RepoRoot ".local\tauri-updater.key"
$TokenFile = Join-Path $RepoRoot ".local\exvs-updater-github.token"
$HiddenBin = Join-Path $RepoRoot "src-tauri\src\bin.ci-hidden"
$SrcBin = Join-Path $RepoRoot "src-tauri\src\bin"
$StampedPaths = @(
    (Join-Path $RepoRoot "package.json"),
    (Join-Path $RepoRoot "src-tauri\tauri.conf.json"),
    (Join-Path $RepoRoot "src-tauri\Cargo.toml")
)

function Read-SecretFile([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) {
        return $null
    }
    return (Get-Content -LiteralPath $Path -Raw).Trim()
}

function Restore-PublishTree {
    if (Test-Path -LiteralPath $HiddenBin) {
        if (Test-Path -LiteralPath $SrcBin) {
            throw "Cannot restore src/bin: both src/bin and src/bin.ci-hidden exist"
        }
        Rename-Item -LiteralPath $HiddenBin -NewName "bin"
    }
    foreach ($path in $StampedPaths) {
        git checkout -- $path
    }
}

if (-not $env:TAURI_SIGNING_PRIVATE_KEY) {
    $env:TAURI_SIGNING_PRIVATE_KEY = Read-SecretFile $KeyFile
}
if (-not $env:TAURI_SIGNING_PRIVATE_KEY) {
    throw "Missing updater signing key. Expected .local/tauri-updater.key"
}
if (-not $env:EXVS_UPDATER_GITHUB_TOKEN) {
    $env:EXVS_UPDATER_GITHUB_TOKEN = Read-SecretFile $TokenFile
}
if (-not $env:EXVS_UPDATER_GITHUB_TOKEN) {
    throw "Missing updater GitHub token. Create a PAT with Contents: Read on $OwnerRepo and save it to .local/exvs-updater-github.token (one line, no quotes)."
}

$previousGhToken = $env:GH_TOKEN
try {
    $env:GH_TOKEN = $env:EXVS_UPDATER_GITHUB_TOKEN
    $name = gh api "repos/$OwnerRepo" --jq ".full_name"
    if ($name -ne $OwnerRepo) {
        throw "EXVS_UPDATER_GITHUB_TOKEN cannot read $OwnerRepo"
    }
}
finally {
    $env:GH_TOKEN = $previousGhToken
}

if (-not $Version) {
    $previous = ""
    try {
        $previous = (gh release list --limit 1 | Select-Object -First 1)
    } catch {
        $previous = ""
    }
    $tagMatch = [regex]::Match([string]$previous, 'v?(\d+\.\d+\.\d+)')
    if ($tagMatch.Success -and $tagMatch.Groups[1].Value -match '^0\.1\.(\d+)$') {
        $Version = "0.1.$([int]$Matches[1] + 1)"
    } elseif ($tagMatch.Success) {
        $Version = "0.1.1"
    } else {
        $Version = "0.1.1"
    }
}
if ($Version -notmatch '^\d+\.\d+\.\d+$') {
    throw "Version must be semver like 0.1.1, got $Version"
}
$tag = "v$Version"

$previousNotesTag = ""
try {
    $previousNotesLine = (gh release list --limit 1 | Select-Object -First 1)
    $notesTagMatch = [regex]::Match([string]$previousNotesLine, 'v?\d+\.\d+\.\d+')
    if ($notesTagMatch.Success) {
        $previousNotesTag = $notesTagMatch.Value
        if ($previousNotesTag -notmatch '^v') {
            $previousNotesTag = "v$previousNotesTag"
        }
    }
} catch {
    $previousNotesTag = ""
}
if ($previousNotesTag) {
    $log = git log "$previousNotesTag..HEAD" --pretty=format:"- %s" 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $log) {
        $log = git log -20 --pretty=format:"- %s"
    }
} else {
    $log = git log -20 --pretty=format:"- %s"
}
if ($log -is [array]) {
    $log = $log -join "`n"
}
if (-not $log) {
    $log = "- Windows release of EXVS Mod Project."
}
$notes = @(
    "Windows x64 release of EXVS Mod Project.",
    "",
    $log,
    "",
    "- EXVS-Mod-Project-$Version-windows-x64.zip is the Windows x64 build.",
    "- Installed copies check this GitHub Release on every launch."
) -join "`n"

$cpu = [Environment]::ProcessorCount
$env:CARGO_BUILD_JOBS = [Math]::Max(2, [Math]::Min(6, $cpu)).ToString()

if (Test-Path -LiteralPath $HiddenBin) {
    throw "src-tauri/src/bin.ci-hidden already exists. Rename it back to src/bin before publishing."
}

try {
    Write-Host "Stamping $Version"
    node .github/scripts/stamp-release-version.mjs $Version
    Write-Host "Building Windows x64 app (local Release, thin LTO, jobs=$($env:CARGO_BUILD_JOBS))"
    pnpm tauri build --no-bundle
}
finally {
    Restore-PublishTree
}

$outDir = Join-Path $RepoRoot "tmp\release-local\$Version"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$zipName = "EXVS-Mod-Project-$Version-windows-x64.zip"
$zipRel = "tmp\release-local\$Version\$zipName"
& (Join-Path $PSScriptRoot "pack-portable-zip.ps1") -Version $Version -OutputZip $zipRel -RepoRoot $RepoRoot
$zipPath = Join-Path $RepoRoot $zipRel
$sigPath = "$zipPath.sig"
if (Test-Path -LiteralPath $sigPath) {
    Remove-Item -LiteralPath $sigPath -Force
}
Write-Host "Signing $zipPath"
pnpm tauri signer sign $zipPath
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $sigPath)) {
    throw "Windows x64 zip signature was not produced at $sigPath"
}

Write-Host "ZIP: $zipPath"
Write-Host "SIG: $sigPath"

if ($SkipUpload) {
    Write-Host "SkipUpload set; not creating a GitHub Release."
    return
}

$existingTag = $false
try {
    gh release view $tag 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) {
        $existingTag = $true
    }
} catch {
    $existingTag = $false
}
if ($existingTag) {
    throw "GitHub Release $tag already exists"
}

gh release create $tag `
    --title "EXVS Mod Project $tag" `
    --notes $notes `
    --latest `
    $zipPath

$assets = gh api "repos/$OwnerRepo/releases/tags/$tag" | ConvertFrom-Json
$zipAsset = $assets.assets | Where-Object { $_.name -eq $zipName } | Select-Object -First 1
if (-not $zipAsset) {
    throw "Uploaded release $tag is missing $zipName"
}

$latest = [ordered]@{
    version = $Version
    notes = $notes
    pub_date = [DateTime]::UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ")
    platforms = @{
        "windows-x86_64" = @{
            signature = (Get-Content -LiteralPath $sigPath -Raw).Trim()
            url = "https://api.github.com/repos/$OwnerRepo/releases/assets/$($zipAsset.id)"
        }
    }
}
$latestPath = Join-Path $outDir "latest.json"
$json = $latest | ConvertTo-Json -Depth 6
[System.IO.File]::WriteAllText($latestPath, $json)
gh release upload $tag $latestPath --clobber

Write-Host "Published $tag"
Write-Host "https://github.com/$OwnerRepo/releases/tag/$tag"
