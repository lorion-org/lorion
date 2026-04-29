export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hooks.hook('shops:created', ({ registerShop }) => {
    registerShop({
      id: 'shop-coffee',
      name: 'Bean Supply',
      path: '/shops/coffee',
      tagline: 'Coffee beans and simple brewing gear.',
    });
  });
});
