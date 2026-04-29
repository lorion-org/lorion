export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hooks.hook('shops:created', ({ registerShop }) => {
    registerShop({
      id: 'shop-stationery',
      name: 'Paper Desk',
      path: '/shops/stationery',
      tagline: 'Notebooks, pens, and desk basics.',
    });
  });
});
