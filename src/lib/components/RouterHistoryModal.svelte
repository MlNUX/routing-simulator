<script lang="ts">
	import { computeShortestPaths, simulation, ui, uiState } from '$lib/viewmodels';
	import { RoutingAlgorithmType } from '$lib/model/RoutingAlgorithmType';
	import { EventType } from '$lib/model/EventType';
	import {
		computeBellmanSteps as computeBellmanStepsForHistory,
		getBellmanStepHeading,
		getLectureTimeLabel as getLectureTimeLabelForHistory,
		getVisibleHistorySteps,
		inferHistoryStepType,
		sequenceIndexForStep as sequenceIndexForHistory
	} from '$lib/components/routerHistoryUtils';

	export let open: boolean = false;
	export let onClose: () => void;

	// Typen-Definitionen
	type DvCell = { dist: number; nextHop: string | null };
	type DvTable = {
		routerId: string;
		rowIds: string[];
		destIds: string[];
		values: Record<string, Record<string, DvCell>>;
		oldValues: Record<string, Record<string, DvCell>>;
	};
	type DtCell = { dist: number };
	type DtTable = {
		routerId: string;
		rowIds: string[];
		destIds: string[];
		values: Record<string, Record<string, DtCell>>;
		minByDest: Record<string, number>;
	};
	type DvTableResult = { ok: true; table: DvTable } | { ok: false; error: string };
	type DtTableResult = { ok: true; table: DtTable } | { ok: false; error: string };

	// State Variablen
	let allRouterIds: string[] = [];
	let allSteps: number[] = [];

	// REAKTIV: visibleSteps hängt vom View-Modus ab
	$: visibleSteps = getVisibleHistorySteps(
		allSteps,
		stepTypeMap,
		currentStepNumber,
		bellmanView,
		isDistanceVector,
		isLinkState
	);

	let selectedRouters: string[] = [];
	let selectedSteps: number[] = [];
	let compactMode = false;
	let compactSelectedRouters: string[] = [];
	let compactSelectedSteps: number[] = [];
	let compactRoutersOpen = false;
	let compactStepsOpen = false;
	let fullRoutersOpen = false;
	let fullStepsOpen = false;
	let compactAxis: 'steps' | 'routers' = 'steps';
	let lastKnownCompactSteps: Set<number> = new Set();

	const COMPACT_COL_WIDTH = 320;
	const COMPACT_MIN_WIDTH = 380;
	const COMPACT_SIDE_PADDING = 40;
	const COMPACT_ROW_HEIGHT = 170;
	const COMPACT_MIN_HEIGHT = 320;
	const COMPACT_BASE_HEIGHT = 240;
	const COMPACT_WIDTH_SCREEN_RATIO = 1 / 3;

	let viewportWidth = 1200;

	$: compactColCount = Math.max(
		1,
		compactAxis === 'steps' ? compactSelectedSteps.length : compactSelectedRouters.length
	);
	$: compactRowCount = Math.max(
		1,
		compactAxis === 'steps' ? compactSelectedRouters.length : compactSelectedSteps.length
	);
	$: compactWidthPx = Math.max(
		COMPACT_MIN_WIDTH,
		compactColCount * COMPACT_COL_WIDTH + COMPACT_SIDE_PADDING
	);
	$: safeViewportWidth = Number.isFinite(viewportWidth) && viewportWidth > 0 ? viewportWidth : 1200;
	$: compactMaxWidthPx = Math.max(
		COMPACT_MIN_WIDTH,
		Math.floor(safeViewportWidth * COMPACT_WIDTH_SCREEN_RATIO)
	);
	$: compactClampedWidthPx = Math.min(compactWidthPx, compactMaxWidthPx);
	$: compactHeightPx = Math.max(
		COMPACT_MIN_HEIGHT,
		COMPACT_BASE_HEIGHT + compactRowCount * COMPACT_ROW_HEIGHT
	);
	$: compactModalStyle = compactMode
		? (safeViewportWidth < 640
			? 'width: 100vw; height: 100dvh; left: 0; top: 0;'
			: `width: min(${compactClampedWidthPx}px, calc(100vw - 32px)); height: min(${compactHeightPx}px, calc(100vh - 200px));`)
		: '';

	// WICHTIG: Standardmäßig Bellman-Ansicht aktiv
	let bellmanView = true;

	// Maps für schnellen Zugriff auf Daten pro Schritt
	let stepNodesMap: Map<number, Map<string, any>> = new Map();
	let stepTopologyMap: Map<number, any> = new Map();
	let stepEventsMap: Map<number, any[]> = new Map();
	let stepTypeMap: Map<number, string> = new Map();

	let didRedirect = false;

	// Reaktivität auf Store-Updates
	$: ctrl = $simulation as any;
	$: algo = String(ctrl?.algorithm ?? RoutingAlgorithmType.LINK_STATE);
	$: isLinkState = algo === RoutingAlgorithmType.LINK_STATE;
	$: isDistanceVector =
		algo === RoutingAlgorithmType.DISTANCE_VECTOR ||
		algo === RoutingAlgorithmType.DISTANCE_VECTOR_POISONED;
	$: history = Array.isArray(ctrl?.history) ? (ctrl.history as any[]) : [];
	$: currentHistoryIndex = Math.max(0, Math.floor(Number(ctrl?.currentStepIndex ?? 0)));
	$: currentState = history?.[currentHistoryIndex] ?? null;
	$: currentStepNumber = readStepNumber(currentState);
	$: currentTopology = extractTopology(currentState);
	$: currentNodes = extractNodesMap(currentTopology);

	// Compact Mode Router IDs
	$: compactRouterIds =
		currentNodes instanceof Map
			? Array.from(currentNodes.entries())
					.map(([id]) => String(id))
					.sort((a, b) => a.localeCompare(b))
			: [];

	// --- Helper Funktionen ---

	// Liest Stepnummer aus History-State.
	function readStepNumber(state: any): number {
		const v = state?.stepNumber ?? state?.stepNumber;
		const n = Math.floor(Number(v));
		return Number.isFinite(n) ? n : 0;
	}

	// Extrahiert Topologie aus History-State.
	function extractTopology(state: any): any | null {
		return state?.topologyState ?? state?.topologyState ?? null;
	}

	// Liefert die Nodes Map aus Topologie.
	function extractNodesMap(topo: any): Map<string, any> | null {
		const m = topo?.nodes ?? topo?.nodes;
		return m instanceof Map ? (m as Map<string, any>) : null;
	}

	// --- Anzeige-Funktionen für Routernamen ---

	function routerDisplayName(id: string, nodes?: Map<string, any> | null): string {
		const rid = String(id ?? '').trim();
		if (!rid) return '';
		const node = nodes instanceof Map ? nodes.get(rid) : null;
		const name = String(node?.name ?? node?.name ?? '').trim();
		return name.length > 0 ? name : rid;
	}

	function routerDisplayNameAny(id: string): string {
		const rid = String(id ?? '').trim();
		if (!rid) return '';
		const primary = routerDisplayName(rid, currentNodes);
		if (primary && primary !== rid) return primary;
		for (const nodes of stepNodesMap.values()) {
			const label = routerDisplayName(rid, nodes);
			if (label && label !== rid) return label;
		}
		return rid;
	}

	function compareRouterIdsAny(aId: string, bId: string): number {
		const aLabel = routerDisplayNameAny(aId);
		const bLabel = routerDisplayNameAny(bId);
		const labelCmp = aLabel.localeCompare(bLabel, undefined, {
			numeric: true,
			sensitivity: 'base'
		});
		if (labelCmp !== 0) return labelCmp;
		return String(aId).localeCompare(String(bId), undefined, {
			numeric: true,
			sensitivity: 'base'
		});
	}

	// --- Labels für Zeitpunkte & Phasen ---

	// Wandelt Simulations-Step (0, 2, 4...) in Übungsblatt-Zeit (t1, t2, t3...) um
	function getLectureTimeLabel(step: number): string {
		return getLectureTimeLabelForHistory(
			step,
			allSteps,
			stepTypeMap,
			isDistanceVector,
			isLinkState
		);
	}

	// Gibt den Typ des Schritts für die Standard-Ansicht zurück
	function getPhaseLabel(step: number): string {
		const stepType = inferStepType(step);
		if (stepType === 'update') return 'Update';
		if (!isDistanceVector) return '';
		if (stepType === 'send') return 'Send / Exchange';
		if (stepType === 'recompute') return 'Recompute';
		if (step === 0) return 'Initialization';
		return step % 2 === 0 ? 'Recompute' : 'Send / Exchange';
	}

	function sequenceIndexForStep(step: number, steps: number[], types: Map<number, string>): number {
		return sequenceIndexForHistory(step, steps, types);
	}

	function inferStepType(step: number): string {
		return inferHistoryStepType(step, allSteps, stepTypeMap, isDistanceVector, isLinkState);
	}

	function typesForStep(step: number): string {
		return stepTypeMap.get(step) ?? '';
	}

	// Filtert die Schritte eines Bellman-Ford-Algorithmus
	function computeBellmanSteps(steps: number[], types: Map<number, string>): number[] {
		return computeBellmanStepsForHistory(steps, types, isDistanceVector, isLinkState);
	}

	// --- History Index Aufbauen ---

	function rebuildIndexFromHistory(): void {
		const nextStepNodesMap = new Map<number, Map<string, any>>();
		const nextStepTopologyMap = new Map<number, any>();
		const nextStepEventsMap = new Map<number, any[]>();
		const nextStepTypeMap = new Map<number, string>();

		const routerIds = new Set<string>();

		for (const st of history) {
			const step = readStepNumber(st);
			const topo = extractTopology(st);
			const nodes = extractNodesMap(topo);
			if (!nodes) continue;

			nextStepNodesMap.set(step, nodes);
			if (topo) nextStepTopologyMap.set(step, topo);
			const evs = Array.isArray((st as any)?.executedEvents) ? (st as any).executedEvents : [];
			nextStepEventsMap.set(step, evs);

			const stepType = String((st as any)?.stepType ?? '');
			if (stepType) nextStepTypeMap.set(step, stepType);

			for (const [id] of nodes.entries()) {
				routerIds.add(String(id));
			}
		}

		stepNodesMap = nextStepNodesMap;
		stepTopologyMap = nextStepTopologyMap;
		stepEventsMap = nextStepEventsMap;
		stepTypeMap = nextStepTypeMap;

		const allStepsSorted = Array.from(nextStepNodesMap.keys()).sort((a, b) => a - b);

		allRouterIds = Array.from(routerIds).sort(compareRouterIdsAny);
		allSteps = allStepsSorted;

		// --- INITIALE SELEKTION ---
		// Wenn Bellman aktiv ist (Standard beim Öffnen), wählen wir nur die geraden Steps.
		// Wenn nicht, alle.
		selectedSteps = getVisibleHistorySteps(
			allStepsSorted,
			nextStepTypeMap,
			currentStepNumber,
			bellmanView,
			isDistanceVector,
			isLinkState
		);

		// Automatisch alle Router selektieren, falls noch keine Auswahl getroffen wurde
		if (selectedRouters.length === 0) selectedRouters = [...allRouterIds];
		selectedRouters = selectedRouters.filter((id) => routerIds.has(id));
	}

	// --- Öffnen/Schließen Logik ---

	let isMobile = false;
	$: if (typeof window !== 'undefined') isMobile = window.innerWidth < 640;

	let wasOpen = false;
	$: if (open && !wasOpen) {
		// Beim Öffnen: auf Mobile direkt Compact-View
		compactMode = isMobile;
		fullRoutersOpen = false;
		fullStepsOpen = false;
		ui.setHistoryCompactOpen(isMobile);
		bellmanView = true;
		lastKnownCompactSteps = new Set();
		rebuildIndexFromHistory();
		wasOpen = true;
	}
	$: if (!open && wasOpen) {
		ui.setHistoryCompactOpen(false);
		wasOpen = false;
		didRedirect = false;
	}

	$: if (open && isLinkState && !didRedirect) {
		didRedirect = true;
		ui.setShowHistoryModal(false);
		ui.setShowDijkstraModal(true);
	}

	$: if (compactMode) {
		const stepSet = new Set(visibleSteps);
		const filtered = compactSelectedSteps.filter((s) => stepSet.has(s));
		const brandNew = visibleSteps.filter((s) => !lastKnownCompactSteps.has(s));
		const merged = [...new Set([...filtered, ...brandNew])].sort((a, b) => a - b);
		compactSelectedSteps = merged.length > 0 ? merged : [...visibleSteps];
		lastKnownCompactSteps = new Set(visibleSteps);

		const routerSet = new Set(allRouterIds);
		compactSelectedRouters = compactSelectedRouters.filter((id) => routerSet.has(id));
		if (compactSelectedRouters.length === 0) {
			compactSelectedRouters = [...allRouterIds];
		}
	}

	let lastHistorySignature = '';
	$: if (open) {
		const sig = `${history?.length ?? 0}:${currentHistoryIndex}`;
		if (sig !== lastHistorySignature) {
			lastHistorySignature = sig;
			rebuildIndexFromHistory();
		}
	}

	// --- View Umschalter ---

	function toggleViewMode() {
		const nextBellmanView = !bellmanView;
		bellmanView = nextBellmanView;
		selectedSteps = getVisibleHistorySteps(
			allSteps,
			stepTypeMap,
			currentStepNumber,
			nextBellmanView,
			isDistanceVector,
			isLinkState
		);
	}

	function toggleCompactMode() {
		compactMode = !compactMode;
		ui.setHistoryCompactOpen(compactMode);
		if (compactMode) {
			lastKnownCompactSteps = new Set();
			ui.setRoutingHover(null, null);
			fullRoutersOpen = false;
			fullStepsOpen = false;
			if (compactSelectedSteps.length === 0 && visibleSteps.length > 0) {
				compactSelectedSteps = [...visibleSteps];
			}
			if (compactSelectedRouters.length === 0) {
				compactSelectedRouters = [...allRouterIds];
			}
		} else {
			lastKnownCompactSteps = new Set();
			compactRoutersOpen = false;
			compactStepsOpen = false;
			selectedSteps = getVisibleHistorySteps(
				allSteps,
				stepTypeMap,
				currentStepNumber,
				bellmanView,
				isDistanceVector,
				isLinkState
			);
		}
	}
	function toggleCompactAxis(): void {
		compactAxis = compactAxis === 'steps' ? 'routers' : 'steps';
	}
	function toggleFullRoutersMenu(): void {
		fullRoutersOpen = !fullRoutersOpen;
		if (fullRoutersOpen) fullStepsOpen = false;
	}
	function toggleFullStepsMenu(): void {
		fullStepsOpen = !fullStepsOpen;
		if (fullStepsOpen) fullRoutersOpen = false;
	}

	// --- Tabellen-Daten Logik ---

	function directNeighborIds(routerId: string, topo: any, nodes: Map<string, any>): string[] {
		const rid = String(routerId ?? '').trim();
		if (!rid || !(nodes instanceof Map)) return [];

		const links: any[] = Array.isArray(topo?.links) ? topo.links : [];
		const neighbors = new Set<string>();

		for (const l of links) {
			const sId = String(l?.source?.id ?? l?.source?.id ?? '');
			const tId = String(l?.target?.id ?? l?.target?.id ?? '');
			if (!sId || !tId) continue;

			if (sId === rid || tId === rid) {
				const otherId = sId === rid ? tId : sId;
				const otherNode = nodes.get(otherId);
				if (!otherNode || (otherNode as any)?.disabled) continue;
				neighbors.add(otherId);
			}
		}
		return Array.from(neighbors.values()).sort(compareRouterIdsAny);
	}

	function linkWeightBetween(routerId: string, neighborId: string, topo: any): number | null {
		const rid = String(routerId ?? '').trim();
		const nid = String(neighborId ?? '').trim();
		if (!rid || !nid) return null;

		const links: any[] = Array.isArray(topo?.links) ? topo.links : [];
		for (const l of links) {
			const sId = String(l?.source?.id ?? l?.sourceId ?? l?.source?.id ?? '');
			const tId = String(l?.target?.id ?? l?.targetId ?? l?.target?.id ?? '');
			if (!sId || !tId) continue;
			if ((sId === rid && tId === nid) || (sId === nid && tId === rid)) {
				const wRaw = Number(l?.weight ?? l?.weight ?? 1);
				return Number.isFinite(wRaw) && wRaw > 0 ? wRaw : 1;
			}
		}
		return null;
	}

	function readDvState(node: any): {
		values: Record<string, Record<string, DvCell>>;
		oldValues: Record<string, Record<string, DvCell>>;
	} | null {
		const dv = node?.dvState ?? node?.dvState;
		const values = dv?.dvs ?? null;
		const oldValues = dv?.oldDvs ?? null;
		if (!values || !oldValues) return null;
		return { values, oldValues };
	}

	function dvTableFor(routerId: string, step: number): DvTableResult {
		const rid = String(routerId ?? '').trim();
		const nodes = stepNodesMap.get(step);
		if (!nodes) return { ok: false, error: 'No data' };
		const node = nodes.get(rid);
		if (!node) return { ok: false, error: 'Router missing' };

		const state = readDvState(node);
		if (!state) return { ok: false, error: 'No DV state' };

		let rowIds = Object.keys(state.values);
		let destIds = Array.from(nodes.keys()).sort(compareRouterIdsAny);

		return {
			ok: true,
			table: { routerId: rid, rowIds, destIds, values: state.values, oldValues: state.oldValues }
		};
	}

	function bellmanTableFor(routerId: string, step: number): DtTableResult {
		const rid = String(routerId ?? '').trim();
		const nodes = stepNodesMap.get(step);
		const topo = stepTopologyMap.get(step);

		if (!nodes || !topo) return { ok: false, error: 'No data' };

		const node = nodes.get(rid);
		if (!node) return { ok: false, error: 'Router missing' };

		const state = readDvState(node);
		if (!state) return { ok: false, error: 'No state' };

		const rowIds = directNeighborIds(rid, topo, nodes);
		const destIds = Array.from(nodes.keys())
			.filter((id) => String(id) !== rid)
			.sort(compareRouterIdsAny);

		const values: Record<string, Record<string, DtCell>> = {};
		const minByDest: Record<string, number> = {};
		for (const dest of destIds) minByDest[dest] = Infinity;

		for (const rowId of rowIds) {
			const row: Record<string, DtCell> = {};
			const linkCost = linkWeightBetween(rid, rowId, topo);
			const dvRow = state.values?.[rowId] ?? {};

			for (const dest of destIds) {
				const neighborDist = dvRow?.[dest]?.dist ?? Infinity;
				const dist =
					linkCost === null || linkCost === Infinity || neighborDist === Infinity
						? Infinity
						: linkCost + neighborDist;

				row[dest] = { dist };
				if (dist < minByDest[dest]) minByDest[dest] = dist;
			}
			values[rowId] = row;
		}

		return {
			ok: true,
			table: { routerId: rid, rowIds, destIds, values, minByDest }
		};
	}

	function formatDtCell(cell: DtCell | null | undefined): string {
		if (!cell) return '';
		if (cell.dist === Infinity) return '∞';
		return `${cell.dist}`;
	}

	function formatDvCell(cell: DvCell | null | undefined): string {
		if (!cell) return '';
		if (cell.dist === Infinity) return '∞';
		return `${cell.dist} (${cell.nextHop ?? '-'})`;
	}

	function dtCell(table: DtTable, rowId: string, destId: string): DtCell | null {
		return table.values?.[rowId]?.[destId] ?? null;
	}

	function dvCell(table: DvTable, rowId: string, destId: string): DvCell | null {
		return table.values?.[rowId]?.[destId] ?? null;
	}

	function previousDtCell(
		result: DtTableResult | null,
		rowId: string,
		destId: string
	): DtCell | null {
		if (!result?.ok) return null;
		return result.table.values?.[rowId]?.[destId] ?? null;
	}

	function dtMinimum(table: DtTable, destId: string): number {
		return table.minByDest?.[destId] ?? Infinity;
	}

	function dtCellChanged(
		current: DtCell | null | undefined,
		prev: DtCell | null | undefined
	): boolean {
		const currDist = current?.dist ?? Infinity;
		const prevDist = prev?.dist ?? Infinity;
		return currDist !== prevDist;
	}

	function dvCellChanged(table: DvTable, rowId: string, destId: string): boolean {
		const current = table.values?.[rowId]?.[destId] ?? null;
		const prev = table.oldValues?.[rowId]?.[destId] ?? null;
		if (!current && !prev) return false;
		const currDist = current?.dist ?? Infinity;
		const prevDist = prev?.dist ?? Infinity;
		const currHop = current?.nextHop ?? null;
		const prevHop = prev?.nextHop ?? null;
		return currDist !== prevDist || currHop !== prevHop;
	}

	function isUpdateStep(step: number): boolean {
		return stepTypeMap.get(step) === 'update';
	}

	function setHoverRouting(sourceId: string | null, targetId: string | null): void {
		if (compactMode && (sourceId !== null || targetId !== null)) return;
		ui.setRoutingHover(sourceId, targetId);
	}

	function close(): void {
		fullRoutersOpen = false;
		fullStepsOpen = false;
		ui.setHistoryCompactOpen(false);
		ui.setRoutingHover(null, null);
		if (typeof onClose === 'function') onClose();
	}
	function toggleRouter(id: string): void {
		selectedRouters = selectedRouters.includes(id)
			? selectedRouters.filter((x) => x !== id)
			: [...selectedRouters, id].sort(compareRouterIdsAny);
	}
	function toggleStep(s: number): void {
		selectedSteps = selectedSteps.includes(s)
			? selectedSteps.filter((x) => x !== s)
			: [...selectedSteps, s].sort((a, b) => a - b);
	}
	function toggleCompactRouter(id: string): void {
		compactSelectedRouters = compactSelectedRouters.includes(id)
			? compactSelectedRouters.filter((x) => x !== id)
			: [...compactSelectedRouters, id].sort(compareRouterIdsAny);
	}
	function toggleCompactStep(s: number): void {
		compactSelectedSteps = compactSelectedSteps.includes(s)
			? compactSelectedSteps.filter((x) => x !== s)
			: [...compactSelectedSteps, s].sort((a, b) => a - b);
	}
	function toggleCompactRoutersMenu(): void {
		compactRoutersOpen = !compactRoutersOpen;
		if (compactRoutersOpen) compactStepsOpen = false;
	}
	function toggleCompactStepsMenu(): void {
		compactStepsOpen = !compactStepsOpen;
		if (compactStepsOpen) compactRoutersOpen = false;
	}
	function compactStepLabel(s: number): string {
		if (bellmanView)
			return getBellmanStepHeading(s, allSteps, stepTypeMap, isDistanceVector, isLinkState);
		const phase = getPhaseLabel(s);
		return phase ? `Step ${s} (${phase})` : `Step ${s}`;
	}
