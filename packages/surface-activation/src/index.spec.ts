import { describe, expect, it } from 'vitest';

import {
  capabilitySpecifier,
  conventionActivation,
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
