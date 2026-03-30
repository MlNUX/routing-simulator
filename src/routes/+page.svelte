<!-- routes/+page.svelte -->
<script lang="ts">
	import { fly } from 'svelte/transition';
	import { Controls } from '@xyflow/svelte';

	import Toolbar from '$lib/components/Toolbar.svelte';
	import Editor from '$lib/components/Editor.svelte';
	import RouterPanel from '$lib/components/RouterPanel.svelte';
	import Timeline from '$lib/components/Timeline.svelte';
	import PlaybackControls from '$lib/components/PlaybackControls.svelte';
	import RouterTablePanel from '$lib/components/RouterTablePanel.svelte';
	import ErrorToast from '$lib/components/ErrorToast.svelte';
	import ConfirmMenu from '$lib/components/ConfirmMenu.svelte';
	import SurferWindow from '$lib/components/SurferWindow.svelte';

	import { simulation, selectedRouterId, uiState, hideErrorToast } from '$lib/viewmodels';
	import ToggleTheme from '$lib/components/ToggleTheme.svelte';
	import ShortcutMenu from '$lib/components/ShortcutMenu.svelte';
	import { RoutingAlgorithmType } from '$lib/model/RoutingAlgorithmType';

	const scale = 1;
	const currentStep = 0;

	$: toastOpen = !!$uiState?.errorToast?.open;
	$: toastMessage = String($uiState?.errorToast?.message ?? '');
	$: algo = String($simulation?.algorithm ?? RoutingAlgorithmType.LINK_STATE);
	$: isDV =
		algo === RoutingAlgorithmType.DISTANCE_VECTOR ||
		algo === RoutingAlgorithmType.DISTANCE_VECTOR_POISONED;
	$: compactHistoryOpen = !!$uiState?.historyCompactOpen;
	$: historyViewOpen = !!$uiState?.showHistoryModal || !!$uiState?.showDijkstraModal;
	$: networkOffsetPx = compactHistoryOpen ? 'min(34vw, 420px)' : '0px';
	$: stepIndex = Number($simulation?.currentStepIndex ?? 0);
	$: history = Array.isArray(($simulation as any)?.history)
		? (($simulation as any).history as any[])
		: [];
	$: stateAtStep = history?.[Math.max(0, Math.floor(stepIndex))] ?? null;
	$: stepType = String((stateAtStep as any)?.stepType ?? '');
	$: stepLabel = (() => {
		const s = Math.floor(Number.isFinite(stepIndex) ? stepIndex : 0);
		if (!isDV) return `#${s}`;
		if (s === 0) return '0';
		const iter = Math.floor((s + 1) / 2);
		const phase = s % 2 === 1 ? '1' : '2';
		return `${iter}.${phase}`;
	})();
	$: stepPhase = (() => {
		const s = Math.floor(Number.isFinite(stepIndex) ? stepIndex : 0);
		if (stepType === 'update') return 'Update';
		if (!isDV) return '';
		if (stepType === 'send') return 'Send';
		if (stepType === 'recompute') return 'Recompute';
		if (s === 0) return 'Initialize';
		return s % 2 === 1 ? 'Send' : 'Recompute';
	})();
</script>

<div class:help-mode={$uiState.helpMode} class="relative h-full w-full" style={`--uiScale: ${scale};`}>
	<div
		class="absolute inset-y-0 right-0 z-0 transition-[left,width] duration-200 ease-out"
		style={`left: ${networkOffsetPx}; width: calc(100% - ${networkOffsetPx});`}
	>
		<Editor />
	</div>

	<ErrorToast open={toastOpen} message={toastMessage} timeout={4000} onClose={hideErrorToast} />
	<ConfirmMenu />
	<SurferWindow />

	<ShortcutMenu />
	<div class="top-bar" style="transform: scale(var(--uiScale, 1)); transform-origin: top left;">
		<Toolbar />
		<ToggleTheme />
	</div>

	{#if $uiState.menuOpen}
		<div in:fly={{ x: -18, duration: 180 }} out:fly={{ x: -18, duration: 160 }}>
			<RouterPanel />
		</div>
	{/if}

	{#if $selectedRouterId && !historyViewOpen}
		<RouterTablePanel />
	{/if}

	<div
		class="absolute bottom-6 left-1/2 z-10 w-[min(900px,90vw)] justify-center px-4"
		style="transform: translateX(-50%) scale(var(--uiScale, 1)); transform-origin: bottom center;"
	>
		<div
			class="mb-1.5 inline-block min-w-[120px] rounded-full bg-primary px-2
      py-1 text-center text-[14px] font-semibold text-white"
		>
			Current state: {stepLabel}{stepPhase ? ` · ${stepPhase}` : ''}
		</div>

		<Timeline />
		<PlaybackControls />
	</div>

	<div class="absolute right-18 bottom-0.5">
		<Controls
			class="items-center justify-center rounded-lg 
    p-1 text-accent shadow-lg hover:bg-light-hover-white dark:hover:bg-blue-950"
		/>
	</div>
</div>
