param(
  [ValidateSet('all', 'api', 'mobile', 'reseed')]
  [string]$Mode = 'all'
)

$ErrorActionPreference = 'Stop'
$RepoDir = Split-Path -Parent $PSScriptRoot
$EnvFile = Join-Path $RepoDir '.env'
$ApiUrl = 'http://localhost:8787'
$WebUrl = 'http://localhost:8081'

function Get-EnvValue([string]$Name) {
  if (-not (Test-Path -LiteralPath $EnvFile)) { return $null }
  $line = Get-Content -LiteralPath $EnvFile |
    Where-Object { $_ -match "^\s*$([regex]::Escape($Name))\s*=" } |
    Select-Object -Last 1
  if ($null -eq $line) { return $null }
  return (($line -split '=', 2)[1]).Trim().Trim('"').Trim("'")
}

function Assert-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "$Name is not installed or is not available in PATH."
  }
}

function Assert-GroqConfiguration {
  if (-not (Test-Path -LiteralPath $EnvFile)) {
    throw "Missing $EnvFile. Create it from .env.example and add the server-only Groq key."
  }
  if ((Get-EnvValue 'CHIVAGO_GROQ') -ne 'on') {
    throw 'CHIVAGO_GROQ must be set to on in .env.'
  }
  if ([string]::IsNullOrWhiteSpace((Get-EnvValue 'GROQ_API_KEY'))) {
    throw 'GROQ_API_KEY is missing from .env.'
  }
  if ((Get-EnvValue 'GROQ_MODEL') -ne 'openai/gpt-oss-120b') {
    throw 'GROQ_MODEL must be openai/gpt-oss-120b in .env.'
  }
  Write-Host '[OK] Groq server configuration found (the key was not printed).' -ForegroundColor Green
}

function Stop-ChivaGoProcesses([ValidateSet('api', 'mobile')][string]$Kind) {
  $repoPattern = [regex]::Escape($RepoDir)
  $patterns = if ($Kind -eq 'api') {
    @(
      'src[\\/]server-node\.ts',
      '@chivago[\\/]api',
      'pnpm(?:\.js)?[^\r\n]*\sapi(?:\s|$)',
      "$repoPattern[^\r\n]*(?:pnpm\s+api|@chivago[\\/]api|server-node\.ts)"
    )
  } else {
    @(
      '@chivago[\\/]mobile',
      'apps[\\/]mobile[^\r\n]*expo',
      'pnpm(?:\.js)?[^\r\n]*\smobile(?:\s|$)',
      "$repoPattern[^\r\n]*(?:pnpm\s+mobile|apps[\\/]mobile[^\r\n]*expo)"
    )
  }

  $matches = Get-CimInstance Win32_Process | Where-Object {
    $command = $_.CommandLine
    $command -and ($patterns | Where-Object { $command -match $_ } | Select-Object -First 1)
  }

  if ($matches) {
    Write-Host "Stopping old ChivaGo $Kind process(es)..." -ForegroundColor Yellow
    foreach ($process in $matches) {
      Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Milliseconds 700
  }
}

function Assert-PortFree([int]$Port) {
  $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if ($listener) {
    $owner = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)" -ErrorAction SilentlyContinue
    $description = if ($owner) { $owner.CommandLine } else { "PID $($listener.OwningProcess)" }
    throw "Port $Port is still in use by another process: $description"
  }
}

function Wait-Http([string]$Url, [int]$Seconds = 45) {
  $deadline = (Get-Date).AddSeconds($Seconds)
  do {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 2
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) { return }
    } catch {
      Start-Sleep -Milliseconds 500
    }
  } while ((Get-Date) -lt $deadline)
  throw "Timed out waiting for $Url"
}

function Start-Api {
  Assert-GroqConfiguration
  Stop-ChivaGoProcesses 'api'
  Assert-PortFree 8787
  Write-Host 'Starting ChivaGo API with .env on port 8787...'
  $command = "title ChivaGo API - 8787 && cd /d `"$RepoDir`" && pnpm --filter @chivago/api start"
  Start-Process -FilePath 'cmd.exe' -ArgumentList '/k', $command -WorkingDirectory $RepoDir
  Wait-Http "$ApiUrl/health"
  Write-Host "[OK] API is ready at $ApiUrl" -ForegroundColor Green
}

function Start-Mobile {
  Stop-ChivaGoProcesses 'mobile'
  Assert-PortFree 8081
  Write-Host 'Starting ChivaGo Web through Expo on port 8081...'
  $command = "title ChivaGo Web - 8081 && cd /d `"$RepoDir`" && pnpm --dir apps/mobile exec expo start --web --port 8081"
  Start-Process -FilePath 'cmd.exe' -ArgumentList '/k', $command -WorkingDirectory $RepoDir
  Wait-Http $WebUrl 60
  Start-Process $WebUrl
  Write-Host "[OK] Web app is ready at $WebUrl" -ForegroundColor Green
}

Set-Location $RepoDir
Assert-Command 'node'
Assert-Command 'pnpm'

switch ($Mode) {
  'api' { Start-Api }
  'mobile' { Start-Mobile }
  'reseed' {
    Write-Host 'Re-seeding the ChivaGo database...'
    & pnpm seed
    if ($LASTEXITCODE -ne 0) { throw "Seed failed with exit code $LASTEXITCODE." }
  }
  'all' {
    Start-Api
    Start-Mobile
  }
}

