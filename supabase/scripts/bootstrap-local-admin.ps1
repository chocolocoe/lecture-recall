$ErrorActionPreference = 'Stop'

if (-not (Test-Path '.env.local')) {
  throw 'Run this script from the repository root after creating .env.local.'
}

$envLines = Get-Content '.env.local'
$urlLine = $envLines | Where-Object { $_ -match '^VITE_SUPABASE_URL=' } | Select-Object -First 1
$keyLine = $envLines | Where-Object { $_ -match '^VITE_SUPABASE_PUBLISHABLE_KEY=' } | Select-Object -First 1
if (-not $keyLine) {
  $keyLine = $envLines | Where-Object { $_ -match '^VITE_SUPABASE_ANON_KEY=' } | Select-Object -First 1
}

if (-not $urlLine -or -not $keyLine) {
  throw '.env.local must define VITE_SUPABASE_URL and a publishable or anon key.'
}

$supabaseUrl = ($urlLine -split '=', 2)[1].Trim().Trim('"')
$publicKey = ($keyLine -split '=', 2)[1].Trim().Trim('"')
$uri = [System.Uri]::new($supabaseUrl)
if ($uri.Scheme -ne 'http' -or $uri.Host -notin @('localhost', '127.0.0.1')) {
  throw 'The local bootstrap script only accepts localhost Supabase URLs.'
}

$result = Invoke-RestMethod -Uri "$($supabaseUrl.TrimEnd('/'))/functions/v1/bootstrap-local-admin" `
  -Method Post `
  -Headers @{ apikey = $publicKey; Authorization = "Bearer $publicKey" } `
  -ContentType 'application/json' `
  -Body '{}'

Write-Output $result.message
if (-not $result.alreadyExists) {
  Write-Output 'Local development sign-in: username admin, password admin. Change this password immediately in Settings.'
}
