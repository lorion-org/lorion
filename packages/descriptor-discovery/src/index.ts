import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join, resolve as resolvePath } from 'node:path';

import Ajv, { type ErrorObject, type Options as AjvOptions } from 'ajv';
import type { Descriptor } from '@lorion-org/composition-graph';

import { descriptorSchema, type JsonSchemaObject } from './schema';

export { descriptorSchema, type JsonSchemaObject };

// A virtual descriptor is a grouping descriptor a host feeds to the graph without a
// filesystem package (see `loadBundleManifest`). It is addressed at a synthetic
// directory under this segment: the path never exists on disk, so surface markers
// never match, no package.json is read, and it can never collide with a real
// capability directory or the process cwd. Both the runtime and the build-time host
// share this one convention instead of each hard-coding the segment.
export const VIRTUAL_DESCRIPTOR_DIR = '__lorion_virtual__';

// The synthetic directory a virtual descriptor is addressed at, under
// `VIRTUAL_DESCRIPTOR_DIR` in the workspace. Kept here so every host agrees on the
// convention from a single definition.
export function virtualDescriptorDirectory(workspaceRoot: string, id: string): string {
  return resolvePath(workspaceRoot, VIRTUAL_DESCRIPTOR_DIR, id);
}

// A capability lives on disk as a package: its descriptor (capability.json) beside
// a package.json. Validating that the package declares a `name` — with one shared
// error message — belongs here next to descriptor discovery, so each host does not
// reimplement it. Takes an already-parsed package.json to avoid re-reading it.
export function requirePackageName(
  packageJson: { name?: unknown },
  packageJsonPath: string,
): string {
  if (typeof packageJson.name !== 'string') {
    throw new Error(`Capability package is missing "name": ${packageJsonPath}`);
  }
  return packageJson.name;
}

export type RawDescriptor = Omit<Descriptor, 'id'> & {
  id?: string;
};

export type DiscoveredDescriptor = {
  id: string;
  cwd: string;
  descriptorPath: string;
  descriptor: Descriptor;
};

export type DescriptorSchemaValidationTarget = {
  descriptorPath: string;
};

export type DescriptorSchemaValidationErrorFormatter = (
  target: DescriptorSchemaValidationTarget,
  validationError: ErrorObject,
) => Error;

export type DescriptorValidationOptions = {
  ajvOptions?: AjvOptions;
  formatError?: DescriptorSchemaValidationErrorFormatter;
  schema: object;
};

export type ExpandNestedDescriptorsInput = {
  rawDescriptor: RawDescriptor & Record<string, unknown>;
  fallbackId: string;
  idField?: string;
  nestedField?: string;
};

export type DiscoverDescriptorsInput = {
  cwd?: string;
  descriptorPaths?: string[];
  roots?: string[];
  descriptorFileName?: string;
  idField?: string;
  maxDepth?: number;
  nestedField?: string;
  validation?: false | DescriptorValidationOptions;
};

function formatDescriptorSchemaValidationError(
  target: DescriptorSchemaValidationTarget,
  validationError: ErrorObject,
): Error {
  const jsonPath = validationError.instancePath || '/';
  const ajvError = `${validationError.keyword}${validationError.message ? `: ${validationError.message}` : ''}`;

  return new Error(
    [
      'Descriptor schema validation failed.',
      `File: ${target.descriptorPath}`,
      `JSON path: ${jsonPath}`,
      `Schema error: ${ajvError}`,
    ].join('\n'),
  );
}

function createDescriptorValidator(
  options: false | DescriptorValidationOptions | undefined,
): ((target: DescriptorSchemaValidationTarget, descriptor: object) => void) | undefined {
  if (!options) return undefined;

  const ajv = new Ajv({
    strict: false,
    allErrors: false,
    ...options.ajvOptions,
  });
  const validate = ajv.compile(options.schema);
  const formatError = options.formatError ?? formatDescriptorSchemaValidationError;

  return (target, descriptor) => {
    if (validate(descriptor)) return;

    const validationError = validate.errors?.[0];
    if (validationError) throw formatError(target, validationError);

    throw new Error(`Descriptor schema validation failed: "${target.descriptorPath}"`);
  };
}

function resolveDescriptorId(input: {
  rawDescriptor: Record<string, unknown>;
  idField: string;
  fallbackId?: string;
  label: string;
}): string {
  const configuredId = input.rawDescriptor[input.idField];

  if (typeof configuredId === 'string' && configuredId.trim()) {
    return configuredId.trim();
  }

  if (typeof input.fallbackId === 'string' && input.fallbackId.trim()) {
    return input.fallbackId.trim();
  }

  throw new Error(`${input.label} is missing a non-empty "${input.idField}" field`);
}

function getNestedDescriptors(input: {
  rawDescriptor: Record<string, unknown>;
  nestedField?: string;
  parentId: string;
}): Array<RawDescriptor & Record<string, unknown>> {
  if (!input.nestedField) return [];

  const nestedValue = input.rawDescriptor[input.nestedField];

  if (nestedValue === undefined) return [];
  if (!Array.isArray(nestedValue))
    throw new Error(`Descriptor "${input.parentId}" field "${input.nestedField}" must be an array`);

  return nestedValue.map((entry, index) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new Error(
        `Descriptor "${input.parentId}" field "${input.nestedField}" contains an invalid entry at index ${index}`,
      );
    }

    return entry as RawDescriptor & Record<string, unknown>;
  });
}