</script>

<svelte:window bind:innerWidth={viewportWidth} />

{#if open}
	<div class="modal-backdrop" on:click={close} />

	<div
		class="modal"
		class:modal--compact={compactMode}
		style={compactModalStyle}
		role="dialog"
		aria-modal="true"
		aria-label="Routing table history"
	>
		<div class="modal-header">
			<div class="modal-actions">
				{#if compactMode}
					{#if isDistanceVector}
						<button class="btn" class:btn--active={bellmanView} on:click={toggleViewMode}>
							{bellmanView ? 'Bellman (PDF)' : 'Standard'}
						</button>
					{/if}
					<button class="btn dark:text-dark-blue" on:click={toggleCompactAxis}>Swap axes</button>
					{#if safeViewportWidth >= 640}
						<button class="btn dark:text-dark-blue" on:click={toggleCompactMode}>Full view</button>
					{/if}
					<button class="btn btn--close" on:click={close} title="Close">✖</button>
				{:else}
					<button class="btn dark:text-dark-blue" on:click={toggleCompactMode}>Compact view</button>
					{#if isDistanceVector}
						<button class="btn" class:btn--active={bellmanView} on:click={toggleViewMode}>
							{bellmanView ? 'Bellman view (PDF)' : 'Standard view'}
						</button>
					{/if}
					<button class="btn btn--close" on:click={close} title="Close">✖</button>
				{/if}
			</div>
		</div>

		{#if !compactMode}
			<div class="modal-body">
				<div class="full-controls">
					<label class="compact-control">
						<span class="control-label">Router</span>
						<div class="compact-dropdown">
							<button
								class="compact-dropdown-trigger"
								type="button"
								on:click={toggleFullRoutersMenu}
							>
								Select routers ({selectedRouters.length})
							</button>
							{#if fullRoutersOpen}
								<div class="compact-dropdown-menu">
									{#each allRouterIds as rid (rid)}
										<label class="compact-check">
											<input
												type="checkbox"
												checked={selectedRouters.includes(rid)}
												on:change={() => toggleRouter(rid)}
											/>
											<span class="mono">{routerDisplayNameAny(rid)}</span>
										</label>
									{/each}
								</div>
							{/if}
						</div>
					</label>

					<label class="compact-control">
						<span class="control-label">Time steps</span>
						<div class="compact-dropdown">
							<button class="compact-dropdown-trigger" type="button" on:click={toggleFullStepsMenu}>
								Select time steps ({selectedSteps.length})
							</button>
							{#if fullStepsOpen}
								<div class="compact-dropdown-menu">
									{#each visibleSteps as s (s)}
										{@const phaseLabel = getPhaseLabel(s)}
										<label class="compact-check">
											<input
												type="checkbox"
												checked={selectedSteps.includes(s)}
												on:change={() => toggleStep(s)}
											/>
											<span class="mono" style="font-weight:700;">
												{#if bellmanView}
													{getLectureTimeLabel(s)}
												{:else}
													Step {s}
												{/if}
											</span>
											{#if bellmanView}
												<span
													class="mono-light"
													style="font-size: 10px; margin-left: 4px; opacity: 0.6;"
												>
													(Step {s})
												</span>
											{:else if phaseLabel}
												<span
													class="mono-light"
													style="font-size: 10px; margin-left: 4px; opacity: 0.6;"
												>
													({phaseLabel})
												</span>
											{/if}
										</label>
									{/each}
								</div>
							{/if}
						</div>
					</label>
				</div>

				<div class="tables">
					{#if selectedRouters.length === 0 || selectedSteps.length === 0}
						<div class="empty big">Please select at least one router and one time slot.</div>
					{:else}
						<div class="tables-scroll dark:bg-[#0F172A]"
							style={safeViewportWidth < 640 ? 'height: calc(100dvh - 160px); overflow-y: scroll; overflow-x: auto; -webkit-overflow-scrolling: touch; overscroll-behavior: contain;' : ''}
						>
							<!-- Columns = steps, Rows = routers -->
						<div
								class="matrix-grid"
								style={`grid-template-columns: 150px repeat(${selectedSteps.length}, minmax(260px, 1fr));`}
							>
								<div class="matrix-corner"></div>

								{#each selectedSteps as s (s)}
									{@const phaseLabel = getPhaseLabel(s)}
									<div class="matrix-head sticky-top">
										<div class="time-title dark:text-almost-white">
											{#if bellmanView}
												<span class="mono-lg dark:text-almost-white">{getBellmanStepHeading(s, allSteps, stepTypeMap, isDistanceVector, isLinkState)}</span>
											{:else}
												Step <span class="mono-lg dark:text-almost-white">{s}</span>
												{#if phaseLabel}<span class="mono-light dark:text-almost-white" style="font-size:0.8em; opacity:0.7;">· {phaseLabel}</span>{/if}
											{/if}
										</div>
									</div>
								{/each}

								{#each selectedRouters as rid (rid)}
									{@const routerLabel = routerDisplayNameAny(rid)}
									<div class="matrix-step-label sticky-left">
										Router <span class="mono-lg">{routerLabel}</span>
									</div>
									{#each selectedSteps as s (s)}
										{@const isUpdate = isUpdateStep(s)}
										<div class="matrix-cell">
											{#if bellmanView}
												{@const dtRes = bellmanTableFor(rid, s)}
												{@const prevBellman = isUpdate ? bellmanTableFor(rid, s - 1) : null}
												{#if !dtRes.ok}
													<div class="empty-cell">Keine Daten</div>
												{:else}
													<table
														class="pdf-table"
														on:mouseleave={() => setHoverRouting(null, null)}
													>
														<thead>
															<tr>
																<th class="th-corner">
																	D<sup style="margin-left:1px;">{routerLabel}</sup>
																</th>
																{#each dtRes.table.rowIds as rowId (rowId)}
																	<th>{rowId}</th>
																{/each}
															</tr>
														</thead>
														<tbody>
															{#each dtRes.table.destIds as dest (dest)}
																<tr>
																	<td class="td-row-head">{dest}</td>
																	{#each dtRes.table.rowIds as rowId (rowId)}
																		{@const val = dtCell(dtRes.table, rowId, dest)}
																		{@const min = dtMinimum(dtRes.table, dest)}
																		{@const isBest =
																			val?.dist !== undefined &&
																			val.dist !== Infinity &&
																			val.dist === min}
																		{@const prevVal = previousDtCell(prevBellman, rowId, dest)}
																		{@const isChanged = isUpdate && dtCellChanged(val, prevVal)}
																		<td
																			class:cell-best={isBest}
																			class:cell-inf={val?.dist === Infinity}
																			class:cell-changed={isChanged}
																			on:mouseenter={() => setHoverRouting(rowId, dest)}
																		>
																			{formatDtCell(val)}
																		</td>
																	{/each}
																</tr>
															{/each}
														</tbody>
													</table>
												{/if}
											{:else}
												{@const dvRes = dvTableFor(rid, s)}
												{#if !dvRes.ok}
													<div class="empty-cell">Keine Daten</div>
												{:else}
													<table
														class="pdf-table"
														on:mouseleave={() => setHoverRouting(null, null)}
													>
														<thead>
															<tr>
																<th class="th-corner">Ziel</th>
																{#each dvRes.table.destIds as dest (dest)}
																	<th>{dest}</th>
																{/each}
															</tr>
														</thead>
														<tbody>
															{#each dvRes.table.rowIds as rowId (rowId)}
																<tr>
																	<td class="td-row-head">{rowId}</td>
																	{#each dvRes.table.destIds as dest (dest)}
																		{@const val = dvCell(dvRes.table, rowId, dest)}
																		{@const isChanged =
																			isUpdate && dvCellChanged(dvRes.table, rowId, dest)}
																		<td
																			class:cell-changed={isChanged}
																			on:mouseenter={() => setHoverRouting(rowId, dest)}
																		>
																			{formatDvCell(val)}
																		</td>
																	{/each}
																</tr>
															{/each}
														</tbody>
													</table>
												{/if}
											{/if}
										</div>
									{/each}
								{/each}
							</div>
						</div>
					{/if}
				</div>
			</div>
		{:else}
			<div class="compact-body">
				<div class="compact-controls">
					<label class="compact-control">
						<span class="control-label">Router</span>
						<div class="compact-dropdown">
							<button
								class="compact-dropdown-trigger"
								type="button"
								on:click={toggleCompactRoutersMenu}
							>
								Select routers ({compactSelectedRouters.length})
							</button>
							{#if compactRoutersOpen}
								<div class="compact-dropdown-menu">
									{#each allRouterIds as rid (rid)}
										<label class="compact-check">
											<input
												type="checkbox"
												checked={compactSelectedRouters.includes(rid)}
												on:change={() => toggleCompactRouter(rid)}
											/>
											<span class="mono">{routerDisplayNameAny(rid)}</span>
										</label>
									{/each}
								</div>
							{/if}
						</div>
					</label>
					<label class="compact-control">
						<span class="control-label">Time slots</span>
						<div class="compact-dropdown">
							<button
								class="compact-dropdown-trigger"
								type="button"
								on:click={toggleCompactStepsMenu}
							>
								Select time steps ({compactSelectedSteps.length})
							</button>
							{#if compactStepsOpen}
								<div class="compact-dropdown-menu">
									{#each visibleSteps as s (s)}
										<label class="compact-check text-dark-blue">
											<input
												type="checkbox"
												checked={compactSelectedSteps.includes(s)}
												on:change={() => toggleCompactStep(s)}
											/>
											<span class="mono">
												{bellmanView ? `${getLectureTimeLabel(s)} (Step ${s})` : `Step ${s}`}
											</span>
										</label>
									{/each}
								</div>
							{/if}
						</div>
					</label>
				</div>

				{#if compactSelectedRouters.length === 0 || compactSelectedSteps.length === 0}
					<div class="empty big">Please select at least one router and one time slot.</div>
				{:else if compactRouterIds.length === 0}
					<div class="empty big">No routers found in current step.</div>
				{:else}
					<div class="compact-grid-scroll">
						<div class="compact-grid">
							{#if compactAxis === 'steps'}
								{#each compactSelectedSteps as s (s)}
									<div class="compact-step-col">
										<div class="compact-step-title">{compactStepLabel(s)}</div>
										{#each compactSelectedRouters as rid (rid)}
											{@const isUpdate = isUpdateStep(s)}
											<div class="compact-item">
												<div class="compact-item-title">
													Router <span class="mono" title={rid}>{routerDisplayNameAny(rid)}</span>
												</div>
												{#if bellmanView}
													{@const dtRes = bellmanTableFor(rid, s)}
													{@const prevBellman = isUpdate ? bellmanTableFor(rid, s - 1) : null}
													{#if !dtRes.ok}
														<div class="empty-cell">Keine Daten</div>
													{:else}
														<table
															class="pdf-table"
															on:mouseleave={() => setHoverRouting(null, null)}
														>
															<thead>
																<tr>
																	<th class="th-corner">
																		D<sup style="margin-left:1px;">{routerDisplayNameAny(rid)}</sup>
																	</th>
																	{#each dtRes.table.rowIds as rowId (rowId)}
																		<th>{rowId}</th>
																	{/each}
																</tr>
															</thead>
															<tbody>
																{#each dtRes.table.destIds as dest (dest)}
																	<tr>
																		<td class="td-row-head">{dest}</td>
																		{#each dtRes.table.rowIds as rowId (rowId)}
																			{@const val = dtCell(dtRes.table, rowId, dest)}
																			{@const min = dtMinimum(dtRes.table, dest)}
																			{@const isBest =
																				val?.dist !== undefined &&
																				val.dist !== Infinity &&
																				val.dist === min}
																			{@const prevVal = previousDtCell(prevBellman, rowId, dest)}
																			{@const isChanged = isUpdate && dtCellChanged(val, prevVal)}
																			<td
																				class:cell-best={isBest}
																				class:cell-inf={val?.dist === Infinity}
																				class:cell-changed={isChanged}
																				on:mouseenter={() => setHoverRouting(rowId, dest)}
																			>
																				{formatDtCell(val)}
																			</td>
																		{/each}
																	</tr>
																{/each}
															</tbody>
														</table>
													{/if}
												{:else}
													{@const dvRes = dvTableFor(rid, s)}
													{#if !dvRes.ok}
														<div class="empty-cell">Keine Daten</div>
													{:else}
														<table
															class="pdf-table"
															on:mouseleave={() => setHoverRouting(null, null)}
														>
															<thead>
																<tr>
																	<th class="th-corner">Ziel</th>
																	{#each dvRes.table.destIds as dest (dest)}
																		<th>{dest}</th>
																	{/each}
																</tr>
															</thead>
															<tbody>
																{#each dvRes.table.rowIds as rowId (rowId)}
																	<tr>
																		<td class="td-row-head">{rowId}</td>
																		{#each dvRes.table.destIds as dest (dest)}
																			{@const val = dvCell(dvRes.table, rowId, dest)}
																			{@const isChanged =
																				isUpdate && dvCellChanged(dvRes.table, rowId, dest)}
																			<td
																				class:cell-changed={isChanged}
																				on:mouseenter={() => setHoverRouting(rowId, dest)}
																			>
																				{formatDvCell(val)}
																			</td>
																		{/each}
																	</tr>
																{/each}
															</tbody>
														</table>
													{/if}
												{/if}
											</div>
										{/each}
									</div>
								{/each}
							{:else}
								{#each compactSelectedRouters as rid (rid)}
									<div class="compact-step-col">
										<div class="compact-step-title">
											Router <span class="mono">{routerDisplayNameAny(rid)}</span>
										</div>
										{#each compactSelectedSteps as s (s)}
											{@const isUpdate = isUpdateStep(s)}
											<div class="compact-item">
												<div class="compact-item-title">{compactStepLabel(s)}</div>
												{#if bellmanView}
													{@const dtRes = bellmanTableFor(rid, s)}
													{@const prevBellman = isUpdate ? bellmanTableFor(rid, s - 1) : null}
													{#if !dtRes.ok}
														<div class="empty-cell">No data</div>
													{:else}
														<table
															class="pdf-table"
															on:mouseleave={() => setHoverRouting(null, null)}
														>
															<thead>
																<tr>
																	<th class="th-corner">
																		D<sup style="margin-left:1px;">{routerDisplayNameAny(rid)}</sup>
																	</th>
																	{#each dtRes.table.rowIds as rowId (rowId)}
																		<th>{rowId}</th>
																	{/each}
																</tr>
															</thead>
															<tbody>
																{#each dtRes.table.destIds as dest (dest)}
																	<tr>
																		<td class="td-row-head">{dest}</td>
																		{#each dtRes.table.rowIds as rowId (rowId)}
																			{@const val = dtCell(dtRes.table, rowId, dest)}
																			{@const min = dtMinimum(dtRes.table, dest)}
																			{@const isBest =
																				val?.dist !== undefined &&
																				val.dist !== Infinity &&
																				val.dist === min}
																			{@const prevVal = previousDtCell(prevBellman, rowId, dest)}
																			{@const isChanged = isUpdate && dtCellChanged(val, prevVal)}
																			<td
																				class:cell-best={isBest}
																				class:cell-inf={val?.dist === Infinity}
																				class:cell-changed={isChanged}
																				on:mouseenter={() => setHoverRouting(rowId, dest)}
																			>
																				{formatDtCell(val)}
																			</td>
																		{/each}
																	</tr>
																{/each}
															</tbody>
														</table>
													{/if}
												{:else}
													{@const dvRes = dvTableFor(rid, s)}
													{#if !dvRes.ok}
														<div class="empty-cell">No data</div>
													{:else}
														<table
															class="pdf-table"
															on:mouseleave={() => setHoverRouting(null, null)}
														>
															<thead>
																<tr>
																	<th class="th-corner">Ziel</th>
																	{#each dvRes.table.destIds as dest (dest)}
																		<th>{dest}</th>
																	{/each}
																</tr>
															</thead>
															<tbody>
																{#each dvRes.table.rowIds as rowId (rowId)}
																	<tr>
																		<td class="td-row-head">{rowId}</td>
																		{#each dvRes.table.destIds as dest (dest)}
																			{@const val = dvCell(dvRes.table, rowId, dest)}
																			{@const isChanged =
																				isUpdate && dvCellChanged(dvRes.table, rowId, dest)}
																			<td
																				class:cell-changed={isChanged}
																				on:mouseenter={() => setHoverRouting(rowId, dest)}
																			>
																				{formatDvCell(val)}
																			</td>
																		{/each}
																	</tr>
																{/each}
															</tbody>
														</table>
													{/if}
												{/if}
											</div>
										{/each}
									</div>
								{/each}
							{/if}
						</div>
					</div>
				{/if}
			</div>
		{/if}
	</div>
{/if}

<style>
	/* Grundlayout & Modal */
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(15, 23, 42, 0.45);
		z-index: 200;
	}
	.modal {
		position: fixed;
		left: 50%;
		top: 90px;
		transform: translateX(-50%);
		width: min(1200px, calc(100vw - 40px));
		height: calc(100vh - 260px);
		background: #fff;
		border-radius: 12px;
		box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
		z-index: 210;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		font-family:
			-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
	}
	.modal--compact {
		left: 16px;
		top: 120px;
		transform: none;
	}

	/* Header */
	.modal-header {
		padding: 12px 16px;
		border-bottom: 1px solid #e2e8f0;
		display: flex;
		align-items: center;
		justify-content: flex-end;
		background: #f8fafc;
	}
	.modal-actions {
		display: flex;
		gap: 12px;
		align-items: center;
	}

	/* Buttons */
	.btn {
		padding: 6px 12px;
		border-radius: 6px;
		border: 1px solid #cbd5e1;
		background: #fff;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.1s;
	}
	.btn:hover {
		background: #f1f5f9;
	}
	.btn--active {
		background: #e0f2fe;
		border-color: #7dd3fc;
		color: #0284c7;
	}
	.btn--close {
		border: none;
		background: transparent;
		font-size: 18px;
		color: #64748b;
		padding: 4px;
	}
	.btn--close:hover {
		color: #ef4444;
		background: transparent;
	}

	/* Body Layout */
	.modal-body {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 12px 14px;
		flex: 1;
		min-height: 0;
		overflow: hidden;
	}
	.compact-body {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 12px 14px;
		flex: 1;
		min-height: 0;
		overflow: hidden;
	}
	.full-controls {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: 12px;
		z-index: 12;
	}
	.compact-controls {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 12px;
		flex-shrink: 0;
	}
	.compact-control {
		display: grid;
		gap: 6px;
	}
	.control-label {
		font-size: 11px;
		font-weight: 700;
		color: #64748b;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.compact-dropdown {
		position: relative;
	}
	.compact-dropdown-trigger {
		width: 100%;
		text-align: left;
		padding: 6px 8px;
		border-radius: 8px;
		border: 1px solid #cbd5e1;
		background: #fff;
		font-size: 12px;
		color: #0f172a;
		cursor: pointer;
	}
	.compact-dropdown-menu {
		position: absolute;
		left: 0;
		right: 0;
		top: calc(100% + 6px);
		background: #fff;
		border: 1px solid #cbd5e1;
		border-radius: 8px;
		box-shadow: 0 10px 20px rgba(15, 23, 42, 0.12);
		padding: 6px;
		max-height: 240px;
		overflow: auto;
		z-index: 20;
	}
	.compact-check {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 12px;
		padding: 4px 6px;
		border-radius: 6px;
	}
	.compact-check:hover {
		background: #f1f5f9;
	}
	.compact-grid-scroll {
		max-width: 100%;
		overflow-x: auto;
		overflow-y: auto;
		flex: 1;
		min-height: 0;
		padding-bottom: 10px;
		scrollbar-gutter: stable both-edges;
		scrollbar-width: auto;
		scrollbar-color: #334155 #d6e0ea;
		-webkit-overflow-scrolling: touch;
	}
	.compact-grid-scroll::-webkit-scrollbar {
		height: 14px;
	}
	.compact-grid-scroll::-webkit-scrollbar-track {
		border-radius: 999px;
		background: #d6e0ea;
	}
	.compact-grid-scroll::-webkit-scrollbar-thumb {
		border-radius: 999px;
		border: 2px solid #d6e0ea;
		background: #334155;
	}
	.compact-grid {
		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: minmax(300px, 1fr);
		gap: 12px;
		width: max-content;
		min-width: 100%;
	}
	.compact-step-col {
		display: flex;
		flex-direction: column;
		gap: 10px;
		min-width: 300px;
	}
	.compact-step-title {
		font-weight: 700;
		font-size: 12px;
		color: #334155;
	}
	.compact-item {
		background: #fff;
		border: 1px solid #cbd5e1;
		border-radius: 8px;
		padding: 8px;
	}
	.compact-item-title {
		font-weight: 700;
		font-size: 12px;
		margin-bottom: 6px;
		color: #334155;
	}

	.mono {
		font-family: ui-monospace, monospace;
	}
	.mono-lg {
		font-family: ui-monospace, monospace;
		font-weight: 700;
	}

	/* Legend */
	.cell-changed {
		color: #dc2626;
		font-weight: 700;
	}

	/* Matrix Area */
	.tables {
		position: relative;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		background: #cbd5e1;
		flex: 1;
		min-height: 0;
	} /* Darker bg for gap look */
	.tables-scroll {
		flex: 1;
		overflow: auto;
		padding: 20px;
	}

	.matrix-grid {
		display: grid;
		gap: 16px;
		align-items: start;
	}

	.matrix-corner {
	}

	.matrix-head {
		background: #fff;
		padding: 8px;
		border-radius: 8px;
		text-align: center;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
		border: 1px solid #cbd5e1;
	}
	.time-title {
		font-weight: 700;
		color: #334155;
		font-size: 14px;
	}

	.matrix-step-label {
		background: #fff;
		padding: 12px;
		border-radius: 8px;
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
		border: 1px solid #cbd5e1;
		font-size: 14px;
		color: #334155;
	}

	.matrix-cell {
		background: #fff;
		padding: 0;
		border-radius: 4px;
		overflow: hidden;
		box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
	}

	/* PDF Style Table */
	.pdf-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 13px;
		text-align: center;
	}
	.pdf-table th,
	.pdf-table td {
		border: 1px solid #000; /* Hartes Schwarz wie im PDF */
		padding: 6px 10px;
		min-width: 32px;
	}

	/* Header Zeile */
	.pdf-table thead tr {
		border-bottom: 2px solid #000;
	}
	.pdf-table th {
		font-weight: 700;
		background: #fff;
	}
	.th-corner {
		background: #fff;
		position: relative;
	}

	/* Zeilen Header */
	.td-row-head {
		font-weight: 700;
		background: #fff;
	}

	/* Zellen Styles */
	.cell-best {
		background-color: #5b9bd5 !important; /* Kräftiges PDF-Blau */
		color: #fff;
		font-weight: 700;
		border-color: #000;
	}
	.cell-inf {
		color: #333;
	}

	/* Sticky Verhalten */
	.sticky-top {
		position: sticky;
		top: 0;
		z-index: 10;
	}
	.sticky-left {
		position: sticky;
		left: 0;
		z-index: 9;
	}

	.empty {
		padding: 40px;
		text-align: center;
		color: #64748b;
	}
	.empty-cell {
		padding: 20px;
		text-align: center;
		color: #94a3b8;
		font-style: italic;
	}

	/* Dark Mode Overrides (Minimal) */
	:global(.dark) .modal {
		background: #1e293b;
		color: #f8fafc;
	}
	:global(.dark) .modal-header {
		background: #0f172a;
		border-color: #334155;
	}
	:global(.dark) .matrix-head,
	:global(.dark) .matrix-step-label {
		background: #1e293b;
		border-color: #475569;
		color: #f8fafc;
	}
	:global(.dark) .pdf-table th,
	:global(.dark) .pdf-table td {
		border-color: #94a3b8;
		color: #f8fafc;
		background: #1e293b;
	}
	:global(.dark) .cell-best {
		background-color: #0284c7 !important;
		color: #fff;
	}
	:global(.dark) .compact-check:hover {
		background: #334155;
	}
	:global(.dark) .compact-grid-scroll {
		scrollbar-color: #93c5fd #1e293b;
	}
	:global(.dark) .compact-grid-scroll::-webkit-scrollbar-track {
		background: #1e293b;
	}
	:global(.dark) .compact-grid-scroll::-webkit-scrollbar-thumb {
		border-color: #1e293b;
		background: #93c5fd;
	}

	@media (max-width: 640px) {
		.modal {
			top: 0;
			left: 0;
			right: 0;
			transform: none;
			width: 100vw;
			height: 100dvh;
			border-radius: 0;
			display: flex;
			flex-direction: column;
		}

		.modal--compact {
			left: 0;
			top: 0;
			transform: none;
			width: 100vw;
			height: 100dvh;
		}

		.modal-header {
			flex-shrink: 0;
			padding: 10px 12px;
			padding-top: max(10px, env(safe-area-inset-top));
		}

		.modal-actions {
			gap: 6px;
		}

		.btn {
			padding: 5px 8px;
			font-size: 11px;
		}

		.modal-body {
			flex: 1;
			min-height: 0;
			overflow: hidden;
			padding: 8px;
			display: flex;
			flex-direction: column;
		}

		.full-controls {
			flex-shrink: 0;
		}

		.tables {
			flex: 1;
			min-height: 0;
			overflow: hidden;
		}

		.tables-scroll {
			height: calc(100dvh - 52px - 100px);
			overflow-x: auto;
			overflow-y: scroll;
			-webkit-overflow-scrolling: touch;
			overscroll-behavior: contain;
			padding: 8px;
			padding-bottom: max(16px, env(safe-area-inset-bottom));
			scrollbar-width: auto;
			scrollbar-color: #334155 #d6e0ea;
		}

		.tables-scroll::-webkit-scrollbar {
			width: 14px;
			height: 14px;
		}

		.tables-scroll::-webkit-scrollbar-track {
			border-radius: 999px;
			background: #d6e0ea;
		}

		.tables-scroll::-webkit-scrollbar-thumb {
			border-radius: 999px;
			border: 2px solid #d6e0ea;
			background: #334155;
		}

		.compact-body {
			height: calc(100dvh - 52px);
			overflow-y: auto;
			overflow-x: hidden;
			-webkit-overflow-scrolling: touch;
			overscroll-behavior: contain;
			touch-action: pan-y;
			padding: 8px;
			padding-bottom: max(16px, env(safe-area-inset-bottom));
		}

		.compact-grid-scroll {
			flex: none;
			min-height: unset;
			overflow-x: auto;
			overflow-y: hidden;
			-webkit-overflow-scrolling: touch;
			padding-bottom: 14px;
		}

		.compact-grid-scroll::-webkit-scrollbar {
			height: 18px;
		}

		.pdf-table th,
		.pdf-table td {
			padding: 4px 6px;
			font-size: 11px;
		}
	}
</style>
