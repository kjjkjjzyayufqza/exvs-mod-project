param(
    [string]$Root = "",
    [string]$Output = "docs\agent-sessions\scene-object-texture-param-placement\stage_csv_common_values.json"
)

$ErrorActionPreference = "Stop"

function New-FieldStats {
    param([string]$Key)
    [pscustomobject]@{
        key = $Key
        count = 0
        fileCount = 0
        numericCount = 0
        min = $null
        max = $null
        uniqueValues = New-Object 'System.Collections.Generic.HashSet[string]'
        sampleValues = New-Object 'System.Collections.Generic.List[string]'
    }
}

function Add-FieldValue {
    param(
        [hashtable]$Map,
        [string]$Key,
        [string]$Value,
        [hashtable]$FileKeySet
    )

    if ([string]::IsNullOrWhiteSpace($Key)) {
        return
    }

    if (-not $Map.ContainsKey($Key)) {
        $Map[$Key] = New-FieldStats -Key $Key
    }

    $item = $Map[$Key]
    $item.count += 1
    if (-not $FileKeySet.ContainsKey($Key)) {
        $FileKeySet[$Key] = $true
        $item.fileCount += 1
    }

    $trimmed = $Value.Trim()
    [void]$item.uniqueValues.Add($trimmed)
    if ($item.sampleValues.Count -lt 12 -and -not $item.sampleValues.Contains($trimmed)) {
        [void]$item.sampleValues.Add($trimmed)
    }

    $num = 0.0
    if ([double]::TryParse(
        $trimmed,
        [System.Globalization.NumberStyles]::Float,
        [System.Globalization.CultureInfo]::InvariantCulture,
        [ref]$num
    )) {
        $item.numericCount += 1
        if ($null -eq $item.min -or $num -lt $item.min) {
            $item.min = $num
        }
        if ($null -eq $item.max -or $num -gt $item.max) {
            $item.max = $num
        }
    }
}

function Convert-StatsMap {
    param(
        [hashtable]$Map,
        [int]$FileCount
    )

    return @(
        $Map.Values |
            Sort-Object key |
            ForEach-Object {
                [pscustomobject]@{
                    key = $_.key
                    count = $_.count
                    fileCount = $_.fileCount
                    inEveryFile = ($FileCount -gt 0 -and $_.fileCount -eq $FileCount)
                    numericCount = $_.numericCount
                    min = $_.min
                    max = $_.max
                    uniqueValueCount = $_.uniqueValues.Count
                    sampleValues = @($_.sampleValues)
                }
            }
    )
}

function Read-GraphicParamStats {
    param([string]$RootPath)

    $files = @(Get-ChildItem -LiteralPath $RootPath -Recurse -Filter "graphic_param.csv" -File)
    $map = @{}

    foreach ($file in $files) {
        $fileKeySet = @{}
        foreach ($line in Get-Content -LiteralPath $file.FullName) {
            if ([string]::IsNullOrWhiteSpace($line)) {
                continue
            }
            $parts = $line -split ",", 2
            if ($parts.Count -ne 2) {
                continue
            }
            Add-FieldValue -Map $map -Key $parts[0].Trim() -Value $parts[1] -FileKeySet $fileKeySet
        }
    }

    $fields = Convert-StatsMap -Map $map -FileCount $files.Count
    [pscustomobject]@{
        fileCount = $files.Count
        commonKeys = @($fields | Where-Object { $_.inEveryFile } | Select-Object -ExpandProperty key)
        fields = $fields
    }
}

function Read-PlacementStats {
    param([string]$RootPath)

    $files = @(Get-ChildItem -LiteralPath $RootPath -Recurse -Filter "placement.csv" -File)
    $map = @{}
    $typeSet = New-Object 'System.Collections.Generic.HashSet[string]'
    $rowCount = 0

    foreach ($file in $files) {
        $fileKeySet = @{}
        foreach ($line in Get-Content -LiteralPath $file.FullName) {
            if ([string]::IsNullOrWhiteSpace($line)) {
                continue
            }
            $rowCount += 1
            $parts = $line -split ","
            for ($i = 0; $i -lt $parts.Count; $i += 2) {
                $key = $parts[$i].Trim()
                $value = if ($i + 1 -lt $parts.Count) { $parts[$i + 1] } else { "" }
                if ($key -eq "VDK_TYPE") {
                    [void]$typeSet.Add($value.Trim())
                }
                Add-FieldValue -Map $map -Key $key -Value $value -FileKeySet $fileKeySet
            }
        }
    }

    $fields = Convert-StatsMap -Map $map -FileCount $files.Count
    [pscustomobject]@{
        fileCount = $files.Count
        rowCount = $rowCount
        vdkTypes = @($typeSet | Sort-Object)
        commonKeys = @($fields | Where-Object { $_.inEveryFile } | Select-Object -ExpandProperty key)
        fields = $fields
    }
}

if ([string]::IsNullOrWhiteSpace($Root)) {
    throw "Root is required. Pass -Root with the extracted stage folder path."
}

if (-not (Test-Path -LiteralPath $Root -PathType Container)) {
    throw "Stage root does not exist: $Root"
}

$result = [pscustomobject]@{
    root = $Root
    generatedAt = (Get-Date).ToString("o")
    graphicParam = Read-GraphicParamStats -RootPath $Root
    placement = Read-PlacementStats -RootPath $Root
}

$outputPath = Resolve-Path -LiteralPath "." | ForEach-Object {
    Join-Path $_.Path $Output
}
$outputDir = Split-Path -Parent $outputPath
if (-not (Test-Path -LiteralPath $outputDir -PathType Container)) {
    New-Item -ItemType Directory -Path $outputDir | Out-Null
}

$result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $outputPath -Encoding UTF8
Write-Output $outputPath
