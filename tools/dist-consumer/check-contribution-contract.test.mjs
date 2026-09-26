import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';

test('installed contract resolution accepts filesystem paths with spaces and URL characters', () => {
  const root = resolve(import.meta.dirname, '../..');
  const temp = mkdtempSync(join(tmpdir(), 'lorion contract # '));
  try {
    const consumer = join(temp, 'tools', 'dist-consumer');
    mkdirSync(consumer, { recursive: true });
    symlinkSync(join(root, 'node_modules'), join(temp, 'node_modules'), 'junction');
    symlinkSync(
      join(import.meta.dirname, 'node_modules'),
      join(consumer, 'node_modules'),
      'junction',
    );
    cpSync(join(import.meta.dirname, 'src'), join(consumer, 'src'), { recursive: true });
    const script = join(consumer, 'check-contribution-contract.mjs');
    cpSync(join(import.meta.dirname, 'check-contribution-contract.mjs'), script);
    execFileSync(process.execPath, [script], { stdio: 'pipe' });
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
