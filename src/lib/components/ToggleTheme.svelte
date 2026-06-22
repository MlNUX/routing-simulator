<script lang="ts">
	import { onMount } from 'svelte';

	let darkMode = $state(false);

	// Wird beim Mounten der Komponente ausgeführt.
	// Liest das gespeicherte Theme aus dem LocalStorage und
	// berücksichtigt zusätzlich die Systempräferenz des Browsers.
	onMount(() => {
		// Check user system preference
		const saved = localStorage.getItem('theme');
		const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

		darkMode = saved === 'dark' || (!saved && prefersDark);
		if (darkMode) document.documentElement.classList.add('dark');
	});

	/**
	 * Wechselt zwischen Light- und Dark-Theme
	 * und speichert die Auswahl im LocalStorage.
	 */
	function toggleTheme() {
		darkMode = !darkMode;
		document.documentElement.classList.toggle('dark');
		localStorage.setItem('theme', darkMode ? 'dark' : 'light');
	}
</script>

<button
	class="fixed top-2.5 right-2.5 mt-1.5 hidden h-9 w-9 items-center justify-center
    rounded-xl p-2 transition-colors duration-200 sm:flex
    hover:bg-light-hover-white dark:hover:bg-blue-950"
	on:click={toggleTheme}
	data-help={darkMode ? 'Switch to the light theme.' : 'Switch to the dark theme.'}
	data-help-pos="bottom"
	data-help-fixed
>
	{#if darkMode}
		<img src="/icons/moon.svg" alt="DarkTheme" />
	{:else}
		<img src="/icons/sun.svg" alt="LightTheme" />
	{/if}
</button>
