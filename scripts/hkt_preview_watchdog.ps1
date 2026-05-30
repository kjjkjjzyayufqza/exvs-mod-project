param(
    [Parameter(Mandatory = $true)]
    [string]$HktPath,

    [string]$PreviewTool = "C:\Program Files\Havok\HavokContentTools\PreviewTool.exe",

    [int]$TimeoutSeconds = 20,

    [int]$StableSeconds = 5
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $PreviewTool)) {
    throw "PreviewTool not found: $PreviewTool"
}

if (-not (Test-Path -LiteralPath $HktPath)) {
    throw "HKT not found: $HktPath"
}

Add-Type @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public static class WindowProbe {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool IsHungAppWindow(IntPtr hWnd);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    public static string Probe(uint pid) {
        var rows = new List<string>();
        EnumWindows((hWnd, lParam) => {
            uint windowPid;
            GetWindowThreadProcessId(hWnd, out windowPid);
            if (windowPid == pid && IsWindowVisible(hWnd)) {
                var title = new StringBuilder(512);
                GetWindowText(hWnd, title, title.Capacity);
                rows.Add(((long)hWnd).ToString() + "|" + IsHungAppWindow(hWnd).ToString() + "|" + title.ToString());
            }
            return true;
        }, IntPtr.Zero);
        return String.Join("\n", rows);
    }
}
"@

$startTime = Get-Date
$process = Start-Process -FilePath $PreviewTool -ArgumentList @($HktPath) -PassThru
$hadWindow = $false
$hadReadyWindow = $false
$hungObserved = $false
$lastWindow = ""
$stableStarted = $null
$result = "timeout"

try {
    while (((Get-Date) - $startTime).TotalSeconds -lt $TimeoutSeconds) {
        Start-Sleep -Milliseconds 500

        $process.Refresh()
        if ($process.HasExited) {
            $result = "exited"
            break
        }

        $probe = [WindowProbe]::Probe([uint32]$process.Id)
        if ($probe.Length -gt 0) {
            $hadWindow = $true
            $lastWindow = $probe
            $isHung = $probe -match '\|True\|'
            $hasReadyWindow = $probe -match '\|False\|Havok Preview Tool'
            if ($hasReadyWindow) {
                $hadReadyWindow = $true
            }
            if ($isHung -or -not $hasReadyWindow) {
                $hungObserved = $true
                $stableStarted = $null
            } else {
                if ($null -eq $stableStarted) {
                    $stableStarted = Get-Date
                }
                if (((Get-Date) - $stableStarted).TotalSeconds -ge $StableSeconds) {
                    $result = "responsive"
                    break
                }
            }
        }
    }
}
finally {
    try {
        $process.Refresh()
        if (-not $process.HasExited) {
            Stop-Process -Id $process.Id -Force
            Wait-Process -Id $process.Id -Timeout 5 -ErrorAction SilentlyContinue
        }
    } catch {
    }
}

[pscustomobject]@{
    hkt = (Resolve-Path -LiteralPath $HktPath).Path
    result = $result
    hadWindow = $hadWindow
    hadReadyWindow = $hadReadyWindow
    hungObserved = $hungObserved
    timeoutSeconds = $TimeoutSeconds
    stableSeconds = $StableSeconds
    lastWindow = $lastWindow
} | ConvertTo-Json -Depth 4

if ($result -ne "responsive") {
    exit 2
}
