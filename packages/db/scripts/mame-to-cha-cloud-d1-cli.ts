#!/usr/bin/env node
import { runMameToChaCloudD1FromEnv } from './mame-to-cha-cloud-d1.js';

export interface CloudD1CliArgs {
  gate?: string;
  projectRef?: string;
  targetEnvironment?: string;
  confirm?: string;
}

export function parseCloudD1CliArgs(argv: readonly string[]): CloudD1CliArgs {
  const result: CloudD1CliArgs = {};
  const names: Record<string, keyof CloudD1CliArgs> = {
    '--gate': 'gate',
    '--project-ref': 'projectRef',
    '--target-environment': 'targetEnvironment',
    '--confirm': 'confirm',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index] ?? '';
    const key = names[flag];
    const value = argv[index + 1];
    if (key === undefined) throw new Error('Unknown D1 argument.');
    if (value === undefined || value.startsWith('--')) throw new Error('A D1 argument value is missing.');
    if (result[key] !== undefined) throw new Error('A D1 argument was provided more than once.');
    result[key] = value;
    index += 1;
  }
  return result;
}

export interface CloudD1CliDeps {
  execute?: typeof runMameToChaCloudD1FromEnv;
  print?: (line: string) => void;
  printError?: (line: string) => void;
}

export async function runCloudD1Cli(argv: readonly string[], deps: CloudD1CliDeps = {}): Promise<number> {
  const print = deps.print ?? console.log;
  const printError = deps.printError ?? console.error;
  try {
    const args = parseCloudD1CliArgs(argv);
    const result = await (deps.execute ?? runMameToChaCloudD1FromEnv)({
      ...args,
      mode: 'execute',
    });
    print(JSON.stringify({
      gate: result.gate,
      tenantSlug: result.tenantSlug,
      committed: result.committed,
      noop: result.noop,
      changedOperationCount: result.changedOperationCount,
      auditRowCount: result.auditRowCount,
      target: result.target,
    }));
    return 0;
  } catch (error) {
    printError(error instanceof Error ? error.message : 'Cloud D1 execution failed.');
    return 1;
  }
}

function isMain(): boolean {
  return process.argv[1]?.replaceAll('\\', '/').endsWith('/mame-to-cha-cloud-d1-cli.ts') === true;
}

if (isMain()) {
  process.exitCode = await runCloudD1Cli(process.argv.slice(2));
}