function normalizeDescriptor(input: {
  rawDescriptor: RawDescriptor & Record<string, unknown>;
  id: string;
  nestedField?: string;
}): Descriptor {
  const version =
    typeof input.rawDescriptor.version === 'string' && input.rawDescriptor.version.trim()
      ? input.rawDescriptor.version
      : '0.0.0';

  if (input.nestedField) {
    const descriptor = { ...input.rawDescriptor };

    delete descriptor[input.nestedField];

    return {
      ...descriptor,
      id: input.id,
      version,
    };
  }

  return {
    ...input.rawDescriptor,
    id: input.id,
    version,
  };
}

export function expandNestedDescriptors(input: ExpandNestedDescriptorsInput): Descriptor[] {
  const idField: string = input.idField ?? 'id';
  const rootId = resolveDescriptorId({
    rawDescriptor: input.rawDescriptor,
    idField,
    fallbackId: input.fallbackId,
    label: 'Descriptor',
  });
  const nestedDescriptors = getNestedDescriptors({
    rawDescriptor: input.rawDescriptor,
    parentId: rootId,
    ...(input.nestedField ? { nestedField: input.nestedField } : {}),
  });
  const descriptors: Descriptor[] = [
    normalizeDescriptor({
      rawDescriptor: input.rawDescriptor,
      id: rootId,
      ...(input.nestedField ? { nestedField: input.nestedField } : {}),
    }),
  ];

  for (const nestedDescriptor of nestedDescriptors) {
    const nestedId = resolveDescriptorId({
      rawDescriptor: nestedDescriptor,
      idField,
      label: `Nested descriptor in "${rootId}"`,
    });
    const nestedChildren = getNestedDescriptors({
      rawDescriptor: nestedDescriptor,
      parentId: nestedId,
      ...(input.nestedField ? { nestedField: input.nestedField } : {}),
    });

    if (nestedChildren.length) {
      throw new Error(`Nested descriptors are not supported inside descriptor "${nestedId}"`);
    }

    descriptors.push(
      normalizeDescriptor({
        rawDescriptor: nestedDescriptor,
        id: nestedId,
        ...(input.nestedField ? { nestedField: input.nestedField } : {}),
      }),
    );
  }

  return descriptors;
}

function escapeRegex(value: string): string {
  return value.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
}

function createGlobSegmentRegex(segment: string): RegExp {
  return new RegExp(`^${segment.split('*').map(escapeRegex).join('[^/\\\\]*')}$`);
}

function splitPattern(pattern: string): string[] {
  return pattern.split(/[\\/]+/).filter(Boolean);
}

function expandDescriptorPathPattern(input: { cwd: string; pattern: string }): string[] {
  const segments = splitPattern(input.pattern);
  const visit = (currentDir: string, index: number): string[] => {
    const segment = segments[index];
    if (!segment) return [];

    const isLast = index === segments.length - 1;

    if (!segment.includes('*')) {
      const nextPath = join(currentDir, segment);

      if (isLast) return existsSync(nextPath) ? [nextPath] : [];
      if (!existsSync(nextPath)) return [];

      return visit(nextPath, index + 1);
    }

    if (!existsSync(currentDir)) return [];

    const matcher = createGlobSegmentRegex(segment);

    return readdirSync(currentDir, { withFileTypes: true })
      .filter((entry) => entry.name !== 'node_modules' && matcher.test(entry.name))
      .flatMap((entry) => {
        const nextPath = join(currentDir, entry.name);

        if (isLast) return entry.isFile() ? [nextPath] : [];
        return entry.isDirectory() ? visit(nextPath, index + 1) : [];
      });
  };

  return visit(resolvePath(input.cwd), 0);
}

function discoverDescriptorFiles(input: { cwd: string; descriptorPaths: string[] }): string[] {
  return [
    ...new Set(
      input.descriptorPaths.flatMap((pattern) =>
        expandDescriptorPathPattern({
          cwd: input.cwd,
          pattern,
        }),
      ),
    ),
  ].sort();
}

function discoverDescriptorFilesFromRoots(input: {
  descriptorFileName: string;
  maxDepth: number;
  roots: string[];
}): string[] {
  const discovered: string[] = [];
  const visit = (root: string, depth: number): void => {
    if (depth > input.maxDepth || !existsSync(root)) return;

    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === 'node_modules') continue;

      const cwd: string = join(root, entry.name);
      const descriptorPath: string = join(cwd, input.descriptorFileName);

      if (existsSync(descriptorPath)) discovered.push(descriptorPath);

      visit(cwd, depth + 1);
    }
  };

  for (const root of input.roots) {
    visit(resolvePath(root), 1);
  }

  return [...new Set(discovered)].sort();
}

