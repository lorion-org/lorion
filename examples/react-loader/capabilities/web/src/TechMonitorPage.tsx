import type { ReactElement } from 'react';
import { useHostRuntime } from '@acme/plugin';
import { createDemoOverview } from '../../../src/demoOverview';

export function TechMonitorPage(): ReactElement {
  const runtime = useHostRuntime();
  const overview = createDemoOverview(runtime);

  return (
    <main className="page page-wide">
      <header className="intro">
        <p>React integration example — bring your own runtime</p>
        <h1>Tech monitor</h1>
        <a href="/">Back</a>
        <p>Capability profile: {overview.selectedCapabilityIds[0] ?? '(default selection)'}</p>
      </header>

      <section className="grid">
        <MonitorCard title="Resolved capabilities" values={overview.resolvedCapabilityIds} />
        <MonitorCard title="Selected provider" values={overview.selectedProviderIds} />
        <MonitorCard title="Not injected" values={overview.notInjectedCapabilityIds} />
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
