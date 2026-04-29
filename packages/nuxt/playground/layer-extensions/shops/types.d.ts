export type Shop = {
  id: string;
  name: string;
  path: string;
  tagline: string;
};

declare module '#app' {
  interface RuntimeNuxtHooks {
    'shops:created': (context: { registerShop: (shop: Shop) => void }) => void;
  }
}
