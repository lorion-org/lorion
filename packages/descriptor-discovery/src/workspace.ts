import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { expandPathPattern, patternPrefix } from './paths';

// The package set of a workspace: which packages exist, where each one lies, what it
// is called, and which of them carries a descriptor. A capability lives on disk as a
// package (its descriptor beside its manifest), so the manifest side of that pair is
// read here, next to the descriptor side, instead of in every host that needs it.
//
// A host reaches its descriptors through `descriptorPaths`, its packages through
// `packageSources`, and no host maps a package name to a directory a second time.

const MANIFEST_FILE_NAME = 'package.json';
// The name the composition layer gives a descriptor file. `discoverDescriptors`
// takes it as an option like this one does.
const DESCRIPTOR_FILE_NAME = 'capability.json';

export interface PackageSource {
  // The package name from its manifest.
  name: string;
  // The directory the manifest lies in.
  root: string;
  manifestPath: string;
  manifest: Record<string, unknown>;
  // The descriptor beside the manifest, when the package carries one.
  descriptorPath?: string;
  // The id that descriptor declares.
  descriptorId?: string;
}

export interface PackageSourceSnapshot {
  workspaceRoot: string;
  packageSources: readonly PackageSource[];
  // The descriptor files of the snapshot, relative to `workspaceRoot`, in the shape
  // `discoverDescriptors({ cwd, descriptorPaths })` takes. A descriptor in a second
  // root is reached the same way, through a path that leaves the workspace root.
  descriptorPaths: readonly string[];
}

// A second package set joined into the snapshot: another checkout whose packages take
// part in the same composition. Its patterns come from its own manifest unless the
// caller names them.
export interface AdditionalPackageRoot {
  root: string;
  patterns?: readonly string[];
}

export interface PackageSourcesInput {
  // Where to start looking for the workspace root: a path or a file URL such as
  // `import.meta.url`. Ignored when `root` is given.
  from?: string;
  // The workspace root, when the caller already knows it.
  root?: string;
  // The patterns that name the package directories. Defaults to the workspace
  // patterns the root manifest declares.
  patterns?: readonly string[];
  // Further roots joined into this snapshot. The primary root wins a package name
  // collision, because the workspace being asked decides what a name means.
  additionalRoots?: readonly (string | AdditionalPackageRoot)[];
  descriptorFileName?: string;
  // Reuse across calls. Neither the layout nor the manifests change within a run, so a
  // host that resolves the snapshot in several places passes one map and reads one
  // snapshot. The key covers every input that shapes the result, so two different
  // questions about the same root get two answers. Omitted means no reuse: a caller
  // that writes packages between calls, a test above all, sees what it wrote.
  cache?: Map<string, PackageSourceSnapshot>;
}

