import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import Ajv from 'ajv';
import type { ErrorObject, Options as AjvOptions } from 'ajv';
import {
  getRuntimeConfigScope,
  projectSectionedRuntimeConfig,
  resolveRuntimeConfigValueFromRuntimeConfig,
  projectRuntimeConfigEnvVars,
  toRuntimeConfigFragment,
  runtimeEnvVarsToShellAssignments,
  type ConfigVisibility,
  type GetRuntimeConfigScopeOptions,
  type ProjectRuntimeConfigEnvVarsOptions,
  type RuntimeConfigFragment,
  type RuntimeConfigFragmentMap,
  type RuntimeEnvVars,
  type RuntimeConfigSection,
  type SectionedRuntimeConfig,
} from '@lorion-org/runtime-config';

export type RuntimeConfigPaths = {
  varDir: string;
  runtimeConfigDir: string;
  scopeDir: string;
  filePath: string;
};

export type RuntimeConfigPathOptions = {
  fileName?: string;
  runtimeConfigDirName?: string;
};

export type RuntimeConfigSource = RuntimeConfigPathOptions & {
  varDir: string;
};

export type RuntimeConfigPathPatternSource = {
  paths: string[];
};

export type RuntimeConfigSourceFile = {
  configPath: string;
  pattern: string;
  scopeId: string;
};

export type ResolveRuntimeConfigSourceOptions = RuntimeConfigPathOptions & {
  defaultVarDir?: string;
  env?: Record<string, string | undefined>;
  envKey?: string;
  varDir?: string;
};

export type RuntimeConfigEnvFileOptions = RuntimeConfigPathOptions &
  ProjectRuntimeConfigEnvVarsOptions;

export type WriteFileOptions = {
  createDir?: boolean;
};

export type WriteJsonFileOptions = WriteFileOptions & {
  pretty?: boolean;
};

export type ReadJsonFileOptions<T> = {
  defaultValue?: T;
  onParseError?: (error: unknown, filePath: string) => void;
};

export type RuntimeConfigSchemaValidationTarget = {
  configPath: string;
  schemaPath: string;
  scopeId: string;
};

export type RuntimeConfigSchemaValidationErrorFormatter = (
  target: RuntimeConfigSchemaValidationTarget,
  validationError: ErrorObject,
) => Error;

export type ValidateRuntimeConfigSchemaTargetsOptions = {
  ajvOptions?: AjvOptions;
  formatError?: RuntimeConfigSchemaValidationErrorFormatter;
};

export type RuntimeConfigListEntry = {
  contextIds: string[];
  path: string;
  privateKeys: string[];
  publicKeys: string[];
  scopeId: string;
};

export type RuntimeConfigListOptions = RuntimeConfigPathOptions & {
  contextInputKey?: string;
};

export type RuntimeConfigListResult = {
  fileName: string;
  scopes: RuntimeConfigListEntry[];
  varDir: string;
};

export type RuntimeConfigShowResult = {
  config?: RuntimeConfigFragment;
  exists: boolean;
  fileName: string;
  path: string;
  scopeId: string;
  varDir: string;
};

export type RuntimeConfigProjectOptions = RuntimeConfigPathOptions & {
  contextInputKey?: string;
  contextOutputKey?: string;
  scopeIds?: string[];
};

export type RuntimeConfigProjectResult = {
  fileName: string;
  runtimeConfig: SectionedRuntimeConfig;
  scopeIds: string[];
  varDir: string;
};

export type RuntimeConfigValueQueryOptions = RuntimeConfigProjectOptions & {
  contextId?: string;
  visibility?: ConfigVisibility;
};

export type RuntimeConfigValueResult = {
  contextId?: string;
  exists: boolean;
  fileName: string;
  key: string;
  scopeId: string;
  value?: unknown;
  varDir: string;
  visibility: ConfigVisibility;
};

export type RuntimeConfigScopeViewOptions = RuntimeConfigProjectOptions & {
  contextId?: string;
  visibility?: ConfigVisibility;
};

export type RuntimeConfigScopeViewResult = {
  config: RuntimeConfigSection;
  contextId?: string;
  fileName: string;
  scopeId: string;
  varDir: string;
  visibility: ConfigVisibility;
};

