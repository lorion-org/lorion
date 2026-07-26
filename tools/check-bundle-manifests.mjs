// Every bundle manifest in this repository is loaded the way a host loads it.
//
// The manifest format is data, so nothing compiles it: a manifest can drift from
// the schema and only fail when some host happens to read it. The examples are the
// reference a reader copies, so they are held to the real loader here — not to a
// second validation written for this check, which could disagree with it.
import { readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { loadBundleManifest } from '@lorion-org/descriptor-discovery';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const skip = new Set(['node_modules', 'dist', '.nuxt', '.output', '.git', '.turbo', 'coverage']);

function manifests(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (skip.has(entry.name)) return [];
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return manifests(path);
    return entry.name === 'bundles.json' ? [path] : [];
  });
}

const files = manifests(repoRoot);
const failures = [];

for (const file of files) {
  try {
    loadBundleManifest({ cwd: dirname(file) });
  } catch (error) {
    failures.push(`${relative(repoRoot, file)}: ${error.message.replace(/\n/g, ' ')}`);
  }
}

if (failures.length) {
  console.error(`Invalid bundle manifests (${failures.length}):`);
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}

console.log(`Checked ${files.length} bundle manifests.`);
