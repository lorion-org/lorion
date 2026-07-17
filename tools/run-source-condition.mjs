#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);

if (!args.length) {
  console.error('Usage: node tools/run-source-condition.mjs <command> [...args]');
  process.exitCode = 1;
  process.exit();
}

const [command, ...commandArgs] = args;
const selectionKeyToEnv = new Map([
  ['--capabilities', 'LORION_CAPABILITIES'],
  ['--extensions', 'LORION_EXTENSIONS'],
  ['--features', 'LORION_FEATURES'],
]);

function extractSelectionArgs(args) {
  const env = {};
  const remainingArgs = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const [key, inlineValue] = arg.split(/=(.*)/s, 2);
    const envKey = selectionKeyToEnv.get(key);

    if (!envKey) {
      remainingArgs.push(arg);
      continue;
    }

    const values = [];

    if (inlineValue?.trim()) {
      values.push(inlineValue);
    }

    while (index + 1 < args.length && !args[index + 1].startsWith('--')) {
      values.push(args[index + 1]);
      index += 1;
    }

    env[envKey] = values.join(' ');
  }

  return {
    env,
    remainingArgs,
  };
}

const selectionArgs = extractSelectionArgs(commandArgs);
const isWindows = process.platform === 'win32';

// The `lorion-source` export condition points `@lorion-org/*` at TypeScript
// source. Prefer Bun, which resolves those `.ts` sources and extensionless
// specifiers natively under the condition; this keeps tools whose config loader
// otherwise externalizes and natively imports the source (for example Vite's
// config loading) working without a build step. Fall back to Node with
// `--conditions` when Bun is unavailable.
const hasBun = spawnSync('bun', ['--version'], { stdio: 'ignore', shell: isWindows }).status === 0;

const runner = hasBun
  ? {
      bin: 'bun',
      args: ['--conditions=lorion-source', 'x', command, ...selectionArgs.remainingArgs],
      env: { ...process.env, ...selectionArgs.env },
    }
  : {
      bin: command,
      args: selectionArgs.remainingArgs,
      env: {
        ...process.env,
        ...selectionArgs.env,
        NODE_OPTIONS: [process.env.NODE_OPTIONS, '--conditions=lorion-source']
          .filter(Boolean)
          .join(' '),
      },
    };

const result = spawnSync(runner.bin, runner.args, {
  env: runner.env,
  shell: isWindows,
  stdio: 'inherit',
});

process.exitCode = result.status ?? 1;
