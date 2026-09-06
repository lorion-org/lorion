import type { Descriptor, DescriptorId } from '@lorion-org/composition-graph';
import type {
  ProviderSelectionMode,
  ProviderSlotResolution,
} from '@lorion-org/descriptor-selection';

export type CompositionProviderSlot =
  | {
      capability: DescriptorId;
      state: 'selected';
      required: boolean;
      provider: DescriptorId;
      candidates: readonly DescriptorId[];
      mode: ProviderSelectionMode;
      overridden: readonly DescriptorId[];
      resolved: boolean;
    }
  | {
      capability: DescriptorId;
      state: 'unfilled';
      required: false;
      candidates: readonly DescriptorId[];
    };

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
  // Every active provider slot in capability order. A selected slot names its
  // winner and whether the winner is in this composition; an unfilled slot is a
  // positive outcome rather than an omitted selection.
  providerSlots: readonly CompositionProviderSlot[];
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
  // Passed through from the provider resolution that shaped `resolved`.
  providerSlots?: readonly ProviderSlotResolution[];
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
    providerSlots: (input.providerSlots ?? [])
      .map(
        (slot): CompositionProviderSlot =>
          slot.state === 'selected'
            ? {
                capability: slot.capabilityId,
                state: 'selected',
                required: slot.required,
                provider: slot.selectedProviderId,
                candidates: sorted(slot.candidateProviderIds),
                mode: slot.mode,
                overridden: sorted(slot.overriddenProviderIds),
                resolved: resolvedIds.has(slot.selectedProviderId),
              }
            : {
                capability: slot.capabilityId,
                state: 'unfilled',
                required: false,
                candidates: sorted(slot.candidateProviderIds),
              },
      )
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