export type RuntimeConfigSchemaTargetInput = {
  cwd?: string;
  scopeId: string;
};

export type RuntimeConfigValidationEntry = {
  configPath: string;
  schemaPath: string;
  scopeId: string;
};

export type RuntimeConfigValidationSkippedEntry = {
  configPath?: string;
  reason: 'missing-config' | 'missing-schema' | 'missing-scope-dir';
  schemaPath?: string;
  scopeId: string;
};

export type ValidateRuntimeConfigScopesOptions = RuntimeConfigPathOptions & {
  formatError?: RuntimeConfigSchemaValidationErrorFormatter;
  schemaFileName?: string;
};

export type ValidateRuntimeConfigPatternSourceScopesOptions = Pick<
  ValidateRuntimeConfigScopesOptions,
  'formatError' | 'schemaFileName'
>;

export type RuntimeConfigValidateResult = {
  fileName: string;
  skipped: RuntimeConfigValidationSkippedEntry[];
  validated: RuntimeConfigValidationEntry[];
  varDir: string;
};

const defaultRuntimeConfigFileName = 'runtime.config.json';
const defaultRuntimeConfigDirName = 'runtime-config';
const defaultRuntimeConfigSchemaFileName = 'runtime-config.schema.json';

function toPosixPath(filePath: string): string {
  return filePath.split(path.sep).join('/');
}

function escapeRegex(value: string): string {
  return value.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
}

function countWildcards(pattern: string): number {
  return (pattern.match(/\*/g) ?? []).length;
}

function assertSingleWildcardPattern(pattern: string): void {
  const wildcardCount = countWildcards(pattern);

  if (wildcardCount !== 1) {
    throw new Error(
      `RuntimeConfig path pattern must contain exactly one "*" wildcard: "${pattern}"`,
    );
  }
}

function createGlobSegmentRegex(segment: string): RegExp {
  return new RegExp(`^${segment.split('*').map(escapeRegex).join('[^/\\\\]*')}$`);
}

function splitAbsolutePattern(pattern: string): {
  root: string;
  segments: string[];
} {
  const absolutePattern = path.resolve(pattern);
  const parsed = path.parse(absolutePattern);
  const relativePattern = path.relative(parsed.root, absolutePattern);

  return {
    root: parsed.root,
    segments: relativePattern.split(/[\\/]+/).filter(Boolean),
  };
}

function expandRuntimeConfigPattern(pattern: string): string[] {
  assertSingleWildcardPattern(pattern);

  const { root, segments } = splitAbsolutePattern(pattern);
  const visit = (currentDir: string, index: number): string[] => {
    const segment = segments[index];
    if (!segment) return [];

    const isLast = index === segments.length - 1;

    if (!segment.includes('*')) {
      const nextPath = path.join(currentDir, segment);

      if (isLast) return existsSync(nextPath) ? [nextPath] : [];
      if (!existsSync(nextPath)) return [];

      return visit(nextPath, index + 1);
    }

    if (!existsSync(currentDir)) return [];

    const matcher = createGlobSegmentRegex(segment);

    return readdirSync(currentDir, { withFileTypes: true })
      .filter((entry) => entry.name !== 'node_modules' && matcher.test(entry.name))
      .flatMap((entry) => {
        const nextPath = path.join(currentDir, entry.name);

        if (isLast) return entry.isFile() ? [nextPath] : [];
        return entry.isDirectory() ? visit(nextPath, index + 1) : [];
      });
  };

  return visit(root, 0);
}

function getRuntimeConfigScopeIdFromPattern(input: {
  configPath: string;
  pattern: string;
}): string {
  assertSingleWildcardPattern(input.pattern);

  const resolvedPattern = path.resolve(input.pattern);
  const wildcardIndex = resolvedPattern.indexOf('*');
  const beforeWildcard = resolvedPattern.slice(0, wildcardIndex);
  const afterWildcard = resolvedPattern.slice(wildcardIndex + 1);
  const configPath = path.resolve(input.configPath);

  if (!configPath.startsWith(beforeWildcard) || !configPath.endsWith(afterWildcard)) {
    throw new Error(
      `RuntimeConfig file "${input.configPath}" does not match pattern "${input.pattern}"`,
    );
  }

  return toPosixPath(
    configPath.slice(beforeWildcard.length, configPath.length - afterWildcard.length),
  ).replace(/^\/+|\/+$/g, '');
}

