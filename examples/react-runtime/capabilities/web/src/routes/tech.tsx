import { Link, createFileRoute } from '@tanstack/react-router';
import { useMemo, type ReactElement } from 'react';
import { getPaymentProviders } from '../../../payments/src';
import { createDemoOverview } from '../../../../src/demoOverview';

export const Route = createFileRoute('/tech')({
  component: TechMonitor,
});

function TechMonitor(): ReactElement {
  const { capabilityRuntime } = Route.useRouteContext();
  const overview = useMemo(() => createDemoOverview(capabilityRuntime), [capabilityRuntime]);
  const activeProviderIds = getPaymentProviders(capabilityRuntime).map((provider) => provider.id);

  return (
    <main className="page page-wide">
      <header className="intro">
        <p>React integration example</p>
        <h1>Tech monitor</h1>
        <Link to="/">Back</Link>
        <p>Capability profile: {overview.capabilitySelection.selectedCapabilityIds[0]}</p>
      </header>

      <section className="grid">
        <MonitorCard
          title="Resolved capabilities"
          values={overview.capabilitySelection.resolvedCapabilityIds}
        />
        <MonitorCard title="Active provider" values={activeProviderIds} />
        <MonitorCard
          title="Not injected"
          values={overview.capabilitySelection.notInjectedCapabilityIds}
        />
      </section>
    </main>
  );
}

function MonitorCard({
  title,
  values,
}: Readonly<{ title: string; values: string[] }>): ReactElement {
  return (
    <article>
      <h2>{title}</h2>
      <ul className="list">
        {values.map((value) => (
          <li key={value}>
            <span>{value}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}