function readJsonObject(path: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${path}: expected a JSON object.`);
  }
  return parsed as Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Both spellings a workspace manifest uses: the bare pattern array, and the object
// form whose `packages` carries the patterns while sibling keys carry other workspace
// data. Reading only one of them makes half the workspaces in the wild look empty.
export function readWorkspacePatterns(manifest: Record<string, unknown>): string[] {
  const workspaces = manifest.workspaces;
  const patterns = Array.isArray(workspaces)
    ? workspaces
    : isRecord(workspaces) && Array.isArray(workspaces.packages)
      ? workspaces.packages
      : [];
  return patterns.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
}

// The directory the upward walk starts from: `from` is a path or a file URL such as
// `import.meta.url`. A file resolves to its containing directory, a directory is used
// as it is, and a path that does not exist is read as a file.
function toDirectory(from: string): string {
  const path = from.startsWith('file:') ? fileURLToPath(from) : from;
  try {
    if (statSync(path).isDirectory()) return path;
  } catch {
    // Nothing at that path: fall back to its parent.
  }
  return dirname(path);
}

// The nearest directory at or above `from` whose manifest declares workspace
// patterns. That declaration is what makes a directory a package set: a manifest
// without it belongs to a single package, however many directories lie below it.
export function findWorkspaceRoot(from: string): string {
  let current = resolve(toDirectory(from));

  for (;;) {
    const manifestPath = resolve(current, MANIFEST_FILE_NAME);
    if (existsSync(manifestPath) && readWorkspacePatterns(readJsonObject(manifestPath)).length) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      throw new Error(
        `No workspace root found from "${from}": no manifest at or above it declares workspace patterns.`,
      );
    }
    current = parent;
  }
}

// A pattern whose literal prefix leaves its root names another checkout. A missing
// one would otherwise resolve to a composition without those packages and fail much
// later with an unrelated message, so its directory has to exist. A prefix inside the
// root stays unchecked: it may describe a location the workspace has not filled yet.
function assertReachablePattern(root: string, manifestPath: string, pattern: string): void {
  const prefix = patternPrefix(pattern);
  if (!prefix) return;

  const directory = resolve(root, prefix);
  const inside = relative(root, directory);
  if (!inside.startsWith('..') && !isAbsolute(inside)) return;
  if (existsSync(directory)) return;

  throw new Error(
    `${manifestPath}: workspace pattern "${pattern}" names the checkout "${directory}", which does not exist.`,
  );
}

function readDescriptorId(descriptorPath: string): string | undefined {
  const id = readJsonObject(descriptorPath).id;
  if (id === undefined) return undefined;
  if (typeof id !== 'string' || id.length === 0) {
    throw new Error(`${descriptorPath}: "id" must be a non-empty string.`);
  }
  return id;
}

function discoverRoot(input: {
  root: string;
  patterns?: readonly string[];
  descriptorFileName: string;
}): PackageSource[] {
  const manifestPath = resolve(input.root, MANIFEST_FILE_NAME);
  const patterns =
    input.patterns ??
    (existsSync(manifestPath) ? readWorkspacePatterns(readJsonObject(manifestPath)) : []);

  if (!patterns.length) {
    throw new Error(
      `"${input.root}" declares no workspace patterns. Name them in its manifest, or pass them as \`patterns\`.`,
    );
  }
  for (const pattern of patterns) assertReachablePattern(input.root, manifestPath, pattern);

  const manifestPaths = [
    ...new Set(
      patterns.flatMap((pattern) =>
        expandPathPattern(input.root, `${pattern}/${MANIFEST_FILE_NAME}`),
      ),
    ),
  ].sort();

  // A descriptor whose manifest is missing matches no package and would simply not be
  // in the snapshot: the composition would be smaller than the workspace reads, and
  // nothing would say so. It is reported here, where the file that was meant to take
  // part can still be named.
  const found = new Set(manifestPaths.map((path) => dirname(path)));
  for (const pattern of patterns) {
    for (const descriptorPath of expandPathPattern(
      input.root,
      `${pattern}/${input.descriptorFileName}`,
    )) {
      if (found.has(dirname(descriptorPath))) continue;
      throw new Error(
        `${descriptorPath}: no "${MANIFEST_FILE_NAME}" beside this descriptor. A capability lies on disk as a package; add the manifest, or hand the descriptor paths to discovery directly.`,
      );
    }
  }

  const names = new Set<string>();
  return manifestPaths.map((path) => {
    const manifest = readJsonObject(path);
    const name = manifest.name;
    if (typeof name !== 'string' || !name.length) {
      throw new Error(`${path}: workspace package must declare a package name.`);
    }
    if (names.has(name)) throw new Error(`${path}: duplicate workspace package name "${name}".`);
    names.add(name);

    const root = dirname(path);
    const descriptorPath = resolve(root, input.descriptorFileName);
    if (!existsSync(descriptorPath)) return { name, root, manifestPath: path, manifest };

    const descriptorId = readDescriptorId(descriptorPath);
    return {
      name,
      root,
      manifestPath: path,
      manifest,
      descriptorPath,
      ...(descriptorId ? { descriptorId } : {}),
    };
  });
}

