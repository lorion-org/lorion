<script setup lang="ts">
const { $payment } = useNuxtApp();
const paymentProvider = $payment.getProvider();
const checkoutPath = paymentProvider?.createCheckoutPath({ shopId: 'stationery' }) ?? '/';
</script>

<template>
  <main class="page">
    <NuxtLink to="/"> Back </NuxtLink>
    <h1>Paper Desk</h1>
    <p>Notebooks, pens, and desk basics.</p>
    <NuxtLink class="button" :to="checkoutPath">
      Checkout with {{ paymentProvider?.label ?? 'selected provider' }}
    </NuxtLink>
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

.button {
  width: fit-content;
  padding: 10px 12px;
  border-radius: 6px;
  background: #0b57d0;
  color: #ffffff;
}
</style>
