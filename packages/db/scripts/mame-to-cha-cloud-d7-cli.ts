#!/usr/bin/env node
import { runMameToChaCloudD7FromEnv } from './mame-to-cha-cloud-d7.js';

interface Args {
  gate?: string;
  projectRef?: string;
  targetEnvironment?: string;
  managerUserId?: string;
  staffUserId?: string;
}

export function parseCloudD7CliArgs(argv: readonly string[]): Args {
  const result: Args = {};
  const names: Record<string, keyof Args> = {
    '--gate': 'gate',
    '--project-ref': 'projectRef',
    '--target-environment': 'targetEnvironment',
    '--manager-user-id': 'managerUserId',
    '--staff-user-id': 'staffUserId',
  };
  for (let index = 0; index < argv.length; index += 2) {
    const key = names[argv[index] ?? ''];
    const value = argv[index + 1];
    if (!key) throw new Error('Unknown D7 argument.');
    if (!value || value.startsWith('--')) throw new Error('A D7 argument value is missing.');
    if (result[key]) throw new Error('A D7 argument was provided more than once.');
    result[key] = value;
  }
  return result;
}

export async function runCloudD7Cli(
  argv: readonly string[],
  deps: {
    execute?: typeof runMameToChaCloudD7FromEnv;
    print?: (line: string) => void;
    printError?: (line: string) => void;
  } = {},
): Promise<number> {
  const print = deps.print ?? console.log;
  const printError = deps.printError ?? console.error;
  try {
    const args = parseCloudD7CliArgs(argv);
    if (!args.managerUserId || !args.staffUserId) {
      throw new Error('Both D3 Auth user ids are required for D7 verification.');
    }
    const result = await (deps.execute ?? runMameToChaCloudD7FromEnv)(
      {
        gate: args.gate,
        projectRef: args.projectRef,
        targetEnvironment: args.targetEnvironment,
        mode: 'execute',
      },
      { managerUserId: args.managerUserId, staffUserId: args.staffUserId },
    );
    const checkCounts = result.checks.reduce<Record<string, number>>((counts, check) => {
      counts[check.status] = (counts[check.status] ?? 0) + 1;
      return counts;
    }, {});
    print(JSON.stringify({
      gate: result.gate,
      tenantSlug: result.tenantSlug,
      readOnly: result.readOnly,
      ok: result.ok,
      checkCounts,
      failures: result.failures,
      target: result.target,
    }));
    return result.ok ? 0 : 1;
  } catch (error) {
    printError(error instanceof Error ? error.message : 'Cloud D7 verification failed.');
    return 1;
  }
}

if (process.argv[1]?.replaceAll('\\', '/').endsWith('/mame-to-cha-cloud-d7-cli.ts')) {
  process.exitCode = await runCloudD7Cli(process.argv.slice(2));
}
