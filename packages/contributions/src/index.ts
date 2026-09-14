import type {
  CapabilityIdentity,
  Contribution,
  ContributionAddress,
  ContributionErrorCode,
  ContributionErrorDetails,
  ContributionInspectionRecord,
  ContributionItem,
  ContributionModule,
  ContributionPlan,
  ContributionPlanEdge,
  ContributionPoint,
  ContributionRuntime,
  ResolvedContributionItem,
} from './types';

export type * from './types';

const messages: Record<ContributionErrorCode, string> = {
  INVALID_PLAN: 'The contribution plan is inconsistent or malformed.',
  INVALID_MODULE: 'A contribution module must return synchronous declarations.',
  MODULE_IDENTITY_MISMATCH: 'The contribution module does not match the selected identity.',
  DUPLICATE_MODULE: 'A contribution module was supplied more than once.',
  INVALID_POINT: 'The runtime point does not belong to its declared owner.',
  INVALID_ITEM: 'The contribution item is malformed.',
  UNDECLARED_CONTRIBUTION: 'The contributor has not declared this target address.',
  MISSING_POINT_IMPLEMENTATION: 'The selected recipient has no implementation of this point.',
  DUPLICATE_POINT: 'The runtime point was declared more than once.',
  DUPLICATE_ITEM: 'The active point contains conflicting item identities.',
  MODULE_FACTORY_FAILED: 'A contribution module factory failed.',
};

export class ContributionError extends Error {
  readonly code: ContributionErrorCode;
  readonly details: ContributionErrorDetails;

  constructor(
    code: ContributionErrorCode,
    details: ContributionErrorDetails = {},
    options?: { cause?: unknown },
  ) {
    super(messages[code], options);
    if (typeof code !== 'string' || !Object.hasOwn(messages, code))
      throw new TypeError('Invalid contribution error code.');
    this.name = 'ContributionError';
    this.code = code;
    const safe = record(details) ? details : {};
    this.details = Object.freeze({
      ...(isIdentity(safe.source) ? { source: identity(safe.source) } : {}),
      ...(isAddress(safe.target) ? { target: address(safe.target) } : {}),
      ...(typeof safe.itemId === 'string' ? { itemId: safe.itemId } : {}),
      ...(typeof safe.expectedVersion === 'string'
        ? { expectedVersion: safe.expectedVersion }
        : {}),
      ...(Array.isArray(safe.conflicts)
        ? { conflicts: Object.freeze(safe.conflicts.filter(isIdentity).map(identity)) }
        : {}),
    });
  }
}

