<script lang="ts">
	import { fly } from 'svelte/transition';
	import { simulation, selectedRouterId, ui, showErrorToast } from '$lib/viewmodels';
	import '../../app.css';

	$: ctrl = $simulation as any;
	$: isRunning = !!ctrl?.running;

	$: history = Array.isArray(ctrl?.history) ? ctrl.history : [];
	$: stepIndex = Math.max(0, Math.floor(Number(ctrl?.currentStepIndex ?? 0)));
	$: stateAtStep = history?.[stepIndex] ?? null;
	$: topo = stateAtStep?.topologyState ?? stateAtStep?.topologyState ?? null;
	$: nodes =
		topo?.nodes instanceof Map ? (topo.nodes as Map<string, any>) : (new Map() as Map<string, any>);
	$: links = Array.isArray(topo?.links) ? (topo.links as any[]) : [];

	$: rid = $selectedRouterId;
	$: selectedNode = rid ? nodes.get(rid) : null;
	$: hasRouter = !!selectedNode;

	$: routerId = hasRouter ? String(selectedNode?.id ?? selectedNode?.id ?? '') : '';
	$: routerName = hasRouter ? String(selectedNode?.name ?? selectedNode?.name ?? routerId) : '';
	$: xPos = hasRouter ? Number(selectedNode?.xPos ?? selectedNode?.xPos ?? 0) : 0;
	$: yPos = hasRouter ? Number(selectedNode?.yPos ?? selectedNode?.yPos ?? 0) : 0;
	$: routerDisabled = hasRouter ? !!(selectedNode as any)?.disabled : false;

	let nameDraft = '';
	let lastRouterId = '';
	$: if (routerId && routerId !== lastRouterId) {
		nameDraft = routerName;
		lastRouterId = routerId;
	}

	/**
	 * Speichert den aktuell eingegebenen Routernamen.
	 */
	function saveName() {
		if (!hasRouter || isRunning || routerDisabled) return;
		const next = nameDraft.trim();
		if (!next) return;
		if (next === routerName) return;
		ui.renameRouter(routerId, next);
	}

	/**
	 * Reagiert auf Tastatureingaben im Namensfeld.
	 *
	 * @param e Keyboard Input des Benutzers
	 */
	function handleNameKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			saveName();
		}
	}

	type NeighborRow = { linkId: string; otherId: string; weight: number };

	$: neighbors = hasRouter
		? (links
				.map((l: any) => {
					const linkId = String(l?.id ?? l?.id ?? '');
					const sId = String(l?.source?.id ?? l?.source?.id ?? l?.source?.id ?? '');
					const tId = String(l?.target?.id ?? l?.target?.id ?? l?.target?.id ?? '');
					const wRaw = Number(l?.weight ?? l?.weight ?? 1);
					const weight = Number.isFinite(wRaw) && wRaw > 0 ? wRaw : 1;

					if (!routerId) return null;
					if (sId !== routerId && tId !== routerId) return null;

					const otherId = sId === routerId ? tId : sId;
					if (!otherId) return null;

					return { linkId, otherId, weight } satisfies NeighborRow;
				})
				.filter(Boolean) as NeighborRow[])
		: [];

	let weightDraft: Record<string, number> = {};

	$: if (hasRouter) {
		for (const n of neighbors) {
			if (!(n.linkId in weightDraft)) weightDraft[n.linkId] = n.weight;
		}
		for (const k of Object.keys(weightDraft)) {
			if (!neighbors.some((n) => n.linkId === k)) delete weightDraft[k];
		}
	} else {
		weightDraft = {};
	}

	/**
	 * Aktualisiert den temporären Gewichtswert eines Links.
	 * Der eingegebene Wert wird validiert und anschließend,
	 * falls er sich vom aktuellen Gewicht unterscheidet,
	 * über die UI an das Modell übergeben.
	 *
	 * @param linkId ID des zu bearbeitenden Links
	 * @param e Input des Benutzers
	 */
	function updateWeightDraft(linkId: string, e: Event) {
		const el = e.currentTarget as HTMLInputElement;
		const v = Math.floor(Number(el.value));
		const next = Number.isFinite(v) && v > 0 ? v : 1;
		weightDraft = { ...weightDraft, [linkId]: next };
		const match = neighbors.find((n) => n.linkId === linkId);
		if (!match) return;
		if (!hasRouter || isRunning || routerDisabled) return;
		if (match.weight === next) return;
		ui.changeLinkWeights([{ sourceId: routerId, targetId: match.otherId, weight: next }]);
	}

	$: weightChanges = hasRouter
		? neighbors
				.map((n) => {
					const v = Math.floor(Number(weightDraft[n.linkId]));
					const next = Number.isFinite(v) && v > 0 ? v : 1;
					return { otherId: n.otherId, linkId: n.linkId, current: n.weight, next };
				})
				.filter((c) => c.current !== c.next)
		: [];

	let packetTargetId = '';

	/**
	 * Sendet ein Testpaket vom aktuell ausgewählten Router
	 * zu einem angegebenen Zielrouter. Der Pfad wird im
	 * Simulator hervorgehoben.
	 */
	function sendPacket() {
		if (!hasRouter) return;
		if (routerDisabled) {
			showErrorToast('Router is disabled.');
			return;
		}
		const src = routerId;
		const tgt = String(packetTargetId ?? '').trim();
		if (!tgt || tgt === src) {
			showErrorToast('Choose a different target router.');
			return;
		}
		ui.previewPacket(src, tgt);
	}

	/**
	 * Öffnet die Historie gefiltert nach dem aktuell
	 * ausgewählten Router.
	 */
	function openHistoryForRouter() {
		if (!hasRouter) return;
		ui.setHistoryFilterRouterId(routerId);
		ui.setShowHistoryModal(true);
	}

	/**
	 * Aktiviert oder deaktiviert den aktuell ausgewählten Router.
	 */
	function toggleRouterDisabled() {
		if (!hasRouter) return;
		ui.setRouterDisabled(routerId, !routerDisabled);
	}
