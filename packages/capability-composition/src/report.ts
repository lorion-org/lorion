import type { DescriptorId } from '@lorion-org/composition-graph';
import type { ProviderSelectionMode } from '@lorion-org/descriptor-selection';

// What one resolution amounts to, in terms every host shares: descriptor ids and
// the provider outcome. Derived from a single resolution, so a report cannot
// describe a different composition than the run it belongs to.
//
// Deliberately descriptor-level. Whether a descriptor is a filesystem package, a
// mounted layer or an emitted import is a host's own view; a host that reports on
// that filters before it describes.
export interface CompositionReport {
  // The ids a run asked for, or null when it named none. What happens then is the
  // host's business, which `selected` shows; the report does not guess it.
  requested: readonly DescriptorId[] | null;
  // What the selection resolved to, and the always-on floor it resolves against.
  selected: readonly DescriptorId[];
  base: readonly DescriptorId[];
  // What this composition activates, and everything the workspace holds.
  resolved: readonly DescriptorId[];
  discovered: readonly DescriptorId[];
  // The winner of each contested capability, in capability order. `resolved` is
  // false when that winner is not part of this composition.
  providers: readonly {
    capability: DescriptorId;
    provider: DescriptorId;
    mode: ProviderSelectionMode;
    overridden: readonly DescriptorId[];
    resolved: boolean;
  }[];
}

export interface DescribeCompositionInput {
  requested?: readonly DescriptorId[] | null;
  selected?: readonly DescriptorId[];
  base?: readonly DescriptorId[];
  resolved: readonly DescriptorId[];
  // Required: the report states `resolved` out of `discovered`, and defaulting the
  // second to the first would make the count claim that nothing was left out. A
  // resolution returns it, so a host passes it through rather than deriving it.
  discovered: readonly DescriptorId[];
  // Flattened from a `ProviderSelectionResolution`, so this module needs no
  // knowledge of how a host stores it.
  providers?: readonly {
    capabilityId: DescriptorId;
    selectedProviderId: DescriptorId;
    mode: ProviderSelectionMode;
    overriddenProviderIds?: readonly DescriptorId[];
  }[];
}

// Every id list of a report is deduplicated and ordered the same way, so two
// reports of the same composition compare as equal text.
const sorted = (ids: readonly DescriptorId[] = []): DescriptorId[] => [...new Set(ids)].sort();

export function describeComposition(input: DescribeCompositionInput): CompositionReport {
  const resolved = sorted(input.resolved);
  const resolvedIds = new Set(resolved);

  return {
    requested: input.requested ? sorted(input.requested) : null,
    selected: sorted(input.selected),
    base: sorted(input.base),
    resolved,
    discovered: sorted(input.discovered),
    // Every contested capability, with whether its winner is part of this
    // composition. A winner that is not says the host named a provider the
    // run never built, which is the one thing a reader must not have to infer.
    providers: (input.providers ?? [])
      .map((selection) => ({
        capability: selection.capabilityId,
        provider: selection.selectedProviderId,
        mode: selection.mode,
        overridden: sorted(selection.overriddenProviderIds),
        resolved: resolvedIds.has(selection.selectedProviderId),
      }))
      .sort((left, right) => left.capability.localeCompare(right.capability)),
  };
}

// Descriptors the workspace holds that this composition does not activate.
export function notResolved(report: CompositionReport): DescriptorId[] {
  const resolved = new Set(report.resolved);
  return report.discovered.filter((id) => !resolved.has(id));
}

// How a host colors the report, one role per thing a reader distinguishes. The
// default is colorless, so rendered lines stay plain and comparable in a test; a
// terminal host injects its own.
export interface CompositionReportPalette {
  // The key column and the heading of a list.
  label: (text: string) => string;
  // A number or address worth finding at a glance.
  accent: (text: string) => string;
  // An id this composition activates.
  id: (text: string) => string;
  // An id it leaves out, and wording that only supports the value it follows.
  muted: (text: string) => string;
}

