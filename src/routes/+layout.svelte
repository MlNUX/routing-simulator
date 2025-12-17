<script>
  import '../app.css';
  import '@xyflow/svelte/dist/style.css';

  import { SvelteFlowProvider } from '@xyflow/svelte';
</script>

<SvelteFlowProvider>
  <div class="app-root">
    <slot />
  </div>
</SvelteFlowProvider>

