export type RegistryItem = {
  id: string;
};

export type Registry<T extends RegistryItem = RegistryItem> = {
  id: string;
  get: (id: string) => T | undefined;
  list: () => T[];
  register: (items: T | T[]) => T[];
  entries: () => Array<[string, T]>;
};

export type RegistryHub = {
  createRegistry: <T extends RegistryItem>(id: string) => Registry<T>;
  getRegistry: <T extends RegistryItem>(id: string) => Registry<T> | undefined;
  register: <T extends RegistryItem>(registryId: string, items: T | T[]) => T[];
  get: <T extends RegistryItem>(registryId: string, itemId: string) => T | undefined;
  list: <T extends RegistryItem>(registryId: string) => T[];
  entries: () => Array<[string, Registry<RegistryItem>]>;
};

type AnyRegistry = Registry<RegistryItem>;

export function createRegistry<T extends RegistryItem>(id: string): Registry<T> {
  const map: Map<string, T> = new Map();

  return {
    id,
    get: (itemId: string) => map.get(itemId),
    list: () => Array.from(map.values()),
    entries: () => Array.from(map.entries()),
    register: (items: T | T[]) => {
      const normalized: T[] = Array.isArray(items) ? items : [items];

      for (const item of normalized) map.set(item.id, item);

      return normalized;
    },
  };
}

export function createRegistryHub(): RegistryHub {
  const registries: Map<string, AnyRegistry> = new Map();

  return {
    createRegistry: <T extends RegistryItem>(id: string) => {
      const existing: AnyRegistry | undefined = registries.get(id);

      if (existing) return existing as unknown as Registry<T>;

      const created: Registry<T> = createRegistry<T>(id);
      registries.set(id, created as unknown as AnyRegistry);

      return created;
    },
    getRegistry: <T extends RegistryItem>(id: string) =>
      registries.get(id) as Registry<T> | undefined,
    register: <T extends RegistryItem>(registryId: string, items: T | T[]) => {
      const registry: Registry<T> =
        (registries.get(registryId) as Registry<T> | undefined) ?? createRegistry<T>(registryId);

      if (!registries.has(registryId))
        registries.set(registryId, registry as unknown as AnyRegistry);

      return registry.register(items);
    },
    get: <T extends RegistryItem>(registryId: string, itemId: string) => {
      const registry: Registry<T> | undefined = registries.get(registryId) as
        | Registry<T>
        | undefined;

      return registry?.get(itemId);
    },
    list: <T extends RegistryItem>(registryId: string) => {
      const registry: Registry<T> | undefined = registries.get(registryId) as
        | Registry<T>
        | undefined;

      return registry?.list() ?? [];
    },
    entries: () => Array.from(registries.entries()),
  };
}
