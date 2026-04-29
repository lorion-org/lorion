export default {
  test: {
    include: ['packages/*/src/**/*.spec.ts'],
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
  },
};
