import type {
  RuntimeConfigContext,
  RuntimeConfigFragment,
  RuntimeConfigFragmentInput,
} from './types';

export type NormalizeRuntimeConfigFragmentOptions = {
  contextInputKey?: string;
};

const isObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

export function toRuntimeConfigFragment(
  config: RuntimeConfigFragmentInput,
  options: NormalizeRuntimeConfigFragmentOptions = {},
): RuntimeConfigFragment {
  const contextInputKey = options.contextInputKey ?? 'contexts';
  const contexts =
    contextInputKey === 'contexts' ? config.contexts : (config.contexts ?? config[contextInputKey]);

  return {
    ...(isObject(config.public) ? { public: config.public } : {}),
    ...(isObject(config.private) ? { private: config.private } : {}),
    ...(isObject(contexts) ? { contexts: contexts as Record<string, RuntimeConfigContext> } : {}),
  };
}
