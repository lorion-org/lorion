import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join, resolve as resolvePath } from 'node:path';

import Ajv, { type ErrorObject, type Options as AjvOptions } from 'ajv';
import type { Descriptor } from '@lorion-org/composition-graph';

import type { SchemaDescriptor } from './descriptor';
import { bundleManifestSchema, descriptorSchema, type JsonSchemaObject } from './schema';

export { bundleManifestSchema, descriptorSchema, type JsonSchemaObject };
export type { DescriptorField, SchemaDescriptor } from './descriptor';

// A virtual descriptor is a grouping descriptor a host feeds to the graph without a
// filesystem package (see `loadBundleManifest`). It is addressed at a synthetic
// directory under this segment: the path never exists on disk, so surface markers
// never match, no package.json is read, and it can never collide with a real
// capability directory or the process cwd. Both the runtime and the build-time host
// share this one convention instead of each hard-coding the segment.
export const VIRTUAL_DESCRIPTOR_DIR = '__lorion_virtual__';

// The descriptor field that holds further descriptors. `bundles` is declared by the
// shared descriptor schema, so every host expands it by default; a host names
// `nestedField` only to read a different field, and `false` to read none.
export const NESTED_DESCRIPTOR_FIELD = 'bundles';

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
  // True for a descriptor declared inside another descriptor's nested field. It
  // shares the host's directory but owns no package there, so a host must not
  // read a package name or resolve a surface marker for it.
  nested: boolean;
};

export type DescriptorSchemaValidationTarget = {
  descriptorPath: string;
};

export type DescriptorSchemaValidationErrorFormatter = (
  target: DescriptorSchemaValidationTarget,
  validationErrors: readonly [ErrorObject, ...ErrorObject[]],
) => Error;

export type DescriptorValidationOptions = {
  ajvOptions?: AjvOptions;
  formatError?: DescriptorSchemaValidationErrorFormatter;
  // What the validated document is called in the error. A manifest wrapper is not a
  // descriptor, and saying so is the difference between a reader looking at the file
  // and a reader looking at a bundle entry.
  label?: string;
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

// One line per violation, each naming where it is and what was rejected. Ajv
// reports an additional property against the containing object, so the instance
// path alone points at `/` and never names the offending key; a `required` error
// names the missing property the same way.
function formatValidationLine(validationError: ErrorObject): string {
  const params = validationError.params as {
    additionalProperty?: unknown;
    missingProperty?: unknown;
  };
  const named =
    typeof params.additionalProperty === 'string'
      ? params.additionalProperty
      : typeof params.missingProperty === 'string'
        ? params.missingProperty
        : undefined;

  const jsonPath = validationError.instancePath || '/';
  const key = named ? ` ("${named}")` : '';
  const message = validationError.message ? `: ${validationError.message}` : '';

  return `  ${jsonPath} ${validationError.keyword}${key}${message}`;
}

function formatDescriptorSchemaValidationError(
  target: DescriptorSchemaValidationTarget,
  validationErrors: readonly [ErrorObject, ...ErrorObject[]],
  label = 'Descriptor',
): Error {
  return new Error(
    [
      `${label} schema validation failed.`,
      `File: ${target.descriptorPath}`,
      'Schema errors:',
      ...validationErrors.map(formatValidationLine),
    ].join('\n'),
  );
}

function createDescriptorValidator(
  options: false | DescriptorValidationOptions | undefined,
): ((target: DescriptorSchemaValidationTarget, descriptor: object) => void) | undefined {
  if (!options) return undefined;

  const ajv = new Ajv({
    strict: false,
    allErrors: true,
    ...options.ajvOptions,
  });
  const validate = ajv.compile(options.schema);
  const label = options.label ?? 'Descriptor';
  const formatError: DescriptorSchemaValidationErrorFormatter =
    options.formatError ??
    ((target, errors) => formatDescriptorSchemaValidationError(target, errors, label));

  return (target, descriptor) => {
    if (validate(descriptor)) return;

    const [first, ...rest] = validate.errors ?? [];
    if (first) throw formatError(target, [first, ...rest]);

    throw new Error(`${label} schema validation failed: "${target.descriptorPath}"`);
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
    }).map((descriptor, index) => ({
      id: descriptor.id,
      cwd,
      descriptorPath,
      descriptor,
      nested: index > 0,
    }));
  });
}

// A declarative bundle manifest groups discovered capabilities into named virtual
// descriptors without one filesystem package per group. `bundles` is a nested list
// of ordinary descriptors (`{ id, version, dependencies }`) — the same shape as any
// capability's descriptor, not a bespoke format. This is the batteries-included
// path so a host needs no bundling code of its own: point it at a manifest and
// feed the descriptors to composition.
//
// A manifest declares descriptors and nothing else. Which of them is the always-on
// base and which is the default selection is a property of a run, not of a
// grouping file, so the host names both in its seed.

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

// Resolves a bundle manifest into the virtual descriptors it declares. The
// manifest is discovered by walking up from `cwd`, so a host passes only where it
// starts (for example its config directory).
export function loadBundleManifest(options: { cwd: string; fileName?: string }): Descriptor[] {
  const fileName = options.fileName ?? 'bundles.json';
  const manifestPath = findManifestUp(options.cwd, fileName);
  const raw: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'));

  // `bundles.schema.json` is the definition of this file's shape, so it is validated
  // rather than restated as a TypeScript type. A key that is not a bundle
  // declaration is reported here instead of being ignored on the way to
  // composition, and the narrowing below states the schema's guarantee once.
  createDescriptorValidator({ schema: bundleManifestSchema, label: 'Bundle manifest' })?.(
    { descriptorPath: manifestPath },
    raw as object,
  );
  const { bundles } = raw as { bundles: Array<Partial<SchemaDescriptor> & { id?: unknown }> };

  // Each bundle is an ordinary descriptor, so validate it against the very schema a
  // capability's descriptor is held to — a malformed grouping (e.g. a non-semver
  // dependency) fails fast here with the shared schema error, not later as a
  // confusing graph-resolution error.
  return bundles.map((bundle, index) => {
    if (typeof bundle?.id !== 'string' || !bundle.id.trim()) {
      throw new Error(`Bundle at index ${index} in ${manifestPath} is missing a non-empty "id".`);
    }
    // Trimmed like every other id: `resolveDescriptorId` trims what it reads from a
    // descriptor file, and an id carrying spaces can never be named from a CLI flag
    // or an environment variable, which split on whitespace.
    const id = bundle.id.trim();
    // Validated as written otherwise: the same grouping declared under a
    // descriptor's nested field is held to the shared schema unchanged, so
    // defaulting a version here would make one spelling accept what the other
    // rejects. The error names the entry, since a manifest holds several.
    const descriptor = { ...bundle, id } as Descriptor;
    createDescriptorValidator({
      schema: descriptorSchema,
      label: `Bundle "${id}" (index ${index})`,
    })?.({ descriptorPath: manifestPath }, descriptor);
    return descriptor;
  });
}
