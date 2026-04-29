export default defineNuxtPlugin(() => {
  const plugins = useState<string[]>('extensionPlugins', () => []);

  if (!plugins.value.includes('shop-plugin')) plugins.value.push('shop-plugin');
});
