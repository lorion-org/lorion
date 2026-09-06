import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// The snippet is the documented playground: a workspace host over two checkouts,
// with what it prints written next to each call. Running it here holds those lines
// to what the packages actually produce, so the documentation cannot drift from the
// behaviour while both still typecheck.
const printed: unknown[][] = [];

beforeAll(async () => {
  const log = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    printed.push(args);
  });
  // Reached through a variable so the specifier stays out of this package's
  // compilation: snippets are type-checked by `pnpm snippets:check`, against the
  // published entry points rather than the sources this `rootDir` covers.
  const snippet = '../snippets/workspace-composition.ts';
  await import(snippet);
  log.mockRestore();
});

afterAll(() => {
  printed.length = 0;
});

describe('the workspace composition snippet', () => {
  it('reads the contributions its comment names', () => {
    expect(printed[0]?.[0]).toEqual([
      { from: 'reports', to: 'dashboard', point: 'panel' },
      { from: 'audit-log', to: 'dashboard', point: 'panel' },
    ]);
  });

  it('prints the origin rows its comment names', () => {
    expect(printed[1]?.[0]).toBe(
      [
        '  Named         audit-log',
        '  Base          platform',
        '  Groupings     back-office',
        '  auth          auth-local (not named by this run) (instead of auth-oidc)',
        '  Via groupings dashboard, reports',
        '  Pulled        tokens',
      ].join('\n'),
    );
  });

  it('projects and loads the surface across both checkouts', () => {
    expect(printed[2]?.[0]).toEqual([
      '@demo/audit-log/server',
      '@demo/auth-local/server',
      '@demo/dashboard/server',
      '@demo/platform/server',
      '@demo/reports/server',
    ]);
    expect(printed[3]?.[0]).toEqual([
      'audit-log',
      'auth-local',
      'dashboard',
      'platform',
      'reports',
    ]);
  });
});
