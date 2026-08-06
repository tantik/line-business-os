[CmdletBinding()]
param(
    [ValidateSet('Merge', 'FounderDecision', 'StageTransition', 'ReleaseGate', 'Research', 'Documentation')]
    [string]$Kind,
    [string]$Event,
    [string]$Evidence,
    [string]$NextTask,
    [switch]$Check,
    [switch]$SkipFetch
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Invoke-Git {
    param([Parameter(Mandatory)][string[]]$Arguments)

    $result = & git @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "git $($Arguments -join ' ') failed:`n$($result -join [Environment]::NewLine)"
    }
    return ($result -join "`n").Trim()
}

function Read-RequiredValue {
    param(
        [Parameter(Mandatory)][string]$CurrentValue,
        [Parameter(Mandatory)][string]$Prompt
    )

    if (-not [string]::IsNullOrWhiteSpace($CurrentValue)) {
        return $CurrentValue.Trim()
    }

    $answer = Read-Host $Prompt
    if ([string]::IsNullOrWhiteSpace($answer)) {
        throw "$Prompt is required."
    }
    return $answer.Trim()
}

function Write-Utf8NoBom {
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][string]$Content
    )

    $encoding = [System.Text.UTF8Encoding]::new($false)
    [System.IO.File]::WriteAllText($Path, $Content, $encoding)
}

function Replace-MarkedBlock {
    param(
        [Parameter(Mandatory)][string]$Content,
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][string]$Body
    )

    $start = "<!-- AUTO:${Name}:START -->"
    $end = "<!-- AUTO:${Name}:END -->"
    $pattern = [regex]::Escape($start) + '.*?' + [regex]::Escape($end)
    if (-not [regex]::IsMatch($Content, $pattern, [System.Text.RegularExpressions.RegexOptions]::Singleline)) {
        throw "Missing automation markers for $Name."
    }
    $replacement = "$start`n$Body`n$end"
    return [regex]::Replace(
        $Content,
        $pattern,
        [System.Text.RegularExpressions.MatchEvaluator]{ param($match) $replacement },
        [System.Text.RegularExpressions.RegexOptions]::Singleline
    )
}

function Escape-MarkdownTableCell {
    param([Parameter(Mandatory)][string]$Value)
    return ($Value -replace '\|', '\|' -replace "`r?`n", ' ').Trim()
}

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repoRoot

if (-not (Test-Path -LiteralPath (Join-Path $repoRoot '.git'))) {
    throw "Not a Git repository: $repoRoot"
}

$statePath = Join-Path $repoRoot 'docs/project/01_PROJECT_STATE.md'
$nextPath = Join-Path $repoRoot 'docs/project/06_NEXT_TASK.md'
$changelogPath = Join-Path $repoRoot 'docs/project/07_CHANGELOG.md'
$handoffPath = Join-Path $repoRoot 'docs/project/CURRENT_HANDOFF.md'
$requiredPaths = @($statePath, $nextPath, $changelogPath)
foreach ($path in $requiredPaths) {
    if (-not (Test-Path -LiteralPath $path)) {
        throw "Required Project State file is missing: $path"
    }
}

if (-not $SkipFetch) {
    try {
        Invoke-Git -Arguments @('fetch', 'origin') | Out-Null
    }
    catch {
        throw "Cannot refresh origin. Re-run online, or use -SkipFetch only if stale remote evidence is explicitly acceptable. $($_.Exception.Message)"
    }
}

$branch = Invoke-Git -Arguments @('branch', '--show-current')
$head = Invoke-Git -Arguments @('rev-parse', 'HEAD')
$originDev = Invoke-Git -Arguments @('rev-parse', 'origin/dev')
$originDevSubject = Invoke-Git -Arguments @('log', '-1', '--pretty=%s', 'origin/dev')
$statusText = Invoke-Git -Arguments @('status', '--short')
$statusLines = @(($statusText -split "`n") | Where-Object { $_ -ne '' })
$trackedChanges = @($statusLines | Where-Object { $_ -notmatch '^\?\?' })
$untrackedChanges = @($statusLines | Where-Object { $_ -match '^\?\?' })
$date = Get-Date -Format 'yyyy-MM-dd'
$timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss K'

$stateContent = Get-Content -Raw -Encoding UTF8 -LiteralPath $statePath
$nextContent = Get-Content -Raw -Encoding UTF8 -LiteralPath $nextPath
$changelogContent = Get-Content -Raw -Encoding UTF8 -LiteralPath $changelogPath

$validationErrors = @()
if (-not ($stateContent.Contains('<!-- AUTO:REPOSITORY_SNAPSHOT:START -->') -and $stateContent.Contains('<!-- AUTO:REPOSITORY_SNAPSHOT:END -->'))) {
    $validationErrors += 'Repository snapshot markers are missing.'
}
if (-not ($nextContent.Contains('<!-- AUTO:NEXT_TASK:START -->') -and $nextContent.Contains('<!-- AUTO:NEXT_TASK:END -->'))) {
    $validationErrors += 'Next-task markers are missing.'
}
if ($changelogContent -notmatch '<!-- AUTO:CHANGELOG:APPEND -->') {
    $validationErrors += 'Changelog append marker is missing.'
}

if ($Check) {
    if ($validationErrors.Count -gt 0) {
        throw ($validationErrors -join "`n")
    }
    Write-Output 'Project handoff automation: PASS'
    Write-Output "Branch: $branch"
    Write-Output "HEAD: $head"
    Write-Output "origin/dev: $originDev"
    Write-Output "Tracked working-tree changes: $($trackedChanges.Count)"
    Write-Output "Untracked paths: $($untrackedChanges.Count)"
    exit 0
}

