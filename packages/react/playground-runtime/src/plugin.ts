import type { ReactNode } from 'react';

// The host's own plugin contract. In a real product this lives in a package
// such as a plugin system; capabilities depend on it, not on LORION. LORION only
// selects and activates capabilities; the shape of a "plugin" is the host's
// decision.
export type WebPlugin = {
  id: string;
  title: string;
  render: () => ReactNode;
  setup?: () => void | Promise<void>;
};

export function defineWebPlugin(plugin: WebPlugin): WebPlugin {
  return plugin;
}
