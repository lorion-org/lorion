<script setup lang="ts">
defineProps<{ shopId: string; requiredToken: string }>();
</script>
<template>
  <span>{{ requiredToken }}</span>
</template>