// Renders a report as lines: an aligned key column for what was asked and each
// active provider-slot outcome, then one hanging block per descriptor set.
export function formatCompositionReport(
  report: CompositionReport,
  options: CompositionReportOptions = {},
): string[] {
  const palette = options.palette ?? plainPalette;
  const leadingRows = options.leadingRows ?? [];
  const labelWidth = Math.max(
    MIN_LABEL_WIDTH,
    ...leadingRows.map((entry) => entry.label.length),
    ...report.providerSlots.map((entry) => entry.capability.length),
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

  for (const entry of report.providerSlots) {
    if (entry.state === 'unfilled') {
      const detail = entry.candidates.length
        ? `unfilled; candidates: ${entry.candidates.join(', ')}`
        : 'unfilled; no candidates';
      lines.push(row(entry.capability, palette.muted(`(${detail})`)));
      continue;
    }

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

// --- Where each descriptor came from ----------------------------------------
//
// A report says what a composition amounts to. This says why: the same descriptor is
// named by one run, brought along by a grouping in the next and pulled in behind
// something else in a third. The rows read from what a run decides to what follows
// from it: what it named, the floor it stands on, the groupings it runs, the slots it
// fills and with what, what the groupings bring, and what a named descriptor needed.
//
// Every row is a projection of one resolution. Nothing here re-resolves, so a row can
// never describe a composition other than the one it belongs to.

export interface CompositionOriginSlot {
  capability: DescriptorId;
  // The providers of this slot the composition activated.
  chosen: DescriptorId[];
  // True when the run named the winner, directly or through a grouping it named.
  named: boolean;
  // Providers of this slot the composition left out.
  alternatives: DescriptorId[];
}

export interface CompositionOrigins {
  // Named by the run, one by one.
  named: DescriptorId[];
  // The floor every run of this host stands on, which no run names.
  base: DescriptorId[];
  // The groupings this composition runs, base groupings excluded.
  groupings: DescriptorId[];
  slots: CompositionOriginSlot[];
  // What the groupings bring without anyone naming it one by one.
  viaGroupings: DescriptorId[];
  // What something named needed, decided by nobody.
  pulled: DescriptorId[];
}

export interface DescribeOriginsInput {
  // What the run named, as `resolveDescriptorSelection` returns it.
  selected: readonly DescriptorId[];
  base?: readonly DescriptorId[];
  resolved: readonly DescriptorId[];
  // The descriptors of the resolved set, read for their dependencies and provider
  // declarations. A caller that passes the full discovered set gets the same rows.
  descriptors: readonly Descriptor[];
  // Which of them are groupings: descriptors that name others and are none. A
  // composition knows them as the descriptors with no package of their own.
  groupings?: readonly DescriptorId[];
  providerSlots?: readonly ProviderSlotResolution[];
}

function descriptorDependencies(descriptor: Descriptor | undefined): DescriptorId[] {
  return Object.keys(descriptor?.dependencies ?? {});
}

function providedCapabilities(descriptor: Descriptor | undefined): DescriptorId[] {
  const declared = descriptor?.providesFor;
  return (Array.isArray(declared) ? declared : [declared]).filter(
    (entry): entry is DescriptorId => typeof entry === 'string' && entry.length > 0,
  );
}

export function describeCompositionOrigins(input: DescribeOriginsInput): CompositionOrigins {
  const resolved = new Set(input.resolved);
  const groupings = new Set(input.groupings ?? []);
  const descriptorById = new Map(
    input.descriptors.map((descriptor) => [descriptor.id, descriptor]),
  );

  // Which capability each provider fills, and the providers each capability has.
  const providersOf = new Map<DescriptorId, DescriptorId[]>();
  for (const descriptor of input.descriptors) {
    for (const capability of providedCapabilities(descriptor)) {
      providersOf.set(capability, [...(providersOf.get(capability) ?? []), descriptor.id].sort());
    }
  }

  // Naming a grouping names what it holds. Those members stay out of the one-by-one
  // row and keep their attribution, so a slot a run chose through a grouping does not
  // read as a declared default.
  const namedByRun = new Set(input.selected.filter((id) => resolved.has(id)));
  const chosenByRun = new Set(namedByRun);
  const pending = [...namedByRun].filter((id) => groupings.has(id));
  const seenGroupings = new Set<DescriptorId>();
  while (pending.length) {
    const id = pending.pop() as DescriptorId;
    if (seenGroupings.has(id)) continue;
    seenGroupings.add(id);
    for (const member of descriptorDependencies(descriptorById.get(id))) {
      chosenByRun.add(member);
      if (groupings.has(member)) pending.push(member);
    }
  }

  const baseIds = new Set((input.base ?? []).filter((id) => resolved.has(id)));
  const resolvedGroupings = [...resolved].filter((id) => groupings.has(id)).sort();

  // A grouping is a descriptor of the run and not a package, so its members are read
  // from the grouping and their own dependencies from the descriptors below them.
  const reachable = (seed: readonly DescriptorId[]): Set<DescriptorId> => {
    const seen = new Set<DescriptorId>();
    const queue = [...seed];
    while (queue.length) {
      const id = queue.pop() as DescriptorId;
      if (seen.has(id) || !resolved.has(id)) continue;
      seen.add(id);
      queue.push(...descriptorDependencies(descriptorById.get(id)));
    }
    return seen;
  };
  const fromGroupings = reachable(
    resolvedGroupings.flatMap((id) => descriptorDependencies(descriptorById.get(id))),
  );

  const slots: CompositionOriginSlot[] = [...providersOf.entries()]
    .filter(([capability]) => resolved.has(capability))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([capability, providers]) => ({
      capability,
      chosen: providers.filter((provider) => resolved.has(provider)),
      named: providers.some((provider) => resolved.has(provider) && chosenByRun.has(provider)),
      alternatives: providers.filter((provider) => !resolved.has(provider)),
    }));

  // A slot and its filling belong to their own row. Both also arrive through a
  // grouping or behind a named descriptor, and counting them twice would list the
  // same descriptor in two rows of one report.
  const inSlotRow = new Set(slots.flatMap((slot) => [slot.capability, ...slot.chosen]));

  const named = [...namedByRun].filter((id) => !groupings.has(id) && !inSlotRow.has(id)).sort();
  const groupingRow = resolvedGroupings.filter((id) => !inSlotRow.has(id) && !baseIds.has(id));
  const accounted = new Set<DescriptorId>([
    ...baseIds,
    ...fromGroupings,
    ...named,
    ...inSlotRow,
    ...resolvedGroupings,
  ]);

  return {
    named,
    base: [...baseIds].filter((id) => !inSlotRow.has(id)).sort(),
    groupings: groupingRow,
    slots,
    viaGroupings: [...fromGroupings]
      .filter((id) => !namedByRun.has(id) && !inSlotRow.has(id) && !groupings.has(id))
      .sort(),
    pulled: [...resolved].filter((id) => !accounted.has(id)).sort(),
  };
}

// The origin rows as lines, in the order they read. Empty rows are left out: a row
// that names nothing is not an outcome, it is a row this run had no use for.
// The rows a composition origin carries, in the order they read.
const ORIGIN_ROW_LABELS = ['Named', 'Base', 'Groupings', 'Via groupings', 'Pulled'] as const;

export function formatCompositionOrigins(
  origins: CompositionOrigins,
  options: CompositionReportOptions = {},
): string[] {
  const palette = options.palette ?? plainPalette;
  // Every label the rows below can carry, the fixed ones included: a key column that
  // measures only the slot names leaves the longest row unaligned, which is the one
  // thing this rendering exists for.
  const labelWidth = Math.max(
    MIN_LABEL_WIDTH,
    ...ORIGIN_ROW_LABELS.map((label) => label.length),
    ...origins.slots.map((slot) => slot.capability.length),
  );
  const row = (label: string, value: string): string =>
    `${INDENT}${palette.label(label.padEnd(labelWidth))} ${value}`;
  const lines: string[] = [];
  const idRow = (label: string, ids: readonly DescriptorId[]): void => {
    if (!ids.length) return;
    lines.push(row(label, ids.map((id) => palette.id(id)).join(', ')));
  };

  idRow('Named', origins.named);
  idRow('Base', origins.base);
  idRow('Groupings', origins.groupings);
  for (const slot of origins.slots) {
    // An unfilled slot has no winner: it carries neither an attribution nor a loser,
    // and its candidates read as what could still fill it.
    if (!slot.chosen.length) {
      const detail = slot.alternatives.length
        ? `unfilled; candidates: ${slot.alternatives.join(', ')}`
        : 'unfilled; no candidates';
      lines.push(row(slot.capability, palette.muted(`(${detail})`)));
      continue;
    }

    const note = slot.named ? '' : palette.muted(' (not named by this run)');
    const alternatives = slot.alternatives.length
      ? palette.muted(` (instead of ${slot.alternatives.join(', ')})`)
      : '';
    lines.push(
      row(
        slot.capability,
        `${slot.chosen.map((id) => palette.id(id)).join(', ')}${note}${alternatives}`,
      ),
    );
  }
  idRow('Via groupings', origins.viaGroupings);
  idRow('Pulled', origins.pulled);

  return lines;
}
