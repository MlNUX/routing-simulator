<script lang="ts">
	import { fly } from 'svelte/transition';
	import { onDestroy } from 'svelte';

	export let message: string = '';
	export let open: boolean = false;
	export let dismissible: boolean = true;
	export let timeout: number = 0; // ms, 0 = stay until closed
	export let onClose: () => void = () => {};

	let timer: ReturnType<typeof setTimeout> | null = null;

	$: if (open && timeout > 0) {
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => handleClose(), timeout);
	}

	// Aufräum-Logik beim Zerstören der Komponente
	// (z. B. beim Wechsel der Seite oder Entfernen der Komponente)
	onDestroy(() => {
		if (timer) clearTimeout(timer);
	});

	/**
	 * Schließt den Error-Toast.
	 */
	function handleClose() {
		if (timer) {
			clearTimeout(timer);
			timer = null;
		}
		if (typeof onClose === 'function') onClose();
	}
</script>

{#if open && message}
	<div
		class="toast-shell"
		role="alert"
		aria-live="assertive"
		in:fly={{ x: 24, duration: 150 }}
		out:fly={{ x: 24, duration: 130 }}
	>
		<div class="toast">
			<div class="icon" aria-hidden="true">!</div>
			<div class="message">{message}</div>
			{#if dismissible}
				<button class="close" on:click={handleClose} aria-label="Dismiss">×</button>
			{/if}
		</div>
	</div>
{/if}

<style>
	.toast-shell {
		position: fixed;
		top: 16px;
		right: 16px;
		z-index: 320;
		pointer-events: none;
	}

	.toast {
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: center;
		gap: 10px;
		padding: 10px 12px;
		border-radius: 12px;
		border: 1px solid #fca5a5;
		background: #fef2f2;
		color: #7f1d1d;
		font-size: 13px;
		line-height: 1.35;
		min-width: 240px;
		max-width: min(420px, 90vw);
		box-shadow: 0 10px 24px rgba(15, 23, 42, 0.12);
		pointer-events: auto;
	}

	.icon {
		width: 22px;
		height: 22px;
		border-radius: 999px;
		background: #ef4444;
		color: #fff;
		display: grid;
		place-items: center;
		font-weight: 800;
		font-size: 13px;
		box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.06);
	}

	.message {
		word-break: break-word;
	}

	.close {
		border: none;
		background: transparent;
		color: inherit;
		font-size: 16px;
		cursor: pointer;
		padding: 4px 6px;
		border-radius: 8px;
		line-height: 1;
	}

	.close:hover {
		background: rgba(127, 29, 29, 0.08);
	}
</style>
