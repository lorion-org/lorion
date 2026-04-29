<script setup lang="ts">
const plugins = useState<string[]>('extensionPlugins', () => []);
const layerValue = useShopLayerValue();
</script>

<template>
  <main>
    <h1>Shop extension mounted</h1>
    <ShopBadge />
    <p>{{ plugins.join(',') }}</p>
    <p>{{ layerValue }}</p>
  </main>
</template>
