<!-- src/lib/components/PlaybackControls.svelte -->
<script lang="ts">
	import { simulation, ui, uiState } from '$lib/viewmodels';

	$: ctrl = $simulation as any;
	$: isRunning = !!ctrl?.running;
	$: canUndo = !!$uiState?.canUndo;
	$: canRedo = !!$uiState?.canRedo;
	$: intervalMs = Number($uiState?.playbackIntervalMs ?? 5000);

	const MIN_INTERVAL = 250;
	const MAX_INTERVAL = 5000;

	/**
	 * Startet die Simulation.
	 */
	function handlePlay() {
		if ($uiState?.menuOpen) {
			ui.toggleMenuOpen();
		}
		ui.play();
	}

	/**
	 * Pausiert die Simulation.
	 */
	function handlePause() {
		ui.pause();
	}

	/**
	 * Stoppt die Simulation.
	 */
	function handleStop() {
		ui.stop();
	}

	/**
	 * Lädt die Simulation neu.
	 */
	function handleReset() {
		ui.openConfirmMenu(
			{
				title: 'Reset/Clear Network?',
				message: 'Choose an action:',
				options: [
					{
						id: 'reset',
						label: 'Reset to Initial State',
						intent: 'primary',
						description: 'Restores the network to its initial state (R1, R2, R3...).'
					},
					{
						id: 'clear',
						label: 'Clear Entire Network',
						intent: 'danger',
						description: 'Deletes all routers and links (Blank Canvas).'
					},
					{ id: 'cancel', label: 'Cancel', intent: 'neutral' }
				]
			},
			(choice) => {
				if (choice === 'reset') ui.reset();
				if (choice === 'clear') ui.clear();
			}
		);
	}

	/**
	 * Führt einen Simulationsstep vorwärts aus.
	 */
	function stepForward() {
		ui.stepForward();
	}

	/**
	 * Führt einen Simulationsstep rückwärts aus.
	 */
	function stepBackward() {
		ui.stepBackward();
	}

	/**
	 * Macht die letzte Aktion rückgängig, sofern die Simulation nicht läuft.
	 */
	function handleUndo() {
		if (isRunning) return;
		ui.undo();
	}

	/**
	 * Stellt die zuletzt rückgängig gemachte Aktion wieder her, sofern die Simulation nicht läuft.
	 */
	function handleRedo() {
		if (isRunning) return;
		ui.redo();
	}

	/**
	 * Setzt das Intervall für das automatische Playback.
	 */
	function handleIntervalInput(event: Event) {
		const el = event.currentTarget as HTMLInputElement;
		const v = Number(el.value);
		ui.setPlaybackInterval(v);
	}
</script>

<div class="flex flex-wrap items-center justify-center gap-3">
	<div class="flex rounded-xl bg-primary p-1">
		<button
			class="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border-none
      bg-primary text-base text-white hover:brightness-110"
			on:click={handleUndo}
			disabled={isRunning || !canUndo}
			title="Undo"
			aria-label="Undo"
			data-help="Undo the last change in the current step."
			data-help-pos="top"
		>
			<img src="/icons/undo.svg" alt="Undo" />
		</button>

		<button
			class="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border-none
      bg-primary text-base text-white hover:brightness-110"
			on:click={handleRedo}
			disabled={isRunning || !canRedo}
			title="Redo"
			aria-label="Redo"
			data-help="Redo the last undone change."
			data-help-pos="top"
		>
			<img src="/icons/redo.svg" alt="Redo" />
		</button>
	</div>

	<div class="flex rounded-xl bg-primary p-1">
		<button
			class="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border-none
      bg-primary text-base text-white hover:brightness-110"
			on:click={handleReset}
			title="Reset"
			aria-label="Reset"
			data-help="Reset the network to its initial state or clear it completely."
			data-help-pos="top"
		>
			<img src="/icons/reload.svg" alt="Reset" />
		</button>

		<button
			class="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border-none
      bg-primary text-base text-white hover:brightness-110"
			on:click={stepBackward}
			title="Step backward"
			aria-label="Step backward"
			data-help="Go back one step."
			data-help-pos="top"
		>
			<img src="/icons/step-back.svg" alt="Step backward" />
		</button>

		<button
			class="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border-none
      bg-primary text-base text-white hover:brightness-110"
			on:click={isRunning ? handlePause : handlePlay}
			title={isRunning ? 'Pause' : 'Play'}
			aria-label={isRunning ? 'Pause' : 'Play'}
			data-help={isRunning ? 'Pause the simulation.' : 'Start the simulation.'}
			data-help-pos="top"
		>
			{#if isRunning}
				<img src="/icons/pause.svg" alt="Pause" />
			{:else}
				<img src="/icons/play.svg" alt="Play" />
			{/if}
		</button>

		<button
			class="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border-none
      bg-primary text-base text-white hover:brightness-110"
			on:click={stepForward}
			title="Step forward"
			aria-label="Step forward"
			data-help="Advance by one step."
			data-help-pos="top"
		>
			<img src="/icons/step-front.svg" alt="Step forward" />
		</button>

		<button
			class="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border-none
      bg-primary text-base text-white hover:brightness-110"
			on:click={handleStop}
			title="Stop"
			aria-label="Stop"
			data-help="Stop the simulation and return to step 0."
			data-help-pos="top"
		>
			<img src="/icons/stop.svg" alt="Stop" />
		</button>
	</div>

	<div
		class="flex items-center gap-2 rounded-xl border border-primary bg-white/90 px-3 py-2 shadow-sm dark:bg-blue-950"
		data-help="Adjust the speed of automatic playback."
		data-help-pos="top"
	>
		<label class="text-[11px] font-semibold text-dark-blue dark:text-almost-white">Interval</label>
		<input
			type="range"
			min={MIN_INTERVAL}
			max={MAX_INTERVAL}
			step="250"
			value={intervalMs}
			on:input={handleIntervalInput}
			aria-label="Playback interval in milliseconds"
			style="width: 160px;"
		/>
		<div
			class="w-[70px] text-right text-[12px] font-semibold text-dark-blue dark:text-almost-white"
		>
			{(intervalMs / 1000).toFixed(2)}s
		</div>
	</div>
</div>
