export type RuntimeConfigKeyStrategy = (scopeId: string, key: string) => string;

export type RuntimeConfigKeyOptions = {
  keyStrategy?: RuntimeConfigKeyStrategy;
};

function upperFirst(input: string): string {
  return input ? input[0]!.toUpperCase() + input.slice(1) : input;
}

function uncapitalize(input: string): string {
  return input ? input[0]!.toLowerCase() + input.slice(1) : input;
}

function camelCase(input: string): string {
  return input
    .replace(/['\u2019]/g, '')
    .split(/[^A-Za-z0-9]+|(?=[A-Z][a-z])/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.toLowerCase())
    .map((part, index) => (index === 0 ? part : upperFirst(part)))
    .join('');
}

export function createRuntimeConfigKey(
  scopeId: string,
  key: string,
  options: RuntimeConfigKeyOptions = {},
): string {
  return options.keyStrategy?.(scopeId, key) ?? camelCase(`${scopeId} ${key}`);
}

export function stripRuntimeConfigScopePrefix(
  scopeId: string,
  configKey: string,
  options: RuntimeConfigKeyOptions = {},
): string | undefined {
  const prefix = createRuntimeConfigKey(scopeId, '', options);
  if (!prefix || !configKey.startsWith(prefix) || configKey.length <= prefix.length) {
    return undefined;
  }

  return uncapitalize(configKey.slice(prefix.length));
}

export function toSnakeUpperCase(input: string): string {
  return input
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toUpperCase();
}
