import cases from '../../../examples/tests/contribution-cases.json';
import { runInNewContext } from 'node:vm';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ContributionError,
  createContributionRuntime,
  type ContributionRuntime,
} from '@lorion-org/contributions';
import { capabilityLoader, lorionReact } from './vite';
const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'lorion-contributions-react-'));
  roots.push(root);
  for (const [dir, id, version, exported] of [
    ['a', 'a', '1.0.0', true],
    ['b', 'b', '1.0.0', false],
    ['a-next', 'a', '2.0.0', true],
  ] as const) {
    const cwd = join(root, 'capabilities', dir);
    mkdirSync(join(cwd, 'src/routes'), { recursive: true });
    writeFileSync(
      join(cwd, 'package.json'),
      JSON.stringify({
        name: `@test/${dir}`,
        exports: {
          './capability': './capability.ts',
          ...(exported ? { './contributions': './contributions.ts' } : {}),
        },
      }),
    );
    writeFileSync(join(cwd, 'capability.json'), JSON.stringify({ id, version }));
    writeFileSync(join(cwd, 'capability.ts'), 'export const capability = {};');
    writeFileSync(join(cwd, 'contributions.ts'), 'export const contributionModule = {};');
  }
  return root;
}
function evaluate(source: string, module: unknown): unknown {
  const body = source.replace(/^import .*;$/gm, '').replaceAll('export const ', 'const ');
  return runInNewContext(`${body}\ncontributionModules;`, {
    m0: module,
    ContributionError,
  }) as unknown;
}
describe('React contribution source binding', () => {
  it('uses the selected physical version for both routes and contribution imports', () => {
    const root = fixture();
    const result = lorionReact({
      workspaceRoot: root,
      contributions: true,
      selected: ['a@1', 'b'],
      selectionSeed: false,
      routesDirectory: join(root, 'routes'),
      indexRouteFile: false,
    });
    result.capabilityLoader.configResolved({ root });
    const source = result.capabilityLoader.load(
      result.capabilityLoader.resolveId('virtual:lorion-contributions')!,
    )!;
    expect(source).toContain('/a/contributions.ts');
    expect(source).not.toContain('/a-next/contributions.ts');
    expect(JSON.stringify(result.routeConfig)).toContain('/a/src/routes');
    expect(JSON.stringify(result.routeConfig)).not.toContain('/a-next/src/routes');
    const create = vi.fn();
    const valid = { id: 'a', version: '1.0.0', create };
    expect(evaluate(source, valid)).toEqual([valid]);
    expect(create).not.toHaveBeenCalled();
    for (const invalid of [
      { id: 'b', version: '1.0.0', create },
      { id: 'a', version: '2.0.0', create },
      undefined,
    ])
      expect(() => evaluate(source, invalid)).toThrowError(
        matchingError({ code: 'MODULE_IDENTITY_MISMATCH' }),
      );
    expect(create).not.toHaveBeenCalled();
  });
  it('is opt-in and rejects declared exports pointing to absent files', () => {
    const root = fixture();
    const options = { workspaceRoot: root, selected: ['a@1'], selectionSeed: false as const };
    const disabled = capabilityLoader(options);
    disabled.configResolved({ root });
    expect(disabled.resolveId('virtual:lorion-contributions')).toBeUndefined();
    rmSync(join(root, 'capabilities/a/contributions.ts'));
    expect(() =>
      capabilityLoader({ ...options, contributions: true }).configResolved({ root }),
    ).toThrow(/contributions/);
  });
});

function matchingError(value: Record<string, unknown>): Error {
  return expect.objectContaining(value) as Error;
}

it.each(cases)('shared adapter scenario: $name', (scenario) => {
  const root = mkdtempSync(join(tmpdir(), 'lorion-react-case-'));
  roots.push(root);
  for (const descriptor of scenario.descriptors) {
    const cwd = join(root, 'capabilities', `${descriptor.id}-${descriptor.version}`);
    mkdirSync(cwd, { recursive: true });
    writeFileSync(join(cwd, 'capability.json'), JSON.stringify(descriptor));
    writeFileSync(
      join(cwd, 'package.json'),
      JSON.stringify({
        name: `@test/${descriptor.id}-${descriptor.version}`,
        exports: { './capability': './capability.ts', './contributions': './contributions.ts' },
      }),
    );
    writeFileSync(join(cwd, 'capability.ts'), 'export const capability = {};');
    writeFileSync(join(cwd, 'contributions.ts'), 'export const contributionModule = {};');
  }
  const plugin = capabilityLoader({
    workspaceRoot: root,
    contributions: true,
    selected: scenario.selected,
    selectionSeed: false,
  });
  plugin.configResolved({ root });
  const source = plugin.load(plugin.resolveId('virtual:lorion-contributions')!)!;
  const context: Record<string, unknown> = { ContributionError, createContributionRuntime };
  const calls: string[] = [];
  const declarations = scenario.modules as Record<string, { failure?: boolean }>;
  const imports = [
    ...source.matchAll(/import \{ contributionModule as (m\d+) \} from "([^"]+)";/g),
  ];
  for (const [, variable, path] of imports) {
    const descriptor = JSON.parse(readFileSync(join(path!, '../capability.json'), 'utf8')) as {
      id: string;
      version: string;
    };
    context[variable!] = {
      ...descriptor,
      create: () => {
        calls.push(descriptor.id);
        const result = declarations[descriptor.id];
        if (result?.failure) throw new Error('PRIVATE_MARKER');
        return result;
      },
    };
  }
  const construct = (): ContributionRuntime =>
    runInNewContext(
      `${source.replace(/^import .*;$/gm, '').replaceAll('export const ', 'const ')}\ncreateContributionRuntime({ plan: contributionPlan, modules: contributionModules });`,
      context,
    ) as ContributionRuntime;
  if (scenario.error) {
    expect(construct).toThrowError(matchingError({ code: scenario.error }));
    try {
      construct();
    } catch (error) {
      expect(JSON.stringify(error)).not.toContain('PRIVATE_MARKER');
    }
  } else {
    const runtime = construct();
    expect(runtime.get({ owner: 'owner', point: 'items' }).map(({ id }) => id)).toEqual(
      scenario.ids,
    );
    if (scenario.selected.includes('owner'))
      expect(runtime.get({ owner: 'owner', point: 'other' }).map(({ id }) => id)).toEqual(['a']);
    else expect(runtime.inspect().every((row) => row.status === 'owner-not-selected')).toBe(true);
  }
  if (scenario.error === 'MODULE_FACTORY_FAILED') expect(calls).not.toContain('b');
});