function getRuntimeConfigPatternPublicRoot(pattern: string): string {
  assertSingleWildcardPattern(pattern);

  const resolvedPattern = path.resolve(pattern);
  const beforeWildcard = resolvedPattern.slice(0, resolvedPattern.indexOf('*'));
  const wildcardParent = beforeWildcard.replace(/[\\/]+$/, '');

  return path.resolve(wildcardParent, 'public');
}

function getFileName(options: RuntimeConfigPathOptions): string {
  return options.fileName ?? defaultRuntimeConfigFileName;
}

function getRuntimeConfigDirName(options: RuntimeConfigPathOptions): string {
  return options.runtimeConfigDirName ?? defaultRuntimeConfigDirName;
}

function getRuntimeConfigPathOptions(source: RuntimeConfigSource): RuntimeConfigPathOptions {
  return {
    ...(source.fileName ? { fileName: source.fileName } : {}),
    ...(source.runtimeConfigDirName ? { runtimeConfigDirName: source.runtimeConfigDirName } : {}),
  };
}

function getSchemaFileName(options: ValidateRuntimeConfigScopesOptions): string {
  return options.schemaFileName ?? defaultRuntimeConfigSchemaFileName;
}

function stripJsonBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export function ensureParentDir(filePath: string): void {
  const dirPath = path.dirname(filePath);

  if (!existsSync(dirPath)) mkdirSync(dirPath, { recursive: true });
}

export function readTextFile(filePath: string): string | undefined {
  return existsSync(filePath) ? readFileSync(filePath, 'utf8') : undefined;
}

export function writeTextFile(
  filePath: string,
  data: string,
  options: WriteFileOptions = {},
): void {
  if (options.createDir !== false) ensureParentDir(filePath);

  writeFileSync(filePath, data, 'utf8');
}

export function readJsonFile<T>(
  filePath: string,
  options: ReadJsonFileOptions<T> = {},
): T | undefined {
  const text = readTextFile(filePath);

  if (text === undefined) return undefined;

  try {
    return JSON.parse(stripJsonBom(text)) as T;
  } catch (error) {
    options.onParseError?.(error, filePath);
    return options.defaultValue;
  }
}

export function readRequiredJsonFile<T>(filePath: string): T {
  const text = readTextFile(filePath);

  if (text === undefined) {
    throw new Error(`RuntimeConfig JSON file not found: "${filePath}"`);
  }

  try {
    return JSON.parse(stripJsonBom(text)) as T;
  } catch (error) {
    throw new Error(`RuntimeConfig JSON parse error in "${filePath}": ${String(error)}`);
  }
}

export function writeJsonFile(
  filePath: string,
  data: unknown,
  options: WriteJsonFileOptions = {},
): void {
  const spacing = options.pretty === false ? undefined : 2;

  writeTextFile(filePath, `${JSON.stringify(data, undefined, spacing)}\n`, options);
}

export function resolveRuntimeConfigPaths(
  varDir: string,
  scopeId: string,
  options: RuntimeConfigPathOptions = {},
): RuntimeConfigPaths {
  const runtimeConfigDir: string = path.join(varDir, getRuntimeConfigDirName(options));
  const scopeDir: string = path.join(runtimeConfigDir, scopeId);
  const filePath: string = path.join(scopeDir, getFileName(options));

  return {
    varDir,
    runtimeConfigDir,
    scopeDir,
    filePath,
  };
}

