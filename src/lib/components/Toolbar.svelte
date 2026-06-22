<!-- src/lib/components/Toolbar.svelte -->
<script lang="ts">
	import DebugConsoleModal from '$lib/components/DebugConsoleModal.svelte';
	import DijkstraModal from '$lib/components/DijkstraModal.svelte';
	import RouterHistoryModal from '$lib/components/RouterHistoryModal.svelte';
	import { simulation, ui, uiState } from '$lib/viewmodels';
	import { notify } from '$lib/notify';
	import { RoutingAlgorithmType } from '$lib/model/RoutingAlgorithmType';

	$: isRunning = !!$simulation?.running;

	type AlgorithmSelection = 'link' | 'distance' | 'distancePoisoned';

	// Derive selection from the actual controller algorithm (prevents drift vs debug console, etc.)
	$: algo = String($simulation?.algorithm ?? RoutingAlgorithmType.LINK_STATE);
	$: isLinkState = algo === RoutingAlgorithmType.LINK_STATE;
	$: selected =
		algo === RoutingAlgorithmType.DISTANCE_VECTOR
			? ('distance' satisfies AlgorithmSelection)
			: algo === RoutingAlgorithmType.DISTANCE_VECTOR_POISONED
				? ('distancePoisoned' satisfies AlgorithmSelection)
				: ('link' satisfies AlgorithmSelection);

	let fileInput: HTMLInputElement | null = null;
	let mobileMenuOpen = false;

	type ScenarioEntry = {
		name: string;
		path: string;
		load: () => Promise<string>;
	};

	let scenarios: ScenarioEntry[] = [];

	const scenarioModules = import.meta.glob('$lib/scenarios/*.json', {
		query: '?raw',
		import: 'default'
	}) as Record<string, () => Promise<string>>;

	/**
	 * Erstellt eine sortierte Liste aller verfügbaren Szenario-Presets.
	 *
	 * @returns Liste der Szenario-Presets
	 */
	function buildScenarioList(): ScenarioEntry[] {
		const entries: ScenarioEntry[] = [];

		for (const [path, loader] of Object.entries(scenarioModules)) {
			const base = path.split('/').pop() ?? path;
			const name = base
				.replace(/\.json$/i, '')
				.replace(/[_-]+/g, ' ')
				.trim()
				.replace(/\b\w/g, (char) => char.toUpperCase());
			entries.push({ name, path, load: loader });
		}

		entries.sort((a, b) => a.name.localeCompare(b.name));
		return entries;
	}

	/**
	 * Öffnet ein Bestätigungsmenü zum Wechsel des Routing-Algorithmus.
	 * Der Benutzer kann entscheiden, ob die Simulation vollständig zurückgesetzt
	 * oder nur der Algorithmus gewechselt und zu Step 0 gesprungen werden soll.
	 *
	 * @param nextSelected Der vom Benutzer ausgewählte Algorithmus
	 */
	function confirmAlgorithmChange(nextSelected: AlgorithmSelection) {
		const nextLabel =
			nextSelected === 'link'
				? 'Link State'
				: nextSelected === 'distance'
					? 'Distance Vector'
					: 'Distance Vector (Poisoned Reverse)';

		ui.openConfirmMenu(
			{
				title: 'Switch algorithm?',
				message: `How should "${nextLabel}" be switched to?`,
				options: [
					{
						id: 'reset-all',
						label: 'Yes, reset to initial topology to step 0',
						intent: 'danger',
						description: 'Resets the simulation, retaining only the initial state of the topology.'
					},
					{ id: 'cancel', label: 'Cancel', intent: 'neutral' }
				]
			},
			(choice) => {
				if (choice === 'reset-all') {
					ui.reset();
					ui.setAlgorithm(nextSelected);
				}
			}
		);
	}

	/**
	 * Wendet einen neuen Routing-Algorithmus an.
	 *
	 * @param nextSelected Der vom Benutzer ausgewählte Algorithmus
	 */
	function applyAlgorithm(nextSelected: AlgorithmSelection) {
		if (isRunning) return;
		if (selected === nextSelected) return;
		confirmAlgorithmChange(nextSelected);
	}

	/**
	 * Wählt den Link-State-Algorithmus aus.
	 */
	function selectLinkState() {
		applyAlgorithm('link');
	}

	/**
	 * Wählt den Distanz-Vektor-Algorithmus aus.
	 */
	function selectDistanceVector() {
		applyAlgorithm('distance');
	}

	/**
	 * Wählt den Distanz-Vektor-Algorithmus mit Poisoned Reverse aus.
	 */
	function selectDistanceVectorPoisoned() {
		applyAlgorithm('distancePoisoned');
	}

	/**
	 * Öffnet oder schließt das Szenario-Auswahlmenü.
	 */
	function handleChoosePreset() {
		if ($uiState.showScenarioModal) {
			ui.setShowScenarioModal(false);
			return;
		}

		scenarios = buildScenarioList();
		ui.setShowScenarioModal(true);
	}

	/**
	 * Öffnet oder schließt das Editor-Menü.
	 */
	function handleToggleMenu() {
		if ($uiState.menuOpen) {
			ui.toggleMenuOpen();
			return;
		}

		if (isRunning) {
			ui.openConfirmMenu(
				{
					title: 'Open the editor?',
					message: 'If you continue, the simulation will be paused.',
					options: [
						{ id: 'continue', label: 'Continue and pause', intent: 'primary' },
						{ id: 'cancel', label: 'Cancel', intent: 'neutral' }
					]
				},
				(choice) => {
					if (choice !== 'continue') return;
					ui.pause();
					ui.toggleMenuOpen();
				}
			);
			return;
		}

		ui.toggleMenuOpen();
	}

	/**
	 * Exportiert die aktuelle Topologie als JSON-Datei
	 * und startet einen Download im Browser.
	 */
	async function handleExportJson() {
		if (typeof window === 'undefined') return;
		if (isRunning) return;

		const json = ui.exportJson();
		if (!json || String(json).trim().length === 0) {
			await notify('Export returned empty JSON (backend not wired).', { kind: 'warning' });
			return;
		}

		const blob = new Blob([json], { type: 'application/json' });
		const url = URL.createObjectURL(blob);

		const a = document.createElement('a');
		a.href = url;
		a.download = 'topology.json';
		document.body.appendChild(a);
		a.click();
		a.remove();

		URL.revokeObjectURL(url);
	}

	/**
	 * Öffnet einen Dateidialog zum Importieren einer JSON-Topologie.
	 */
	function handleImportJson() {
		if (typeof window === 'undefined') return;
		if (isRunning) return;
		const input = fileInput;
		if (!input) return;

		ui.openConfirmMenu(
			{
				title: 'Load JSON?',
				message: 'Loading will overwrite the current simulation. Continue?',
				options: [
					{ id: 'load', label: 'Yes, load JSON', intent: 'primary' },
					{ id: 'cancel', label: 'Cancel', intent: 'neutral' }
				]
			},
			(choice) => {
				if (choice !== 'load') return;
				input.value = '';
				input.click();
			}
		);
	}

	/**
	 * Wird aufgerufen, nachdem eine JSON-Topologie im Importdialog ausgewählt wurde.
	 * Liest den Inhalt der JSON-Topologie und übergibt ihn an die Importfunktion der UI.
	 *
	 * @param event Die importierte JSON-Topologie
	 */
	async function handleFileChosen(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const files = input.files;
		if (!files || files.length === 0) return;

		const file = files[0];
		try {
			const text = await file.text();
			ui.importJson(text);
			await notify('Imported JSON (if backend import is implemented).', { kind: 'info' });
		} catch (e) {
			await notify(`Import failed: ${(e as Error)?.message ?? String(e)}`, { kind: 'error' });
		}
	}

	/**
	 * Lädt ein ausgewähltes Szenario-Preset.
	 *
	 * @param entry Das ausgewählte Szenario-Preset
	 */
	async function loadScenario(entry: ScenarioEntry) {
		if (typeof window === 'undefined') return;

		ui.openConfirmMenu(
			{
				title: 'Load preset?',
				message: `Preset “${entry.name}” reloads the current simulation. Continue?`,
				options: [
					{ id: 'load', label: 'Yes, load preset', intent: 'primary' },
					{ id: 'cancel', label: 'Cancel', intent: 'neutral' }
				]
			},
			async (choice) => {
				if (choice !== 'load') return;
				try {
					const text = await entry.load();

					ui.importJson(text);
					await notify(`Preset "${entry.name}" loaded.`, { kind: 'success' });
					ui.setShowScenarioModal(false);
				} catch (e) {
					const msg = (e as Error)?.message ?? 'Unknown error loading the preset.';
					console.error(e);
					await notify(msg, { kind: 'error' });
				}
			}
		);
	}
