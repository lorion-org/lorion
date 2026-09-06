#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import process from 'node:process';

// LORION packages carry no application vocabulary: a name from a product that
// consumes them, in a public API, a comment, a fixture or an example, makes the
// libraries read as that product's internals and follows every consumer that copies
// the example. The principle is stated in CONTRIBUTING ("avoid application-specific
// naming in public APIs"); this is where it is checked.
//
// The list holds the names of consuming products and organisations. It is not a
// style list: an ordinary English word that a product also uses stays allowed, and a
// name is added here when a product starts consuming these packages.
const FORBIDDEN = ['civitas', 'sentinel', 'orcrist'];

const ROOTS = ['packages', 'examples', 'tools', 'docs'];
const SKIP_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  'coverage',
  '.turbo',
  '.git',
  '.nuxt',
  '.output',
]);
// The list itself is the one place these names are allowed to stand.
const SKIP_FILES = new Set(['pnpm-lock.yaml', 'check-vocabulary.mjs']);
const TEXT_FILE = /\.(ts|tsx|mts|cts|js|mjs|cjs|jsx|json|md|vue|yml|yaml|css|html)$/;

const repositoryRoot = resolve(import.meta.dirname, '..');
const pattern = new RegExp(`\\b(${FORBIDDEN.join('|')})\\b`, 'gi');

function* walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.storybook') continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name)) continue;
      yield* walk(path);
      continue;
    }
    if (SKIP_FILES.has(entry.name) || !TEXT_FILE.test(entry.name)) continue;
    yield path;
  }
}

const findings = [];
for (const root of ROOTS) {
  const directory = resolve(repositoryRoot, root);
  try {
    if (!statSync(directory).isDirectory()) continue;
  } catch {
    continue;
  }

  for (const path of walk(directory)) {
    const lines = readFileSync(path, 'utf8').split('\n');
    lines.forEach((line, index) => {
      for (const match of line.matchAll(pattern)) {
        findings.push({
          path: relative(repositoryRoot, path),
          line: index + 1,
          word: match[0],
          text: line.trim(),
        });
      }
    });
  }
}

if (findings.length) {
  console.error(`Application vocabulary found in ${findings.length} place(s):`);
  for (const finding of findings) {
    console.error(`  ${finding.path}:${finding.line}  "${finding.word}"  ${finding.text}`);
  }
  console.error(
    '\nName the thing in the terms these packages own, or use the neutral example vocabulary (@acme, @demo).',
  );
  process.exit(1);
}

console.log(`No application vocabulary in ${ROOTS.join(', ')}.`);
