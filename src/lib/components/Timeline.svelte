<script lang="ts">
	import { EventType } from '$lib/model/EventType';
	import { simulation } from '$lib/viewmodels';
	import '../../app.css';

	$: history = Array.isArray(($simulation as any)?.history) ? ($simulation as any).history : [];
	$: steps = history.length > 0 ? history.length : 1;

	$: stepEvents = Array.from({ length: steps }, (_, i) => {
		const events = Array.isArray((history[i] as any)?.executedEvents)
			? (history[i] as any).executedEvents
			: [];
		return events;
	});

	$: stepHasEvents = Array.from({ length: steps }, (_, i) => {
		const events = stepEvents[i] ?? [];
		return events.length > 0;
	});

	$: currentStep = Math.max(0, Math.floor(Number(($simulation as any)?.currentStepIndex ?? 0)));

	$: maxIndex = Math.max(0, steps - 1);
	$: clamped = Math.min(currentStep, maxIndex);
	$: knobLeft = maxIndex > 0 ? (clamped / maxIndex) * 100 : 0;

	let hoveredIndex: number | null = null;
	$: hoveredEvents = hoveredIndex === null ? [] : (stepEvents[hoveredIndex] ?? []);
	$: hoverLeft =
		hoveredIndex === null ? null : maxIndex === 0 ? 0 : (hoveredIndex / maxIndex) * 100;

	/**
	 * Formatiert das Payload eines Events in eine lesbare Zeichenkette.
	 *
	 * @param payload eines Events
	 * @returns Formatierten Payload
	 */
	function formatPayload(payload: any): string {
		if (!payload || typeof payload !== 'object') return '';
		const entries = Object.entries(payload)
			.map(([k, v]) => `${k}=${String(v)}`)
			.join(', ');
		return entries ? ` (${entries})` : '';
	}

	/**
	 * Erstellt eine kompakte Textdarstellung eines Events.
	 *
	 * @param evt Gegebener Event
	 * @returns Formatierten Event
	 */
	function formatEvent(evt: any): string {
		const type = String(evt?.type ?? evt?.type ?? 'EVENT');
		const target = String(evt?.targetId ?? evt?.targetId ?? '').trim();
		const payload = formatPayload(evt?.payload);
		if (target) return `${type} @ ${target}${payload}`;
		return `${type}${payload}`;
	}

	/**
	 * Prüft, ob eine Eventliste mindestens ein Event enthält,
	 * dessen Typ nicht `NODE_MOVE` ist.
	 *
	 * @param events Liste aller möglichen Events
	 * @returns true, wenn NODE_MOVE nicht vorhanden, sonst false
	 */
	function hasNotMoveType(events: any): boolean {
		for (var evt of events) {
			if (evt.type != 'NODE_MOVE') return true;
		}

		return false;
	}
</script>

<div class="relative mb-1.5 h-6">
	<!-- baseline -->
	<div class="absolute top-1/2 right-0 left-0 h-0.5 -translate-y-1/2 bg-secondary"></div>

	<!-- ticks -->
	<div class="absolute inset-x-0 top-1/2 -translate-y-1/2">
		{#if steps <= 1}
			<button
				class="tick-hit"
				style="left: 0%;"
				title="Step 0"
				on:mouseenter={() => (hoveredIndex = 0)}
				on:mouseleave={() => (hoveredIndex = null)}
				on:focus={() => (hoveredIndex = 0)}
				on:blur={() => (hoveredIndex = null)}
			>
				{#if stepHasEvents[0] && hasNotMoveType(stepEvents[0])}
					<span class="item-center flex justify-center text-2xl font-bold text-orange-400">!</span>
				{:else}
					<span
						class="block h-3.5 w-[3px] rounded-md bg-secondary transition-[transform,background]
            duration-120 ease-in-out
            group-hover:scale-y-110 group-focus-visible:scale-y-110"
					></span>
				{/if}
			</button>
		{:else}
			{#each Array.from({ length: steps }, (_, i) => i) as i (i)}
				<button
					class="tick-hit"
					style={`left: ${(i / (steps - 1)) * 100}%;`}
					title={`History #${i}`}
					on:mouseenter={() => (hoveredIndex = i)}
					on:mouseleave={() => (hoveredIndex = null)}
					on:focus={() => (hoveredIndex = i)}
					on:blur={() => (hoveredIndex = null)}
				>
					<span class="tick-band" class:tick-band--active={hoveredIndex === i}></span>
					{#if stepHasEvents[i] && hasNotMoveType(stepEvents[i])}
						<span class="item-center flex justify-center text-2xl font-bold text-orange-400">!</span
						>
					{:else}
						<span
							class="block h-3.5 w-[3px] rounded-md bg-secondary transition-[transform,background]
              duration-120 ease-in-out
              group-hover:scale-y-110 group-focus-visible:scale-y-110"
						></span>
					{/if}
				</button>
			{/each}
		{/if}
	</div>

	<!-- knob -->
	<div
		class="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2
    rounded-full border-2 border-white bg-secondary shadow-sm shadow-slate-900/40"
		style={`left: ${knobLeft}%;`}
		title={`currentStepIndex: ${currentStep}`}
	></div>

	{#if hoveredIndex !== null && hoverLeft !== null}
		<div
			class="bottom-[calc(100% + 8px)] pointer-events-none absolute right-0 left-0"
			aria-live="polite"
		>
			<div class="absolute left-0 -translate-x-1/2" style={`left: ${hoverLeft}%;`}>
				<div
					class="pointer-events-none max-w-[280px] min-w-40 rounded-xl bg-dark-blue/94 px-2.5
          py-2 text-almost-white shadow-xl"
				>
					<div class="mb-1 text-xs font-extrabold opacity-90">
						Step {hoveredIndex}
					</div>
					{#if (hoveredEvents?.length ?? 0) === 0}
						<div
							class="text-xs leading-[1.35] wrap-break-word whitespace-normal italic
            opacity-70 [&+&]:mt-1"
						>
							No events
						</div>
					{:else}
						{#each hoveredEvents as evt, idx (idx)}
							<div
								class="text-xs leading-[1.35] wrap-break-word whitespace-normal italic opacity-70 [&+&]:mt-1"
							>
								{#if evt?.type === EventType.NODE_MOVE}
									No events
								{:else}
									{formatEvent(evt)}
								{/if}
							</div>
						{/each}
					{/if}
				</div>
			</div>
		</div>
	{/if}
</div>
