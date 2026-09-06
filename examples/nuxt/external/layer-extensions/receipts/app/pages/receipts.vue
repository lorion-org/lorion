<script setup lang="ts">
const { $payment } = useNuxtApp();
const paymentProvider = $payment.getProvider();
</script>

<template>
  <main class="page">
    <NuxtLink to="/"> Back </NuxtLink>
    <h1>Receipts</h1>
    <p>
      Receipts are issued for checkouts paid through
      <strong>{{ paymentProvider?.label ?? 'the selected provider' }}</strong
      >.
    </p>
    <p>
      This extension lives outside the layer directory of this project, in a second root joined into
      the same package set. Nothing about it differs from the others.
    </p>
  </main>
</template>

<style scoped>
.page {
  display: grid;
  gap: 12px;
  max-width: 520px;
  padding: 32px;
  color: #202124;
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
}

h1,
p {
  margin: 0;
}

a {
  color: #0b57d0;
  font-weight: 700;
  text-decoration: none;
}
</style>
