import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from '@tanstack/react-router';
import { capabilityModules } from 'virtual:capabilities';
import { createHostRuntime } from './registry';
import { createRouter } from './router';
import './styles.css';

// Model B — bring your own runtime. The LORION loader resolved the descriptor
// graph at build time (provider selection included) and emitted the activated
// capability plugins as `virtual:capabilities`. From here the host owns
// everything: it composes the plugins into its own runtime and its own router.
// No LORION React runtime, no LORION-generated route config.
async function bootstrap(): Promise<void> {
  const runtime = await createHostRuntime(capabilityModules);
  const router = createRouter(runtime);

  const container = document.getElementById('root');
  if (!container) throw new Error('React example root element not found.');

  createRoot(container).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );
}

void bootstrap();