if ([string]::IsNullOrWhiteSpace($Kind)) {
    $Kind = Read-RequiredValue -CurrentValue '' -Prompt 'Event kind (Merge, FounderDecision, StageTransition, ReleaseGate, Research, Documentation)'
    $allowedKinds = @('Merge', 'FounderDecision', 'StageTransition', 'ReleaseGate', 'Research', 'Documentation')
    if ($Kind -notin $allowedKinds) {
        throw "Unsupported event kind: $Kind"
    }
}
$Event = Read-RequiredValue -CurrentValue $Event -Prompt 'Significant completed event'
$Evidence = Read-RequiredValue -CurrentValue $Evidence -Prompt 'Evidence (PR/SHA/document/test/report)'
$NextTask = Read-RequiredValue -CurrentValue $NextTask -Prompt 'Exactly one next task'

$trackedSummary = if ($trackedChanges.Count -eq 0) { 'clean' } else { "$($trackedChanges.Count) tracked path(s) changed" }
$untrackedSummary = if ($untrackedChanges.Count -eq 0) { 'none' } else { "$($untrackedChanges.Count) untracked path(s)" }
$snapshot = @"
## Automated repository snapshot

- Generated: $timestamp.
- Checked-out branch: ``$branch``.
- HEAD: ``$head``.
- ``origin/dev``: ``$originDev`` - $originDevSubject.
- Working tree: $trackedSummary; $untrackedSummary.
- Significant event: **$Kind** - $Event.
- Evidence supplied by operator: $Evidence.

Git identifiers above are repository evidence. Event meaning and evidence description are operator-supplied and must still obey the documentation hierarchy.
"@.Trim()

$continuation = @"
## Automated continuation

- Updated: $timestamp.
- Significant event: **$Kind** - $Event.
- Evidence: $Evidence.
- Next task: **$NextTask**

Reverify Git and the linked task-specific sources before implementation. This block never authorizes production, database, security, billing, messaging, or destructive actions.
"@.Trim()

$stateContent = Replace-MarkedBlock -Content $stateContent -Name 'REPOSITORY_SNAPSHOT' -Body $snapshot
$nextContent = Replace-MarkedBlock -Content $nextContent -Name 'NEXT_TASK' -Body $continuation

$eventCell = Escape-MarkdownTableCell -Value "[$Kind] $Event"
$evidenceCell = Escape-MarkdownTableCell -Value $Evidence
$row = "| $date | $eventCell | $evidenceCell |"
if ($changelogContent -notmatch [regex]::Escape($row)) {
    $changelogContent = $changelogContent.Replace('<!-- AUTO:CHANGELOG:APPEND -->', "$row`n<!-- AUTO:CHANGELOG:APPEND -->")
}

$handoff = @"
# ORUWA Business OS - Current Handoff

Generated: **$timestamp**

Status: **Operational continuation artifact; repository evidence takes priority**

## Repository snapshot

- Repository: ``tantik/line-business-os`` at ``D:\Dev\line-business-os``.
- Branch: ``$branch``.
- HEAD: ``$head``.
- ``origin/dev``: ``$originDev`` - $originDevSubject.
- Working tree: $trackedSummary; $untrackedSummary.

## Last significant event

- Kind: **$Kind**
- Event: $Event
- Evidence: $Evidence

## Exactly one next task

**$NextTask**

## Required recovery order

1. Read ``AGENTS.md`` and ``docs/ai/oaes-project-profile.md``.
2. Read ``docs/project/01_PROJECT_STATE.md`` and ``docs/project/06_NEXT_TASK.md``.
3. Run a fresh Git preflight; do not treat this generated file as proof of later state.
4. Follow the normative Foundation/ADR/product sources linked by the Project Index.
5. Separate verified facts, operator/Founder statements, hypotheses, and pending evidence.
6. Preserve tenant/location isolation and human approval at high-risk boundaries.

## Paste-ready prompt

~~~text
Continue ORUWA Business OS in D:\Dev\line-business-os.

First read AGENTS.md, docs/ai/oaes-project-profile.md,
docs/project/00_PROJECT_INDEX.md, docs/project/01_PROJECT_STATE.md,
docs/project/06_NEXT_TASK.md, and docs/project/CURRENT_HANDOFF.md.

Then run a read-only Git preflight and reconcile it with the handoff. The last
recorded event is: $Event. Evidence: $Evidence. The one next task is:
$NextTask

Do not reopen Frozen Foundation decisions, invent PASS evidence, stage unrelated
untracked files, or perform high-risk production/DB/security/billing/messaging
actions without the required explicit approval. Report contradictions before
implementation and keep Project State updated after the next significant event.
~~~
"@

Write-Utf8NoBom -Path $statePath -Content $stateContent
Write-Utf8NoBom -Path $nextPath -Content $nextContent
Write-Utf8NoBom -Path $changelogPath -Content $changelogContent
Write-Utf8NoBom -Path $handoffPath -Content $handoff

Write-Output 'Project State and CURRENT_HANDOFF.md updated.'
Write-Output "Branch: $branch"
Write-Output "HEAD: $head"
Write-Output "origin/dev: $originDev"
Write-Output "Next task: $NextTask"
Write-Output 'No files were staged, committed, pushed, or merged.'
