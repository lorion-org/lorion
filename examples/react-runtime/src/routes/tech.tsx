import { contributionRuntime } from '../router';
import { createFileRoute } from '@tanstack/react-router';
import { useMemo, type ReactElement } from 'react';
import { createDemoOverview } from '../demoOverview';

export const Route = createFileRoute('/tech')({
  component: TechMonitor,
});

function TechMonitor(): ReactElement {
  const { capabilityRuntime } = Route.useRouteContext();
  const overview = useMemo(() => createDemoOverview(capabilityRuntime), [capabilityRuntime]);
  const activeProviderIds = contributionRuntime
    .inspect()
    .filter(
      (row) =>
        row.status === 'active' &&
        row.target.owner === 'payments' &&
        row.target.point === 'payment-method',
    )
    .map((row) => row.id);
  const providerCandidateIds = [
    ...new Set(overview.providerSelection.slots.flatMap((slot) => slot.candidateProviderIds)),
  ];
  const unfilledProviderSlots = overview.providerSelection.slots
    .filter((slot) => slot.state === 'unfilled')
    .map((slot) => slot.capabilityId);

  return (
    <main className="page page-wide">
      <header className="intro">
        <p>React integration example</p>
        <h1>Tech monitor</h1>
        {overview.capabilitySelection.resolvedCapabilityIds.includes('shops') && (
          <a href="/">Back</a>
        )}
        <p>Capability profile: {overview.capabilitySelection.selectedCapabilityIds[0]}</p>
      </header>

      <pre data-testid="contribution-inspection">
        {JSON.stringify(contributionRuntime.inspect())}
      </pre>
      <section className="grid">
        <MonitorCard
          title="Resolved capabilities"
          values={overview.capabilitySelection.resolvedCapabilityIds.map(
            (id) => `${id}@${overview.resolvedCapabilityVersions[id]}`,
          )}
        />
        <MonitorCard title="Active provider" values={activeProviderIds} />
        <MonitorCard title="Provider candidates" values={providerCandidateIds} />
        <MonitorCard title="Unfilled provider slots" values={unfilledProviderSlots} />
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
