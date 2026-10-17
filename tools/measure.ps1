# Measure what MacroForge costs the PC: every process it owns (the app plus
# its WebView2 helpers), their memory, and CPU used over a sample window.
#
#   powershell -ExecutionPolicy Bypass -File tools\measure.ps1 [-Seconds 20]
param([int]$Seconds = 20)

function Get-MacroForgeProcs {
    $app = Get-CimInstance Win32_Process -Filter "Name='macroforge.exe'"
    if (-not $app) { return @() }
    $all = Get-CimInstance Win32_Process
    $ids = New-Object System.Collections.Generic.HashSet[int]
    foreach ($a in $app) { [void]$ids.Add([int]$a.ProcessId) }
    # Children, grandchildren... (WebView2 hangs off the app process).
    do {
        $added = $false
        foreach ($p in $all) {
            if ($ids.Contains([int]$p.ParentProcessId) -and -not $ids.Contains([int]$p.ProcessId)) {
                [void]$ids.Add([int]$p.ProcessId); $added = $true
            }
        }
    } while ($added)
    $all | Where-Object { $ids.Contains([int]$_.ProcessId) }
}

$procs = Get-MacroForgeProcs
if (-not $procs) { Write-Output "MacroForge is not running"; exit 1 }
# CPU from WMI's kernel + user time (100 ns units): readable even when the
# app runs as administrator and this shell does not.
function Cpu-Ms($p) { ([double]$p.KernelModeTime + [double]$p.UserModeTime) / 10000 }
$before = @{}
foreach ($p in $procs) { $before[$p.ProcessId] = Cpu-Ms $p }
Start-Sleep -Seconds $Seconds
$rows = foreach ($p in (Get-MacroForgeProcs)) {
    $gp = Get-Process -Id $p.ProcessId -ErrorAction SilentlyContinue
    if (-not $gp) { continue }
    $kind = if ($p.Name -eq 'macroforge.exe') { 'app' } elseif ($p.CommandLine -match '--type=renderer') { 'renderer' } elseif ($p.CommandLine -match '--type=gpu-process') { 'gpu' } elseif ($p.CommandLine -match '--type=utility') { 'utility' } elseif ($p.CommandLine -match '--type=crashpad') { 'crashpad' } else { 'browser' }
    $cpu = if ($before.ContainsKey($p.ProcessId)) { (Cpu-Ms $p) - $before[$p.ProcessId] } else { 0 }
    [pscustomobject]@{
        Kind = $kind; PID = $p.ProcessId
        PrivateMB = [math]::Round($gp.PrivateMemorySize64 / 1MB, 1)
        WorkingMB = [math]::Round($gp.WorkingSet64 / 1MB, 1)
        Threads = $gp.Threads.Count
        CpuMs = [math]::Round($cpu, 0)
    }
}
$rows | Sort-Object Kind | Format-Table -AutoSize | Out-String -Width 200
$sum = ($rows | Measure-Object PrivateMB -Sum).Sum
$ws = ($rows | Measure-Object WorkingMB -Sum).Sum
$cpu = ($rows | Measure-Object CpuMs -Sum).Sum
"TOTAL processes=$($rows.Count) private=$([math]::Round($sum,1)) MB working=$([math]::Round($ws,1)) MB cpu=$cpu ms over $Seconds s ($([math]::Round($cpu / ($Seconds * 10), 3)) % of one core)"
