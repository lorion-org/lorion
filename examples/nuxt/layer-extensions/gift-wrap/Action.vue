<script setup lang="ts">
import { ref } from 'vue';
import type { CheckoutActionProps } from '../checkout/contracts';
defineProps<CheckoutActionProps>();
const count = ref(0);
</script>
<template>
  <button data-testid="gift-wrap" @click="count++">Gift wrap for {{ shopId }}: {{ count }}</button>
</template>
