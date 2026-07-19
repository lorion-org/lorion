import {
  Outlet,
  createRootRoute,
  createRoute,
  createRouter as createTanStackRouter,
} from '@tanstack/react-router';
import { HostRuntimeProvider, type HostRuntime } from './plugin';

// The host owns its router. LORION emitted no route config (that is Model A); here
// the product assembles its own TanStack router from the routes each activated
// capability contributed, and provides the host runtime through context so pages
// can read the other extension points.
export function createRouter(runtime: HostRuntime) {
  const rootRoute = createRootRoute({
    component: () => (
      <HostRuntimeProvider value={runtime}>
        <Outlet />
      </HostRuntimeProvider>
    ),
  });

  const routes = runtime.routes.map((route) =>
    createRoute({
      getParentRoute: () => rootRoute,
      path: route.path,
      component: route.Component,
    }),
  );

  const routeTree = rootRoute.addChildren(routes);
  return createTanStackRouter({ routeTree });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createRouter>;
  }
}
