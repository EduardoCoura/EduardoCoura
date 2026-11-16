$ErrorActionPreference = "Stop"

$ProfileRepo = "EduardoCoura/EduardoCoura"

Write-Host "=== Configurando Profile City 100% automatico ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "1) Crie um Personal Access Token (Classic) com escopos: repo, workflow, read:user"
Write-Host "   Link direto: https://github.com/settings/tokens/new?description=EduardoCoura-Profile-City&scopes=repo,workflow,read:user"
Write-Host ""

$secureToken = Read-Host "Cole aqui o seu GitHub PAT (entrada oculta)" -AsSecureString
$bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
$plainToken = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
[System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)

if ([string]::IsNullOrWhiteSpace($plainToken)) {
  throw "Token vazio. Abortado."
}

Write-Host "`n2) Salvando secret PROFILE_TOKEN no repo do perfil e nos repos com notify-profile.yml..." -ForegroundColor Cyan
$plainToken | gh secret set PROFILE_TOKEN -R $ProfileRepo
Write-Host "   -> $ProfileRepo (ok)"

$repos = gh api "user/repos?affiliation=owner&sort=pushed&per_page=20" | ConvertFrom-Json
foreach ($r in $repos) {
  if ($r.full_name -eq $ProfileRepo -or $r.fork) { continue }
  $hasWorkflow = $false
  try {
    gh api "repos/$($r.full_name)/contents/.github/workflows/notify-profile.yml" | Out-Null
    if ($LASTEXITCODE -eq 0) { $hasWorkflow = $true }
  } catch {}
  if ($hasWorkflow) {
    $plainToken | gh secret set PROFILE_TOKEN -R $r.full_name
    Write-Host "   -> $($r.full_name) (ok)"
  }
}

Write-Host "`n3) Verificando login na Cloudflare (Wrangler)..." -ForegroundColor Cyan
$loggedIn = $false
try {
  wrangler whoami | Out-Null
  if ($LASTEXITCODE -eq 0) { $loggedIn = $true }
} catch {}

if (-not $loggedIn) {
  Write-Host "   Abrindo login da Cloudflare no navegador..."
  wrangler login
}

Push-Location $PSScriptRoot
try {
  Write-Host "`n4) Fazendo deploy do Cloudflare Worker e salvando GH_TOKEN..." -ForegroundColor Cyan
  wrangler deploy
  $plainToken | wrangler secret put GH_TOKEN
} finally {
  Pop-Location
}

$plainToken = $null

Write-Host "`n5) Disparando primeira atualizacao imediata do perfil..." -ForegroundColor Cyan
gh workflow run profile.yml -R $ProfileRepo

Write-Host "`nPronto! Tudo configurado (repos atuais + Cloudflare Cron a cada 5 min para todos os repos futuros)." -ForegroundColor Green
