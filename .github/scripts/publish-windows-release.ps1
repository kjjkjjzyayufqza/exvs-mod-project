# Build, sign, and publish the current committed Windows release.
# pnpm version:bump [patch|minor|major|X.Y.Z] updates versions separately.
# pnpm release:publish [-SkipUpload] [-NotesFile path]
param(
    [string]$Version,
    [switch]$SkipUpload,
    [string]$NotesFile
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location -LiteralPath $RepoRoot
$OwnerRepo = "kjjkjjzyayufqza/exvs-mod-project"

function Assert-NativeSuccess([string]$Action) {
    if ($LASTEXITCODE -ne 0) { throw "$Action failed (exit $LASTEXITCODE)" }
}

node .github/scripts/stamp-release-version.mjs --check
Assert-NativeSuccess "Version check"
$currentVersion = (Get-Content -LiteralPath package.json -Raw | ConvertFrom-Json).version
if ($Version -and $Version -ne $currentVersion) {
    throw "Version is $currentVersion. Run pnpm version:bump $Version first."
}
$Version = $currentVersion
$tag = "v$Version"
$commit = (git rev-parse HEAD).Trim()
Assert-NativeSuccess "Resolve release commit"
$changes = @(git status --porcelain --untracked-files=no)
Assert-NativeSuccess "Check release tree"
if ($changes.Count -gt 0) {
    throw "Commit tracked changes before publishing, or build from a clean release worktree."
}

if (-not $SkipUpload) {
    $releaseTags = @(gh api "repos/$OwnerRepo/releases?per_page=100" --paginate --jq '.[].tag_name')
    Assert-NativeSuccess "Read GitHub releases"
    if ($releaseTags -contains $tag) { throw "GitHub Release $tag already exists" }
}

$key = $env:TAURI_SIGNING_PRIVATE_KEY
if (-not $key) {
    $keyFile = Join-Path $RepoRoot ".local\tauri-updater.key"
    if (Test-Path -LiteralPath $keyFile) {
        $key = (Get-Content -LiteralPath $keyFile -Raw).Trim()
    }
}
if (-not $key) { throw "Missing TAURI_SIGNING_PRIVATE_KEY or .local/tauri-updater.key" }
$password = $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD
if ($null -eq $password) {
    $passwordFile = Join-Path $RepoRoot ".local\tauri-updater.key.password"
    $password = if (Test-Path -LiteralPath $passwordFile) {
        (Get-Content -LiteralPath $passwordFile -Raw).Trim()
    } else { "" }
}

$outDir = Join-Path $RepoRoot "tmp\release-local\$Version"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
if ($NotesFile) {
    $notes = Get-Content -LiteralPath $NotesFile -Raw
} else {
    $previousTag = git describe --tags --abbrev=0 HEAD 2>$null
    $range = if ($LASTEXITCODE -eq 0 -and $previousTag) { "$previousTag..HEAD" } else { "HEAD" }
    $log = @(git log $range -20 --pretty=format:"- %s")
    Assert-NativeSuccess "Collect release notes"
    $notes = @(
        "Windows x64 release of EXVS Mod Project.",
        "",
        ($log -join "`n"),
        "",
        "Portable Windows x64 ZIP with a signed automatic-update manifest."
    ) -join "`n"
}
$notesPath = Join-Path $outDir "release-notes.md"
[System.IO.File]::WriteAllText($notesPath, $notes)

$previousToken = $env:EXVS_UPDATER_GITHUB_TOKEN
$previousKey = $env:TAURI_SIGNING_PRIVATE_KEY
$previousPassword = $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD
$zipName = "EXVS-Mod-Project-$Version-windows-x64.zip"
$zipPath = Join-Path $outDir $zipName
$sigPath = "$zipPath.sig"
try {
    # Public releases must never embed a private GitHub access token in the EXE.
    $env:EXVS_UPDATER_GITHUB_TOKEN = $null
    $env:TAURI_SIGNING_PRIVATE_KEY = $key
    $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = $password
    Write-Host "Building $tag from $commit (Release profile)"
    pnpm exec tauri build --no-bundle
    Assert-NativeSuccess "Release build"

    $exe = Join-Path $RepoRoot "src-tauri\target\release\app.exe"
    if (-not (Test-Path -LiteralPath $exe)) { throw "Release app.exe was not produced" }
    $exeVersion = (Get-Item -LiteralPath $exe).VersionInfo.ProductVersion
    if ($exeVersion -ne $Version) { throw "EXE version '$exeVersion' does not match $Version" }

    & (Join-Path $PSScriptRoot "pack-portable-zip.ps1") -Version $Version -OutputZip $zipPath -RepoRoot $RepoRoot
    if (Test-Path -LiteralPath $sigPath) { Remove-Item -LiteralPath $sigPath -Force }
    pnpm exec tauri signer sign "--password=$password" $zipPath
    Assert-NativeSuccess "Sign portable ZIP"
    if (-not (Test-Path -LiteralPath $sigPath)) { throw "ZIP signature was not produced" }
}
finally {
    $env:EXVS_UPDATER_GITHUB_TOKEN = $previousToken
    $env:TAURI_SIGNING_PRIVATE_KEY = $previousKey
    $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = $previousPassword
}

Write-Host "ZIP: $zipPath"
Write-Host "SIG: $sigPath"
if ($SkipUpload) { return }

git diff --quiet HEAD --
Assert-NativeSuccess "Confirm build did not change tracked release files"
$localTag = git rev-parse --verify --quiet "refs/tags/$tag^{commit}"
if ($LASTEXITCODE -eq 0) {
    if ($localTag -ne $commit) { throw "Local tag $tag points at another commit" }
} else {
    git tag $tag $commit
    Assert-NativeSuccess "Create release tag"
}
# The tag publishes the exact commit used for the build; no branch is force-pushed.
git push origin "refs/tags/$tag"
Assert-NativeSuccess "Push release tag"
gh release create $tag --repo $OwnerRepo --verify-tag --draft `
    --title "EXVS Mod Project $tag" --notes-file $notesPath $zipPath $sigPath
Assert-NativeSuccess "Create draft release"
$release = gh api "repos/$OwnerRepo/releases/tags/$tag" | ConvertFrom-Json
Assert-NativeSuccess "Read uploaded release"
$zipAsset = $release.assets | Where-Object { $_.name -eq $zipName } | Select-Object -First 1
if (-not $zipAsset) { throw "Draft release is missing $zipName" }

$latest = [ordered]@{
    version = $Version
    notes = $notes
    pub_date = [DateTime]::UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ")
    platforms = @{
        "windows-x86_64" = @{
            signature = (Get-Content -LiteralPath $sigPath -Raw).Trim()
            url = $zipAsset.browser_download_url
        }
    }
}
$latestPath = Join-Path $outDir "latest.json"
[System.IO.File]::WriteAllText($latestPath, ($latest | ConvertTo-Json -Depth 6))
gh release upload $tag --repo $OwnerRepo $latestPath
Assert-NativeSuccess "Upload updater manifest"
$assets = gh release view $tag --repo $OwnerRepo --json assets | ConvertFrom-Json
Assert-NativeSuccess "Verify uploaded assets"
foreach ($name in @($zipName, "$zipName.sig", "latest.json")) {
    if (-not ($assets.assets | Where-Object { $_.name -eq $name -and $_.size -gt 0 })) {
        throw "Draft release is missing a complete $name asset"
    }
}
gh release edit $tag --repo $OwnerRepo --draft=false --latest
Assert-NativeSuccess "Publish complete release"
Write-Host "Published https://github.com/$OwnerRepo/releases/tag/$tag"
