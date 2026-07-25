#!/usr/bin/env node
import { runMameToChaCloudD5FromEnv } from './mame-to-cha-cloud-d5.js';

interface Args {
  gate?: string;
  projectRef?: string;
  targetEnvironment?: string;
  confirm?: string;
  staffUserId?: string;
}

export function parseCloudD5CliArgs(argv: readonly string[]): Args {
  const result: Args = {};
  const names: Record<string, keyof Args> = {
    '--gate': 'gate',
    '--project-ref': 'projectRef',
    '--target-environment': 'targetEnvironment',
    '--confirm': 'confirm',
    '--staff-user-id': 'staffUserId',
  };
  for (let index = 0; index < argv.length; index += 2) {
    const key = names[argv[index] ?? ''];
    const value = argv[index + 1];
    if (!key) throw new Error('Unknown D5 argument.');
    if (!value || value.startsWith('--')) throw new Error('A D5 argument value is missing.');
    if (result[key]) throw new Error('A D5 argument was provided more than once.');
    result[key] = value;
  }
  return result;
}

export async function runCloudD5Cli(
  argv: readonly string[],
  deps: {
    execute?: typeof runMameToChaCloudD5FromEnv;
    print?: (line: string) => void;
    printError?: (line: string) => void;
  } = {},
): Promise<number> {
  const print = deps.print ?? console.log;
  const printError = deps.printError ?? console.error;
  try {
    const args = parseCloudD5CliArgs(argv);
    if (!args.staffUserId) throw new Error('The D3 staff Auth user id is required for D5.');
    const result = await (deps.execute ?? runMameToChaCloudD5FromEnv)(
      {
        gate: args.gate,
        projectRef: args.projectRef,
        targetEnvironment: args.targetEnvironment,
        confirm: args.confirm,
        mode: 'execute',
      },
      args.staffUserId,
    );
    print(JSON.stringify({
      gate: result.gate,
      tenantSlug: result.tenantSlug,
      committed: result.committed,
      noop: result.noop,
      action: result.action,
      changedOperationCount: result.changedOperationCount,
      auditRowCount: result.auditRowCount,
      target: result.target,
    }));
    return 0;
  } catch (error) {
    printError(error instanceof Error ? error.message : 'Cloud D5 execution failed.');
    return 1;
  }
}

if (process.argv[1]?.replaceAll('\\', '/').endsWith('/mame-to-cha-cloud-d5-cli.ts')) {
  process.exitCode = await runCloudD5Cli(process.argv.slice(2));
}
