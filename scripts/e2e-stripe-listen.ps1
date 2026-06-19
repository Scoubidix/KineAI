# Lance `stripe listen` pour les tests e2e en lisant STRIPE_SECRET_KEY depuis backend/.env.
# Évite de recopier la clé à la main. Force le CLI sur le bon compte + le mode test
# (via --api-key) pour que les webhooks atteignent bien le backend local.
#
# Usage (depuis la racine du repo) :
#   powershell -ExecutionPolicy Bypass -File scripts\e2e-stripe-listen.ps1
# ou, si l'execution policy l'autorise :
#   .\scripts\e2e-stripe-listen.ps1

$ErrorActionPreference = 'Stop'

$envPath = Join-Path $PSScriptRoot '..\backend\.env'
if (-not (Test-Path $envPath)) {
    Write-Error "backend/.env introuvable ($envPath)"
    exit 1
}

# Récupère la 1re ligne STRIPE_SECRET_KEY=... et extrait la valeur (sans guillemets ni espaces).
$line = Select-String -Path $envPath -Pattern '^\s*STRIPE_SECRET_KEY\s*=' | Select-Object -First 1
if (-not $line) {
    Write-Error "STRIPE_SECRET_KEY absent de backend/.env"
    exit 1
}
$key = ($line.Line -replace '^\s*STRIPE_SECRET_KEY\s*=', '').Trim().Trim('"').Trim("'")

if ($key -notmatch '^sk_test_') {
    Write-Warning "La clé ne commence pas par sk_test_ (valeur: $($key.Substring(0,[Math]::Min(8,$key.Length)))...). Les tests e2e doivent utiliser une clé de TEST."
}

Write-Host "stripe listen --api-key <STRIPE_SECRET_KEY de backend/.env> --forward-to localhost:3000/webhook/stripe" -ForegroundColor Cyan
Write-Host "(Laisse ce terminal ouvert pendant les tests. Au 1er lancement, copie le whsec_ affiché dans STRIPE_ENDPOINT_SECRET de backend/.env puis redemarre le backend.)" -ForegroundColor DarkGray

stripe listen --api-key $key --forward-to localhost:3000/webhook/stripe
