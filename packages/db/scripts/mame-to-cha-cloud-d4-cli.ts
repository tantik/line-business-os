#!/usr/bin/env node
import { runMameToChaCloudD4FromEnv } from './mame-to-cha-cloud-d4.js';

interface Args {
  gate?: string;
  projectRef?: string;
  targetEnvironment?: string;
  confirm?: string;
  managerUserId?: string;
  staffUserId?: string;
}

export function parseCloudD4CliArgs(argv: readonly string[]): Args {
  const result: Args = {};
  const names: Record<string, keyof Args> = {
    '--gate': 'gate', '--project-ref': 'projectRef',
    '--target-environment': 'targetEnvironment', '--confirm': 'confirm',
    '--manager-user-id': 'managerUserId', '--staff-user-id': 'staffUserId',
  };
  for (let index = 0; index < argv.length; index += 2) {
    const key = names[argv[index] ?? ''];
    const value = argv[index + 1];
    if (!key) throw new Error('Unknown D4 argument.');
    if (!value || value.startsWith('--')) throw new Error('A D4 argument value is missing.');
    if (result[key]) throw new Error('A D4 argument was provided more than once.');
    result[key] = value;
  }
  return result;
}

export async function runCloudD4Cli(
  argv: readonly string[],
  deps: {
    execute?: typeof runMameToChaCloudD4FromEnv;
    print?: (line: string) => void;
    printError?: (line: string) => void;
  } = {},
): Promise<number> {
  const print = deps.print ?? console.log;
  const printError = deps.printError ?? console.error;
  try {
    const args = parseCloudD4CliArgs(argv);
    if (!args.managerUserId || !args.staffUserId) throw new Error('Both D3 Auth user ids are required for D4.');
    const result = await (deps.execute ?? runMameToChaCloudD4FromEnv)(
      { gate: args.gate, projectRef: args.projectRef, targetEnvironment: args.targetEnvironment, confirm: args.confirm, mode: 'execute' },
      { managerUserId: args.managerUserId, staffUserId: args.staffUserId },
    );
    print(JSON.stringify({
      gate: result.gate, tenantSlug: result.tenantSlug, committed: result.committed,
      noop: result.noop, changedOperationCount: result.changedOperationCount,
      auditRowCount: result.auditRowCount, target: result.target,
    }));
    return 0;
  } catch (error) {
    printError(error instanceof Error ? error.message : 'Cloud D4 execution failed.');
    return 1;
  }
}

if (process.argv[1]?.replaceAll('\\', '/').endsWith('/mame-to-cha-cloud-d4-cli.ts')) {
  process.exitCode = await runCloudD4Cli(process.argv.slice(2));
}
