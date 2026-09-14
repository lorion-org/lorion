import { point } from '../../contributions';
export default defineNuxtPlugin({
  name: 'shops',
  dependsOn: ['lorion-contributions'],
  setup() {
    const nuxtApp = useNuxtApp();
    return {
      provide: {
        shops: { list: () => nuxtApp.$contributions.get(point).map(({ value }) => value) },
      },
    };
  },
});
