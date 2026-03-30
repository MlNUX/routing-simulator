<!-- lib/components/RouterPanel.svelte -->
<script lang="ts">
	import { fly } from 'svelte/transition';
	import { simulation, ui, uiState, type PlacementMode } from '$lib/viewmodels';
	import { notify } from '$lib/notify';

	$: isRunning = !!$simulation?.running;
	$: currentMode = ($uiState?.placementMode ?? 'none') as PlacementMode;
	$: weightValue = Number($uiState?.linkWeight ?? 1);

	let packetSource = '';
	let packetTarget = '';
	let routerIds: string[] = [];

	$: {
		const ctrl = $simulation as any;
		const history = Array.isArray(ctrl?.history) ? ctrl.history : [];
		const stepIndex = Math.max(0, Math.floor(Number(ctrl?.currentStepIndex ?? 0)));
		const stateAtStep = history?.[stepIndex] ?? null;
		const topo = stateAtStep?.topologyState ?? stateAtStep?.topologyState ?? null;

		const nodes = topo?.nodes ?? topo?.nodes;
		const arr: string[] = [];
		if (nodes instanceof Map) {
			for (const [id] of nodes.entries()) {
				arr.push(String(id));
			}
		}
		routerIds = arr.sort((a, b) => a.localeCompare(b));
	}

	let fileInput: HTMLInputElement | null = null;

	/**
	 * Öffnet ein Bestätigungsmenü zum Zurücksetzen oder vollständigen
	 * Löschen des aktuellen Netzwerks.
	 */
	async function handleClearNetwork() {
		ui.openConfirmMenu(
			{
				title: 'Reset/Clear Network?',
				message: 'Choose an action:',
				options: [
					{
						id: 'reset',
						label: 'Reset to Initial State',
						intent: 'primary',
						description: 'Restores the network to its initial state.'
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
	 * Aktualisiert das aktuell ausgewählte Gewicht für neue Links.
	 *
	 * @param event Input des Benutzers
	 */
	function handleWeightInput(event: Event) {
		const el = event.currentTarget as HTMLInputElement;
		const parsed = Number(el.value);
		ui.setLinkWeight(parsed);
	}

	/**
	 * Aktiviert oder deaktiviert den Platzierungsmodus für Router.
	 */
	async function handleRouterClick() {
		if (isRunning) return;
		ui.togglePlacementMode('router');
	}

	/**
	 * Aktiviert oder deaktiviert den Modus zum Verbinden von Routern.
	 */
	async function handleLinkClick() {
		if (isRunning) return;
		ui.togglePlacementMode('link');
	}

	/**
	 * Aktiviert oder deaktiviert den Modus zum Senden von Paketen
	 * und setzt eine initiale Auswahl für Source und Target Router.
	 */
	async function handleSendPacketClick() {
		if (isRunning) return;
		ui.togglePlacementMode('sendpacket');
		ui.clearPacketPreview();

		packetSource = routerIds[0] ?? '';
		packetTarget = routerIds[1] ?? routerIds[0] ?? '';
	}

	/**
	 * Aktiviert oder deaktiviert den Löschmodus für Router oder Links.
	 */
	async function handleDeleteClick() {
		if (isRunning) return;
		ui.togglePlacementMode('delete');
	}

	/**
	 * Sendet ein Testpaket zwischen dem ausgewählten Source-
	 * und Target-Router und zeigt den berechneten Pfad an.
	 */
	function commitSendPacket() {
		ui.previewPacket(packetSource, packetTarget);
	}
</script>

<aside
	class="absolute top-20 left-6 z-10 flex h-fit
  w-[210px] origin-top-left flex-col rounded-2xl bg-[rgba(223,243,255,0.96)] p-3 shadow-lg
  dark:bg-dark-theme-blue/90 dark:shadow-sky-700/20"
	transition:fly={{ x: -26, duration: 170 }}
>
	<button
		class="cursor-pointer rounded-xl border border-slate-900/18 bg-cyan-600/10 px-2.5
  py-1.5 text-[11px] font-bold text-dark-blue hover:bg-cyan-600/16
  dark:border-slate-700/60 dark:bg-sky-500/15 dark:text-almost-white dark:hover:bg-sky-500/25"
		on:click={handleClearNetwork}
		disabled={isRunning}
		data-help="Reset the network to its initial state or clear it completely."
		data-help-pos="right"
	>
		Clear network
	</button>

	<div class="mt-1">
		<div
			class="mb-2 text-[10px] font-semibold tracking-[0.12em]
    text-dark-blue uppercase dark:text-almost-white"
		>
			Tools
		</div>

		<div class="flex flex-col gap-2 text-xs">
			<div
				class={`flex cursor-pointer items-center gap-2 rounded-xl bg-primary px-2 py-1.5 text-white shadow-md
          dark:text-almost-white dark:shadow-[0_6px_12px_rgba(2,6,23,0.35)]
         ${currentMode === 'router' ? 'outline outline-slate-900' : ''} ${
						isRunning ? 'pointer-events-none opacity-55' : ''
					}`}
				on:click={handleRouterClick}
				data-help="Place routers on the canvas."
				data-help-pos="right"
			>
				<img class="h-6" src="/icons/router.svg" alt="Place router" />
				<div class="font-semibold">
					{currentMode === 'router' ? 'Placing routers…' : 'Add router'}
				</div>
			</div>

			<div
				class={`mt-1.5 flex cursor-pointer items-center gap-2 rounded-xl bg-primary px-2 py-1.5 text-white shadow-md
         dark:text-almost-white dark:shadow-[0_6px_12px_rgba(2,6,23,0.35)]
        ${currentMode === 'link' ? 'outline outline-slate-900' : ''} ${
					isRunning ? 'pointer-events-none opacity-55' : ''
				}`}
				on:click={handleLinkClick}
				data-help="Select two routers to create a link."
				data-help-pos="right"
			>
				<img class="h-6" src="/icons/link.svg" alt="Link routers" />
				<div class="font-semibold">
					{currentMode === 'link' ? 'Linking routers…' : 'Link routers'}
				</div>
			</div>

			{#if currentMode === 'link'}
				<div class="mt-2 text-[11px] text-dark-blue dark:text-almost-white">
					<div class="mt-1 opacity-80">Link weight</div>
					<input
						type="number"
						min="1"
						step="1"
						value={weightValue}
						disabled={isRunning}
						on:input={handleWeightInput}
						class="w-full rounded-lg border border-slate-900/25 bg-white/95 px-2 py-1.5
            dark:border-slate-600/60 dark:bg-slate-900/60 dark:text-almost-white"
					/>
					<div class="mt-1.5 opacity-75">Click two routers on the canvas to create a link.</div>
				</div>
			{/if}

			<div
				class={`mt-1.5 flex cursor-pointer items-center gap-2 rounded-xl bg-primary px-2 py-1.5 text-white shadow-md
         dark:text-almost-white dark:shadow-[0_6px_12px_rgba(2,6,23,0.35)]
        ${currentMode === 'sendpacket' ? 'outline outline-slate-900' : ''} ${
					isRunning ? 'pointer-events-none opacity-55' : ''
				}`}
				on:click={handleSendPacketClick}
				data-help="Test the path between a source and a target."
				data-help-pos="right"
			>
				<img class="h-6" src="/icons/packet.svg" alt="Send packet" />
				<div class="font-semibold">
					{currentMode === 'sendpacket' ? 'Sending packets…' : 'Send packet'}
				</div>
			</div>

			{#if currentMode === 'sendpacket'}
				<div class="mt-2 text-[11px] text-dark-blue dark:text-almost-white">
					{#if routerIds.length < 2}
						<div class="opacity-80">Need at least 2 routers.</div>
					{:else}
						<div class="grid gap-2">
							<label class="text-[12px] font-bold">Source</label>
							<select
								class="w-full rounded-lg border border-slate-900/25 bg-almost-white/95 px-2 py-1.5
                focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none
                dark:border-slate-600/60 dark:bg-slate-900/60 dark:text-almost-white"
								bind:value={packetSource}
							>
								{#each routerIds as rid (rid)}
									<option value={rid}>{rid}</option>
								{/each}
							</select>

							<label style="font-size: 12px; font-weight: 700;">Target</label>
							<select
								class="w-full rounded-lg border border-slate-900/25 bg-almost-white/95 px-2 py-1.5
                focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none
                dark:border-slate-600/60 dark:bg-slate-900/60 dark:text-almost-white"
								bind:value={packetTarget}
							>
								{#each routerIds as rid (rid)}
									<option value={rid}>{rid}</option>
								{/each}
							</select>

							<button
								class="cursor-pointer rounded-xl border border-slate-900/18 bg-cyan-600/10 px-2.5
                py-1.5 text-[11px] font-bold text-dark-blue hover:bg-cyan-600/16
                dark:border-slate-700/60 dark:bg-sky-500/15 dark:text-almost-white dark:hover:bg-sky-500/25"
								on:click={commitSendPacket}
								style="margin-top: 6px;"
								data-help="Calculate a packet preview for the selected routers."
								data-help-pos="right"
							>
								Send
							</button>

							<div class="mt-1.5 opacity-75">
								Hint: You can also click directly on the topology on the source and target routers.
							</div>
						</div>
					{/if}
				</div>
			{/if}

			<div
				class={`mt-1.5 flex cursor-pointer items-center gap-2 rounded-xl bg-primary px-2 py-1.5 text-white shadow-md
        dark:text-almost-white dark:shadow-[0_6px_12px_rgba(2,6,23,0.35)]
        ${currentMode === 'delete' ? 'outline outline-slate-900' : ''} ${
					isRunning ? 'pointer-events-none opacity-55' : ''
				}`}
				on:click={handleDeleteClick}
				data-help="Delete routers or links."
				data-help-pos="right"
			>
				<img class="h-6" src="/icons/trash.svg" alt="Delete" />
				<div class="font-semibold">
					{currentMode === 'delete' ? 'Deleting…' : 'Delete'}
				</div>
			</div>

			{#if currentMode === 'delete'}
				<div class="mt-1.5 font-[11px] text-dark-blue opacity-75 dark:text-almost-white">
					Drag-select multiple items in the canvas, then press Delete.
				</div>
			{/if}

			{#if isRunning}
				<div class="mt-2.5 font-[11px] text-dark-blue opacity-75 dark:text-almost-white">
					Topology editing disabled while playing.
				</div>
			{/if}
		</div>
	</div>
</aside>
