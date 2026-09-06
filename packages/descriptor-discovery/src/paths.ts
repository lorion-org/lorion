import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve as resolvePath } from 'node:path';

// Segment-wise expansion of a path pattern, the one glob this package needs.
// Literal segments are followed, `*` matches within a segment, `..` is an ordinary
// segment and therefore reaches a sibling checkout, and `node_modules` is never
// entered. Deliberately not `fs.globSync`, which exists only from Node 22 while this
// package supports 20.19.

function escapeRegex(value: string): string {
  return value.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
}

function createGlobSegmentRegex(segment: string): RegExp {
  return new RegExp(`^${segment.split('*').map(escapeRegex).join('[^/\\\\]*')}$`);
}

export function splitPattern(pattern: string): string[] {
  return pattern.split(/[\\/]+/).filter(Boolean);
}

// What a pattern matches is a file. The wildcard branch reads that off the directory
// entry it already holds; a literal segment has none, so it asks.
function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

// Absolute paths of the files the pattern matches below `cwd`, sorted by the caller.
// A pattern whose last segment carries no wildcard matches that one file when it is
// there, so a caller can pass a literal path through unchanged.
export function expandPathPattern(cwd: string, pattern: string): string[] {
  const segments = splitPattern(pattern);
  const visit = (currentDir: string, index: number): string[] => {
    const segment = segments[index];
    if (!segment) return [];

    const isLast = index === segments.length - 1;

    if (!segment.includes('*')) {
      const nextPath = join(currentDir, segment);

      if (isLast) return isFile(nextPath) ? [nextPath] : [];
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

  return visit(resolvePath(cwd), 0);
}

// The literal prefix of a pattern, meaning everything before its first wildcard
// segment. A caller checks it to tell a pattern that names a directory from one that
// only describes where files may appear.
export function patternPrefix(pattern: string): string {
  const segments = splitPattern(pattern);
  const wildcard = segments.findIndex((segment) => segment.includes('*'));
  return (wildcard === -1 ? segments.slice(0, -1) : segments.slice(0, wildcard)).join('/');
}