export function resolveRuntimeConfigSource(
  options: ResolveRuntimeConfigSourceOptions = {},
): RuntimeConfigSource {
  const envKey = options.envKey ?? 'RUNTIME_CONFIG_VAR_DIR';
  const varDir = String(
    options.varDir ?? options.env?.[envKey] ?? options.defaultVarDir ?? '',
  ).trim();

  if (!varDir) {
    throw new Error(`RuntimeConfig varDir not found. Pass varDir or set ${envKey}.`);
  }

  return {
    varDir,
    ...(options.fileName ? { fileName: options.fileName } : {}),
    ...(options.runtimeConfigDirName ? { runtimeConfigDirName: options.runtimeConfigDirName } : {}),
  };
}

export function resolveRuntimeConfigFilePath(
  varDir: string,
  scopeId: string,
  filename: string,
  options: RuntimeConfigPathOptions = {},
): string {
  const { scopeDir } = resolveRuntimeConfigPaths(varDir, scopeId, options);

  return path.join(scopeDir, filename);
}

export function resolveRuntimeConfigScopeFilePath(
  source: RuntimeConfigSource,
  scopeId: string,
  fileName: string,
): string {
  return resolveRuntimeConfigFilePath(
    source.varDir,
    scopeId,
    fileName,
    getRuntimeConfigPathOptions(source),
  );
}

export function readRuntimeConfigScopeJson<T>(
  source: RuntimeConfigSource,
  scopeId: string,
  fileName: string,
  options: ReadJsonFileOptions<T> = {},
): T | undefined {
  return readJsonFile<T>(resolveRuntimeConfigScopeFilePath(source, scopeId, fileName), options);
}

export function writeRuntimeConfigScopeJson(
  source: RuntimeConfigSource,
  scopeId: string,
  fileName: string,
  data: unknown,
  options: WriteJsonFileOptions = {},
): void {
  writeJsonFile(resolveRuntimeConfigScopeFilePath(source, scopeId, fileName), data, options);
}

export function resolveRuntimeConfigPublicRootPath(source: RuntimeConfigSource): string {
  return path.resolve(
    source.varDir,
    getRuntimeConfigDirName(getRuntimeConfigPathOptions(source)),
    'public',
  );
}

export function resolveRuntimeConfigPublicFilePath(
  source: RuntimeConfigSource,
  relativePath: string,
): string {
  return path.resolve(resolveRuntimeConfigPublicRootPath(source), relativePath);
}

export function resolveRuntimeConfigSourceFiles(
  source: RuntimeConfigPathPatternSource,
): RuntimeConfigSourceFile[] {
  return source.paths
    .flatMap((pattern) =>
      expandRuntimeConfigPattern(pattern).map((configPath) => ({
        configPath,
        pattern,
        scopeId: getRuntimeConfigScopeIdFromPattern({ configPath, pattern }),
      })),
    )
    .filter((entry, index, entries) => {
      return entries.findIndex((candidate) => candidate.configPath === entry.configPath) === index;
    })
    .sort((left, right) => left.configPath.localeCompare(right.configPath));
}

export function loadRuntimeConfigSourceTree(
  source: RuntimeConfigPathPatternSource,
): RuntimeConfigFragmentMap {
  const fragments: RuntimeConfigFragmentMap = new Map();

  for (const entry of resolveRuntimeConfigSourceFiles(source)) {
    const config = readJsonFile<RuntimeConfigFragment>(entry.configPath);

    if (config) fragments.set(entry.scopeId, config);
  }

  return fragments;
}

export function resolveRuntimeConfigSourcePublicRootPath(
  source: RuntimeConfigPathPatternSource,
): string | undefined {
  const pattern = source.paths[0];

  return pattern ? getRuntimeConfigPatternPublicRoot(pattern) : undefined;
}

export function listRuntimeConfigScopeFiles(
  varDir: string,
  scopeId: string,
  subdir: string,
  options: RuntimeConfigPathOptions & { extension?: string } = {},
): string[] {
  const dirPath = resolveRuntimeConfigFilePath(varDir, scopeId, subdir, options);

  if (!existsSync(dirPath)) return [];

  return readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => (options.extension ? name.endsWith(options.extension) : true));
}

