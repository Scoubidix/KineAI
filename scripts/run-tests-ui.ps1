# Démarre l'UI de tests (serveur Node) et ouvre le navigateur.
# Usage (depuis la racine du repo) :
#   powershell -ExecutionPolicy Bypass -File scripts\run-tests-ui.ps1

$ErrorActionPreference = 'Stop'
$server = Join-Path $PSScriptRoot 'test-runner\server.js'
$url = 'http://localhost:4500'

if (-not (Test-Path $server)) {
    Write-Error "server.js introuvable ($server)"
    exit 1
}

Write-Host "Demarrage de l'UI de tests sur $url ..." -ForegroundColor Cyan

# Ouvre le navigateur apres un court delai (laisse le serveur demarrer), sans bloquer.
Start-Job -ScriptBlock { Start-Sleep -Seconds 2; Start-Process $using:url } | Out-Null

# Lance le serveur au premier plan (Ctrl+C pour arreter l'UI).
node $server
