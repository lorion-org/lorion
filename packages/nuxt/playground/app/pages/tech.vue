<script setup lang="ts">
const { data: overview } = await useFetch('/api/demo/overview');

const extensionSelection = computed(() => overview.value?.extensionSelection);
const providerSelections = computed(() =>
  Object.values(overview.value?.providerSelection?.selections ?? {}),
);
const selectedProviderIds = computed(() =>
  providerSelections.value
    .map((selection) => selection.selectedProviderId)
    .filter((id): id is string => Boolean(id)),
);
const providerCandidateIds = computed(() => [
  ...new Set(providerSelections.value.flatMap((selection) => selection.candidateProviderIds)),
]);
</script>

<template>
  <main class="page">
    <header class="intro">
      <p>Nuxt integration playground</p>
      <h1>Tech monitor</h1>
      <NuxtLink to="/">Back</NuxtLink>
      <p>Extension profile: {{ extensionSelection?.selectedExtensionIds[0] }}</p>
    </header>

    <section class="grid">
      <article>
        <h2>Resolved extensions</h2>
        <ul class="list">
          <li v-for="id in extensionSelection?.resolvedExtensionIds" :key="id">
            <span>{{ id }}</span>
          </li>
        </ul>
      </article>

      <article>
        <h2>Selected provider</h2>
        <ul class="list">
          <li v-for="id in selectedProviderIds" :key="id">
            <span>{{ id }}</span>
          </li>
        </ul>
      </article>

      <article>
        <h2>Provider candidates</h2>
        <ul class="list">
          <li v-for="id in providerCandidateIds" :key="id">
            <span>{{ id }}</span>
          </li>
        </ul>
      </article>

      <article>
        <h2>Not injected</h2>
        <ul class="list">
          <li v-for="id in extensionSelection?.notInjectedExtensionIds" :key="id">
            <span>{{ id }}</span>
          </li>
        </ul>
      </article>
    </section>
  </main>
</template>

<style scoped>
.page {
  display: grid;
  gap: 16px;
  max-width: 1120px;
  padding: 32px;
  color: #202124;
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
}

h1 {
  margin: 0;
  font-size: 2rem;
}

h2 {
  margin: 0 0 12px;
  font-size: 1rem;
}

.grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(220px, 1fr));
  gap: 12px;
}

article {
  min-width: 0;
  padding: 16px;
  border: 1px solid #dadce0;
  border-radius: 8px;
  background: #ffffff;
}

.note {
  color: #5f6368;
}

.list,
.checks {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.list li {
  overflow-wrap: anywhere;
}

.checks li {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.note {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.45;
}

pre {
  overflow: auto;
  min-height: 96px;
  max-height: 180px;
  margin: 0;
  padding: 10px;
  border-radius: 6px;
  background: #f1f3f4;
  font-size: 0.8rem;
  line-height: 1.45;
}

a {
  color: #0b57d0;
  font-weight: 700;
  text-decoration: none;
}

@media (max-width: 980px) {
  .summary,
  .grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 620px) {
  .page {
    padding: 20px;
  }

  .summary,
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
