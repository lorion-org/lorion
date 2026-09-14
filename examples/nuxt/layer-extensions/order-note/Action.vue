<script setup lang="ts">
import { ref } from 'vue';
import type { CheckoutActionProps } from '../checkout/contracts';
defineProps<CheckoutActionProps>();
const count = ref(0);
</script>
<template>
  <button data-testid="order-note" @click="count++">
    Order note for {{ shopId }}: {{ count }}
  </button>
</template>
