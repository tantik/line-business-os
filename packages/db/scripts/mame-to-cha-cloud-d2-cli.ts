#!/usr/bin/env node
import { runMameToChaCloudD2FromEnv } from './mame-to-cha-cloud-d2.js';

function parse(argv: readonly string[]): Record<string, string> {
  const result: Record<string, string> = {};
  const names: Record<string, string> = {
    '--gate': 'gate',
    '--project-ref': 'projectRef',
    '--target-environment': 'targetEnvironment',
    '--confirm': 'confirm',
  };
  for (let i = 0; i < argv.length; i += 2) {
    const key = names[argv[i] ?? ''];
    const value = argv[i + 1];
    if (!key) throw new Error('Unknown D2 argument.');
    if (!value || value.startsWith('--')) throw new Error('A D2 argument value is missing.');
    if (result[key]) throw new Error('A D2 argument was provided more than once.');
    result[key] = value;
  }
  return result;
}

export async function runCloudD2Cli(argv: readonly string[]): Promise<number> {
  try {
    const result = await runMameToChaCloudD2FromEnv({ ...parse(argv), mode: 'execute' });
    console.log(JSON.stringify({
      gate: result.gate,
      tenantSlug: result.tenantSlug,
      module: result.module,
      action: result.action,
      committed: result.committed,
      noop: result.noop,
      changedOperationCount: result.changedOperationCount,
      auditRowCount: result.auditRowCount,
      target: result.target,
    }));
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Cloud D2 execution failed.');
    return 1;
  }
}

if (process.argv[1]?.replaceAll('\\', '/').endsWith('/mame-to-cha-cloud-d2-cli.ts')) {
  process.exitCode = await runCloudD2Cli(process.argv.slice(2));
}
