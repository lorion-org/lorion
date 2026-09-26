<script setup lang="ts">
import { point } from '../../contributions';
import type { CheckoutActionProps } from '../../contracts';
defineProps<CheckoutActionProps>();
const items = useLorionContributions(point);
</script>
<template>
  <section aria-label="Checkout actions">
    <template v-if="items.length"
      ><component :is="item.value.component" v-for="item in items" :key="item.id" :shop-id="shopId"
    /></template>
    <p v-else>No checkout actions.</p>
  </section>
</template>
