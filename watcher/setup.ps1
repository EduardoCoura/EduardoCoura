$ErrorActionPreference = "Stop"

$ProfileRepo = "EduardoCoura/EduardoCoura"

Write-Host "=== Configurando Profile City 100% automatico ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "1) Crie um Personal Access Token (Classic) com escopos: repo, workflow, read:user"
Write-Host "   Link direto: https://github.com/settings/tokens/new?description=EduardoCoura-Profile-City&scopes=repo,workflow,read:user"
Write-Host ""

$secureToken = Read-Host "Cole aqui o seu GitHub PAT (entrada oculta)" -AsSecureString
$bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
$plainToken = ([System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)).Trim()
[System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)

if ([string]::IsNullOrWhiteSpace($plainToken)) {
  throw "Token vazio. Abortado."
}

Write-Host "`n2) Salvando secret PROFILE_TOKEN no repo do perfil e nos repos com notify-profile.yml..." -ForegroundColor Cyan
gh secret set PROFILE_TOKEN -R $ProfileRepo --body $plainToken
Write-Host "   -> $ProfileRepo (ok)"

$repos = gh api "user/repos?affiliation=owner&sort=pushed&per_page=20" | ConvertFrom-Json
foreach ($r in $repos) {
  if ($r.full_name -eq $ProfileRepo -or $r.fork) { continue }
  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  gh api "repos/$($r.full_name)/contents/.github/workflows/notify-profile.yml" 2>$null | Out-Null
  $hasWorkflow = ($LASTEXITCODE -eq 0)
  $ErrorActionPreference = $prevEap
  if ($hasWorkflow) {
    gh secret set PROFILE_TOKEN -R $r.full_name --body $plainToken
    Write-Host "   -> $($r.full_name) (ok)"
  }
}

Write-Host "`n3) Verificando login na Cloudflare (Wrangler)..." -ForegroundColor Cyan
$prevEap = $ErrorActionPreference
$ErrorActionPreference = "Continue"
wrangler whoami 2>$null | Out-Null
$loggedIn = ($LASTEXITCODE -eq 0)
$ErrorActionPreference = $prevEap

if (-not $loggedIn) {
  Write-Host "   Abrindo login da Cloudflare no navegador..."
  wrangler login
}

Push-Location $PSScriptRoot
$tmpSecrets = [System.IO.Path]::GetTempFileName()
try {
  Write-Host "`n4) Fazendo deploy do Cloudflare Worker e salvando GH_TOKEN..." -ForegroundColor Cyan
  wrangler deploy
  $payload = @{ GH_TOKEN = $plainToken } | ConvertTo-Json -Compress
  [System.IO.File]::WriteAllText($tmpSecrets, $payload, [System.Text.UTF8Encoding]::new($false))
  wrangler secret bulk $tmpSecrets
} finally {
  if (Test-Path $tmpSecrets) { Remove-Item -Force $tmpSecrets }
  Pop-Location
}

$plainToken = $null

Write-Host "`n5) Disparando primeira atualizacao imediata do perfil..." -ForegroundColor Cyan
gh workflow run profile.yml -R $ProfileRepo

Write-Host "`nPronto! Tudo configurado (repos atuais + Cloudflare Cron a cada 5 min para todos os repos futuros)." -ForegroundColor Green