export function collectRuntimeConfigFragmentFiles(
  runtimeConfigDir: string,
  options: RuntimeConfigPathOptions = {},
): string[] {
  const fileName = getFileName(options);
  const files: string[] = [];

  if (!existsSync(runtimeConfigDir)) return files;

  const walk = (currentPath: string): void => {
    for (const entry of readdirSync(currentPath, { withFileTypes: true })) {
      const absolutePath = path.resolve(currentPath, entry.name);

      if (entry.isDirectory()) {
        walk(absolutePath);
        continue;
      }

      if (entry.isFile() && entry.name === fileName) {
        files.push(absolutePath);
      }
    }
  };

  walk(runtimeConfigDir);

  return files.sort((left, right) => left.localeCompare(right));
}

export function parseRuntimeConfigFragmentFiles(
  filePaths: string[],
  runtimeConfigDir: string,
  options: RuntimeConfigPathOptions = {},
): RuntimeConfigFragmentMap {
  const fileName = getFileName(options);
  const fragments: RuntimeConfigFragmentMap = new Map();

  for (const filePath of filePaths) {
    const relativePath = toPosixPath(path.relative(runtimeConfigDir, filePath));
    const scopeId = relativePath.replace(
      new RegExp(`/${fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`),
      '',
    );
    const config = readJsonFile<RuntimeConfigFragment>(filePath);

    if (config) fragments.set(scopeId, config);
  }

  return fragments;
}

export function loadRuntimeConfigFragment(
  varDir: string,
  scopeId: string,
  options: RuntimeConfigPathOptions = {},
): RuntimeConfigFragment | undefined {
  const { filePath } = resolveRuntimeConfigPaths(varDir, scopeId, options);

  return readJsonFile<RuntimeConfigFragment>(filePath);
}

export function writeRuntimeConfigFragment(
  varDir: string,
  scopeId: string,
  config: RuntimeConfigFragment,
  options: RuntimeConfigPathOptions & WriteJsonFileOptions = {},
): void {
  const { filePath } = resolveRuntimeConfigPaths(varDir, scopeId, options);

  writeJsonFile(filePath, config, options);
}

function formatRuntimeConfigSchemaValidationError(
  target: RuntimeConfigSchemaValidationTarget,
  validationError: ErrorObject,
): Error {
  const jsonPath = validationError.instancePath || '/';
  const ajvError = `${validationError.keyword}${validationError.message ? `: ${validationError.message}` : ''}`;

  return new Error(
    [
      'RuntimeConfig schema validation failed.',
      `Scope: ${target.scopeId}`,
      `File: ${target.configPath}`,
      `JSON path: ${jsonPath}`,
      `Schema error: ${ajvError}`,
    ].join('\n'),
  );
}

export function validateRuntimeConfigSchemaTargets(
  targets: RuntimeConfigSchemaValidationTarget[],
  options: ValidateRuntimeConfigSchemaTargetsOptions = {},
): void {
  const ajv = new Ajv({
    strict: false,
    allErrors: false,
    ...options.ajvOptions,
  });
  const formatError = options.formatError ?? formatRuntimeConfigSchemaValidationError;

  for (const target of targets) {
    if (!existsSync(target.schemaPath) || !existsSync(target.configPath)) {
      continue;
    }

    const schema = readRequiredJsonFile<object>(target.schemaPath);
    const runtimeConfig = readRequiredJsonFile<object>(target.configPath);
    const validate = ajv.compile(schema);
    const isValid = validate(runtimeConfig);

    if (!isValid) {
      const validationError = validate.errors?.[0];
      if (validationError) {
        throw formatError(target, validationError);
      }

      throw new Error(
        `RuntimeConfig schema validation failed for "${target.scopeId}" (${target.configPath})`,
      );
    }
  }
}

export function loadRuntimeConfigTree(
  varDir: string,
  options: RuntimeConfigPathOptions = {},
): RuntimeConfigFragmentMap {
  const runtimeConfigDir: string = path.join(varDir, getRuntimeConfigDirName(options));
  const filePaths = collectRuntimeConfigFragmentFiles(runtimeConfigDir, options);

  return parseRuntimeConfigFragmentFiles(filePaths, runtimeConfigDir, options);
}

