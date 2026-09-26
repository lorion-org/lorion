export type CapabilityIdentity = Readonly<{ id: string; version: string }>;
export type ContributionAddress = Readonly<{ owner: string; point: string }>;
export type ContributionPoint<T> = ContributionAddress & {
  readonly valueType?: T;
};
export type ContributionItem<T> = Readonly<{
  id: string;
  value: T;
  order?: number;
}>;
export type ResolvedContributionItem<T> = Readonly<{
  id: string;
  value: T;
  order: number;
}>;
export type Contribution<T> = Readonly<{
  target: ContributionAddress;
  items: readonly ContributionItem<T>[];
}>;
export type ContributionModule = CapabilityIdentity &
  Readonly<{
    create: () => Readonly<{
      points?: readonly ContributionPoint<unknown>[];
      contributions?: readonly Contribution<unknown>[];
    }>;
  }>;
export type ContributionPlanPoint = ContributionAddress & Readonly<{ ownerVersion: string }>;
export type ContributionPlanEdge = Readonly<{
  source: CapabilityIdentity;
  target: ContributionAddress;
}> &
  (
    | Readonly<{ active: true; ownerVersion: string }>
    | Readonly<{ active: false; ownerVersion?: never }>
  );
export type ContributionPlan = Readonly<{
  selected: readonly CapabilityIdentity[];
  points: readonly ContributionPlanPoint[];
  edges: readonly ContributionPlanEdge[];
}>;
export type ContributionInspectionRecord = Readonly<{
  source: CapabilityIdentity;
  target: ContributionAddress;
  id: string;
  order: number;
}> &
  (
    | Readonly<{ status: 'active'; ownerVersion: string }>
    | Readonly<{ status: 'owner-not-selected'; ownerVersion?: never }>
  );
export type ContributionInspection = readonly ContributionInspectionRecord[];
export type ContributionErrorCode =
  | 'INVALID_PLAN'
  | 'INVALID_MODULE'
  | 'MODULE_IDENTITY_MISMATCH'
  | 'DUPLICATE_MODULE'
  | 'INVALID_POINT'
  | 'INVALID_ITEM'
  | 'UNDECLARED_CONTRIBUTION'
  | 'MISSING_POINT_IMPLEMENTATION'
  | 'DUPLICATE_POINT'
  | 'DUPLICATE_ITEM'
  | 'MODULE_FACTORY_FAILED';
export type ContributionErrorDetails = Readonly<{
  source?: CapabilityIdentity;
  target?: ContributionAddress;
  itemId?: string;
  expectedVersion?: string;
  conflicts?: readonly CapabilityIdentity[];
}>;
export interface ContributionRuntime {
  get<T>(point: ContributionPoint<T>): readonly ResolvedContributionItem<T>[];
  inspect(): ContributionInspection;
}
