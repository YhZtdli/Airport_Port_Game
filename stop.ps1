$ErrorActionPreference = 'Stop'
$pidFile = Join-Path $PSScriptRoot 'work\server.pid'
if (-not (Test-Path -LiteralPath $pidFile)) { Write-Host 'No ORBIS process file found.'; exit 0 }
$orbisProcessId = [int](Get-Content -LiteralPath $pidFile -Raw)
$serverScript = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'server.mjs'))
$orbisProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $orbisProcessId"
if ($orbisProcess -and $orbisProcess.Name -eq 'node.exe' -and $orbisProcess.CommandLine.Contains($serverScript)) {
    Stop-Process -Id $orbisProcessId
    Write-Host 'ORBIS stopped. Saved progress stays in data\save.json.'
} elseif ($orbisProcess) {
    throw 'The recorded process is not this ORBIS server; it was left running.'
} else {
    Write-Host 'ORBIS is already stopped.'
}
