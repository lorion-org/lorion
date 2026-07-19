import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  capabilityModules,
  resolvedCapabilityIds,
  selectedCapabilityIds,
} from 'virtual:capabilities';
import { createRegistry } from './registry';
import './styles.css';

async function bootstrap(): Promise<void> {
  // The host composes the pre-resolved list with its own runtime. No LORION
  // React runtime, no route config, no provider decision here.
  const registry = createRegistry();
  for (const plugin of capabilityModules) {
    registry.register(plugin);
  }
  await registry.setup();

  const activatedIds = registry.plugins.map((plugin) => plugin.id);
  const graphOnlyIds = resolvedCapabilityIds.filter((id) => !activatedIds.includes(id));

  function App() {
    return (
      <main>
        <h1>Bring your own runtime</h1>
        <p>
          The <code>@lorion-org/react</code> capability loader resolves the descriptor graph at
          build time and emits <code>virtual:capabilities</code>; surface activation uses the
          framework-free convention from <code>@lorion-org/capability-composition</code>. This page
          owns the runtime: a hand-written registry consumes the pre-resolved module list.
        </p>

        <section>
          <h2>Selection</h2>
          <dl>
            <dt>Seed (selectedCapabilityIds)</dt>
            <dd>{selectedCapabilityIds.join(', ') || '(default selection)'}</dd>
            <dt>Resolved graph (resolvedCapabilityIds)</dt>
            <dd>{resolvedCapabilityIds.join(', ')}</dd>
            <dt>Activated plugins (capabilityModules)</dt>
            <dd>{activatedIds.join(', ')}</dd>
            <dt>Graph-only (resolved, not activated)</dt>
            <dd>{graphOnlyIds.join(', ') || '(none)'}</dd>
          </dl>
        </section>

        <section>
          <h2>Contributed panels</h2>
          {registry.plugins.map((plugin) => (
            <article key={plugin.id}>
              <h3>{plugin.title}</h3>
              <div>{plugin.render()}</div>
            </article>
          ))}
        </section>
      </main>
    );
  }

  const container = document.getElementById('root');
  if (!container) throw new Error('missing #root');
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap();