function fail(code: ContributionErrorCode, details?: ContributionErrorDetails): never {
  throw new ContributionError(code, details);
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isIdentity(value: unknown): value is CapabilityIdentity & Record<string, unknown> {
  return record(value) && text(value.id) && text(value.version);
}

function isAddress(value: unknown): value is ContributionAddress & Record<string, unknown> {
  return record(value) && text(value.owner) && text(value.point);
}

function identity(value: CapabilityIdentity): CapabilityIdentity {
  return Object.freeze({ id: value.id, version: value.version });
}

function address(value: ContributionAddress): ContributionAddress {
  return Object.freeze({ owner: value.owner, point: value.point });
}

function key(value: ContributionAddress): string {
  return JSON.stringify([value.owner, value.point]);
}

function edgeKey(source: string, target: ContributionAddress): string {
  return JSON.stringify([source, target.owner, target.point]);
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function defineContributionPoint<T>(value: ContributionAddress): ContributionPoint<T> {
  if (!isAddress(value)) fail('INVALID_POINT');
  return address(value);
}

export function defineContribution<T>(
  point: ContributionPoint<T>,
  items: readonly ContributionItem<NoInfer<T>>[],
): Contribution<T> {
  return { target: point, items };
}

function readPlan(plan: ContributionPlan): {
  selected: Map<string, CapabilityIdentity>;
  points: Set<string>;
  edges: Map<string, ContributionPlanEdge>;
} {
  if (
    !record(plan) ||
    !Array.isArray(plan.selected) ||
    !Array.isArray(plan.points) ||
    !Array.isArray(plan.edges)
  )
    fail('INVALID_PLAN');
  const selected = new Map<string, CapabilityIdentity>();
  for (const candidate of plan.selected) {
    if (!isIdentity(candidate) || selected.has(candidate.id)) fail('INVALID_PLAN');
    selected.set(candidate.id, identity(candidate));
  }
  const points = new Set<string>();
  for (const point of plan.points) {
    if (
      !isAddress(point) ||
      !text(point.ownerVersion) ||
      selected.get(point.owner)?.version !== point.ownerVersion ||
      points.has(key(point))
    )
      fail('INVALID_PLAN');
    points.add(key(point));
  }
  const edges = new Map<string, ContributionPlanEdge>();
  for (const edge of plan.edges) {
    if (
      !record(edge) ||
      !isIdentity(edge.source) ||
      !isAddress(edge.target) ||
      selected.get(edge.source.id)?.version !== edge.source.version ||
      edge.source.id === edge.target.owner
    )
      fail('INVALID_PLAN');
    const target = address(edge.target);
    const source = identity(edge.source);
    const id = edgeKey(source.id, target);
    if (edges.has(id)) fail('INVALID_PLAN');
    if (edge.active === true) {
      if (
        !text(edge.ownerVersion) ||
        selected.get(target.owner)?.version !== edge.ownerVersion ||
        !points.has(key(target))
      )
        fail('INVALID_PLAN');
      edges.set(
        id,
        Object.freeze({ source, target, active: true, ownerVersion: edge.ownerVersion }),
      );
    } else if (edge.active === false) {
      if (selected.has(target.owner) || Object.hasOwn(edge, 'ownerVersion')) fail('INVALID_PLAN');
      edges.set(id, Object.freeze({ source, target, active: false }));
    } else fail('INVALID_PLAN');
  }
  return { selected, points, edges };
}

export function createContributionRuntime(
  input: Readonly<{
    plan: ContributionPlan;
    modules: readonly ContributionModule[];
  }>,
): ContributionRuntime {
  if (!record(input)) fail('INVALID_PLAN');
  const plan = readPlan(input.plan);
  if (!Array.isArray(input.modules)) fail('INVALID_MODULE');
  const modules = new Map<string, ContributionModule>();
  for (const candidate of input.modules) {
    if (!isIdentity(candidate) || typeof candidate.create !== 'function') fail('INVALID_MODULE');
    const source = identity(candidate);
    const selected = plan.selected.get(source.id);
    if (!selected || source.version !== selected.version)
      fail('MODULE_IDENTITY_MISMATCH', {
        source,
        ...(selected ? { expectedVersion: selected.version } : {}),
      });
    if (modules.has(source.id)) fail('DUPLICATE_MODULE', { source });
    modules.set(source.id, { ...source, create: candidate.create as ContributionModule['create'] });
  }

  const points = new Set<string>();
  const submitted: { source: CapabilityIdentity; contribution: unknown }[] = [];
  for (const module of [...modules.values()].sort((a, b) => compare(a.id, b.id))) {
    const source = identity(module);
    let result: ReturnType<ContributionModule['create']>;
    try {
      result = module.create();
    } catch (cause) {
      throw new ContributionError('MODULE_FACTORY_FAILED', { source }, { cause });
    }
    if (record(result) && 'then' in result && typeof result.then === 'function') {
      void Promise.resolve(result).catch(() => {});
      fail('INVALID_MODULE', { source });
    }
    if (
      !record(result) ||
      (result.points !== undefined && !Array.isArray(result.points)) ||
      (result.contributions !== undefined && !Array.isArray(result.contributions))
    )
      fail('INVALID_MODULE', { source });
    for (const point of result.points ?? []) {
      if (!isAddress(point)) fail('INVALID_POINT', { source });
      const target = address(point);
      if (target.owner !== source.id || !plan.points.has(key(target)))
        fail('INVALID_POINT', { source, target });
      if (points.has(key(target))) fail('DUPLICATE_POINT', { source, target });
      points.add(key(target));
    }
    for (const contribution of result.contributions ?? []) submitted.push({ source, contribution });
  }

  const active = new Map<
    string,
    { source: CapabilityIdentity; item: ResolvedContributionItem<unknown> }[]
  >();
  const inspection: ContributionInspectionRecord[] = [];
  for (const { source, contribution } of submitted) {
    if (!record(contribution) || !isAddress(contribution.target))
      fail('UNDECLARED_CONTRIBUTION', { source });
    const target = address(contribution.target);
    const details = { source, target };
    const edge = plan.edges.get(edgeKey(source.id, target));
    if (!edge) fail('UNDECLARED_CONTRIBUTION', details);
    if (!Array.isArray(contribution.items)) fail('INVALID_ITEM', details);
    for (const value of contribution.items) {
      if (
        !record(value) ||
        !text(value.id) ||
        !Object.hasOwn(value, 'value') ||
        (value.order !== undefined &&
          (typeof value.order !== 'number' || !Number.isFinite(value.order)))
      )
        fail('INVALID_ITEM', {
          ...details,
          ...(record(value) && text(value.id) ? { itemId: value.id } : {}),
        });
      const item = Object.freeze({
        id: value.id,
        value: value.value,
        order: value.order === undefined ? 0 : value.order,
      });
      if (edge.active) {
        if (!points.has(key(target)))
          fail('MISSING_POINT_IMPLEMENTATION', { ...details, itemId: item.id });
        const items = active.get(key(target)) ?? [];
        const duplicate = items.find((entry) => entry.item.id === item.id);
        if (duplicate)
          fail('DUPLICATE_ITEM', {
            ...details,
            itemId: item.id,
            conflicts: [
              ...new Map([duplicate.source, source].map((entry) => [entry.id, entry])).values(),
            ].sort((a, b) => compare(a.id, b.id)),
          });
        items.push({ source, item });
        active.set(key(target), items);
        inspection.push(
          Object.freeze({
            source,
            target,
            id: item.id,
            order: item.order,
            status: 'active',
            ownerVersion: edge.ownerVersion,
          }),
        );
      } else {
        inspection.push(
          Object.freeze({
            source,
            target,
            id: item.id,
            order: item.order,
            status: 'owner-not-selected',
          }),
        );
      }
    }
  }
  const collections = new Map<string, readonly ResolvedContributionItem<unknown>[]>();
  for (const [target, items] of active) {
    items.sort(
      (a, b) =>
        a.item.order - b.item.order ||
        compare(a.source.id, b.source.id) ||
        compare(a.item.id, b.item.id),
    );
    collections.set(target, Object.freeze(items.map(({ item }) => item)));
  }
  inspection.sort(
    (a, b) =>
      compare(a.target.owner, b.target.owner) ||
      compare(a.target.point, b.target.point) ||
      a.order - b.order ||
      compare(a.source.id, b.source.id) ||
      compare(a.source.version, b.source.version) ||
      compare(a.id, b.id),
  );
  const report = Object.freeze(inspection);
  const empty: readonly ResolvedContributionItem<unknown>[] = Object.freeze([]);
  return Object.freeze({
    get<T>(point: ContributionPoint<T>): readonly ResolvedContributionItem<T>[] {
      return (collections.get(key(point)) ?? empty) as readonly ResolvedContributionItem<T>[];
    },
    inspect: () => report,
  });
}
