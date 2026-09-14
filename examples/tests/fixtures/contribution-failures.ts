const target = { owner: 'checkout', point: 'actions' };
export const duplicate = {
  id: 'failure-duplicate',
  version: '1.0.0',
  create: () => ({
    contributions: [
      {
        target,
        items: [
          { id: 'duplicate', value: 'PRIVATE_CONTRIBUTION_VALUE' },
          { id: 'duplicate', value: 'PRIVATE_CONTRIBUTION_VALUE' },
        ],
      },
    ],
  }),
};
export const factory = {
  id: 'failure-factory',
  version: '1.0.0',
  create: () => {
    throw new Error('PRIVATE_FACTORY_DETAIL');
  },
};
