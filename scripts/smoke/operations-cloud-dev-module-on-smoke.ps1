#Requires -Version 5.1
<#
.SYNOPSIS
  LAYER 1 of the Step 4 Operations Cloud DEV module-ON smoke.

.DESCRIPTION
  ONE command for the operator. It:
    * reads the operator's existing gitignored Cloud DEV connection string
      (.env.cloud.local -> MAME_TO_CHA_CLOUD_DATABASE_URL by default);
    * removes URI query parameters that native psql/libpq rejects (e.g.
      'uselibpqcompat', a node-postgres option), keeping only a benign libpq
      allowlist, and REFUSES the run if a connection-target parameter
      (host/hostaddr/port/dbname/user/options/service/...) is in the query;
    * verifies the EFFECTIVE target is the Cloud DEV project (user
      'postgres.pehcoenozjtsjdvjietj', '*.pooler.supabase.com' host, pooler
      port) and is NOT Production (ref 'jsgmmsdkuptdsxtcxhsv' anywhere);
    * invokes psql on the LAYER 2 SQL smoke, passing the verified ref as
      "-v wrapper_verified_ref=<ref>" (Supabase exposes no project-ref signal
      to the pooler 'postgres' role, so the SQL cannot re-derive it itself);
    * propagates psql's exit code;
    * never prints the URL or password; passes the password to psql via the
      PGPASSWORD environment variable (cleared on exit), never on argv.
      (Like any process, the password may transiently exist in this process's
      own memory during the run.)

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

# Query parameters that change WHO / WHERE / HOW psql connects. If any of these
# appear in the query string the wrapper REFUSES the run: the connection target
# must be fully specified in the URI authority so LAYER 1's host/user/ref checks
# actually describe what psql will connect to.
$TARGET_OVERRIDE_KEYS = @(
  'host','hostaddr','port','dbname','user','password','passfile','service',
  'options','require_auth','load_balance_hosts','target_session_attrs',
  'replication','krbsrvname','gsslib'
)
# Benign libpq query keywords that are safe to keep as-is.
$SAFE_QUERY_KEYS = @(
  'sslmode','sslnegotiation','sslrootcert','sslcert','sslkey','sslpassword',
  'sslcertmode','sslcrl','sslcrldir','sslsni','ssl_min_protocol_version',
  'ssl_max_protocol_version','sslcompression','requiressl','requirepeer',
  'gssencmode','gssdelegation','channel_binding','application_name',
  'fallback_application_name','connect_timeout','client_encoding',
  'keepalives','keepalives_idle','keepalives_interval','keepalives_count',
  'tcp_user_timeout'
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

  # --- parse with .NET Uri (robust: a '?' inside a %XX-encoded password
  #     does not truncate the base the way a naive split would) -----------
  try { $u = [System.Uri]::new($rawUrl) }
  catch { throw 'connection string is not a valid URI (is a special char in the password unencoded? it must be %XX-encoded)' }

  if ($u.Scheme -notin @('postgres','postgresql')) { throw "scheme is '$($u.Scheme)', not postgres(ql); aborting" }
  if ([string]::IsNullOrEmpty($u.UserInfo)) { throw 'no userinfo in the URI; aborting' }
  if ([string]::IsNullOrEmpty($u.Host))     { throw 'no host in the URI; aborting' }

  $urlUser = [System.Uri]::UnescapeDataString(($u.UserInfo -split ':', 2)[0])   # 'postgres.<ref>'
  $urlPass = if ($u.UserInfo -match ':') { [System.Uri]::UnescapeDataString(($u.UserInfo -split ':', 2)[1]) } else { '' }
  $urlHost = $u.Host
  $urlPort = $u.Port
  $urlDb   = $u.AbsolutePath.Trim('/')

  # --- query string: REFUSE connection-target overrides, keep only the
  #     benign libpq keys, drop everything else (e.g. uselibpqcompat) ------
  $dropped = @()
  $keep    = @()
  foreach ($pair in (($u.Query.TrimStart('?')) -split '&' | Where-Object { $_ -ne '' })) {
    $k = ($pair -split '=', 2)[0]
    if ($TARGET_OVERRIDE_KEYS -contains $k) {
      throw "connection-target query parameter '$k' present; refusing (the target must be in the URI authority, not the query string)"
    } elseif ($SAFE_QUERY_KEYS -contains $k) {
      $keep += $pair
    } else {
      $dropped += $k
    }
  }

  # --- verify the EFFECTIVE target from the parsed components -----------
  if ($urlUser -match $KNOWN_PROD_REF -or $urlHost -match $KNOWN_PROD_REF) { throw 'target names the PRODUCTION project ref; aborting' }
  if ($urlUser -notmatch '^postgres\.([a-z0-9]{16,32})$')                 { throw "userinfo user '$urlUser' is not postgres.<project_ref> (Supabase pooler); aborting" }
  if ($matches[1] -ne $EXPECTED_DEV_REF)                                  { throw "pooler username ref ($($matches[1])) is not the expected Cloud DEV ref; aborting" }
  if ($urlHost -notmatch '\.pooler\.supabase\.com$')                      { throw "host '$urlHost' is not *.pooler.supabase.com (Supabase pooler); aborting" }
  if (@(5432, 6543) -notcontains $urlPort)                                { throw "port $urlPort is not 5432 (session) or 6543 (transaction) pooler; aborting" }
  if ([string]::IsNullOrWhiteSpace($urlDb))                               { throw 'no database name in the URI; aborting' }

  # --- rebuild a password-LESS connection URL from the verified parts --
  $q       = if ($keep.Count) { '?' + ($keep -join '&') } else { '' }
  $connUrl = $u.Scheme + '://' + $urlUser + '@' + $urlHost + ':' + $urlPort + '/' + $urlDb + $q

  Write-Host "wrapper: connection target OK - user postgres.$EXPECTED_DEV_REF, host $urlHost, port $urlPort, db $urlDb; Production ref absent."
  if ($dropped.Count) { Write-Host ('wrapper: dropped non-libpq URI query parameter(s): ' + ($dropped -join ', ')) }

  # --- invoke LAYER 2 (password via PGPASSWORD env, never on argv) ----
  $psql = Resolve-Psql
  $env:PGPASSWORD = $urlPass
  try {
    & $psql $connUrl -v ON_ERROR_STOP=1 -q -v wrapper_verified_ref=$EXPECTED_DEV_REF -f $sqlFile @PsqlArgs
    $code = $LASTEXITCODE
  } finally {
    Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
  }
 }
}
catch {
  Write-Host ('wrapper: FAIL - ' + $_.Exception.Message)
  $code = 2
}
finally {
  Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
  foreach ($v in 'rawUrl','connUrl','urlPass','line','DbUrl','localUrl') {
    Remove-Variable $v -ErrorAction SilentlyContinue
  }
}

exit $code
