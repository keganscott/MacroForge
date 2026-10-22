# Build MacroForge and replace the one installed copy in place.
#
# There is exactly one install: %LOCALAPPDATA%\Programs\MacroForge\MacroForge.exe.
# The desktop shortcut and Start with Windows both point at it, so after this
# runs, the desktop icon opens the newest build. Nothing is copied anywhere else.
#
#   powershell -ExecutionPolicy Bypass -File scripts\update.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$built = Join-Path $env:LOCALAPPDATA "MacroForge-build\target\release\macroforge.exe"
$dir = Join-Path $env:LOCALAPPDATA "Programs\MacroForge"
$exe = Join-Path $dir "MacroForge.exe"

Push-Location $root
try {
    npx tauri build --no-bundle
    if ($LASTEXITCODE -ne 0) { throw "Build failed; the installed copy was left as it was." }
} finally {
    Pop-Location
}

# Stop the running copy, swap the file, start it again in the tray.
Get-Process macroforge -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 800
New-Item -ItemType Directory -Force $dir | Out-Null
Copy-Item $built $exe -Force
Start-Process $exe -ArgumentList "--minimized"

# Keep the desktop shortcut on the one install.
$lnk = Join-Path ([Environment]::GetFolderPath("Desktop")) "MacroForge.lnk"
$sh = New-Object -ComObject WScript.Shell
$s = $sh.CreateShortcut($lnk)
if ($s.TargetPath -ne $exe) {
    $s.TargetPath = $exe
    $s.WorkingDirectory = $dir
    $ico = Join-Path $dir "MacroForge.ico"
    if (Test-Path $ico) { $s.IconLocation = $ico }
    $s.Save()
}

"Updated {0} ({1:yyyy-MM-dd HH:mm})" -f $exe, (Get-Item $exe).LastWriteTime
