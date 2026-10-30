<script lang="ts">
  let health = $state<string>('…');
  fetch('/api/health').then((r) => r.json()).then((j) => (health = JSON.stringify(j))).catch((e) => (health = String(e)));
</script>

<main>
  <h1>Guarita</h1>
  <p>Em construção.</p>
  <pre>{health}</pre>
</main>
