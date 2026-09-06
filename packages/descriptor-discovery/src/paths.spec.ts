import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Imported from the module rather than the package entry: the expansion is this
// package's own glob and no part of its contract.
import { expandPathPattern, patternPrefix, splitPattern } from './paths';

let root: string;

function writeFile(path: string): void {
  const full = join(root, path);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, '{}\n');
}

const found = (pattern: string): string[] =>
  expandPathPattern(root, pattern)
    .map((path) =>
      path
        .slice(root.length + 1)
        .split(sep)
        .join('/'),
    )
    .sort();

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'lorion-paths-'));
});

afterEach(() => {
  rmSync(root, { force: true, recursive: true });
});

describe('expandPathPattern', () => {
  it('matches within one segment and never across a separator', () => {
    writeFile('packages/checkout/package.json');
    writeFile('packages/checkout/src/package.json');

    expect(found('packages/*/package.json')).toEqual(['packages/checkout/package.json']);
  });

  it('anchors a wildcard segment at both ends and reads the rest literally', () => {
    writeFile('packages/shop-lab/package.json');
    writeFile('packages/lab-shop/package.json');
    writeFile('packages/shop.v2/package.json');
    writeFile('packages/shopXv2/package.json');

    expect(found('packages/*-lab/package.json')).toEqual(['packages/shop-lab/package.json']);
    // A literal segment is matched as text: the dot is a dot and not "any character".
    expect(found('packages/shop.v2/package.json')).toEqual(['packages/shop.v2/package.json']);
    expect(found('packages/shop.*/package.json')).toEqual(['packages/shop.v2/package.json']);
  });

  it('never enters node_modules', () => {
    writeFile('packages/checkout/package.json');
    writeFile('packages/node_modules/package.json');

    expect(found('packages/*/package.json')).toEqual(['packages/checkout/package.json']);
  });

  it('reaches a sibling checkout through a parent segment', () => {
    writeFile('packages/checkout/package.json');
    mkdirSync(join(root, 'nested'), { recursive: true });

    expect(expandPathPattern(join(root, 'nested'), '../packages/*/package.json')).toEqual([
      join(root, 'packages/checkout/package.json'),
    ]);
  });

  it('matches a file and nothing else at the end of a pattern', () => {
    writeFile('packages/checkout/package.json');
    mkdirSync(join(root, 'packages/payments/package.json'), { recursive: true });

    // A directory that carries the name of the file being looked for is not a match.
    expect(found('packages/*/package.json')).toEqual(['packages/checkout/package.json']);
    // A literal path matches only when it is there.
    expect(found('packages/checkout/package.json')).toEqual(['packages/checkout/package.json']);
    expect(found('packages/checkout/capability.json')).toEqual([]);
  });

  it('yields nothing when a segment along the way is not there', () => {
    writeFile('packages/checkout/package.json');

    expect(found('missing/*/package.json')).toEqual([]);
    expect(found('packages/*/missing/package.json')).toEqual([]);
    expect(found('packages/checkout/missing/package.json')).toEqual([]);
  });

  it('descends into directories and never into files', () => {
    writeFile('packages/checkout/package.json');
    writeFile('packages/checkout/src/nested.json');

    // A wildcard at the end names files, not the directories beside them.
    expect(found('packages/checkout/*')).toEqual(['packages/checkout/package.json']);
    // A wildcard on the way is followed into directories; a file of that name is not a
    // way to anywhere.
    expect(found('packages/checkout/*/nested.json')).toEqual(['packages/checkout/src/nested.json']);
  });

  it('yields nothing when the directory the expansion starts in is not there', () => {
    expect(expandPathPattern(join(root, 'gone'), '*/package.json')).toEqual([]);
    expect(expandPathPattern(join(root, 'gone'), 'packages/package.json')).toEqual([]);
  });

  it('reads a pattern in segments, whichever separator wrote it', () => {
    expect(splitPattern('packages//checkout/')).toEqual(['packages', 'checkout']);
    expect(splitPattern('packages\\checkout')).toEqual(['packages', 'checkout']);
  });
});

describe('patternPrefix', () => {
  it('is everything before the first wildcard', () => {
    expect(patternPrefix('packages/*/package.json')).toBe('packages');
    expect(patternPrefix('../core/packages/*')).toBe('../core/packages');
    expect(patternPrefix('*/package.json')).toBe('');
  });

  it('is everything but the last segment when no wildcard names one', () => {
    expect(patternPrefix('packages/checkout/package.json')).toBe('packages/checkout');
    expect(patternPrefix('packages')).toBe('');
  });
});
