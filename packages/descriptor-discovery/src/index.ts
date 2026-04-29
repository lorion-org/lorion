import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join, resolve as resolvePath } from 'node:path';

import Ajv, { type ErrorObject, type Options as AjvOptions } from 'ajv';
import type { Descriptor } from '@lorion-org/composition-graph';

export { descriptorSchema, type JsonSchemaObject } from './schema';

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
