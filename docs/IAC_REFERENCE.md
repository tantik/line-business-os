# IAC Reference

This repository contains the ORUWA Business OS product implementation.

## Repository roles

### IAC strategy and Active Stage

Repository:

`tantik/IAOS`

Local path:

`D:\Dev\IAOS`

Read when relevant:

- `D:\Dev\IAOS\IAC_CONTEXT.md`
- `D:\Dev\IAOS\docs\IAC_MASTER_PLAN.md`
- `D:\Dev\IAOS\docs\IAC_CURRENT_STATUS.md`
- `D:\Dev\IAOS\docs\IAC_DECISIONS_INDEX.md`

IAOS is authoritative for:

- IAC strategy;
- Active Stage;
- product portfolio priorities;
- stage definitions;
- major accepted business decisions.

### Engineering standard

Repository:

`tantik/oaes`

Local path:

`D:\Dev\oaes`

Read when relevant:

- `D:\Dev\oaes\README.md`
- relevant files in `D:\Dev\oaes\engineering\`
- relevant checklists and playbooks in `D:\Dev\oaes\workflow\`

OAES is authoritative for general AI-assisted engineering standards and workflows.

OAES is not an AI-agent platform and is not the IAC AI Workforce.

### Product implementation

This repository is authoritative for:

- application code;
- product architecture;
- database and migrations;
- RLS and tenant isolation;
- permissions;
- security implementation;
- tests;
- CI;
- preview evidence;
- product completion evidence.

Read:

- `README.md`
- `AGENTS.md`
- relevant `.cursor/rules/`
- `docs/architecture/`
- `docs/security/`
- `docs/adr/`
- relevant implementation plans and acceptance reports.

## Source-of-truth precedence

For IAC strategy and Active Stage:

`tantik/IAOS`

For general engineering workflow:

`tantik/oaes`

For ORUWA implementation, repository status, architecture, security, tests, and product evidence:

this repository.

If the sources conflict:

1. Do not guess.
2. Identify the exact conflict.
3. Report it before making changes.
4. Do not proceed when the conflict affects architecture, security, billing, production, permissions, tenant isolation, or product scope.

## Modification boundaries

A task executed in this repository must not modify IAOS or OAES unless the task explicitly authorizes cross-repository changes.

Do not copy full IAOS or OAES documents into this repository.

Reference canonical sources instead.

## Current Active Stage

The current documented Active Stage is:

**Finish Cafe Package v2.0**

Confirm the latest status in:

`D:\Dev\IAOS\docs\IAC_CURRENT_STATUS.md`

Do not rely on this reference file alone for changing status information.