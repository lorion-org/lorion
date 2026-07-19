import {
  readRuntimeConfigScopeJson,
  resolveRuntimeConfigPublicFilePath,
  resolveRuntimeConfigSource,
  writeRuntimeConfigScopeJson,
} from '@lorion-org/runtime-config-node';

const source = resolveRuntimeConfigSource({
  defaultVarDir: './var',
  env: process.env,
  envKey: 'APP_VAR_DIR',
});

writeRuntimeConfigScopeJson(source, 'checkout', 'settings.json', {
  successPath: '/orders/confirmed',
});

const settings = readRuntimeConfigScopeJson(source, 'checkout', 'settings.json');
console.log(settings);
// { successPath: '/orders/confirmed' }

const logoPath = resolveRuntimeConfigPublicFilePath(source, 'checkout/logo.svg');
console.log(logoPath);
// /absolute/project/path/var/runtime-config/public/checkout/logo.svg