</script>

<div
	class="router-panel absolute top-[100px] right-2 bottom-[150px] z-10 box-border w-[calc(100vw-16px)]
  max-w-[340px] min-w-[200px] overflow-auto rounded-xl bg-[rgba(223,243,255,0.96)] p-2.5
  px-3 text-[11px] text-dark-blue shadow-[0_8px_16px_rgba(15,23,42,0.15)] sm:top-20 sm:right-6 sm:bottom-[120px] sm:w-[340px]
  dark:bg-dark-theme-blue/90 dark:text-almost-white dark:shadow-sky-700/20"
	transition:fly={{ x: 26, duration: 170 }}
>
	<div class="flex items-center justify-between gap-2">
		<h3 class="m-0 text-xs">Router details</h3>
	</div>

	{#if !hasRouter}
		<div
			class="flex h-full min-h-60 flex-col items-center justify-center gap-2
      p-3 text-center"
		>
			<div class="text-[18px] font-black tracking-wide text-dark-blue dark:text-almost-white">
				ROUTER NOT FOUND
			</div>
			<div class="max-w-[260px] text-xs text-dark-blue opacity-75 dark:text-almost-white">
				The selected router ID is not available in the current topology.
			</div>
		</div>
	{:else}
		<div class="mt-2.5 border-t border-sky-200/90 pt-2.5 dark:border-slate-700/60">
			<div class="text-[11px] font-bold text-dark-blue dark:text-almost-white">Status</div>
			<p class="mt-2 text-[11px] opacity-75">
				{routerDisabled
					? 'This router is disabled and ignored in calculations.'
					: 'Router is active.'}
			</p>
			<button
				class="mt-2 cursor-pointer rounded-xl border border-slate-900/18 bg-cyan-600/10 px-2.5
          py-1.5 text-[11px] font-bold whitespace-nowrap text-dark-blue
          hover:enabled:bg-cyan-600/16 disabled:cursor-not-allowed disabled:opacity-55
          dark:border-slate-700/60 dark:bg-sky-500/15 dark:text-almost-white dark:hover:enabled:bg-sky-500/25"
				on:click={toggleRouterDisabled}
				disabled={isRunning}
			>
				{routerDisabled ? 'Enable router' : 'Disable router'}
			</button>
		</div>

		<div class="mt-2.5 border-t border-sky-200/90 pt-2.5 dark:border-slate-700/60">
			<div class="text-[11px] font-bold text-dark-blue dark:text-almost-white">Name</div>

			<div class="mt-1.5 flex items-center gap-2">
				<input
					class="box-border flex w-full rounded-lg border border-solid border-dark-blue/25 bg-white/95 p-1.5
          dark:border-slate-600/60 dark:bg-slate-900/60 dark:text-almost-white"
					type="text"
					bind:value={nameDraft}
					disabled={isRunning || routerDisabled}
					placeholder="Router name"
					on:keydown={handleNameKeydown}
				/>
				<button
					class="cursor-pointer rounded-xl border border-slate-900/18 bg-cyan-600/10 px-2.5 py-1.5
          text-[11px] font-bold whitespace-nowrap text-dark-blue hover:enabled:bg-cyan-600/16
          disabled:cursor-not-allowed disabled:opacity-55
          dark:border-slate-700/60 dark:bg-sky-500/15 dark:text-almost-white dark:hover:enabled:bg-sky-500/25"
					on:click={saveName}
					disabled={isRunning ||
						routerDisabled ||
						nameDraft.trim().length === 0 ||
						nameDraft.trim() === routerName}
				>
					Save
				</button>
			</div>

			<div
				class="mt-2 rounded-xl border border-solid border-dark-blue/8 bg-white/70
        p-2 text-[11px] text-dark-blue dark:border-slate-700/50 dark:bg-slate-900/60 dark:text-almost-white"
			>
				<div><b>ID:</b> {routerId}</div>
				<div><b>Position:</b> ({xPos}, {yPos})</div>
			</div>
		</div>

		<div class="mt-2.5 border-t border-sky-200/90 pt-2.5 dark:border-slate-700/60">
			<div class="flex items-center justify-between gap-2">
				<div class="text-[11px] font-bold text-dark-blue dark:text-almost-white">Connections</div>
			</div>
			<p class="mt-2 text-[11px] opacity-75">Direct links from this router (weight editable).</p>

			{#if neighbors.length === 0}
				<div
					class="rounded-xl border border-solid border-dark-blue/8 bg-dark-blue/5 p-2
          text-xs text-dark-blue dark:border-slate-700/50 dark:bg-slate-900/60 dark:text-almost-white"
				>
					No links.
				</div>
			{:else}
				<div class="mt-2 grid gap-2">
					{#each neighbors as n (n.linkId)}
						<div
							class="rounded-xl border border-solid border-dark-blue/8 bg-white/70 p-2.5
              dark:border-slate-700/50 dark:bg-slate-900/60"
						>
							<div class="grid gap-2">
								<div class="flex min-w-0 items-center justify-between gap-2">
									<div class="grid min-w-0 gap-0.5">
										<div class="text-[10px] tracking-wider uppercase opacity-60">Neighbor</div>
										<div class="truncate font-mono text-[12px]">{n.otherId}</div>
									</div>
									<div class="shrink-0 text-[10px] tracking-wider uppercase opacity-60">Link</div>
								</div>

								<div class="flex min-w-0 items-center justify-between gap-2">
									<div class="truncate font-mono text-[10px] opacity-70">{n.linkId}</div>

									<div class="flex shrink-0 items-center gap-2">
										<div class="text-[10px] tracking-wider uppercase opacity-60">Weight</div>
										<input
											class="box-border w-[70px] rounded-lg border border-solid border-dark-blue/25 bg-white/95 p-1.5 text-[11px]
                      dark:border-slate-600/60 dark:bg-slate-900/60 dark:text-almost-white"
											type="number"
											min="1"
											step="1"
											value={weightDraft[n.linkId]}
											disabled={isRunning || routerDisabled}
											on:input={(e) => updateWeightDraft(n.linkId, e)}
										/>
										<div class="text-[10px] tracking-wider uppercase opacity-60">Pending</div>
									</div>
								</div>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>

		<div class="mt-2.5 border-t border-sky-200/90 pt-2.5 dark:border-slate-700/60">
			<div class="text-[11px] font-bold text-dark-blue dark:text-almost-white">Send packet</div>
			<p class="mt-2 text-[11px] opacity-75" style="margin-top: 4px;">
				Highlights: shortest path = green, forwarding path = dashed (success) / red (fail).
			</p>
			<div class="mt-1.5 flex items-center gap-2">
				<input
					class="box-border flex w-full rounded-lg border border-solid border-dark-blue/25 bg-white/95 p-1.5
          dark:border-slate-600/60 dark:bg-slate-900/60 dark:text-almost-white"
					type="text"
					placeholder="Target router ID"
					bind:value={packetTargetId}
					disabled={isRunning}
				/>
				<button
					class="cursor-pointer rounded-xl border border-slate-900/18 bg-cyan-600/10 px-2.5 py-1.5
          text-[11px] font-bold whitespace-nowrap text-dark-blue hover:enabled:bg-cyan-600/16
          disabled:cursor-not-allowed disabled:opacity-55
          dark:border-slate-700/60 dark:bg-sky-500/15 dark:text-almost-white dark:hover:enabled:bg-sky-500/25"
					on:click={sendPacket}
					disabled={isRunning || !packetTargetId.trim() || packetTargetId.trim() === routerId}
				>
					Send
				</button>
			</div>
		</div>

		<div class="mt-2.5 border-t border-sky-200/90 pt-2.5 dark:border-slate-700/60">
			<div class="text-[11px] font-bold text-dark-blue dark:text-almost-white">History</div>
			<button
				class="mt-1.5 w-full cursor-pointer rounded-xl border border-slate-900/18 bg-cyan-600/10
        px-3 py-2.5 text-xs font-extrabold text-dark-blue transition-colors
        duration-120 ease-in-out hover:bg-cyan-600/16
        dark:border-slate-700/60 dark:bg-sky-500/15 dark:text-almost-white dark:hover:bg-sky-500/25"
				on:click={openHistoryForRouter}>Open history for this router</button
			>
		</div>
	{/if}
</div>
