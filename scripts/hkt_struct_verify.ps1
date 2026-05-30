param(
    [Parameter(Mandatory = $true)]
    [string]$HktPath,

    [string]$OutXmlPath = "",

    [string]$FilterManager = "C:\Program Files\Havok\HavokContentTools\hctStandAloneFilterManager.exe"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $FilterManager)) {
    throw "hctStandAloneFilterManager not found: $FilterManager"
}

if (-not (Test-Path -LiteralPath $HktPath)) {
    throw "HKT not found: $HktPath"
}

function Find-FieldEnd {
    param(
        [string]$Text,
        [int]$Start
    )

    $afterOpen = $Text.IndexOf(">", $Start)
    if ($afterOpen -lt 0) {
        throw "Malformed field opening tag"
    }
    $pos = $afterOpen + 1
    $depth = 1
    while ($pos -lt $Text.Length -and $depth -gt 0) {
        $open = $Text.IndexOf("<field ", $pos)
        $close = $Text.IndexOf("</field>", $pos)
        if ($close -lt 0) {
            break
        }
        if ($open -ge 0 -and $open -le $close) {
            $depth += 1
            $pos = $open + 7
        } else {
            $depth -= 1
            $pos = $close + 8
            if ($depth -eq 0) {
                return $pos
            }
        }
    }
    throw "Failed to locate field end"
}

