$a = [System.IO.File]::ReadAllBytes('E:\XB\解包\com\test\test_metadata.bin')
$b = [System.IO.File]::ReadAllBytes('E:\XB\解包\com\test\0x16F73C97_metadata.bin')
Write-Host "test_metadata.bin size: $($a.Length)"
Write-Host "0x16F73C97_metadata.bin size: $($b.Length)"
if ($a.Length -ne $b.Length) {
    Write-Host "SIZE DIFFERS by $($a.Length - $b.Length) bytes"
    $minLen = [Math]::Min($a.Length, $b.Length)
} else {
    $minLen = $a.Length
}
$diffs = @()
for ($i = 0; $i -lt $minLen; $i++) {
    if ($a[$i] -ne $b[$i]) { $diffs += $i }
}
if ($diffs.Count -eq 0 -and $a.Length -eq $b.Length) {
    Write-Host "IDENTICAL"
} else {
    Write-Host "DIFFERS at $($diffs.Count) byte positions (within shared range)"
    $show = [Math]::Min(80, $diffs.Count)
    for ($j = 0; $j -lt $show; $j++) {
        $off = $diffs[$j]
        Write-Host ("  offset 0x{0:X4}: test=0x{1:X2} origin=0x{2:X2}" -f $off, $a[$off], $b[$off])
    }
}
