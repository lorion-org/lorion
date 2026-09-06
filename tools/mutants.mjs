#!/usr/bin/env node
// Test effectiveness for one source file at a time.
//
// A green suite says a test ran, not that it would notice a defect. A mutation run
// changes the production code and asks whether any test objects. What survives is a
// test-quality finding: the line is executed and nothing asserts what it does.
//
// Two properties of the toolchain shape this runner. The Vitest runner cannot find
// the tests related to a mutated file, because a spec here imports its subject
// through the package entry rather than the file, so the tests are named instead.
// And naming more than one spec file per run yields the result of one of them, with
// the rest reported as uncovered: a run therefore measures one source file against
// one spec, and that pairing is what this tool decides.
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const reportPath = join(repoRoot, 'node_modules/.cache/stryker/mutation.json');

const argv = process.argv.slice(2);
const namedTests = argv.includes('--tests') ? argv[argv.indexOf('--tests') + 1] : undefined;
const targets = argv.filter((entry, index) => {
  if (entry.startsWith('--')) return false;
  return argv[index - 1] !== '--tests';
});

if (targets.length === 0) {
  console.error('Usage: pnpm mutants <source.ts> [more.ts ...] [--tests <spec.ts>]');
  process.exit(2);
}

// The spec that covers a source file: the colocated one where it exists, otherwise
// the package's own entry spec. The second is a wider net and measures only what that
// spec happens to drive, so the run says which one it used.
function specFor(target) {
  if (namedTests) return { path: namedTests, colocated: true };

  const colocated = `${target.slice(0, -'.ts'.length)}.spec.ts`;
  if (existsSync(join(repoRoot, colocated))) return { path: colocated, colocated: true };

  const packageDir = target.slice(0, target.indexOf('/src/') + '/src'.length);
  const entry = `${packageDir}/index.spec.ts`;
  if (existsSync(join(repoRoot, entry))) return { path: entry, colocated: false };

  return undefined;
}

function summarize() {
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  const findings = [];
  let killed = 0;
  let errored = 0;

  for (const [file, entry] of Object.entries(report.files)) {
    const lines = entry.source.split('\n');
    for (const mutant of entry.mutants) {
      if (mutant.status === 'Killed' || mutant.status === 'Timeout') killed += 1;
      if (mutant.status === 'RuntimeError' || mutant.status === 'CompileError') errored += 1;
      if (mutant.status !== 'Survived' && mutant.status !== 'NoCoverage') continue;
      findings.push({
        file: relative(repoRoot, file),
        line: mutant.location.start.line,
        status: mutant.status === 'NoCoverage' ? 'uncovered' : 'survived',
        mutator: mutant.mutatorName,
        source: (lines[mutant.location.start.line - 1] ?? '').trim(),
      });
    }
  }

  return { findings, killed, errored };
}

let failed = false;
for (const target of targets) {
  const spec = specFor(target);
  if (!spec) {
    console.log(`\n${target}\n  no spec found for this file. Name one with --tests.`);
    continue;
  }

  console.log(
    `\n${target}\n  measured against ${spec.path}${spec.colocated ? '' : ' (entry spec: this run measures only what it drives)'}`,
  );
  rmSync(reportPath, { force: true });
  mkdirSync(dirname(reportPath), { recursive: true });

  const run = spawnSync(
    'npx',
    ['stryker', 'run', 'stryker.config.mjs', '--mutate', target, '--logLevel', 'warn'],
    {
      cwd: repoRoot,
      stdio: ['ignore', 'ignore', 'inherit'],
      env: { ...process.env, LORION_MUTATION_TESTS: spec.path },
    },
  );

  if (!existsSync(reportPath)) {
    console.error('  the run produced no report and did not complete.');
    failed = true;
    continue;
  }

  const { findings, killed, errored } = summarize();
  const survived = findings.filter((finding) => finding.status === 'survived');
  console.log(
    `  ${killed} killed, ${survived.length} survived, ${findings.length - survived.length} uncovered`,
  );
  for (const finding of findings) {
    console.log(
      `  ${finding.status} ${finding.file}:${finding.line} ${finding.mutator}  ${finding.source.slice(0, 90)}`,
    );
  }

  // A survivor is a finding to answer, not a gate. A mutant the runner could neither
  // compile nor execute is different: then the measurement did not happen.
  if (errored > 0 || run.status !== 0) failed = true;
}

process.exit(failed ? 1 : 0);
