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

writeRuntimeConfigScopeJson(source, 'billing', 'settings.json', {
  apiBase: '/api/billing',
});

const settings = readRuntimeConfigScopeJson(source, 'billing', 'settings.json');
console.log(settings);
// { apiBase: '/api/billing' }

const logoPath = resolveRuntimeConfigPublicFilePath(source, 'billing/logo.svg');
console.log(logoPath);
// /absolute/project/path/var/runtime-config/public/billing/logo.svg
