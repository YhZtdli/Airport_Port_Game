@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$nodeCmd = Get-Command node -ErrorAction SilentlyContinue; if ($nodeCmd) { & $nodeCmd.Source scripts/bootstrap.mjs } else { & (Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe') scripts/bootstrap.mjs }"
pause