function Get-FieldBlock {
    param(
        [string]$Text,
        [string]$Name,
        [int]$Start = 0
    )

    $marker = "<field name=`"$Name`">"
    $fieldStart = $Text.IndexOf($marker, $Start)
    if ($fieldStart -lt 0) {
        return $null
    }
    $fieldEnd = Find-FieldEnd -Text $Text -Start $fieldStart
    return $Text.Substring($fieldStart, $fieldEnd - $fieldStart)
}

function Get-IntegerField {
    param(
        [string]$Text,
        [string]$Name
    )

    $block = Get-FieldBlock -Text $Text -Name $Name
    if ($null -eq $block) {
        return $null
    }
    $match = [regex]::Match($block, '<integer value="(-?[0-9]+)"')
    if (-not $match.Success) {
        return $null
    }
    return [int64]$match.Groups[1].Value
}

function Get-ArrayCountField {
    param(
        [string]$Text,
        [string]$Name
    )

    $block = Get-FieldBlock -Text $Text -Name $Name
    if ($null -eq $block) {
        return $null
    }
    $match = [regex]::Match($block, '<array count="([0-9]+)"')
    if (-not $match.Success) {
        return $null
    }
    return [int64]$match.Groups[1].Value
}

function Convert-HktToXml {
    param(
        [string]$InputPath,
        [string]$OutputPath
    )

    $tmp = Join-Path $env:TEMP ("hkt_struct_" + [guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Path $tmp | Out-Null
    $hko = Join-Path $tmp "settings.hko"
    $hkoContent = @'
<?xml version="1.0" encoding="utf-8"?>
<hkoptions>
	<hkobject class="hctConfigurationSetData">
		<hkparam name="filterManagerVersion">65537</hkparam>
		<hkparam name="activeConfiguration">0</hkparam>
	</hkobject>
	<hkobject class="hctConfigurationData">
		<hkparam name="configurationName">HKT2XML</hkparam>
		<hkparam name="numFilters">1</hkparam>
	</hkobject>
	<hkobject name="Write to Platform" class="hctFilterData">
		<hkparam name="id">2876798309</hkparam>
		<hkparam name="ver">66049</hkparam>
		<hkparam name="hasOptions">true</hkparam>
	</hkobject>
	<hkobject name="Write to Platform" class="hctPlatformWriterOptions">
		<hkparam name="filename"></hkparam>
		<hkparam name="tagfile">true</hkparam>
		<hkparam name="bytesInPointer">8</hkparam>
		<hkparam name="littleEndian">true</hkparam>
		<hkparam name="reusePaddingOptimized">false</hkparam>
		<hkparam name="emptyBaseClassOptimized">false</hkparam>
		<hkparam name="removeMetadata">false</hkparam>
		<hkparam name="userTag">0</hkparam>
		<hkparam name="saveEnvironmentData">false</hkparam>
		<hkparam name="xmlFormat">true</hkparam>
	</hkobject>
</hkoptions>
'@
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($hko, $hkoContent, $utf8NoBom)

    try {
        $proc = Start-Process `
            -FilePath $FilterManager `
            -ArgumentList @("-s", $hko, "-p", "$tmp\", "-o", "$tmp\", $InputPath) `
            -Wait `
            -PassThru
        $generated = Get-ChildItem -LiteralPath $tmp -File |
            Where-Object { $_.Name -ne "settings.hko" } |
            Select-Object -First 1
        if ($null -eq $generated) {
            throw "Havok XML conversion produced no file. Exit=$($proc.ExitCode)"
        }
        Copy-Item -LiteralPath $generated.FullName -Destination $OutputPath -Force
    }
    finally {
        Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
    }
}

$resolvedHkt = (Resolve-Path -LiteralPath $HktPath).Path
if ([string]::IsNullOrWhiteSpace($OutXmlPath)) {
    $OutXmlPath = [System.IO.Path]::ChangeExtension($resolvedHkt, ".roundtrip.xml")
}

Convert-HktToXml -InputPath $resolvedHkt -OutputPath $OutXmlPath
$xml = Get-Content -LiteralPath $OutXmlPath -Raw

$shapeBlocks = [regex]::Matches($xml, '<object id="([^"]+)"[^>]*>\s*<!-- hknpCompressedMeshShape -->(?s:.*?)</object>')
$dataBlocks = [regex]::Matches($xml, '<object id="([^"]+)"[^>]*>\s*<!-- hknpCompressedMeshShapeData -->(?s:.*?)</object>')
$meshSummaries = @()

foreach ($blockMatch in $dataBlocks) {
    $objectText = $blockMatch.Value
    $meshTree = Get-FieldBlock -Text $objectText -Name "meshTree"
    if ($null -eq $meshTree) {
        continue
    }

    $meshSummaries += [pscustomobject]@{
        dataId = $blockMatch.Groups[1].Value
        numPrimitiveKeys = Get-IntegerField -Text $meshTree -Name "numPrimitiveKeys"
        bitsPerKey = Get-IntegerField -Text $meshTree -Name "bitsPerKey"
        maxKeyValue = Get-IntegerField -Text $meshTree -Name "maxKeyValue"
        meshNodes = Get-ArrayCountField -Text $meshTree -Name "nodes"
        sections = Get-ArrayCountField -Text $meshTree -Name "sections"
        primitives = Get-ArrayCountField -Text $meshTree -Name "primitives"
        sharedVerticesIndex = Get-ArrayCountField -Text $meshTree -Name "sharedVerticesIndex"
        packedVertices = Get-ArrayCountField -Text $meshTree -Name "packedVertices"
        sharedVertices = Get-ArrayCountField -Text $meshTree -Name "sharedVertices"
        primitiveDataRuns = Get-ArrayCountField -Text $meshTree -Name "primitiveDataRuns"
        hasSimdTree = if ($objectText -match '<field name="hasSimdTree"><bool value="([^"]+)"') { $Matches[1] } else { $null }
    }
}

$shapeSummaries = @()
foreach ($blockMatch in $shapeBlocks) {
    $objectText = $blockMatch.Value
    $dataId = if ($objectText -match '<field name="data"><pointer id="([^"]+)"') { $Matches[1] } else { $null }
    $triBits = if ($objectText -match '<field name="triangleIsInterior">(?s:.*?)<field name="numBits"><integer value="([0-9]+)"') { [int64]$Matches[1] } else { $null }
    $shapeSummaries += [pscustomobject]@{
        shapeId = $blockMatch.Groups[1].Value
        dataId = $dataId
        numShapeKeyBits = Get-IntegerField -Text $objectText -Name "numShapeKeyBits"
        triangleIsInteriorBits = $triBits
    }
}

$errors = @()
foreach ($mesh in $meshSummaries) {
}

[pscustomobject]@{
    hkt = $resolvedHkt
    xml = (Resolve-Path -LiteralPath $OutXmlPath).Path
    shapeCount = $shapeSummaries.Count
    meshDataCount = $meshSummaries.Count
    shapes = $shapeSummaries
    meshData = $meshSummaries
    errors = $errors
} | ConvertTo-Json -Depth 6

if ($errors.Count -gt 0) {
    exit 3
}
