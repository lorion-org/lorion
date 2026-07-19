import { describe, expect, it } from 'vitest';

import {
  capabilitySpecifier,
  conventionActivation,
  fileSurfaceConvention,
  resolveSurfaceModules,
  type SurfaceCapability,
} from './index';

function camelCase(id: string): string {
  return id.replace(/-([a-z])/g, (_match, char: string) => char.toUpperCase());
}

describe('conventionActivation', () => {
  it('derives activation from a surface marker and export-name convention', () => {
    const activation = conventionActivation({
      web: {
        marker: (directory) => directory.endsWith('auth-oidc'),
        exportName: (id) => `${camelCase(id)}WebPlugin`,
        exportSubpath: './web',
      },
    });

    expect(activation('web', { directory: '/caps/auth-oidc', id: 'auth-oidc' })).toEqual({
      exportSubpath: './web',
      exportName: 'authOidcWebPlugin',
    });
  });

  it('returns undefined for a missing marker or an unknown surface', () => {
    const activation = conventionActivation({
      web: { marker: () => false, exportName: (id) => `${id}WebPlugin`, exportSubpath: './web' },
    });

    expect(activation('web', { directory: '/nope', id: 'dashboard' })).toBeUndefined();
    expect(activation('server', { directory: '/anything', id: 'dashboard' })).toBeUndefined();
  });
});

describe('fileSurfaceConvention', () => {
  it('builds a convention: any marker file present, camelCase(id)+suffix export name', () => {
    const present = new Set(['/caps/auth-oidc/src/web.tsx']);
    const convention = fileSurfaceConvention({
      files: ['src/web.ts', 'src/web.tsx'],
      exportSuffix: 'WebPlugin',
      exportSubpath: './web',
      exists: (path) => present.has(path),
    });

    expect(convention.marker('/caps/auth-oidc')).toBe(true);
    expect(convention.marker('/caps/none')).toBe(false);
    expect(convention.exportName('auth-oidc')).toBe('authOidcWebPlugin');
    expect(convention.exportSubpath).toBe('./web');
  });

  it('defaults the suffix to empty and joins with a POSIX separator', () => {
    const seen: string[] = [];
    const convention = fileSurfaceConvention({
      files: ['server.mjs'],
      exportSubpath: './server',
      exists: (path) => {
        seen.push(path);
        return false;
      },
    });

    convention.marker('/caps/dashboard');
    expect(seen).toEqual(['/caps/dashboard/server.mjs']);
    expect(convention.exportName('dashboard')).toBe('dashboard');
  });

  it('honours a custom join', () => {
    const convention = fileSurfaceConvention({
      files: ['src\\web.ts'],
      exportSubpath: './web',
      exists: (path) => path === 'C:\\caps\\home\\src\\web.ts',
      join: (directory, file) => `${directory}\\${file}`,
    });

    expect(convention.marker('C:\\caps\\home')).toBe(true);
  });

  it('derives valid identifier fragments from non-strict-kebab ids', () => {
    const convention = fileSurfaceConvention({
      files: ['x'],
      exportSuffix: 'WebPlugin',
      exportSubpath: './web',
      exists: () => true,
    });

    // hyphen-run collapse, digit after hyphen, leading/trailing hyphen trim.
    expect(convention.exportName('auth-oidc')).toBe('authOidcWebPlugin');
    expect(convention.exportName('auth-2fa')).toBe('auth2faWebPlugin');
    expect(convention.exportName('foo--bar')).toBe('fooBarWebPlugin');
    expect(convention.exportName('foo-')).toBe('fooWebPlugin');
    expect(convention.exportName('-foo')).toBe('fooWebPlugin');
    expect(convention.exportName('a-9')).toBe('a9WebPlugin');
  });

  it('never activates when the marker file list is empty', () => {
    const convention = fileSurfaceConvention({
      files: [],
      exportSubpath: './web',
      exists: () => true,
    });

    expect(convention.marker('/anything')).toBe(false);
  });

  it('composes with conventionActivation as a drop-in surface', () => {
    const activation = conventionActivation({
      web: fileSurfaceConvention({
        files: ['src/web.ts'],
        exportSuffix: 'WebPlugin',
        exportSubpath: './web',
        exists: (path) => path === '/caps/dashboard/src/web.ts',
      }),
    });

    expect(activation('web', { directory: '/caps/dashboard', id: 'dashboard' })).toEqual({
      exportSubpath: './web',
      exportName: 'dashboardWebPlugin',
    });
    expect(activation('web', { directory: '/caps/tokens', id: 'tokens' })).toBeUndefined();
  });
});

describe('capabilitySpecifier', () => {
  it('joins the package name with the export subpath, dropping a leading dot', () => {
    expect(capabilitySpecifier('@demo/dashboard', './web')).toBe('@demo/dashboard/web');
    expect(capabilitySpecifier('@demo/dashboard', './capability')).toBe(
      '@demo/dashboard/capability',
    );
  });
});

describe('resolveSurfaceModules', () => {
  it('maps active surface capabilities to a static specifier and export name', () => {
    const web = new Set(['platform', 'dashboard']);
    const active: SurfaceCapability[] = [
      { id: 'platform', directory: '/caps/platform', packageName: '@demo/platform' },
      { id: 'dashboard', directory: '/caps/dashboard', packageName: '@demo/dashboard' },
      { id: 'tokens', directory: '/caps/tokens', packageName: '@demo/tokens' },
    ];
    const activation = conventionActivation({
      web: {
        marker: (directory) => web.has(directory.split('/').pop() ?? ''),
        exportName: (id) => `${camelCase(id)}WebPlugin`,
        exportSubpath: './web',
      },
    });

    const modules = resolveSurfaceModules(active, 'web', activation);

    // tokens has no web surface and is skipped.
    expect(modules.map((entry) => entry.specifier).sort()).toEqual([
      '@demo/dashboard/web',
      '@demo/platform/web',
    ]);
    const dashboard = modules.find((entry) => entry.capability.id === 'dashboard');
    expect(dashboard?.exportName).toBe('dashboardWebPlugin');
  });

  it('preserves the original capability item on each resolved module', () => {
    const active = [{ id: 'web', directory: '/caps/web', packageName: '@demo/web' }];
    const activation = conventionActivation({
      web: { marker: () => true, exportName: () => 'webPlugin', exportSubpath: './web' },
    });

    const [entry] = resolveSurfaceModules(active, 'web', activation);
    expect(entry?.capability.id).toBe('web');
  });
});
