import console from 'node:console';
import { mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CompilerState, Extractor, ExtractorConfig } from '@microsoft/api-extractor';

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

function readPackages(root) {
  return readdirSync(join(root, 'packages'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .map((entry) => {
      const folder = join(root, 'packages', entry.name);
      return { folder, slug: entry.name, manifest: readJson(join(folder, 'package.json')) };
    })
    .filter((entry) => !entry.manifest.private);
}

function declarationTargets(pkg) {
  const targets = [];
  const visit = (value, conditions, covered = false) => {
    if (value === null) return;
    if (typeof value === 'string') {
      if (!conditions.includes('types')) {
        if (!covered) {
          throw new Error(
            `${pkg.manifest.name} ${conditions.join(' / ')}: no published declaration target; add an explicit types condition`,
          );
        }
        return;
      }
      if (
        !value.startsWith('./dist/') ||
        value.split('/').includes('..') ||
        !/\.d\.[cm]?ts$/.test(value)
      ) {
        throw new Error(
          `${pkg.manifest.name} ${conditions.join(' / ')}: expected a dist declaration, got ${value}`,
        );
      }
      const [entry, ...branches] = conditions;
      const name = entry === '.' ? 'index' : `subpath-${encodeURIComponent(entry.slice(2))}`;
      targets.push({
        reportName: `${pkg.slug}.${name}.${branches.join('.')}.api.md`,
        path: resolve(pkg.folder, value),
      });
      return;
    }
    if (Array.isArray(value) || typeof value !== 'object') {
      throw new Error(
        `${pkg.manifest.name}: unsupported exports entry at ${conditions.join(' / ')}`,
      );
    }
    const branches = Object.keys(value).filter((condition) => condition !== 'lorion-source');
    if (branches.includes('types') && branches[0] !== 'types') {
      throw new Error(`${pkg.manifest.name}: types must precede runtime export conditions`);
    }
    for (const [condition, target] of Object.entries(value)) {
      if (condition === 'lorion-source') continue;
      if (!['types', 'import', 'require', 'default'].includes(condition)) {
        throw new Error(`${pkg.manifest.name}: unsupported export condition ${condition}`);
      }
      visit(target, [...conditions, condition], covered || typeof value.types === 'string');
    }
  };
  const exports = pkg.manifest.exports;
  if (!exports || typeof exports !== 'object' || Array.isArray(exports)) {
    throw new Error(`${pkg.manifest.name}: expected an exports map`);
  }
  for (const [entry, value] of Object.entries(exports)) {
    if ((entry !== '.' && !entry.startsWith('./')) || entry.includes('*')) {
      throw new Error(`${pkg.manifest.name}: unsupported export ${entry}`);
    }
    const before = targets.length;
    visit(value, [entry]);
    if (value !== null && targets.length === before) {
      throw new Error(`${pkg.manifest.name} ${entry}: no published declaration target`);
    }
  }
  return targets;
}

export function runApiReports(root, write = false) {
  const entries = readPackages(root).flatMap((pkg) =>
    declarationTargets(pkg).map((target) => ({ pkg, ...target })),
  );
  if (entries.length === 0) throw new Error('No published declaration targets found');
  const reportNames = new Set(entries.map((entry) => entry.reportName));
  const folder = join(root, 'api');
  const stale = readdirSync(root).includes('api')
    ? readdirSync(folder).filter((name) => name.endsWith('.api.md') && !reportNames.has(name))
    : [];
  if (!write && stale.length) {
    throw new Error(`Obsolete API reports: ${stale.join(', ')}. Run pnpm api.`);
  }
  const configPath = join(root, 'api-extractor.json');
  const configs = entries.map((entry) => {
    const config = ExtractorConfig.loadFile(configPath);
    config.projectFolder = entry.pkg.folder;
    config.mainEntryPointFilePath = entry.path;
    config.compiler.overrideTsconfig.files = entries.map((target) => target.path);
    config.apiReport.reportFileName = entry.reportName;
    return ExtractorConfig.prepare({
      configObject: config,
      configObjectFullPath: configPath,
      packageJsonFullPath: join(entry.pkg.folder, 'package.json'),
    });
  });
  const compilerState = CompilerState.create(configs[0]);
  if (write) mkdirSync(folder, { recursive: true });
  for (const config of configs) {
    const messages = [];
    const result = Extractor.invoke(config, {
      compilerState,
      localBuild: write,
      messageCallback(message) {
        // Match the declaration gate: third-party diagnostics do not describe our API.
        if (
          message.category === 'Compiler' &&
          message.sourceFilePath &&
          !message.sourceFilePath
            .replaceAll('\\', '/')
            .startsWith(join(root, 'packages').replaceAll('\\', '/') + '/')
        ) {
          message.logLevel = 'none';
        }
        if (message.logLevel === 'error' || message.logLevel === 'warning') {
          messages.push(message.formatMessageWithLocation(root));
        }
        message.handled = true;
      },
    });
    if (!result.succeeded) {
      throw new Error(
        `API check failed for ${config.reportConfigs[0].fileName}:\n${messages.join('\n')}`,
      );
    }
  }
  if (write) for (const name of stale) rmSync(join(folder, name));
  return entries.length;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const mode = process.argv.slice(2);
    if (mode.length !== 1 || !['--write', '--check'].includes(mode[0])) {
      throw new Error('Usage: node tools/api-reports.mjs --write|--check');
    }
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const count = runApiReports(root, mode[0] === '--write');
    console.log(`${mode[0] === '--write' ? 'Updated' : 'Checked'} ${count} API Extractor reports.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