export function discoverDescriptors(input: DiscoverDescriptorsInput): DiscoveredDescriptor[] {
  const descriptorFileName: string = input.descriptorFileName ?? 'descriptor.json';
  const idField: string = input.idField ?? 'id';
  const maxDepth = input.maxDepth ?? 1;
  const validateDescriptor = createDescriptorValidator(input.validation);
  const descriptorPaths = input.descriptorPaths?.length
    ? discoverDescriptorFiles({
        cwd: input.cwd ?? '',
        descriptorPaths: input.descriptorPaths,
      })
    : discoverDescriptorFilesFromRoots({
        descriptorFileName,
        maxDepth,
        roots: input.roots ?? [],
      });

  return descriptorPaths.flatMap((descriptorPath) => {
    const cwd = dirname(descriptorPath);
    const rawDescriptor = JSON.parse(readFileSync(descriptorPath, 'utf8')) as RawDescriptor &
      Record<string, unknown>;

    validateDescriptor?.({ descriptorPath }, rawDescriptor);

    return expandNestedDescriptors({
      rawDescriptor,
      fallbackId: basename(cwd),
      idField,
      ...(input.nestedField ? { nestedField: input.nestedField } : {}),
    }).map((descriptor) => ({
      id: descriptor.id,
      cwd,
      descriptorPath,
      descriptor,
    }));
  });
}

// A declarative bundle manifest groups discovered capabilities into named virtual
// descriptors without one filesystem package per group. `bundles` is a nested list
// of ordinary descriptors (`{ id, version, dependencies }`) — the same shape as any
// capability's descriptor, not a bespoke format — and `base`/`default` name which
// of them is the always-on base and the default selection. This is the
// batteries-included path so a host needs no bundling code of its own: point it at
// a manifest and feed the result to composition.
export type BundleManifest = {
  virtualDescriptors: Descriptor[];
  baseDescriptors: string[];
  defaultSelection: string[];
};

type RawBundleManifest = {
  base: string;
  default: string;
  bundles: Array<Partial<Descriptor> & { id?: unknown }>;
};

// Walk up from `fromDir` (inclusive) to the filesystem root, returning the first
// directory `matches` accepts, or undefined when the root is reached without a hit.
// The one shared "find upward" primitive: manifest discovery and workspace-root
// resolution build on it instead of each re-implementing the ascent.
export function findUp(fromDir: string, matches: (dir: string) => boolean): string | undefined {
  let dir = resolvePath(fromDir);
  for (;;) {
    if (matches(dir)) return dir;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

function findManifestUp(fromDir: string, fileName: string): string {
  const dir = findUp(fromDir, (candidate) => existsSync(join(candidate, fileName)));
  if (dir === undefined) {
    throw new Error(`Bundle manifest "${fileName}" not found from "${fromDir}" upward.`);
  }
  return join(dir, fileName);
}

// Resolves a bundle manifest into composition inputs: the declared bundle
// descriptors as virtual descriptors, plus the base and default-selection seeds.
// The manifest is discovered by walking up from `cwd`, so a host passes only where
// it starts (for example its config directory).
export function loadBundleManifest(options: { cwd: string; fileName?: string }): BundleManifest {
  const fileName = options.fileName ?? 'bundles.json';
  const manifestPath = findManifestUp(options.cwd, fileName);
  const raw = JSON.parse(readFileSync(manifestPath, 'utf8')) as RawBundleManifest;

  if (
    typeof raw?.base !== 'string' ||
    typeof raw?.default !== 'string' ||
    !Array.isArray(raw?.bundles)
  ) {
    throw new Error(
      `Bundle manifest ${manifestPath} must declare string "base", string "default" and an array "bundles".`,
    );
  }

  // Each bundle is an ordinary descriptor, so validate it against the very schema a
  // capability's descriptor is held to — a malformed grouping (e.g. a non-semver
  // dependency) fails fast here with the shared schema error, not later as a
  // confusing graph-resolution error.
  const validateDescriptor = createDescriptorValidator({ schema: descriptorSchema });
  const virtualDescriptors: Descriptor[] = raw.bundles.map((bundle, index) => {
    if (typeof bundle?.id !== 'string' || !bundle.id.trim()) {
      throw new Error(`Bundle at index ${index} in ${manifestPath} is missing a non-empty "id".`);
    }
    const descriptor: Descriptor = {
      ...bundle,
      id: bundle.id,
      version:
        typeof bundle.version === 'string' && bundle.version.trim() ? bundle.version : '0.0.0',
    };
    validateDescriptor?.({ descriptorPath: manifestPath }, descriptor);
    return descriptor;
  });

  const ids = new Set(virtualDescriptors.map((descriptor) => descriptor.id));
  if (!ids.has(raw.base)) {
    throw new Error(`Bundle manifest ${manifestPath}: base bundle "${raw.base}" is not defined.`);
  }
  if (!ids.has(raw.default)) {
    throw new Error(
      `Bundle manifest ${manifestPath}: default bundle "${raw.default}" is not defined.`,
    );
  }

  return { virtualDescriptors, baseDescriptors: [raw.base], defaultSelection: [raw.default] };
}
