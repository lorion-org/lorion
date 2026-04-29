import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  collectRuntimeConfigFragmentFiles,
  ensureParentDir,
  listRuntimeConfigScopeFiles,
  listRuntimeConfigFragments,
  loadRuntimeConfigEnvVars,
  loadRuntimeConfigFragment,
  loadRuntimeConfigShellAssignments,
  loadRuntimeConfigSourceTree,
  loadRuntimeConfigTree,
  projectRuntimeConfigTree,
  parseRuntimeConfigFragmentFiles,
  readJsonFile,
  readRuntimeConfigScopeJson,
  readRequiredJsonFile,
  readTextFile,
  resolveRuntimeConfigPublicFilePath,
  resolveRuntimeConfigPublicRootPath,
  resolveRuntimeConfigFilePath,
  resolveRuntimeConfigPaths,
  resolveRuntimeConfigScopeFilePath,
  resolveRuntimeConfigSource,
  resolveRuntimeConfigSourceFiles,
  resolveRuntimeConfigSourcePublicRootPath,
  showRuntimeConfigFragment,
  getRuntimeConfigValue,
  getRuntimeConfigScopeView,
  validateRuntimeConfigScopes,
  validateRuntimeConfigSourceScopes,
  validateRuntimeConfigSchemaTargets,
  writeJsonFile,
  writeRuntimeConfigScopeJson,
  writeRuntimeConfigFragment,
  writeTextFile,
} from './index';

let tmpRoot: string | undefined;

function createTempRoot(): string {
  tmpRoot = mkdtempSync(path.join(tmpdir(), 'runtime-config-node-'));
  return tmpRoot;
}

