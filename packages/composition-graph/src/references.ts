import { defaultRelationDescriptors, readRelationTargets } from './descriptorGraph';
import type { Descriptor, DescriptorId, RelationDescriptor } from './types';

// A relation resolves only for a target the descriptor map holds, and every other
// name is skipped: a dependency on a descriptor nobody declared pulls in nothing,
// and the composition silently becomes smaller than it reads. This check is where
// such a name is still attributable to the descriptor that declared it and the
// relation it declared it under.
//
// Checked against the declared set, not the resolved one, so a name that exists but
// takes no part in this composition passes.
export function assertKnownReferences(input: {
  descriptors: readonly Descriptor[];
  // The relations to check. Defaults to the relations every graph walks; a host adds
  // the ones it registers, so a field added to the descriptor contract is checked by
  // registering it rather than by restating it here.
  relationDescriptors?: readonly RelationDescriptor[];
}): void {
  const relationDescriptors = input.relationDescriptors ?? defaultRelationDescriptors;
  const declared = new Set(input.descriptors.map((descriptor) => descriptor.id));
  // Keyed, because one descriptor can reach this check twice: a grouping declared in a
  // manifest and nested in a descriptor is one declaration, and reporting it twice
  // would read as two mistakes.
  const unknown = new Map<string, { from: DescriptorId; relation: string; to: DescriptorId }>();

  for (const descriptor of input.descriptors) {
    for (const relationDescriptor of relationDescriptors) {
      for (const target of readRelationTargets(descriptor, relationDescriptor)) {
        if (declared.has(target)) continue;
        unknown.set([descriptor.id, relationDescriptor.id, target].join('\u0000'), {
          from: descriptor.id,
          relation: relationDescriptor.id,
          to: target,
        });
      }
    }
  }

  if (!unknown.size) return;

  const reported = [...unknown.values()]
    .sort(
      (left, right) =>
        left.from.localeCompare(right.from) ||
        left.relation.localeCompare(right.relation) ||
        left.to.localeCompare(right.to),
    )
    .map((entry) => `"${entry.from}" names "${entry.to}" under "${entry.relation}"`);

  throw new Error(
    `Descriptors name targets that no descriptor of this composition declares: ${reported.join('; ')}.`,
  );
}
