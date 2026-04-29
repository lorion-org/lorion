import { parseDescriptorIds } from '@lorion-org/composition-graph';
import LorionNuxtModule, {
  createNuxtExtensionBootstrap,
  createNuxtExtensionLayerPaths,
} from '@lorion-org/nuxt';

const getCliValue = (argv: string[], name: string): string | undefined => {
  const arg = argv.find((entry) => entry === name || entry.startsWith(`${name}=`));

  if (!arg) return undefined;
  if (arg === name) return argv[argv.indexOf(arg) + 1];

  return arg.slice(`${name}=`.length);
};

const extensionBootstrap = createNuxtExtensionBootstrap({
  rootDir: __dirname,
  options: {
    defaultSelection: 'default',
    descriptorPaths: ['layer-extensions/*/extension.json'],
    selected: parseDescriptorIds(
      getCliValue(process.argv, '--extensions') ??
        process.env.npm_config_extensions ??
        process.env.LORION_EXTENSIONS,
    ),
  },
});

export default defineNuxtConfig({
  extends: createNuxtExtensionLayerPaths(extensionBootstrap),
  modules: [
    [
      LorionNuxtModule,
      {
        extensionBootstrap,
        logging: true,
      },
    ],
  ],
});
