#!/usr/bin/env node
import { runMameToChaCloudD3FromEnv } from './mame-to-cha-cloud-d3.js';

export interface CloudD3CliArgs {
  gate?: string;
  projectRef?: string;
  targetEnvironment?: string;
  confirm?: string;
}

export function parseCloudD3CliArgs(argv: readonly string[]): CloudD3CliArgs {
  const result: CloudD3CliArgs = {};
  const names: Record<string, keyof CloudD3CliArgs> = {
    '--gate': 'gate',
    '--project-ref': 'projectRef',
    '--target-environment': 'targetEnvironment',
    '--confirm': 'confirm',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index] ?? '';
    const key = names[flag];
    const value = argv[index + 1];
    if (key === undefined) throw new Error('Unknown D3 argument.');
    if (value === undefined || value.startsWith('--')) throw new Error('A D3 argument value is missing.');
    if (result[key] !== undefined) throw new Error('A D3 argument was provided more than once.');
    result[key] = value;
    index += 1;
  }
  return result;
}

export interface CloudD3CliDeps {
  execute?: typeof runMameToChaCloudD3FromEnv;
  print?: (line: string) => void;
  printError?: (line: string) => void;
}

export async function runCloudD3Cli(argv: readonly string[], deps: CloudD3CliDeps = {}): Promise<number> {
  const print = deps.print ?? console.log;
  const printError = deps.printError ?? console.error;
  try {
    const result = await (deps.execute ?? runMameToChaCloudD3FromEnv)({
      ...parseCloudD3CliArgs(argv),
      mode: 'execute',
    });
    print(JSON.stringify(result));
    return 0;
  } catch (error) {
    printError(error instanceof Error ? error.message : 'Cloud D3 execution failed.');
    return 1;
  }
}

if (process.argv[1]?.replaceAll('\\', '/').endsWith('/mame-to-cha-cloud-d3-cli.ts')) {
  process.exitCode = await runCloudD3Cli(process.argv.slice(2));
}
