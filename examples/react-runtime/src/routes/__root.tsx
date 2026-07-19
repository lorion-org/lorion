import { Outlet, createRootRouteWithContext } from '@tanstack/react-router';
import { CapabilityRuntimeProvider } from '@lorion-org/react';
import type { RouterContext } from '../router';

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootRoute,
});

function RootRoute() {
  const { capabilityRuntime } = Route.useRouteContext();

  return (
    <CapabilityRuntimeProvider runtime={capabilityRuntime}>
      <Outlet />
    </CapabilityRuntimeProvider>
  );
}
