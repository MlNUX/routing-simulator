<script lang="ts">
	import { Handle, Position } from '@xyflow/svelte';
	import { tick } from 'svelte';

	export let id: string;
	export let data: any = {};
	export let selected: boolean;

	// Berechnet die Positionen für gleichmäßig verteilte Handles um einen Kreis.
	const HANDLE_COUNT = 48;
	const RADIUS_PCT = 46;
	const handlePositions = Array.from({ length: HANDLE_COUNT }, (_, i) => {
		const angle = (i / HANDLE_COUNT) * Math.PI * 2;
		const left = 50 + RADIUS_PCT * Math.cos(angle);
		const top = 50 + RADIUS_PCT * Math.sin(angle);
		return { i, left: `${left}%`, top: `${top}%` };
	});

	let label = '';
	let status = 'nonoptimal';
	let editing = false;
	let nameDraft = '';
	let inputEl: HTMLInputElement | null = null;

	$: if (!editing) nameDraft = label;

	/**
	 * Behandelt Klicks auf den Router.
	 */
	function handleClick() {
		if (editing) return;
		const fn = data?.onSelect;
		if (typeof fn === 'function') {
			fn(id);
		}
	}

	/**
	 * Startet die Bearbeitung des Router-Labels.
	 * @param event Mouse Input des Benutzers
	 */
	async function startEditing(event: MouseEvent) {
		event?.stopPropagation();
		event?.preventDefault();
		if (editing) return;
		if (data?.disabled) return;
		if (data?.canEdit === false) return;

		editing = true;
		nameDraft = label;
		await tick();
		inputEl?.focus();
		inputEl?.select();
	}

	/**
	 * Bricht die Bearbeitung ab und setzt den Router-Label-Entwurf auf das
	 * aktuelle Router-Label zurück.
	 */
	function cancelEditing() {
		editing = false;
		nameDraft = label;
	}

	/**
	 * Übernimmt das bearbeitete Router-Label, wenn es geändert wurde.
	 */
	function commitEditing() {
		if (!editing) return;
		const next = nameDraft.trim();
		editing = false;
		if (!next || next === label) return;
		const fn = data?.onRename;
		if (typeof fn === 'function') fn(id, next);
	}

	/**
	 * Behandelt Tastatureingaben im Bearbeitungsfeld.
	 *
	 * @param e Keyboard Input des Benutzers
	 */
	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			commitEditing();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			cancelEditing();
		}
	}

	$: label = String(data?.label ?? id);
	$: status = String(data?.status ?? 'nonoptimal');

	// Berechnet die CSS-Klassen für den Router basierend auf Auswahl, Status
	// und optionalen Highlight-Rollen.
	$: routerStatus = (() => {
		const classes = ['relative', 'w-full', 'max-w-2xl', 'drop-shadow-lg'];

		if (selected) {
			classes.push('drop-shadow-indigo-900 dark:drop-shadow-cyan-600');
		} else if (status === 'optimal') {
			classes.push('drop-shadow-green-500');
		} else if (status === 'nonoptimal') {
			classes.push('drop-shadow-red-500');
		} else {
			classes.push('drop-shadow-gray-400');
		}

		if (status === 'disabled') {
			classes.push('opacity-40');
		}

		if (data?.highlightRole) {
			classes.push(`router-node--hover-${data.highlightRole}`);
		}

		return classes.join(' ');
	})();

	// Berechnet die CSS-Klassen für das Router-Label basierend auf dem Status.
	$: labelStatus = (() => {
		const classes = [
			'absolute',
			'inset-0',
			'flex',
			'items-center',
			'justify-center',
			'pointer-events-auto',
			'min-w-15',
			'max-w-22',
			'text-center',
			'top-8',
			'font-bold',
			'leading-tight',
			'overflow-hidden',
			'text-ellipsis',
			'whitespace-nowrap'
		];

		if (status === 'disabled') {
			classes.push('opacity-30');
			return classes.join(' ');
		}

		if (status === 'optimal') {
			classes.push('text-green-500 dark:text-green-500');
		} else if (status === 'nonoptimal') {
			classes.push('text-red-700 dark:text-red-700');
		} else {
			classes.push('text-dark-blue dark:text-almost-white');
		}

		return classes.join(' ');
	})();
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="relative"
	on:click={handleClick}
	on:dblclick|stopPropagation|preventDefault={startEditing}
>
	<img src="/icons/router_node.svg" alt="Router" class="{routerStatus} h-15 w-15" />

	<span class={labelStatus}>
		{#if editing}
			<input
				class="w-18 rounded-xl border border-black/20 bg-white px-2 py-1.5 text-center text-xs
        font-bold text-dark-blue outline-none"
				bind:this={inputEl}
				bind:value={nameDraft}
				on:blur={commitEditing}
				on:keydown={handleKeydown}
				on:click|stopPropagation
			/>
		{:else}
			{label}
		{/if}
	</span>

	{#each handlePositions as h (h.i)}
		<Handle
			id={`${id}-t-${h.i}`}
			type="target"
			position={Position.Top}
			style={`left:${h.left}; top:${h.top};`}
		/>
	{/each}

	{#each handlePositions as h (h.i)}
		<Handle
			id={`${id}-s-${h.i}`}
			type="source"
			position={Position.Top}
			style={`left:${h.left}; top:${h.top};`}
		/>
	{/each}
</div>

<style>
	:global(.svelte-flow__handle) {
		width: 4px;
		height: 4px;
		border-radius: 999px;
		background: transparent;
		border: none;
		opacity: 0;
		transform: translate(-50%, -50%);
	}

	.router-node--hover-source {
		box-shadow:
			0 4px 10px rgba(15, 23, 42, 0.25),
			0 0 0 3px rgba(14, 165, 233, 0.75),
			0 0 18px rgba(14, 165, 233, 0.7);
	}

	.router-node--hover-target {
		box-shadow:
			0 4px 10px rgba(15, 23, 42, 0.25),
			0 0 0 3px rgba(249, 115, 22, 0.75),
			0 0 18px rgba(249, 115, 22, 0.65);
	}

	.router-node--hover-both {
		box-shadow:
			0 4px 10px rgba(15, 23, 42, 0.25),
			0 0 0 3px rgba(168, 85, 247, 0.75),
			0 0 18px rgba(168, 85, 247, 0.7);
	}
</style>
