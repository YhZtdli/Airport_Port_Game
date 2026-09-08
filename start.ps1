param([int]$Port = 8787, [switch]$Offline, [switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$nodeExecutable = if ($nodeCommand) { $nodeCommand.Source } else { Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' }
if (-not (Test-Path -LiteralPath $nodeExecutable)) { throw 'Node.js 22 or newer is required. Install Node.js, then run start.cmd again.' }
$nodeVersion = & $nodeExecutable --version
if ([int]($nodeVersion.TrimStart('v').Split('.')[0]) -lt 22) { throw 'Node.js 22 or newer is required.' }
$gameUrl = "http://127.0.0.1:$Port"
try {
    $health = Invoke-RestMethod -Uri "$gameUrl/api/health" -TimeoutSec 2
    if ($health.name -eq 'ORBIS') {
        Write-Host "ORBIS is already running: $gameUrl"
        if (-not $NoBrowser) { Start-Process $gameUrl }
        exit 0
    }
} catch {}
$workDirectory = Join-Path $projectRoot 'work'
New-Item -ItemType Directory -Path $workDirectory -Force | Out-Null
$serverScript = Join-Path $projectRoot 'server.mjs'
$serverArguments = '"' + $serverScript + '"'
if ($Offline) { $serverArguments += ' --offline' }
$env:PORT = "$Port"
$serverProcess = Start-Process -FilePath $nodeExecutable -ArgumentList $serverArguments -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $workDirectory 'server.log') -RedirectStandardError (Join-Path $workDirectory 'server-error.log') -PassThru
Set-Content -LiteralPath (Join-Path $workDirectory 'server.pid') -Value $serverProcess.Id
$ready = $false
for ($attempt=0; $attempt -lt 25; $attempt++) {
    Start-Sleep -Milliseconds 300
    try { $health = Invoke-RestMethod -Uri "$gameUrl/api/health" -TimeoutSec 1; if ($health.name -eq 'ORBIS') { $ready = $true; break } } catch {}
    if ($serverProcess.HasExited) { break }
}
if (-not $ready) { throw "ORBIS could not start. Check work\server-error.log or choose a different port." }
Write-Host "ORBIS is running: $gameUrl"
Write-Host "Project: $projectRoot"
Write-Host 'Use stop.cmd to stop the local server.'
if (-not $NoBrowser) { Start-Process $gameUrl }
