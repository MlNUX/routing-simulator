<script lang="ts">
	import { BaseEdge, EdgeLabel, getBezierPath, type Position } from '@xyflow/svelte';
	import { tick } from 'svelte';

	export let id: string;

	export let sourceX: number;
	export let sourceY: number;
	export let targetX: number;
	export let targetY: number;

	export let sourcePosition: Position;
	export let targetPosition: Position;

	export let label: unknown = '';
	export let labelStyle: string | Record<string, string | number> | undefined = undefined;
	export let data: any = {};

	const toCssText = (style: Record<string, string | number>): string =>
		Object.entries(style)
			.map(
				([key, value]) =>
					`${key.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)}:${String(value)}`
			)
			.join(';');

	$: [path, labelX, labelY] = getBezierPath({
		sourceX,
		sourceY,
		targetX,
		targetY,
		sourcePosition,
		targetPosition,
		curvature: 0.1
	});

	$: labelText = label === undefined || label === null ? '' : String(label);
	$: mergedStyle = {
		padding: '0px',
		background: 'transparent',
		border: 'none',
		boxShadow: 'none',
		...(typeof labelStyle === 'string' ? {} : (labelStyle ?? {}))
	};
	$: mergedStyleText =
		typeof labelStyle === 'string'
			? `${toCssText(mergedStyle)};${labelStyle}`
			: toCssText(mergedStyle);

	export let style: string | undefined = undefined;

	let editing = false;
	let weightDraft = '';
	let inputEl: HTMLInputElement | null = null;

	$: if (!editing) {
		weightDraft = labelText;
	}

	/**
	 * Aktiviert den Editormodus für das Kantengewicht.
	 * Wird bei einem Doppelklick auf das Label ausgelöst.
	 *
	 * @param e Mouse Event als Input des Benutzers
	 */
	function startEditing(event: MouseEvent) {
		event?.stopPropagation();
		event?.preventDefault();
		if (data?.disabled) return;
		if (data?.canEdit === false) return;
		editing = true;
		weightDraft = labelText;
		tick().then(() => inputEl?.focus());
	}

	/**
	 * Bricht den Editormodus ab.
	 */
	function cancelEditing() {
		editing = false;
		weightDraft = labelText;
	}

	/**
	 * Übernimmt den eingegebenen Wert aus dem Eingabefeld.
	 */
	function commitEditing() {
		if (!editing) return;
		const parsed = Math.max(1, Math.floor(Number(weightDraft)));
		if (Number.isFinite(parsed) && parsed !== Number(labelText)) {
			data?.onEditWeight?.(parsed);
		}
		editing = false;
	}

	/**
	 * Behandelt Tastatureingaben während der Bearbeitung.
	 *
	 * @param e Keyboard Event als Input des Benutzers
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
</script>

<BaseEdge {id} {path} {style} />

{#if labelText.length > 0}
	<EdgeLabel x={labelX} y={labelY} style={mergedStyleText} class="edge-label-reset">
		{#if editing}
			<input
				class="inline-flex max-w-14 rounded-sm border border-black/18 bg-white text-center
				text-xs font-bold text-dark-blue outline-none"
				bind:this={inputEl}
				bind:value={weightDraft}
				type="number"
				min="1"
				step="1"
				on:blur={commitEditing}
				on:keydown={handleKeydown}
				on:click|stopPropagation
			/>
		{:else}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				on:dblclick|stopPropagation|preventDefault={startEditing}
				on:mouseenter={() =>
					data?.onHover?.({
						id,
						sourceId: data?.sourceId,
						targetId: data?.targetId,
						weight: labelText,
						x: labelX,
						y: labelY
					})}
				on:mouseleave={() => data?.onHoverEnd?.()}
			>
				{labelText}
			</div>
		{/if}
	</EdgeLabel>
{/if}
