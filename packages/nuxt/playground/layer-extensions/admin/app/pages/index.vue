<template>
  <main class="page">
    <header>
      <h1>Admin</h1>
      <NuxtLink to="/tech"> Tech monitor </NuxtLink>
    </header>

    <p>Built without shops.</p>
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

header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
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
