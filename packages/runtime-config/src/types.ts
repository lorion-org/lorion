export type ConfigVisibility = 'public' | 'private';

export type RuntimeConfigSection = Record<string, unknown>;

export type RuntimeConfigContext = {
  public?: RuntimeConfigSection;
  private?: RuntimeConfigSection;
};

export type RuntimeConfigFragment = RuntimeConfigContext & {
  contexts?: Record<string, RuntimeConfigContext>;
};

export type RuntimeConfigFragmentInput = RuntimeConfigFragment & Record<string, unknown>;

export type NamedRuntimeConfigFragment = {
  scopeId: string;
  config: RuntimeConfigFragmentInput;
};

export type RuntimeConfigFragmentMap = Map<string, RuntimeConfigFragment>;

export type SectionedRuntimeConfig = {
  public: RuntimeConfigSection;
  private: RuntimeConfigSection;
};

export type RuntimeConfigNamespaceProjection = RuntimeConfigSection & {
  public: RuntimeConfigSection;
};

export type RuntimeEnvVars = Record<string, unknown>;

export const runtimeConfigVisibilities: ConfigVisibility[] = ['public', 'private'];