// The package set of a workspace, and of every further root joined into it.
export function resolvePackageSources(input: PackageSourcesInput): PackageSourceSnapshot {
  const workspaceRoot = resolve(input.root ?? findWorkspaceRoot(input.from ?? process.cwd()));
  const descriptorFileName = input.descriptorFileName ?? DESCRIPTOR_FILE_NAME;
  const cacheKey = JSON.stringify([
    workspaceRoot,
    descriptorFileName,
    input.patterns ?? null,
    (input.additionalRoots ?? []).map((entry) =>
      typeof entry === 'string' ? [entry, null] : [entry.root, entry.patterns ?? null],
    ),
  ]);
  const cached = input.cache?.get(cacheKey);
  if (cached) return cached;
  const own = discoverRoot({
    root: workspaceRoot,
    ...(input.patterns ? { patterns: input.patterns } : {}),
    descriptorFileName,
  });

  // A package name the asking workspace already carries stays that workspace's: it is
  // the one being asked, and a joined root cannot redefine its vocabulary. The set
  // grows with every root, so the first checkout that carries a name keeps it and a
  // snapshot never holds one name twice.
  const names = new Set(own.map((source) => source.name));
  const joined = (input.additionalRoots ?? []).flatMap((entry) => {
    const additional = typeof entry === 'string' ? { root: entry } : entry;
    const sources = discoverRoot({
      root: resolve(workspaceRoot, additional.root),
      ...(additional.patterns ? { patterns: additional.patterns } : {}),
      descriptorFileName,
    }).filter((source) => !names.has(source.name));
    for (const source of sources) names.add(source.name);
    return sources;
  });

  const packageSources = [...own, ...joined].sort((left, right) =>
    left.name.localeCompare(right.name),
  );

  // A composition rejects a duplicate id by id alone, which across two roots does not
  // say which checkout carries which one. Both files are named here, where both paths
  // are still known.
  const declaredBy = new Map<string, string>();
  for (const source of packageSources) {
    if (!source.descriptorId || !source.descriptorPath) continue;
    const taken = declaredBy.get(source.descriptorId);
    if (taken) {
      throw new Error(
        `Duplicate descriptor id "${source.descriptorId}" declared in ${taken} and ${source.descriptorPath}.`,
      );
    }
    declaredBy.set(source.descriptorId, source.descriptorPath);
  }

  const snapshot: PackageSourceSnapshot = {
    workspaceRoot,
    packageSources,
    descriptorPaths: packageSources.flatMap((source) =>
      source.descriptorPath ? [relative(workspaceRoot, source.descriptorPath)] : [],
    ),
  };
  input.cache?.set(cacheKey, snapshot);
  return snapshot;
}

// --- Package entries --------------------------------------------------------

// The target one `exports` subpath resolves to, in the conditions a loader follows:
// `import` before `require` before `default`, nested condition objects alike. An
// `exports` object with no subpath keys is node's sugar for the `.` export written as
// conditions. `types` is a declaration condition and is never followed.
//
// A subset of node resolution: no subpath patterns, no `node` condition. Enough for a
// workspace package that declares plain targets, which is what a host aliases and
// loads.
export function resolvePackageExport(exports: unknown, subpath: string): string | undefined {
  const followConditions = (entry: unknown): string | undefined => {
    if (typeof entry === 'string') return entry;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return undefined;
    const conditions = entry as Record<string, unknown>;
    for (const condition of ['import', 'require', 'default']) {
      if (!(condition in conditions)) continue;
      const target = followConditions(conditions[condition]);
      if (target !== undefined) return target;
    }
    return undefined;
  };

  if (typeof exports === 'string') return subpath === '.' ? exports : undefined;
  if (!exports || typeof exports !== 'object') return undefined;

  const record = exports as Record<string, unknown>;
  const isSubpathMap = Object.keys(record).some((key) => key.startsWith('.'));
  const entry = isSubpathMap ? record[subpath] : subpath === '.' ? record : undefined;
  return entry === undefined ? undefined : followConditions(entry);
}

export interface PackageEntry {
  packageName: string;
  // The export subpath as the manifest spells it, for example `./web`.
  subpath: string;
  // The specifier that reaches it, for example `@acme/shop-coffee/web`.
  specifier: string;
  // The file the subpath resolves to.
  entryPath: string;
}

// The public entries of a package set: for each source, the subpaths it actually
// declares, resolved to files. A build-time host maps specifiers to source files from
// this instead of walking directories and guessing at file layout; a package that
// declares none of the subpaths contributes nothing.
export function resolvePackageEntries(
  packageSources: readonly PackageSource[],
  subpaths: readonly string[],
): PackageEntry[] {
  return packageSources.flatMap((source) =>
    subpaths.flatMap((subpath) => {
      const target = resolvePackageExport(source.manifest.exports, subpath);
      if (!target) return [];
      return [
        {
          packageName: source.name,
          subpath,
          specifier: `${source.name}${subpath.replace(/^\./, '')}`,
          entryPath: resolve(source.root, target),
        },
      ];
    }),
  );
}