</script>

<div class="fixed top-1.5 left-1/2 z-50 w-[min(1300px,98vw)] -translate-x-1/2">

	<!-- ── MOBILE LAYOUT (< sm) ── -->
	<div class="flex sm:hidden items-center justify-between px-3 py-2">
		<!-- Logo -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="flex items-center gap-2" on:dblclick={() => ui.setDebugUnlocked(true)}>
			<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-white/85 p-1 shadow-sm dark:bg-slate-900/80">
				<img src="/STAR_logo.png" alt="STAR logo" class="h-full w-full object-contain" />
			</div>
			<div>
				<div class="text-[11px] font-black tracking-[0.2em] text-dark-blue dark:text-almost-white">ROUTING SIM</div>
				<div class="text-[9px] font-semibold tracking-[0.15em] text-dark-blue/60 uppercase dark:text-almost-white/60">STAR · {selected === 'link' ? 'LS' : selected === 'distance' ? 'DV' : 'DV-PR'}</div>
			</div>
		</div>

		<!-- Hamburger -->
		<button
			class="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border-none bg-primary text-white"
			on:click={() => (mobileMenuOpen = !mobileMenuOpen)}
			aria-label="Open menu"
		>
			{#if mobileMenuOpen}
				<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M2 2l14 14M16 2L2 16" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>
			{:else}
				<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect y="3" width="18" height="2.5" rx="1.25" fill="currentColor"/><rect y="8" width="18" height="2.5" rx="1.25" fill="currentColor"/><rect y="13" width="18" height="2.5" rx="1.25" fill="currentColor"/></svg>
			{/if}
		</button>
	</div>

	<!-- Mobile dropdown -->
	{#if mobileMenuOpen}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="fixed inset-0 z-[-1] sm:hidden"
			on:click={() => (mobileMenuOpen = false)}
		></div>
		<div class="absolute left-2 right-2 top-[calc(100%+4px)] z-50 rounded-2xl bg-white/97 p-4 shadow-2xl sm:hidden dark:bg-slate-900/97">

			<!-- Algorithm -->
			<div class="mb-3">
				<div class="mb-2 text-[10px] font-bold tracking-[0.15em] text-dark-blue/50 uppercase dark:text-almost-white/50">Algorithm</div>
				<div class="flex flex-col gap-1.5">
					<button
						class={`rounded-xl px-4 py-2.5 text-left text-[12px] font-semibold ${selected === 'link' ? 'bg-primary text-white' : 'bg-sky-50 text-dark-blue dark:bg-slate-800 dark:text-almost-white'}`}
						on:click={() => { selectLinkState(); mobileMenuOpen = false; }}
					>Link State</button>
					<button
						class={`rounded-xl px-4 py-2.5 text-left text-[12px] font-semibold ${selected === 'distance' ? 'bg-primary text-white' : 'bg-sky-50 text-dark-blue dark:bg-slate-800 dark:text-almost-white'}`}
						on:click={() => { selectDistanceVector(); mobileMenuOpen = false; }}
					>Distance Vector</button>
					<button
						class={`rounded-xl px-4 py-2.5 text-left text-[12px] font-semibold ${selected === 'distancePoisoned' ? 'bg-primary text-white' : 'bg-sky-50 text-dark-blue dark:bg-slate-800 dark:text-almost-white'}`}
						on:click={() => { selectDistanceVectorPoisoned(); mobileMenuOpen = false; }}
					>Distance Vector (PR)</button>
				</div>
			</div>

			<div class="my-3 border-t border-slate-200 dark:border-slate-700"></div>

			<!-- Actions -->
			<div class="flex flex-col gap-1.5">
				<button
					class="rounded-xl bg-secondary/20 px-4 py-2.5 text-left text-[12px] font-semibold text-dark-blue dark:text-almost-white"
					on:click={() => { isLinkState ? ui.setShowDijkstraModal(!$uiState.showDijkstraModal) : ui.setShowHistoryModal(!$uiState.showHistoryModal); mobileMenuOpen = false; }}
				>Zustände</button>
				<button
					class="rounded-xl bg-secondary/20 px-4 py-2.5 text-left text-[12px] font-semibold text-dark-blue dark:text-almost-white"
					on:click={() => { handleChoosePreset(); mobileMenuOpen = false; }}
				>Choose Preset</button>
				{#if $uiState.debugUnlocked}
					<button
						class="rounded-xl bg-secondary/20 px-4 py-2.5 text-left text-[12px] font-semibold text-dark-blue dark:text-almost-white"
						on:click={() => { ui.setShowDebugModal(!$uiState.showDebugModal); mobileMenuOpen = false; }}
					>Debug Console</button>
				{/if}
			</div>

			<div class="my-3 border-t border-slate-200 dark:border-slate-700"></div>

			<!-- Icon actions -->
			<div class="grid grid-cols-4 gap-2">
				<button
					class={`flex flex-col items-center gap-1 rounded-xl py-2.5 text-[10px] font-semibold ${$uiState.helpMode ? 'bg-cyan-500 text-white' : 'bg-sky-50 text-dark-blue dark:bg-slate-800 dark:text-almost-white'}`}
					on:click={() => { ui.toggleHelpMode(); mobileMenuOpen = false; }}
				>
					<img src="/icons/help.svg" alt="" class="h-5 w-5" />Help
				</button>
				<button
					class={`flex flex-col items-center gap-1 rounded-xl py-2.5 text-[10px] font-semibold ${$uiState.menuOpen ? 'bg-primary text-white' : 'bg-sky-50 text-dark-blue dark:bg-slate-800 dark:text-almost-white'}`}
					on:click={() => { handleToggleMenu(); mobileMenuOpen = false; }}
				>
					<img src="/icons/edit.svg" alt="" class="h-5 w-5" />Edit
				</button>
				<button
					class="flex flex-col items-center gap-1 rounded-xl bg-sky-50 py-2.5 text-[10px] font-semibold text-dark-blue disabled:opacity-40 dark:bg-slate-800 dark:text-almost-white"
					on:click={() => { handleExportJson(); mobileMenuOpen = false; }}
					disabled={isRunning}
				>
					<img src="/icons/save.svg" alt="" class="h-5 w-5" />Save
				</button>
				<button
					class="flex flex-col items-center gap-1 rounded-xl bg-sky-50 py-2.5 text-[10px] font-semibold text-dark-blue disabled:opacity-40 dark:bg-slate-800 dark:text-almost-white"
					on:click={() => { handleImportJson(); mobileMenuOpen = false; }}
					disabled={isRunning}
				>
					<img src="/icons/upload.svg" alt="" class="h-5 w-5" />Load
				</button>
			</div>
		</div>
	{/if}

	<!-- ── DESKTOP LAYOUT (sm+) ── -->
	<div class="hidden sm:flex w-full items-center justify-between gap-8 px-3 py-3">
		<!--Top bar left side-->
		<div class="max-w-[320px] shrink-0" on:dblclick={() => ui.setDebugUnlocked(true)}>
			<div class="flex items-center gap-3">
				<div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-white/85 p-1 shadow-sm dark:bg-slate-900/80">
					<img src="/STAR_logo.png" alt="STAR logo" class="h-full w-full object-contain" />
				</div>
				<div class="min-w-0">
					<div class="text-base font-black tracking-[0.25em] text-dark-blue dark:text-almost-white">ROUTING SIMULATOR</div>
					<div class="text-[10px] font-semibold tracking-[0.18em] text-dark-blue/70 uppercase dark:text-almost-white/70">STAR</div>
				</div>
			</div>
		</div>

		<div class="flex-1">
			<div class="flex flex-nowrap items-center justify-center gap-2">
				<button
					class={`cursor-pointer rounded-full border border-primary px-5 py-2 text-[11px] font-semibold tracking-wider uppercase ${selected === 'link' ? 'bg-primary text-almost-white' : 'bg-sky-100 text-dark-blue hover:bg-almost-white dark:bg-dark-theme-blue dark:text-almost-white dark:hover:bg-blue-950'}`}
					on:click={selectLinkState}
					data-help="Activate the Link State algorithm."
					data-help-pos="bottom"
				>LINK STATE</button>

				<button
					class={`cursor-pointer rounded-full border border-primary px-5 py-2 text-[11px] font-semibold tracking-wider uppercase ${selected === 'distance' ? 'bg-primary text-white' : 'bg-sky-100 text-dark-blue hover:bg-almost-white dark:bg-dark-theme-blue dark:text-almost-white dark:hover:bg-blue-950'}`}
					on:click={selectDistanceVector}
					data-help="Activate the Distance Vector algorithm."
					data-help-pos="bottom"
				>DISTANCE VECTOR</button>

				<button
					class={`cursor-pointer rounded-full border border-primary px-5 py-2 text-[11px] font-semibold tracking-wider uppercase ${selected === 'distancePoisoned' ? 'bg-primary text-white' : 'bg-sky-100 text-dark-blue hover:bg-almost-white dark:bg-dark-theme-blue dark:text-almost-white dark:hover:bg-blue-950'}`}
					on:click={selectDistanceVectorPoisoned}
					data-help="Activate Distance Vector with Poisoned Reverse."
					data-help-pos="bottom"
				>DISTANCE VECTOR (PR)</button>

				<button
					class="cursor-pointer rounded-full border border-primary bg-secondary px-5 py-2 text-[11px] font-semibold tracking-wider text-dark-blue uppercase hover:brightness-105"
					on:click={() => isLinkState ? ui.setShowDijkstraModal(!$uiState.showDijkstraModal) : ui.setShowHistoryModal(!$uiState.showHistoryModal)}
					data-help="Show routing information."
					data-help-pos="bottom"
				>Zustände</button>

				{#if $uiState.debugUnlocked}
					<button
						class="cursor-pointer rounded-full border border-primary bg-secondary px-5 py-2 text-[11px] font-semibold tracking-wider text-dark-blue uppercase hover:brightness-105"
						on:click={() => ui.setShowDebugModal(!$uiState.showDebugModal)}
						data-help="Open the debug console."
						data-help-pos="bottom"
					>DEBUG</button>
				{/if}

				<button
					class="cursor-pointer rounded-full border border-primary bg-secondary px-5 py-2 text-[11px] font-semibold tracking-wider text-dark-blue uppercase hover:brightness-105"
					on:click={handleChoosePreset}
					data-help="Load a preset scenario."
					data-help-pos="bottom"
				>CHOOSE PRESET</button>
			</div>
		</div>

		<!--Top bar right side-->
		<div class="flex w-fit shrink-0 items-center justify-end gap-2">
			<button
				class={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border-none text-base text-white hover:brightness-105 ${$uiState.helpMode ? 'bg-cyan-500 ring-2 ring-white ring-offset-2 ring-offset-primary shadow-lg shadow-cyan-300/60' : 'bg-primary'}`}
				on:click={() => ui.toggleHelpMode()}
				aria-label={$uiState.helpMode ? 'Disable help mode' : 'Enable help mode'}
				aria-pressed={$uiState.helpMode}
				title={$uiState.helpMode ? 'Disable help mode' : 'Enable help mode'}
				data-help={$uiState.helpMode ? 'Disable help mode.' : 'Enable help mode and show labels.'}
				data-help-pos="bottom"
			><img src="/icons/help.svg" alt="Help" /></button>

			<button
				class={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border-none bg-primary text-base text-white hover:brightness-105 ${$uiState.menuOpen ? 'drop-shadow-md drop-shadow-cyan-400' : ''}`}
				on:click={handleToggleMenu}
				aria-label="Toggle tools menu"
				aria-pressed={$uiState.menuOpen}
				title={$uiState.menuOpen ? 'Close tools menu' : 'Open tools menu'}
				data-help={$uiState.menuOpen ? 'Close the editor tools.' : 'Open the editor tools.'}
				data-help-pos="bottom"
			><img src="/icons/edit.svg" alt="Edit" /></button>

			<button
				class="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border-none bg-primary text-base text-white hover:brightness-105"
				on:click={handleExportJson}
				disabled={isRunning}
				title="Export JSON"
				aria-label="Export JSON"
				data-help="Export the current simulation as JSON."
				data-help-pos="bottom"
			><img src="/icons/save.svg" alt="Save" /></button>

			<button
				class="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border-none bg-primary text-base text-white hover:brightness-105"
				on:click={handleImportJson}
				disabled={isRunning}
				title="Import JSON"
				aria-label="Import JSON"
				data-help="Load a simulation from a JSON file."
				data-help-pos="bottom"
			><img src="/icons/upload.svg" alt="Import" /></button>

			<input bind:this={fileInput} type="file" accept="application/json,.json" style="display:none;" on:change={handleFileChosen} />
		</div>
	</div>
</div>

<DebugConsoleModal open={$uiState.showDebugModal} onClose={() => ui.setShowDebugModal(false)} />
<RouterHistoryModal
	open={$uiState.showHistoryModal}
	onClose={() => ui.setShowHistoryModal(false)}
/>
<DijkstraModal open={$uiState.showDijkstraModal} onClose={() => ui.setShowDijkstraModal(false)} />

{#if $uiState.showScenarioModal}
	<div class="scenario-overlay" on:click={() => ui.setShowScenarioModal(false)}></div>

	<div
		class="scenario-modal"
		role="dialog"
		aria-modal="true"
		aria-label="Scenarios"
		on:click|stopPropagation
	>
		<div class="mb-2 flex items-center justify-between gap-3">
			<div class="text-sm font-bold text-dark-blue">Scenarios</div>
			<button
				class="cursor-pointer border-none bg-transparent text-sm text-dark-blue"
				title="Close"
				on:click={() => ui.setShowScenarioModal(false)}
				type="button"
			>
				✖
			</button>
		</div>

		{#if scenarios.length === 0}
			<div class="text-xs text-dark-blue">
				No scenario JSON files found.<br />
				Put files into <code>src/lib/scenarios/*.json</code>.
			</div>
		{:else}
			<div class="text-xs text-dark-blue">
				<ul class="m-0 grid list-none gap-2 p-0">
					{#each scenarios as s}
						<li>
							<button class="scenario-btn" on:click={() => loadScenario(s)} type="button">
								{s.name}
							</button>
						</li>
					{/each}
				</ul>
			</div>
		{/if}
	</div>
{/if}

<style>
	.scenario-overlay {
		position: fixed;
		inset: 0;
		background: rgba(15, 23, 42, 0.35);
		z-index: 120;
	}

	.scenario-modal {
		position: fixed;
		left: 50%;
		top: 90px;
		transform: translateX(-50%);
		width: min(520px, calc(100vw - 48px));
		max-height: calc(100vh - 150px);
		overflow: auto;
		border-radius: 16px;
		background: rgba(255, 255, 255, 0.98);
		padding: 12px 12px;
		box-shadow: 0 16px 28px rgba(15, 23, 42, 0.28);
		z-index: 130;
	}

	.scenario-btn {
		width: 100%;
		text-align: left;
		padding: 10px 12px;
		border-radius: 12px;
		border: 1px solid rgba(15, 23, 42, 0.12);
		background: rgba(59, 130, 246, 0.06);
		cursor: pointer;
		font-size: 12px;
		color: #0f172a;
		transition:
			background 120ms ease,
			transform 120ms ease;
	}

	.scenario-btn:hover,
	.scenario-btn:focus-visible {
		background: rgba(59, 130, 246, 0.12);
		transform: translateY(-1px);
	}

	.scenario-btn:active {
		transform: translateY(0);
	}

	:global(.dark) .scenario-overlay {
		background: rgba(2, 6, 23, 0.65);
	}

	:global(.dark) .scenario-modal {
		background: rgba(7, 11, 28, 0.98);
		box-shadow: 0 16px 28px rgba(2, 6, 23, 0.6);
	}

	:global(.dark) .scenario-modal .text-dark-blue {
		color: #e2e8f0;
	}

	:global(.dark) .scenario-btn {
		border: 1px solid rgba(148, 163, 184, 0.2);
		background: rgba(15, 23, 42, 0.6);
		color: #e2e8f0;
	}

	:global(.dark) .scenario-btn:hover,
	:global(.dark) .scenario-btn:focus-visible {
		background: rgba(15, 23, 42, 0.8);
	}
</style>
