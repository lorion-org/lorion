/**
 * Mutation run configuration.
 *
 * A green suite says a test ran, not that it would notice a defect. A mutation run
 * changes the production code and asks whether any test objects. What survives is a
 * test-quality finding: the line is executed and nothing asserts what it does.
 *
 * `mutate` is intentionally absent here. A run names its scope on the command line, so
 * this file carries no file list that ages.
 */
export default {
  // Stryker resolves its plugins through the glob `@stryker-mutator/*`, which finds
  // nothing in a pnpm node_modules. Without this the run aborts with "no TestRunner
  // plugins were loaded".
  plugins: ['@stryker-mutator/vitest-runner'],

  testRunner: 'vitest',
  vitest: {
    configFile: 'vitest.mutation.config.mts',
    // Vitest's related mode does not reach a spec that imports its subject through the
    // package entry, and the runner then finds no test at all. The run names the tests
    // instead, through LORION_MUTATION_TESTS.
    related: false,
  },

  // A mutant on module level restarts the whole run for a single mutation, and the
  // module-level constants of these packages are data rather than behaviour.
  ignoreStatic: true,

  // Runs only the tests that cover a mutant, which is what keeps a run affordable.
  coverageAnalysis: 'perTest',

  concurrency: 8,
  timeoutMS: 20000,

  reporters: ['clear-text', 'json'],
  jsonReporter: { fileName: 'node_modules/.cache/stryker/mutation.json' },
  tempDirName: 'node_modules/.cache/stryker/tmp',
};
