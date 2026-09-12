// Reads the declaration files this repository ships, the way a consumer does.
//
// `skipLibCheck: true` is set repository-wide, and it makes TypeScript ignore the
// contents of every `.d.ts` — including the ones emitted here. A shipped declaration
// can therefore be invalid while build, typecheck, lint, publint and attw all pass.
// `tools/dist-consumer` imports every published entry point, and this compiles it
// with `skipLibCheck: false` to validate what is published.
//
// Diagnostics include consumer files and `packages/*/dist`: third-party
// declarations reached along the way (Nuxt's, whose optional peer types do not
// resolve) are not this repository's contract, and silencing them by path keeps the
// check strict where it matters instead of weakening it everywhere.
import console from 'node:console';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

export function checkDeclarations(repoRoot) {
  const consumerFolder = join(repoRoot, 'tools', 'dist-consumer');
  // Read both import and require branches using the existing consumer projects.
  const projectPaths = [
    join(consumerFolder, 'tsconfig.json'),
    join(consumerFolder, 'tsconfig.cjs.json'),
  ];
  const distPrefix = join(repoRoot, 'packages').replaceAll('\\', '/') + '/';
  const consumerPrefix = consumerFolder.replaceAll('\\', '/') + '/';
  const ours = (diagnostic) => {
    if (!diagnostic.file) return true;
    const path = diagnostic.file.fileName.replaceAll('\\', '/');
    return (
      path.startsWith(consumerPrefix) || (path.startsWith(distPrefix) && path.includes('/dist/'))
    );
  };

  const failures = [];
  const seen = new Set();
  const read = new Set();

  for (const projectPath of projectPaths) {
    const configFile = ts.readConfigFile(projectPath, ts.sys.readFile);
    if (configFile.error) {
      throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n'));
    }

    const parsed = ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      dirname(projectPath),
      undefined,
      projectPath,
    );
    const program = ts.createProgram({
      rootNames: parsed.fileNames,
      options: parsed.options,
      configFileParsingDiagnostics: parsed.errors,
    });

    for (const diagnostic of ts.getPreEmitDiagnostics(program).filter(ours)) {
      // Both projects read the same `.d.ts`, so a diagnostic in one is reported twice.
      const key = `${diagnostic.file?.fileName}:${diagnostic.start}:${diagnostic.code}`;
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
    throw new Error(
      ts.formatDiagnosticsWithColorAndContext(failures, {
        getCanonicalFileName: (fileName) => fileName,
        getCurrentDirectory: () => repoRoot,
        getNewLine: () => '\n',
      }),
    );
  }
  return read.size;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    console.log(
      `Read ${checkDeclarations(root)} published declaration files and checked consumer contracts.`,
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