export function loadRuntimeConfigEnvVars(
  varDir: string,
  options: RuntimeConfigEnvFileOptions = {},
): RuntimeEnvVars {
  const { fileName, runtimeConfigDirName, ...envOptions } = options;

  return projectRuntimeConfigEnvVars(
    loadRuntimeConfigTree(varDir, {
      ...(fileName ? { fileName } : {}),
      ...(runtimeConfigDirName ? { runtimeConfigDirName } : {}),
    }),
    envOptions,
  );
}

export function loadRuntimeConfigShellAssignments(
  varDir: string,
  options: RuntimeConfigEnvFileOptions = {},
): string {
  return runtimeEnvVarsToShellAssignments(loadRuntimeConfigEnvVars(varDir, options));
}

export function listRuntimeConfigFragments(
  varDir: string,
  options: RuntimeConfigListOptions = {},
): RuntimeConfigListResult {
  const { contextInputKey, ...pathOptions } = options;
  const fragments = loadRuntimeConfigTree(varDir, pathOptions);
  const scopes = Array.from(fragments.entries())
    .map(([scopeId, config]) => {
      const fragment = contextInputKey
        ? toRuntimeConfigFragment(config, { contextInputKey })
        : config;

      return {
        contextIds: Object.keys(fragment.contexts ?? {}).sort(),
        path: resolveRuntimeConfigPaths(varDir, scopeId, pathOptions).filePath,
        privateKeys: Object.keys(config.private ?? {}).sort(),
        publicKeys: Object.keys(config.public ?? {}).sort(),
        scopeId,
      };
    })
    .sort((left, right) => left.scopeId.localeCompare(right.scopeId));

  return {
    fileName: getFileName(pathOptions),
    scopes,
    varDir,
  };
}

export function showRuntimeConfigFragment(
  varDir: string,
  scopeId: string,
  options: RuntimeConfigPathOptions = {},
): RuntimeConfigShowResult {
  const normalizedScopeId = scopeId.trim();
  const config = normalizedScopeId
    ? loadRuntimeConfigFragment(varDir, normalizedScopeId, options)
    : undefined;

  return {
    fileName: getFileName(options),
    path: resolveRuntimeConfigPaths(varDir, normalizedScopeId, options).filePath,
    scopeId: normalizedScopeId,
    varDir,
    exists: Boolean(config),
    ...(config ? { config } : {}),
  };
}

export function projectRuntimeConfigTree(
  varDir: string,
  options: RuntimeConfigProjectOptions = {},
): RuntimeConfigProjectResult {
  const fragments = loadRuntimeConfigTree(varDir, options);
  const scopeIds = options.scopeIds?.length
    ? options.scopeIds
    : Array.from(fragments.keys()).sort();

  return {
    fileName: getFileName(options),
    runtimeConfig: projectSectionedRuntimeConfig(fragments, {
      ...(options.contextInputKey ? { contextInputKey: options.contextInputKey } : {}),
      ...(options.contextOutputKey ? { contextOutputKey: options.contextOutputKey } : {}),
      scopeIds,
    }),
    scopeIds,
    varDir,
  };
}

export function getRuntimeConfigValue(
  varDir: string,
  scopeId: string,
  key: string,
  options: RuntimeConfigValueQueryOptions = {},
): RuntimeConfigValueResult {
  const normalizedScopeId = scopeId.trim();
  const normalizedKey = key.trim();
  const visibility = options.visibility ?? 'public';
  const runtimeConfig = projectRuntimeConfigTree(varDir, {
    ...options,
    scopeIds: normalizedScopeId ? [normalizedScopeId] : [],
  }).runtimeConfig;
  const value = resolveRuntimeConfigValueFromRuntimeConfig(
    runtimeConfig,
    normalizedScopeId,
    normalizedKey,
    {
      ...(options.contextId ? { contextId: options.contextId } : {}),
      ...(options.contextOutputKey ? { contextOutputKey: options.contextOutputKey } : {}),
      visibility,
    },
  );

  return {
    fileName: getFileName(options),
    key: normalizedKey,
    scopeId: normalizedScopeId,
    varDir,
    visibility,
    ...(options.contextId ? { contextId: options.contextId } : {}),
    exists: value !== undefined,
    ...(value !== undefined ? { value } : {}),
  };
}

