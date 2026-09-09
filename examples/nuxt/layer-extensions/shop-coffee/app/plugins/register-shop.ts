export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hooks.hook('shops:created', ({ registerShop }) => {
    registerShop({
      id: 'shop-coffee',
      name: 'Bean Supply Plus',
      path: '/shops/coffee',
      tagline: 'Coffee beans, brewing gear, and subscriptions.',
    });
  });
});
