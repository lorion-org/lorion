// Reads the declaration files this repository ships, the way a consumer does.
//
// `skipLibCheck: true` is set repository-wide, and it makes TypeScript ignore the
// contents of every `.d.ts` — including the ones emitted here. A shipped declaration
// can therefore be invalid while build, typecheck, lint, publint and attw all pass.
// `tools/dist-consumer` imports every published entry point, and this compiles it
// with `skipLibCheck: false`, which is the only place in the repository that reads
// what is published.
//
// Diagnostics are filtered to files under `packages/*/dist`: third-party
// declarations reached along the way (Nuxt's, whose optional peer types do not
// resolve) are not this repository's contract, and silencing them by path keeps the
// check strict where it matters instead of weakening it everywhere.
import { dirname, join, relative, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const toolsDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(toolsDir, '..');
// Two projects: `moduleResolution: Bundler` reads only the `import` condition, so a
// second, Node16 project is what makes the emitted `.d.cts` files reachable at all.
const projectPaths = [
  join(toolsDir, 'dist-consumer', 'tsconfig.json'),
  join(toolsDir, 'dist-consumer', 'tsconfig.cjs.json'),
];
const distPrefix = join(repoRoot, 'packages') + '/';

const ours = (diagnostic) =>
  Boolean(diagnostic.file) &&
  (diagnostic.file.fileName.startsWith(distPrefix.replace(/\\/g, '/')) ||
    diagnostic.file.fileName.startsWith(distPrefix)) &&
  diagnostic.file.fileName.includes('/dist/');

const failures = [];
const seen = new Set();
const read = new Set();

for (const projectPath of projectPaths) {
  const configFile = ts.readConfigFile(projectPath, ts.sys.readFile);
  if (configFile.error) {
    console.error(ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n'));
    process.exit(1);
  }

  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    dirname(projectPath),
    undefined,
    projectPath,
  );
  const program = ts.createProgram(parsed.fileNames, parsed.options);

  for (const diagnostic of ts.getPreEmitDiagnostics(program).filter(ours)) {
    // Both projects read the same `.d.ts`, so a diagnostic in one is reported twice.
    const key = `${diagnostic.file.fileName}:${diagnostic.start}:${diagnostic.code}`;
    if (seen.has(key)) continue;
    seen.add(key);
    failures.push(diagnostic);
  }
  for (const file of program.getSourceFiles()) {
    if (file.fileName.includes('/packages/') && file.fileName.includes('/dist/')) {
      read.add(file.fileName);
    }
  }
}

if (failures.length) {
  console.error(`Invalid published declarations (${failures.length}):`);
  for (const diagnostic of failures) {
    const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(
      diagnostic.start ?? 0,
    );
    console.error(
      `  ${relative(repoRoot, diagnostic.file.fileName)}(${line + 1},${character + 1}): TS${diagnostic.code}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`,
    );
  }
  process.exit(1);
}

console.log(`Read ${read.size} published declaration files.`);