export function getRuntimeConfigScopeView(
  varDir: string,
  scopeId: string,
  options: RuntimeConfigScopeViewOptions = {},
): RuntimeConfigScopeViewResult {
  const normalizedScopeId = scopeId.trim();
  const visibility = options.visibility ?? 'public';
  const runtimeConfig = projectRuntimeConfigTree(varDir, {
    ...options,
    scopeIds: normalizedScopeId ? [normalizedScopeId] : [],
  }).runtimeConfig;
  const scopeOptions: GetRuntimeConfigScopeOptions = {
    ...(options.contextId ? { contextId: options.contextId } : {}),
    ...(options.contextOutputKey ? { contextOutputKey: options.contextOutputKey } : {}),
    visibility,
  };

  return {
    config: getRuntimeConfigScope(runtimeConfig, normalizedScopeId, scopeOptions),
    fileName: getFileName(options),
    scopeId: normalizedScopeId,
    varDir,
    visibility,
    ...(options.contextId ? { contextId: options.contextId } : {}),
  };
}

export function validateRuntimeConfigScopes(
  varDir: string,
  targets: RuntimeConfigSchemaTargetInput[],
  options: ValidateRuntimeConfigScopesOptions = {},
): RuntimeConfigValidateResult {
  const schemaFileName = getSchemaFileName(options);
  const result: RuntimeConfigValidateResult = {
    fileName: getFileName(options),
    skipped: [],
    validated: [],
    varDir,
  };

  for (const target of targets) {
    const scopeId = target.scopeId.trim();
    if (!scopeId) continue;

    const configPath = resolveRuntimeConfigPaths(varDir, scopeId, options).filePath;
    const schemaPath = target.cwd ? path.resolve(target.cwd, schemaFileName) : undefined;

    if (!target.cwd || !schemaPath) {
      result.skipped.push({ configPath, reason: 'missing-scope-dir', scopeId });
      continue;
    }

    if (!existsSync(configPath)) {
      result.skipped.push({ configPath, reason: 'missing-config', schemaPath, scopeId });
      continue;
    }

    if (!existsSync(schemaPath)) {
      result.skipped.push({ configPath, reason: 'missing-schema', schemaPath, scopeId });
      continue;
    }

    result.validated.push({ configPath, schemaPath, scopeId });
  }

  validateRuntimeConfigSchemaTargets(result.validated, {
    ...(options.formatError ? { formatError: options.formatError } : {}),
  });

  return result;
}

export function validateRuntimeConfigSourceScopes(
  source: RuntimeConfigPathPatternSource,
  targets: RuntimeConfigSchemaTargetInput[],
  options: ValidateRuntimeConfigPatternSourceScopesOptions = {},
): RuntimeConfigValidateResult {
  const schemaFileName = getSchemaFileName(options);
  const filesByScope = new Map<string, string>();
  const result: RuntimeConfigValidateResult = {
    fileName: source.paths[0] ?? '',
    skipped: [],
    validated: [],
    varDir: '',
  };

  for (const file of resolveRuntimeConfigSourceFiles(source)) {
    filesByScope.set(file.scopeId, file.configPath);
  }

  for (const target of targets) {
    const scopeId = target.scopeId.trim();
    if (!scopeId) continue;

    const configPath = filesByScope.get(scopeId);
    const schemaPath = target.cwd ? path.resolve(target.cwd, schemaFileName) : undefined;

    if (!target.cwd || !schemaPath) {
      result.skipped.push({
        ...(configPath ? { configPath } : {}),
        reason: 'missing-scope-dir',
        scopeId,
      });
      continue;
    }

    if (!configPath) {
      result.skipped.push({ reason: 'missing-config', schemaPath, scopeId });
      continue;
    }

    if (!existsSync(schemaPath)) {
      result.skipped.push({ configPath, reason: 'missing-schema', schemaPath, scopeId });
      continue;
    }

    result.validated.push({ configPath, schemaPath, scopeId });
  }

  validateRuntimeConfigSchemaTargets(result.validated, {
    ...(options.formatError ? { formatError: options.formatError } : {}),
  });

  return result;
}
