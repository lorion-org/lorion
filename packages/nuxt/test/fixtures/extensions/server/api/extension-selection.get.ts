export default defineEventHandler(() => {
  const runtimeConfig = useRuntimeConfig();

  return {
    extensionSelection: runtimeConfig.public.extensionSelection,
    shop: runtimeConfig.public.shop,
  };
});
