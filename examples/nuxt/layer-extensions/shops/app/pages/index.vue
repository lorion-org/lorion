<script setup lang="ts">
const { $payment, $shops } = useNuxtApp();
const paymentProvider = $payment.getProvider();
const paymentProviderLabel = paymentProvider?.label ?? 'selected provider';
const shops = $shops.list();
</script>

<template>
  <main class="page">
    <header>
      <h1>Demo shops</h1>
      <NuxtLink to="/tech"> Tech monitor </NuxtLink>
    </header>

    <section class="shops">
      <NuxtLink v-for="shop in shops" :key="shop.id" class="link-card" :to="shop.path">
        <strong>{{ shop.name }}</strong>
        <span>{{ shop.tagline }}</span>
        <small>Checkout with {{ paymentProviderLabel }}</small>
      </NuxtLink>
    </section>
  </main>
</template>

<style scoped>
.page {
  display: grid;
  gap: 20px;
  max-width: 720px;
  padding: 32px;
  color: #202124;
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
}

header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
}

h1 {
  margin: 0;
  font-size: 1.8rem;
}

.shops {
  display: grid;
  gap: 12px;
}

.link-card {
  display: grid;
  gap: 4px;
  padding: 14px;
  border: 1px solid #dadce0;
  border-radius: 8px;
  color: #202124;
  text-decoration: none;
}

span,
small {
  color: #5f6368;
}

a {
  color: #0b57d0;
  font-weight: 700;
  text-decoration: none;
}
</style>
