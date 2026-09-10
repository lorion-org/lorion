import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';
import { renderCapabilityModule } from './render';
import type { DiscoveredCapability } from './vite';

it('executes the generated module with exactly the activated registrations and resolved versions', () => {
  const root = mkdtempSync(join(tmpdir(), 'lorion-render-'));
  try {
    const items: DiscoveredCapability[] = [
      'first',
      'second',
      'group',
      'no-export',
      'no-import',
    ].map((id) => ({
      id,
      capabilityDir: root,
      disabled: false,
      manifest: { id, version: '1.2.0' },
      packageName: id === 'group' ? '' : `@demo/${id}`,
      variableName: id.replace('-', '_'),
      ...(!['group', 'no-export'].includes(id) ? { exportName: 'plugin' } : {}),
      ...(!['group', 'no-import'].includes(id) ? { importSpecifier: `./${id}.mjs` } : {}),
    }));
    for (const id of ['first', 'second'])
      writeFileSync(join(root, `${id}.mjs`), `export const plugin = ${JSON.stringify({ id })};`);
    const providerSelection = { slots: [], excludedProviderIds: ['other'] };
    writeFileSync(
      join(root, 'selected.mjs'),
      renderCapabilityModule(items, ['group'], providerSelection),
    );
    writeFileSync(join(root, 'empty.mjs'), renderCapabilityModule([]));
    for (const [name, expected] of [
      [
        'selected',
        {
          selectedCapabilityIds: ['group'],
          resolvedCapabilityIds: items.map(({ id }) => id),
          resolvedCapabilityVersions: Object.fromEntries(items.map(({ id }) => [id, '1.2.0'])),
          providerSelection,
          capabilityModules: [{ id: 'first' }, { id: 'second' }],
        },
      ],
      [
        'empty',
        {
          selectedCapabilityIds: [],
          resolvedCapabilityIds: [],
          resolvedCapabilityVersions: {},
          providerSelection: { slots: [], excludedProviderIds: [] },
          capabilityModules: [],
        },
      ],
    ] as const) {
      const output = execFileSync(
        process.execPath,
        [
          '--input-type=module',
          '--eval',
          `import * as result from ${JSON.stringify(pathToFileURL(join(root, `${name}.mjs`)).href)}; process.stdout.write(JSON.stringify(result));`,
        ],
        { encoding: 'utf8' },
      );
      expect(JSON.parse(output)).toEqual(expected);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
