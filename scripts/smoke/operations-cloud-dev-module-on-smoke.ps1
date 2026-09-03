#Requires -Version 5.1
<#
.SYNOPSIS
  LAYER 1 of the Step 4 Operations Cloud DEV module-ON smoke.

.DESCRIPTION
  ONE command for the operator. It:
    * reads the operator's existing gitignored Cloud DEV connection string
      (.env.cloud.local -> MAME_TO_CHA_CLOUD_DATABASE_URL by default);
    * removes URI query parameters that native psql/libpq rejects (e.g.
      'uselibpqcompat', a node-postgres option), keeping only libpq-valid keys;
    * verifies the string is the Cloud DEV project (ref 'pehcoenozjtsjdvjietj'
      present) and is NOT Production (ref 'jsgmmsdkuptdsxtcxhsv' absent), and
      that it has the Supabase Session/Transaction pooler shape;
    * invokes psql on the LAYER 2 SQL smoke, passing the verified ref as
      "-v wrapper_verified_ref=<ref>" (Supabase exposes no project-ref signal
      to the pooler 'postgres' role, so the SQL cannot re-derive it itself);
    * propagates psql's exit code;
    * never prints the URL, password, or any credential; clears them from
      memory on exit.

  The SQL smoke commits NOTHING (one transaction, ROLLBACK at the end).

.PARAMETER DbUrl
  Override the connection string (for testing the transform/validation only).
.PARAMETER EnvFile
  Env file to read (default: .env.cloud.local at the repo root).
.PARAMETER VarName
  Variable name inside EnvFile (default: MAME_TO_CHA_CLOUD_DATABASE_URL).
.PARAMETER AllowLocal
  Run the LOCAL MIRROR instead: connect to local Supabase, pass
  "-v allow_local=1", and SKIP the Cloud DEV / Production ref checks.
.PARAMETER PsqlArgs
  Extra args appended to the psql invocation (e.g. -v smoke_location=<uuid>).

.EXAMPLE
  powershell -NoProfile -File scripts/smoke/operations-cloud-dev-module-on-smoke.ps1