export interface CompositionReportOptions {
  palette?: CompositionReportPalette;
  // Maximum line width. Id lists are hard-wrapped to it so a terminal never
  // soft-wraps, which would break a runner's line prefix.
  width?: number;
  // Rows a host shows above the composition, sharing the same label column.
  leadingRows?: readonly { label: string; value: string }[];
}

const identity = (text: string): string => text;
const plainPalette: CompositionReportPalette = {
  label: identity,
  accent: identity,
  id: identity,
  muted: identity,
};

const MIN_LABEL_WIDTH = 9;
// The provider mode that means "nobody named one, the descriptor declaring
// `defaultFor` won". Marked so a reader sees the implicit default as such.
const DEFAULT_MODE: ProviderSelectionMode = 'default';
const INDENT = '  ';
// Id lists hang below their heading rather than in the key column: a list is not
// one row's value, and hundreds of ids read as a block, not as a column entry.
const LIST_INDENT = '    ';
const DEFAULT_WIDTH = 78;

// Greedily packs ids into lines no wider than `width` (plain text, ', ' joins).
function wrapIds(ids: readonly string[], width: number): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let length = 0;

  for (const id of ids) {
    const cost = id.length + (row.length ? 2 : 0);
    if (row.length && length + cost > width) {
      rows.push(row);
      row = [];
      length = 0;
    }
    length += id.length + (row.length ? 2 : 0);
    row.push(id);
  }
  if (row.length) rows.push(row);

  return rows;
}

// Renders a report as lines: an aligned key column for what was asked and what won
// each contested capability, then one hanging block per descriptor set.
export function formatCompositionReport(
  report: CompositionReport,
  options: CompositionReportOptions = {},
): string[] {
  const palette = options.palette ?? plainPalette;
  const leadingRows = options.leadingRows ?? [];
  const labelWidth = Math.max(
    MIN_LABEL_WIDTH,
    ...leadingRows.map((entry) => entry.label.length),
    ...report.providers.map((entry) => entry.capability.length),
  );
  const row = (label: string, value: string): string =>
    `${INDENT}${palette.label(label.padEnd(labelWidth))} ${value}`;
  const idList = (ids: readonly string[]): string => ids.map((id) => palette.id(id)).join(', ');

  const lines = leadingRows.map((entry) => row(entry.label, entry.value));

  lines.push(
    row(
      'Requested',
      report.requested
        ? report.requested.length
          ? idList(report.requested)
          : palette.muted('(none)')
        : palette.muted('(not given)'),
    ),
  );
  if (report.selected.length) lines.push(row('Selected', idList(report.selected)));
  if (report.base.length) lines.push(row('Base', idList(report.base)));

  for (const entry of report.providers) {
    const note = entry.resolved
      ? entry.mode === DEFAULT_MODE
        ? palette.muted(' (default)')
        : entry.overridden.length
          ? palette.muted(` (overrides ${entry.overridden.join(', ')})`)
          : ''
      : palette.muted(' (not in this composition)');
    lines.push(row(entry.capability, `${palette.id(entry.provider)}${note}`));
  }

  const wrapWidth = Math.max(20, (options.width ?? DEFAULT_WIDTH) - LIST_INDENT.length);
  const block = (
    heading: string,
    count: string,
    noun: string,
    ids: readonly DescriptorId[],
    color: (text: string) => string,
  ): void => {
    lines.push('');
    lines.push(
      `${INDENT}${palette.label(heading)} ${palette.accent(count)} ${palette.muted(noun)}`,
    );
    for (const chunk of wrapIds(ids, wrapWidth)) {
      lines.push(`${LIST_INDENT}${chunk.map(color).join(', ')}`);
    }
  };

  block(
    'Resolved',
    `${report.resolved.length}/${report.discovered.length}`,
    report.discovered.length === 1 ? 'descriptor' : 'descriptors',
    report.resolved,
    palette.id,
  );

  // What the workspace holds and this composition leaves out: the answer to "why
  // is my capability not in the app". Dimmed, because it is what is *not* there.
  const unused = notResolved(report);
  if (unused.length) {
    block(
      'Not resolved',
      String(unused.length),
      unused.length === 1 ? 'descriptor' : 'descriptors',
      unused,
      palette.muted,
    );
  }

  return lines;
}
