<script setup lang="ts">
import { point } from '../../contributions';
const items = useLorionContributions(point);
const counter = items[0]!.value;
counter.count++;
</script>
<template>
  <p>Request counter: {{ counter.count }}</p>
</template>
