<script lang="ts">
	import { uiState, setShowSurfer } from '$lib/viewmodels';

	$: open = !!$uiState?.showSurfer;

	// Schließt das "Subway Surfers"-Pop-up.
	function close() {
		setShowSurfer(false);
	}
</script>

{#if open}
	<div
		class="fixed bottom-4 left-4 z-280 flex h-60 w-[min(320px,calc(100vw-32px))]
  flex-col overflow-hidden rounded-2xl bg-white/98 text-[#0f172a] shadow-[0_14px_28px_rgba(15,23,42,0.25)]"
	>
		<div
			class="flex items-center justify-between border-b border-[rgba(15,23,42,0.12)] px-3 py-2.5
    text-sm font-black"
		>
			<div class="surfer-title">Surf's up 🌊</div>

			<button
				class="cursor-pointer rounded-[10px] border border-[rgba(15,23,42,0.18)] bg-white/92
      px-2 py-1 text-[13px] text-[#0f172a] hover:bg-white/98"
				aria-label="Close"
				on:click={close}>✖</button
			>
		</div>
		<div class="flex-1">
			<iframe
				src="https://www.youtube.com/embed/vTfD20dbxho?autoplay=1&mute=1&playsinline=1"
				allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
				allowfullscreen
				title="surfer-easter-egg"
			></iframe>
		</div>
	</div>
{/if}

<style>
	iframe {
		width: 100%;
		height: 100%;
		border: none;
		display: block;
	}
</style>