#>
[CmdletBinding()]
param(
  [string]   $DbUrl,
  [string]   $EnvFile   = '.env.cloud.local',
  [string]   $VarName   = 'MAME_TO_CHA_CLOUD_DATABASE_URL',
  [switch]   $AllowLocal,
  [string[]] $PsqlArgs  = @()
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$code = 1   # default: failure unless psql sets it

# Public, non-secret identifiers (verbatim from docs/project/master-state.md).
$EXPECTED_DEV_REF = 'pehcoenozjtsjdvjietj'
$KNOWN_PROD_REF   = 'jsgmmsdkuptdsxtcxhsv'

# libpq-accepted URI query keywords (PostgreSQL docs 34.1.2). Anything else is
# dropped from the query string before psql sees it.
$LIBPQ_QUERY_KEYS = @(
  'host','hostaddr','port','dbname','user','password','passfile','require_auth',
  'channel_binding','connect_timeout','client_encoding','options',
  'application_name','fallback_application_name','keepalives','keepalives_idle',
  'keepalives_interval','keepalives_count','tcp_user_timeout','replication',
  'gssencmode','sslmode','requiressl','sslnegotiation','sslcompression',
  'sslcert','sslkey','sslpassword','sslcertmode','sslrootcert','sslcrl',
  'sslcrldir','sslsni','requirepeer','ssl_min_protocol_version',
  'ssl_max_protocol_version','krbsrvname','gsslib','gssdelegation','service',
  'target_session_attrs','load_balance_hosts'
)

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$sqlFile  = Join-Path $PSScriptRoot 'operations-cloud-dev-module-on-smoke.sql'
if (-not (Test-Path -LiteralPath $sqlFile)) { throw "SQL smoke not found: $sqlFile" }

function Resolve-Psql {
  $c = Get-Command psql -ErrorAction SilentlyContinue
  if ($c) { return $c.Source }
  foreach ($p in @(
      "$env:LOCALAPPDATA\Programs\postgresql-17\pgsql\bin\psql.exe",
      "$env:ProgramFiles\PostgreSQL\17\bin\psql.exe",
      "$env:ProgramFiles\PostgreSQL\16\bin\psql.exe")) {
    if (Test-Path -LiteralPath $p) { return $p }
  }
  throw 'psql not found on PATH or in a standard PostgreSQL install location.'
}

try {
 if ($AllowLocal) {
  # --- LOCAL MIRROR path ----------------------------------------------
  $localUrl = if ($DbUrl) { $DbUrl } else { 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' }
  Write-Host 'wrapper: LOCAL MIRROR run (-AllowLocal); Cloud DEV / Production ref checks skipped.'
  $psql = Resolve-Psql
  & $psql $localUrl -v ON_ERROR_STOP=1 -q -v allow_local=1 -f $sqlFile @PsqlArgs
  $code = $LASTEXITCODE
 } else {
  # --- Load the stored Cloud DEV connection string --------------------
  if ($DbUrl) {
    $rawUrl = $DbUrl.Trim()
  } else {
    $envPath = if ([System.IO.Path]::IsPathRooted($EnvFile)) { $EnvFile } else { Join-Path $repoRoot $EnvFile }
    if (-not (Test-Path -LiteralPath $envPath)) { throw "env file not found: $EnvFile" }
    $prefix = '^\s*(export\s+)?' + [regex]::Escape($VarName) + '\s*='
    $line = Get-Content -LiteralPath $envPath | Where-Object { $_ -match $prefix } | Select-Object -First 1
    if (-not $line) { throw "$VarName not found in $EnvFile" }
    $rawUrl = ($line -replace ($prefix + '\s*'), '').Trim().Trim('"').Trim("'")
  }
  if ([string]::IsNullOrWhiteSpace($rawUrl)) { throw "$VarName is empty" }

  # --- libpq compatibility: strip non-libpq query parameters ---------
  $cleanUrl = $rawUrl
  $dropped  = @()
  if ($rawUrl -match '^([^?]+)\?(.*)$') {
    $base  = $matches[1]
    $pairs = $matches[2] -split '&' | Where-Object { $_ -ne '' }
    $keep  = @()
    foreach ($pair in $pairs) {
      $k = ($pair -split '=', 2)[0]
      if ($LIBPQ_QUERY_KEYS -contains $k) { $keep += $pair } else { $dropped += $k }
    }
    $cleanUrl = if ($keep.Count) { $base + '?' + ($keep -join '&') } else { $base }
  }

  # --- verify: Cloud DEV, not Production, pooler shape --------------
  if ($cleanUrl -match $KNOWN_PROD_REF) { throw 'connection string contains the PRODUCTION project ref; aborting' }
  if ($cleanUrl -notmatch $EXPECTED_DEV_REF) { throw "connection string does not contain the expected Cloud DEV ref $EXPECTED_DEV_REF; aborting" }
  if ($cleanUrl -notmatch '^postgres(ql)?://') { throw 'not a postgres URI; aborting' }
  if ($cleanUrl -notmatch ('://postgres\.([a-z0-9]' + '{16,32}):')) { throw 'userinfo is not postgres.<project_ref> (Supabase pooler); aborting' }
  $urlRef = $matches[1]
  if ($urlRef -ne $EXPECTED_DEV_REF) { throw "pooler username ref ($urlRef) is not the expected Cloud DEV ref; aborting" }
  if ($cleanUrl -notmatch 'pooler\.supabase\.com') { throw 'host is not *.pooler.supabase.com (Supabase pooler); aborting' }
  if ($cleanUrl -notmatch ':(5432|6543)/[A-Za-z0-9_-]+') { throw 'no session/transaction pooler port + database name in the URI; aborting' }

  Write-Host "wrapper: connection string OK - Cloud DEV ref $EXPECTED_DEV_REF present, Production ref absent, Supabase pooler structure verified."
  if ($dropped.Count) { Write-Host ('wrapper: dropped non-libpq URI query parameter(s): ' + ($dropped -join ', ')) }

  # --- invoke LAYER 2 -----------------------------------------------
  $psql = Resolve-Psql
  & $psql $cleanUrl -v ON_ERROR_STOP=1 -q -v wrapper_verified_ref=$EXPECTED_DEV_REF -f $sqlFile @PsqlArgs
  $code = $LASTEXITCODE
 }
}
catch {
  Write-Host ('wrapper: FAIL - ' + $_.Exception.Message)
  $code = 2
}
finally {
  foreach ($v in 'rawUrl','cleanUrl','base','line','DbUrl','localUrl') {
    Remove-Variable $v -ErrorAction SilentlyContinue
  }
  [System.GC]::Collect()
}

exit $code
