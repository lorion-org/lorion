// The test runner of a mutation run, and nothing else.
//
// `@stryker-mutator/vitest-runner` asks Vitest for the tests related to a mutated
// file, and Vitest's module graph does not reach a spec that imports its subject
// through the package entry rather than the file. The run therefore names the tests
// itself, through LORION_MUTATION_TESTS, which is exact rather than inferred.
import base from './vitest.config.mts';

const named = (process.env.LORION_MUTATION_TESTS ?? '')
  .split(',')
  .map((path) => path.trim())
  .filter(Boolean);

export default {
  ...base,
  test: {
    ...base.test,
    ...(named.length > 0 ? { include: named } : {}),
  },
};