function writeJson(filePath: string, value: unknown): void {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

afterEach(() => {
  if (!tmpRoot) return;

  rmSync(tmpRoot, { recursive: true, force: true });
  tmpRoot = undefined;
});

describe('file helpers', () => {
  it('reads and writes text files with parent directory creation', () => {
    const varDir = createTempRoot();
    const filePath = path.join(varDir, 'nested', 'value.txt');

    writeTextFile(filePath, 'hello');

    expect(readTextFile(filePath)).toBe('hello');
    expect(readTextFile(path.join(varDir, 'missing.txt'))).toBeUndefined();
  });

  it('reads and writes JSON files with fallback on parse errors', () => {
    const varDir = createTempRoot();
    const filePath = path.join(varDir, 'nested', 'value.json');
    const brokenFilePath = path.join(varDir, 'broken.json');
    const errors: string[] = [];

    writeJsonFile(filePath, { public: { apiBase: '/api/billing' } });
    writeFileSync(brokenFilePath, '{', 'utf8');

    expect(readJsonFile(filePath)).toEqual({ public: { apiBase: '/api/billing' } });
    expect(readRequiredJsonFile(filePath)).toEqual({ public: { apiBase: '/api/billing' } });
    expect(
      readJsonFile(brokenFilePath, {
        defaultValue: { public: {} },
        onParseError: (_error, failedPath) => errors.push(failedPath),
      }),
    ).toEqual({ public: {} });
    expect(errors).toEqual([brokenFilePath]);
    expect(() => readRequiredJsonFile(brokenFilePath)).toThrowError(
      /RuntimeConfig JSON parse error/,
    );
  });

  it('reads JSON files with a UTF-8 BOM', () => {
    const varDir = createTempRoot();
    const filePath = path.join(varDir, 'bom.json');

    writeFileSync(
      filePath,
      `\uFEFF${JSON.stringify({ public: { apiBase: '/api/billing' } })}`,
      'utf8',
    );

    expect(readJsonFile(filePath)).toEqual({ public: { apiBase: '/api/billing' } });
    expect(readRequiredJsonFile(filePath)).toEqual({ public: { apiBase: '/api/billing' } });
  });

  it('can ensure a parent directory without writing content', () => {
    const varDir = createTempRoot();
    const filePath = path.join(varDir, 'nested', 'value.txt');

    ensureParentDir(filePath);

    expect(existsSync(path.dirname(filePath))).toBe(true);
  });
});

describe('resolveRuntimeConfigPaths', () => {
  it('returns stable runtime-config paths for a scope', () => {
    const paths = resolveRuntimeConfigPaths('/var/app', 'billing');

    expect(paths.varDir).toBe('/var/app');
    expect(paths.runtimeConfigDir).toBe(path.join('/var/app', 'runtime-config'));
    expect(paths.scopeDir).toBe(path.join('/var/app', 'runtime-config', 'billing'));
    expect(paths.filePath).toBe(
      path.join('/var/app', 'runtime-config', 'billing', 'runtime.config.json'),
    );
  });

  it('supports custom runtime-config directory and file names', () => {
    const paths = resolveRuntimeConfigPaths('/var/app', 'billing', {
      fileName: 'scope.config.json',
      runtimeConfigDirName: 'runtime',
    });

    expect(paths.runtimeConfigDir).toBe(path.join('/var/app', 'runtime'));
    expect(paths.filePath).toBe(path.join('/var/app', 'runtime', 'billing', 'scope.config.json'));
  });
});

describe('resolveRuntimeConfigSource', () => {
  it('resolves a source from explicit values or an environment key', () => {
    expect(
      resolveRuntimeConfigSource({
        env: {
          APP_VAR_DIR: '/var/app',
        },
        envKey: 'APP_VAR_DIR',
        fileName: 'scope.config.json',
      }),
    ).toEqual({
      fileName: 'scope.config.json',
      varDir: '/var/app',
    });
    expect(
      resolveRuntimeConfigSource({
        defaultVarDir: '/var/default',
      }),
    ).toEqual({
      varDir: '/var/default',
    });
    expect(() => resolveRuntimeConfigSource()).toThrowError(/RuntimeConfig varDir not found/);
  });
});

describe('resolveRuntimeConfigFilePath', () => {
  it('resolves arbitrary files inside a scope directory', () => {
    expect(resolveRuntimeConfigFilePath('/var/app', 'billing', 'schema.json')).toBe(
      path.join('/var/app', 'runtime-config', 'billing', 'schema.json'),
    );
  });
});

describe('scope and public file helpers', () => {
  it('reads and writes arbitrary JSON files inside a scope directory', () => {
    const varDir = createTempRoot();
    const source = {
      varDir,
    };

    writeRuntimeConfigScopeJson(source, 'billing', 'settings.json', {
      apiBase: '/api/billing',
    });

    expect(resolveRuntimeConfigScopeFilePath(source, 'billing', 'settings.json')).toBe(
      path.join(varDir, 'runtime-config', 'billing', 'settings.json'),
    );
    expect(readRuntimeConfigScopeJson(source, 'billing', 'settings.json')).toEqual({
      apiBase: '/api/billing',
    });
  });

  it('resolves public runtime config paths from the same source convention', () => {
    const varDir = path.resolve('/var/app');
    const source = {
      varDir,
      runtimeConfigDirName: 'runtime',
    };

    expect(resolveRuntimeConfigPublicRootPath(source)).toBe(path.join(varDir, 'runtime', 'public'));
    expect(resolveRuntimeConfigPublicFilePath(source, 'billing/logo.svg')).toBe(
      path.join(varDir, 'runtime', 'public', 'billing', 'logo.svg'),
    );
  });
});

describe('listRuntimeConfigScopeFiles', () => {
  it('lists files in a scope subdirectory with optional extension filtering', () => {
    const varDir = createTempRoot();
    const docsDir = path.join(varDir, 'runtime-config', 'billing', 'docs');
    mkdirSync(docsDir, { recursive: true });
    writeFileSync(path.join(docsDir, 'guide.md'), '# Guide', 'utf8');
    writeFileSync(path.join(docsDir, 'schema.json'), '{}', 'utf8');

    expect(listRuntimeConfigScopeFiles(varDir, 'billing', 'docs')).toEqual([
      'guide.md',
      'schema.json',
    ]);
    expect(listRuntimeConfigScopeFiles(varDir, 'billing', 'docs', { extension: '.json' })).toEqual([
      'schema.json',
    ]);
    expect(listRuntimeConfigScopeFiles(varDir, 'billing', 'missing')).toEqual([]);
  });
});

describe('loadRuntimeConfigFragment', () => {
  it('loads runtime.config.json from one scope directory', () => {
    const varDir = createTempRoot();
    const scopeDir = path.join(varDir, 'runtime-config', 'billing');
    mkdirSync(scopeDir, { recursive: true });
    writeJson(path.join(scopeDir, 'runtime.config.json'), {
      public: {
        apiBase: '/api/billing',
      },
    });

    expect(loadRuntimeConfigFragment(varDir, 'billing')).toEqual({
      public: {
        apiBase: '/api/billing',
      },
    });
  });

  it('returns undefined when the scope has no runtime config file', () => {
    const varDir = createTempRoot();
    mkdirSync(path.join(varDir, 'runtime-config', 'billing'), { recursive: true });

    expect(loadRuntimeConfigFragment(varDir, 'billing')).toBeUndefined();
  });

  it('loads a fragment with a custom file name', () => {
    const varDir = createTempRoot();
    const scopeDir = path.join(varDir, 'runtime-config', 'billing');
    mkdirSync(scopeDir, { recursive: true });
    writeJson(path.join(scopeDir, 'scope.config.json'), {
      public: {
        apiBase: '/api/billing',
      },
    });

    expect(
      loadRuntimeConfigFragment(varDir, 'billing', {
        fileName: 'scope.config.json',
      }),
    ).toEqual({
      public: {
        apiBase: '/api/billing',
      },
    });
  });
});

describe('writeRuntimeConfigFragment', () => {
  it('writes a runtime config fragment to the configured file name', () => {
    const varDir = createTempRoot();

    writeRuntimeConfigFragment(varDir, 'billing', {
      public: {
        apiBase: '/api/billing',
      },
    });

    expect(loadRuntimeConfigFragment(varDir, 'billing')).toEqual({
      public: {
        apiBase: '/api/billing',
      },
    });
  });
});

describe('collectRuntimeConfigFragmentFiles', () => {
  it('collects runtime config files recursively', () => {
    const varDir = createTempRoot();
    const runtimeConfigDir = path.join(varDir, 'runtime-config');
    mkdirSync(path.join(runtimeConfigDir, 'domains', 'billing'), { recursive: true });
    mkdirSync(path.join(runtimeConfigDir, 'mail'), { recursive: true });
    writeJson(path.join(runtimeConfigDir, 'domains', 'billing', 'runtime.config.json'), {});
    writeJson(path.join(runtimeConfigDir, 'mail', 'runtime.config.json'), {});

    expect(collectRuntimeConfigFragmentFiles(runtimeConfigDir)).toEqual([
      path.join(runtimeConfigDir, 'domains', 'billing', 'runtime.config.json'),
      path.join(runtimeConfigDir, 'mail', 'runtime.config.json'),
    ]);
  });
});

describe('parseRuntimeConfigFragmentFiles', () => {
  it('parses runtime config files into a scope map', () => {
    const varDir = createTempRoot();
    const runtimeConfigDir = path.join(varDir, 'runtime-config');
    const filePath = path.join(runtimeConfigDir, 'domains', 'billing', 'runtime.config.json');
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeJson(filePath, {
      public: {
        apiBase: '/api/billing',
      },
    });

    expect(parseRuntimeConfigFragmentFiles([filePath], runtimeConfigDir)).toEqual(
      new Map([
        [
          'domains/billing',
          {
            public: {
              apiBase: '/api/billing',
            },
          },
        ],
      ]),
    );
  });
});

describe('loadRuntimeConfigTree', () => {
  it('loads all scope directories that contain runtime.config.json', () => {
    const varDir = createTempRoot();
    const runtimeConfigDir = path.join(varDir, 'runtime-config');
    mkdirSync(path.join(runtimeConfigDir, 'domains', 'billing'), { recursive: true });
    mkdirSync(path.join(runtimeConfigDir, 'mail'), { recursive: true });
    mkdirSync(path.join(runtimeConfigDir, 'empty'), { recursive: true });
    writeJson(path.join(runtimeConfigDir, 'domains', 'billing', 'runtime.config.json'), {
      public: {
        apiBase: '/api/billing',
      },
    });
    writeJson(path.join(runtimeConfigDir, 'mail', 'runtime.config.json'), {
      public: {
        apiBase: '/api/mail',
      },
    });

    const fragments = loadRuntimeConfigTree(varDir);

    expect(fragments).toEqual(
      new Map([
        [
          'domains/billing',
          {
            public: {
              apiBase: '/api/billing',
            },
          },
        ],
        [
          'mail',
          {
            public: {
              apiBase: '/api/mail',
            },
          },
        ],
      ]),
    );
  });

  it('returns an empty map when the runtime-config directory is missing', () => {
    expect(loadRuntimeConfigTree(createTempRoot())).toEqual(new Map());
  });
});

describe('path pattern runtime config sources', () => {
  it('resolves source files and scope ids from a single-wildcard path pattern', () => {
    const varDir = createTempRoot();
    const billingConfig = path.join(
      varDir,
      '.runtimeconfig',
      'runtime-config',
      'billing',
      'runtime.config.json',
    );
    const mailConfig = path.join(
      varDir,
      '.runtimeconfig',
      'runtime-config',
      'domains',
      'mail',
      'runtime.config.json',
    );
    const source = {
      paths: [
        path.join(varDir, '.runtimeconfig', 'runtime-config', '*', 'runtime.config.json'),
        path.join(
          varDir,
          '.runtimeconfig',
          'runtime-config',
          'domains',
          '*',
          'runtime.config.json',
        ),
      ],
    };

    mkdirSync(path.dirname(billingConfig), { recursive: true });
    mkdirSync(path.dirname(mailConfig), { recursive: true });
    writeJson(billingConfig, { public: { apiBase: '/api/billing' } });
    writeJson(mailConfig, { public: { apiBase: '/api/mail' } });

    expect(resolveRuntimeConfigSourceFiles(source)).toEqual([
      {
        configPath: billingConfig,
        pattern: source.paths[0],
        scopeId: 'billing',
      },
      {
        configPath: mailConfig,
        pattern: source.paths[1],
        scopeId: 'mail',
      },
    ]);
    expect(resolveRuntimeConfigSourcePublicRootPath(source)).toBe(
      path.join(varDir, '.runtimeconfig', 'runtime-config', 'public'),
    );
  });

  it('loads source fragments from path patterns', () => {
    const varDir = createTempRoot();
    const source = {
      paths: [path.join(varDir, 'runtime-config', '*', 'runtime.config.json')],
    };

    mkdirSync(path.join(varDir, 'runtime-config', 'billing'), { recursive: true });
    writeJson(path.join(varDir, 'runtime-config', 'billing', 'runtime.config.json'), {
      public: {
        apiBase: '/api/billing',
      },
    });

    expect(loadRuntimeConfigSourceTree(source)).toEqual(
      new Map([
        [
          'billing',
          {
            public: {
              apiBase: '/api/billing',
            },
          },
        ],
      ]),
    );
  });

  it('validates source scopes against real resolved config files', () => {
    const varDir = createTempRoot();
    const billingDir = path.join(varDir, 'billing');
    const mailDir = path.join(varDir, 'mail');
    const source = {
      paths: [path.join(varDir, 'runtime-config', '*', 'runtime.config.json')],
    };

    mkdirSync(path.join(varDir, 'runtime-config', 'billing'), { recursive: true });
    mkdirSync(billingDir, { recursive: true });
    mkdirSync(mailDir, { recursive: true });
    writeJson(path.join(varDir, 'runtime-config', 'billing', 'runtime.config.json'), {
      public: {
        apiBase: '/api/billing',
      },
    });
    writeJson(path.join(billingDir, 'scope.schema.json'), {
      type: 'object',
      properties: {
        public: {
          type: 'object',
          properties: {
            apiBase: { type: 'string' },
          },
        },
      },
    });

    expect(
      validateRuntimeConfigSourceScopes(
        source,
        [
          { scopeId: 'billing', cwd: billingDir },
          { scopeId: 'mail', cwd: mailDir },
          { scopeId: 'missing' },
        ],
        {
          schemaFileName: 'scope.schema.json',
        },
      ),
    ).toEqual({
      fileName: source.paths[0],
      skipped: [
        {
          reason: 'missing-config',
          schemaPath: path.join(mailDir, 'scope.schema.json'),
          scopeId: 'mail',
        },
        {
          reason: 'missing-scope-dir',
          scopeId: 'missing',
        },
      ],
      validated: [
        {
          configPath: path.join(varDir, 'runtime-config', 'billing', 'runtime.config.json'),
          schemaPath: path.join(billingDir, 'scope.schema.json'),
          scopeId: 'billing',
        },
      ],
      varDir: '',
    });
  });
});

describe('runtime config env output', () => {
  it('loads runtime config fragments and renders env vars', () => {
    const varDir = createTempRoot();
    const runtimeConfigDir = path.join(varDir, 'runtime-config');
    mkdirSync(path.join(runtimeConfigDir, 'billing'), { recursive: true });
    writeJson(path.join(runtimeConfigDir, 'billing', 'runtime.config.json'), {
      public: {
        apiBase: '/api/billing',
      },
      private: {
        token: 'secret',
      },
      tenants: {
        tenantA: {
          public: {
            apiBase: '/tenant-a/billing',
          },
        },
      },
    });

    expect(
      loadRuntimeConfigEnvVars(varDir, {
        contextInputKey: 'tenants',
        prefix: 'NUXT',
      }),
    ).toEqual({
      NUXT_PUBLIC_BILLING_API_BASE: '/api/billing',
      NUXT_PRIVATE_BILLING_TOKEN: 'secret',
    });
    expect(
      loadRuntimeConfigShellAssignments(varDir, {
        prefix: 'NUXT',
      }),
    ).toContain('NUXT_PUBLIC_BILLING_API_BASE');
  });
});

describe('runtime config tree queries', () => {
  it('lists and shows scope fragments', () => {
    const varDir = createTempRoot();
    const scopeDir = path.join(varDir, 'runtime-config', 'billing');
    mkdirSync(scopeDir, { recursive: true });
    writeJson(path.join(scopeDir, 'runtime.config.json'), {
      public: {
        apiBase: '/api/billing',
      },
      private: {
        token: 'secret',
      },
      contexts: {
        tenantA: {
          public: {
            apiBase: '/tenant-a/billing',
          },
        },
      },
    });

    expect(listRuntimeConfigFragments(varDir)).toEqual({
      fileName: 'runtime.config.json',
      scopes: [
        {
          contextIds: ['tenantA'],
          path: path.join(varDir, 'runtime-config', 'billing', 'runtime.config.json'),
          privateKeys: ['token'],
          publicKeys: ['apiBase'],
          scopeId: 'billing',
        },
      ],
      varDir,
    });
    expect(showRuntimeConfigFragment(varDir, 'billing')).toMatchObject({
      scopeId: 'billing',
      exists: true,
      config: {
        public: {
          apiBase: '/api/billing',
        },
      },
    });
  });

  it('lists contexts from a custom context input key', () => {
    const varDir = createTempRoot();
    const scopeDir = path.join(varDir, 'runtime-config', 'billing');
    mkdirSync(scopeDir, { recursive: true });
    writeJson(path.join(scopeDir, 'runtime.config.json'), {
      public: {
        apiBase: '/api/billing',
      },
      tenants: {
        tenantA: {
          public: {
            apiBase: '/tenant-a/billing',
          },
        },
      },
    });

    expect(
      listRuntimeConfigFragments(varDir, {
        contextInputKey: 'tenants',
      }),
    ).toEqual({
      fileName: 'runtime.config.json',
      scopes: [
        {
          contextIds: ['tenantA'],
          path: path.join(varDir, 'runtime-config', 'billing', 'runtime.config.json'),
          privateKeys: [],
          publicKeys: ['apiBase'],
          scopeId: 'billing',
        },
      ],
      varDir,
    });
  });

  it('projects scope fragments and resolves values from the tree', () => {
    const varDir = createTempRoot();
    const scopeDir = path.join(varDir, 'runtime-config', 'billing');
    mkdirSync(scopeDir, { recursive: true });
    writeJson(path.join(scopeDir, 'runtime.config.json'), {
      public: {
        apiBase: '/api/billing',
      },
      private: {
        token: 'secret',
      },
      contexts: {
        tenantA: {
          public: {
            apiBase: '/tenant-a/billing',
          },
        },
      },
    });

    expect(
      projectRuntimeConfigTree(varDir, {
        contextOutputKey: '__tenants',
      }),
    ).toEqual({
      fileName: 'runtime.config.json',
      runtimeConfig: {
        public: {
          billingApiBase: '/api/billing',
          __tenants: {
            tenantA: {
              billingApiBase: '/tenant-a/billing',
            },
          },
        },
        private: {
          billingToken: 'secret',
        },
      },
      scopeIds: ['billing'],
      varDir,
    });
    expect(
      getRuntimeConfigValue(varDir, 'billing', 'apiBase', {
        contextId: 'tenantA',
        contextOutputKey: '__tenants',
      }),
    ).toMatchObject({
      scopeId: 'billing',
      key: 'apiBase',
      visibility: 'public',
      value: '/tenant-a/billing',
    });
    expect(
      getRuntimeConfigScopeView(varDir, 'billing', {
        visibility: 'private',
      }),
    ).toMatchObject({
      config: {
        token: 'secret',
      },
    });
  });
});

describe('validateRuntimeConfigScopes', () => {
  it('reports validated and skipped generic scope targets', () => {
    const varDir = createTempRoot();
    const billingDir = path.join(varDir, 'billing');
    const mailDir = path.join(varDir, 'mail');
    mkdirSync(path.join(varDir, 'runtime-config', 'billing'), { recursive: true });
    mkdirSync(billingDir, { recursive: true });
    mkdirSync(mailDir, { recursive: true });
    writeJson(path.join(varDir, 'runtime-config', 'billing', 'runtime.config.json'), {
      public: {
        apiBase: '/api/billing',
      },
    });
    writeJson(path.join(billingDir, 'scope.schema.json'), {
      type: 'object',
      properties: {
        public: {
          type: 'object',
          properties: {
            apiBase: { type: 'string' },
          },
        },
      },
    });

    expect(
      validateRuntimeConfigScopes(
        varDir,
        [
          { scopeId: 'billing', cwd: billingDir },
          { scopeId: 'mail', cwd: mailDir },
          { scopeId: 'missing' },
        ],
        {
          schemaFileName: 'scope.schema.json',
        },
      ),
    ).toEqual({
      fileName: 'runtime.config.json',
      skipped: [
        {
          configPath: path.join(varDir, 'runtime-config', 'mail', 'runtime.config.json'),
          reason: 'missing-config',
          schemaPath: path.join(mailDir, 'scope.schema.json'),
          scopeId: 'mail',
        },
        {
          configPath: path.join(varDir, 'runtime-config', 'missing', 'runtime.config.json'),
          reason: 'missing-scope-dir',
          scopeId: 'missing',
        },
      ],
      validated: [
        {
          configPath: path.join(varDir, 'runtime-config', 'billing', 'runtime.config.json'),
          schemaPath: path.join(billingDir, 'scope.schema.json'),
          scopeId: 'billing',
        },
      ],
      varDir,
    });
  });
});

describe('validateRuntimeConfigSchemaTargets', () => {
  it('passes when runtime config matches its schema', () => {
    const varDir = createTempRoot();
    const schemaPath = path.join(varDir, 'billing.schema.json');
    const configPath = path.join(varDir, 'billing.runtime.json');
    writeJson(schemaPath, {
      type: 'object',
      properties: {
        public: {
          type: 'object',
          properties: {
            apiBase: { type: 'string' },
          },
          required: ['apiBase'],
        },
      },
      required: ['public'],
    });
    writeJson(configPath, {
      public: {
        apiBase: '/api/billing',
      },
    });

    expect(() =>
      validateRuntimeConfigSchemaTargets([
        {
          configPath,
          schemaPath,
          scopeId: 'billing',
        },
      ]),
    ).not.toThrow();
  });

  it('throws a formatted error when runtime config does not match its schema', () => {
    const varDir = createTempRoot();
    const schemaPath = path.join(varDir, 'billing.schema.json');
    const configPath = path.join(varDir, 'billing.runtime.json');
    writeJson(schemaPath, {
      type: 'object',
      properties: {
        private: {
          type: 'object',
          properties: {
            timeout: { type: 'integer' },
          },
          required: ['timeout'],
        },
      },
      required: ['private'],
    });
    writeJson(configPath, {
      private: {
        timeout: 'wrong-type',
      },
    });

    expect(() =>
      validateRuntimeConfigSchemaTargets([
        {
          configPath,
          schemaPath,
          scopeId: 'billing',
        },
      ]),
    ).toThrowError(/Scope: billing/);
  });

  it('can use adapter-provided error formatting', () => {
    const varDir = createTempRoot();
    const schemaPath = path.join(varDir, 'mail.schema.json');
    const configPath = path.join(varDir, 'mail.runtime.json');
    writeJson(schemaPath, {
      type: 'object',
      required: ['public'],
    });
    writeJson(configPath, {});

    expect(() =>
      validateRuntimeConfigSchemaTargets(
        [
          {
            configPath,
            schemaPath,
            scopeId: 'mail',
          },
        ],
        {
          formatError: (target) => new Error(`Adapter failed: ${target.scopeId}`),
        },
      ),
    ).toThrowError('Adapter failed: mail');
  });
});
