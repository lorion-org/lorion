export default defineEventHandler(() => {
  return {
    public: usePublicRuntimeConfigScope('billing'),
    context: usePublicRuntimeConfigScope('billing', {
      contextId: 'tenantA',
    }),
    private: usePrivateRuntimeConfigScope('billing'),
    value: useRuntimeConfigValue('billing', 'apiBase'),
  };
});
