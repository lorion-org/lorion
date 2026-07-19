<script setup lang="ts">
const route = useRoute();
</script>

<template>
  <main class="page">
    <NuxtLink :to="`/shops/${route.query.shop ?? 'coffee'}`"> Back to shop </NuxtLink>
    <h1>Invoice checkout</h1>
    <p>Shop: {{ route.query.shop }}</p>
    <p>This page is contributed by the invoice provider layer.</p>
  </main>
</template>

<style scoped>
.page {
  display: grid;
  gap: 10px;
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
