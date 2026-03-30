<script>
	import '../app.css';
	import '@xyflow/svelte/dist/style.css';

	import { SvelteFlowProvider } from '@xyflow/svelte';
</script>

<SvelteFlowProvider>
	<div class="relative h-screen w-screen overflow-hidden bg-sky-100 dark:bg-dark-theme-blue">
		<slot />
	</div>
</SvelteFlowProvider>
