<script lang="ts">
	import { RoutingAlgorithmType } from '$lib/model/RoutingAlgorithmType';
	import { selectedRouterId, simulation } from '$lib/viewmodels';

	export let open: boolean = false;
	export let onClose: () => void;

	type DijkstraRow = {
		step: number;
		nSet: string[];
		dist: Map<string, number>;
		prev: Map<string, string | null>;
	};

	type DijkstraTable = {
		sourceId: string;
		routerIds: string[];
		rows: DijkstraRow[];
	};

	let sourceId = '';

	$: ctrl = $simulation as any;
	$: history = Array.isArray(ctrl?.history) ? (ctrl.history as any[]) : [];
	$: currentHistoryIndex = Math.max(0, Math.floor(Number(ctrl?.currentStepIndex ?? 0)));
	$: currentState = history?.[currentHistoryIndex] ?? null;
	$: currentStepNumber = readStepNumber(currentState);
	$: currentTopology = extractTopology(currentState);
	$: currentNodes = extractNodesMap(currentTopology);
	$: algo = String(ctrl?.algorithm ?? RoutingAlgorithmType.LINK_STATE);
	$: isLinkState = algo === RoutingAlgorithmType.LINK_STATE;

	$: routerIds = currentNodes ? readRouterIds(currentNodes) : [];
	$: labelMap = currentNodes ? buildLabelMap(routerIds, currentNodes) : new Map<string, string>();
	$: if (open) {
		const preferred = $selectedRouterId ? String($selectedRouterId) : '';
		if (!sourceId || !routerIds.includes(sourceId)) {
			if (preferred && routerIds.includes(preferred)) sourceId = preferred;
			else sourceId = routerIds[0] ?? '';
		}
	}

	$: table =
		open && isLinkState && sourceId && currentTopology && currentNodes
			? buildDijkstraTable(currentTopology, currentNodes, sourceId)
			: null;
	$: visibleRows = table ? table.rows.filter((r) => r.step <= currentStepNumber) : [];
	$: displayRows = visibleRows;

	/**
	 * Liest die aktuelle Stepzahl aus einem gegebenen Zustand aus.
	 *
	 * @param state ist der gegebene Zustand
	 * @returns Stepnummer
	 */
	function readStepNumber(state: any): number {
		const v = state?.stepNumber ?? state?.stepNumber;
		const n = Math.floor(Number(v));
		return Number.isFinite(n) ? n : 0;
	}

	/**
	 * Extrahiert die Topologie aus einem gegebenen Zustand.
	 *
	 * @param state ist der gegebene Zustand
	 * @return Topologie, wenn vorhanden, sonst null
	 */
	function extractTopology(state: any): any | null {
		return state?.topologyState ?? state?.topologyState ?? null;
	}

	/**
	 * Extrahiert die Router-Mapping-Struktur aus der Topologie.
	 *
	 * @param topo ist die gegebene Topologie
	 * @returns Router, wenn vorhanden, sonst null
	 */
	function extractNodesMap(topo: any): Map<string, any> | null {
		const m = topo?.nodes ?? topo?.nodes;
		return m instanceof Map ? (m as Map<string, any>) : null;
	}

	/**
	 * Liest die IDs aller aktiven Router aus einer Router-Map.
	 * Deaktivierte Router werden ignoriert.
	 *
	 * @param nodes sind die vorhandenen Router
	 * @returns IDs der aktiven Router
	 */
	function readRouterIds(nodes: Map<string, any>): string[] {
		return Array.from(nodes.entries())
			.filter(([, node]) => !(node as any)?.disabled)
			.map(([id]) => String(id))
			.sort((a, b) => compareRouterIds(a, b, nodes));
	}

	/**
	 * Gibt den Anzeigenamen eines Routers zurück.
	 *
	 * @param id eines Routers
	 * @param nodes sind die vorhandenen Router
	 * @returns Anzeigenames des Routers
	 */
	function routerDisplayName(id: string, nodes?: Map<string, any> | null): string {
		const rid = String(id ?? '').trim();
		if (!rid) return '';
		const node = nodes instanceof Map ? nodes.get(rid) : null;
		const name = String(node?.name ?? node?.name ?? '').trim();
		return name.length > 0 ? name : rid;
	}

	/**
	 * Gibt das Label eines Routers zurück.
	 *
	 * @param id eines Routers
	 * @param nodes sind die vorhandenen Router
	 * @returns Label des Routers
	 */
	function routerLabel(id: string, nodes?: Map<string, any> | null): string {
		const rid = String(id ?? '').trim();
		if (!rid) return 'Unbenannt';
		const node = nodes instanceof Map ? nodes.get(rid) : null;
		const name = String(node?.name ?? node?.name ?? '').trim();
		return name.length > 0 ? name : 'Unbenannt';
	}

	/**
	 * Erstellt eine eindeutige Zuordnung von Router-IDs zu Labels.
	 *
	 * @param id der Router
	 * @param nodes sind die vorhandenen Router
	 * @returns eine Map der Router-Labels
	 */
	function buildLabelMap(ids: string[], nodes: Map<string, any>): Map<string, string> {
		const baseLabels = ids.map((id) => routerLabel(id, nodes));
		const counts = new Map<string, number>();
		for (const label of baseLabels) counts.set(label, (counts.get(label) ?? 0) + 1);

		const nextIndex = new Map<string, number>();
		const out = new Map<string, string>();
		ids.forEach((id, idx) => {
			const base = baseLabels[idx];
			if ((counts.get(base) ?? 0) <= 1) {
				out.set(id, base);
				return;
			}
			const n = (nextIndex.get(base) ?? 0) + 1;
			nextIndex.set(base, n);
			out.set(id, `${base} ${n}`);
		});
		return out;
	}

	/**
	 * Vergleicht zwei Router-IDs anhand ihrer Labels.
	 *
	 * @param aId ID des ersten Routers
	 * @param bId ID des zweiten Routers
	 * @param nodes sind die vorhandenen Router
	 * @returns Zahl zum Sortiervergleich der Router-IDs
	 */
	function compareRouterIds(aId: string, bId: string, nodes?: Map<string, any> | null): number {
		const aLabel = routerDisplayName(aId, nodes);
		const bLabel = routerDisplayName(bId, nodes);
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

	// Baut eine Adjazenzstruktur (Nachbarschaftsmatrix) aus der Topologie.
	// Deaktivierte Router oder fehlerhafte Links werden ignoriert.
	function buildAdjacency(topo: any, nodes: Map<string, any>): Map<string, Map<string, number>> {
		const adjacency = new Map<string, Map<string, number>>();
		const links: any[] = Array.isArray(topo?.links)
			? topo.links
			: Array.isArray(topo?.links)
				? topo.links
				: [];

		for (const l of links) {
			const sId = String(l?.source?.id ?? l?.source?.id ?? l?.source?.id ?? '');
			const tId = String(l?.target?.id ?? l?.target?.id ?? l?.target?.id ?? '');
			if (!sId || !tId) continue;

			const sNode = nodes.get(sId);
			const tNode = nodes.get(tId);
			if (!sNode || !tNode) continue;
			if ((sNode as any)?.disabled || (tNode as any)?.disabled) continue;

			const wRaw = Number(l?.weight ?? l?.weight ?? 1);
			const w = Number.isFinite(wRaw) && wRaw > 0 ? wRaw : 1;

			if (!adjacency.has(sId)) adjacency.set(sId, new Map());
			if (!adjacency.has(tId)) adjacency.set(tId, new Map());
			adjacency.get(sId)?.set(tId, w);
			adjacency.get(tId)?.set(sId, w);
		}

		return adjacency;
	}

	// Erzeugt die Dijkstra-Tabelle für einen gegebenen Quellrouter.
	function buildDijkstraTable(
		topo: any,
		nodes: Map<string, any>,
		source: string
	): DijkstraTable | null {
		const sourceId = String(source ?? '').trim();
		if (!sourceId) return null;

		const routerIds = readRouterIds(nodes);
		if (!routerIds.includes(sourceId)) return null;

		const adjacency = buildAdjacency(topo, nodes);

		const dist = new Map<string, number>();
		const prev = new Map<string, string | null>();
		const hops = new Map<string, number>();
		const visited = new Set<string>();

		for (const id of routerIds) {
			dist.set(id, Number.POSITIVE_INFINITY);
			prev.set(id, null);
			hops.set(id, Number.POSITIVE_INFINITY);
		}

		dist.set(sourceId, 0);
		hops.set(sourceId, 0);

		visited.add(sourceId);

		const sourceNeighbors = adjacency.get(sourceId) ?? new Map();
		for (const [nb, weight] of sourceNeighbors.entries()) {
			dist.set(nb, weight);
			prev.set(nb, sourceId);
			hops.set(nb, 1);
		}

		const rows: DijkstraRow[] = [];
		rows.push({
			step: 0,
			nSet: [sourceId],
			dist: new Map(dist),
			prev: new Map(prev)
		});

		let step = 1;
		while (visited.size < routerIds.length) {
			let nextId: string | null = null;
			let nextDist = Number.POSITIVE_INFINITY;
			let nextHops = Number.POSITIVE_INFINITY;

			for (const id of routerIds) {
				if (visited.has(id)) continue;
				const d = dist.get(id) ?? Number.POSITIVE_INFINITY;
				const h = hops.get(id) ?? Number.POSITIVE_INFINITY;
				if (d < nextDist) {
					nextDist = d;
					nextHops = h;
					nextId = id;
				} else if (d === nextDist) {
					if (h < nextHops) {
						nextHops = h;
						nextId = id;
					} else if (h === nextHops && nextId) {
						const cmp = compareRouterIds(id, nextId, nodes);
						if (cmp < 0) nextId = id;
					}
				}
			}

			if (!nextId || nextDist === Number.POSITIVE_INFINITY) break;

			visited.add(nextId);

			const neighbors = adjacency.get(nextId) ?? new Map();
			for (const [nb, weight] of neighbors.entries()) {
				if (visited.has(nb)) continue;
				const alt = nextDist + weight;
				const cur = dist.get(nb) ?? Number.POSITIVE_INFINITY;
				const curHops = hops.get(nb) ?? Number.POSITIVE_INFINITY;
				const altHops = (hops.get(nextId) ?? 0) + 1;

				if (alt < cur || (alt === cur && altHops < curHops)) {
					dist.set(nb, alt);
					prev.set(nb, nextId);
					hops.set(nb, altHops);
				}
			}

			rows.push({
				step,
				nSet: Array.from(visited.values()),
				dist: new Map(dist),
				prev: new Map(prev)
			});
			step += 1;
		}

		return { sourceId, routerIds, rows };
	}

	// Formatiert die Kosten für die Anzeige.
	function formatCost(cost: number): string {
		if (cost === Infinity) return '∞';
		if (!Number.isFinite(cost)) return '?';
		return String(cost);
	}

	// Formatiert die Vorgänger-ID für die Anzeige.
	function formatPrev(prevId: string | null | undefined, nodes: Map<string, any>): string {
		if (!prevId) return '-';
		const label = labelMap.get(prevId) ?? routerLabel(prevId, nodes);
		return label.length > 0 ? label : '-';
	}

	/**
	 * Berechnet den Zellinhalt einer Dijkstra-Tabelle.
	 * Zeigt nur Änderungen gegenüber der vorherigen Zeile an.
	 */
	function cellText(
		row: DijkstraRow,
		rowIndex: number,
		prevRow: DijkstraRow | null,
		rid: string,
		nodes: Map<string, any>
	): string {
		const d = row.dist.get(rid) ?? Infinity;
		const p = row.prev.get(rid) ?? null;

		if (rowIndex === 0) {
			return `${formatCost(d)}, ${formatPrev(p, nodes)}`;
		}

		const prevD = prevRow?.dist.get(rid) ?? Infinity;
		const prevP = prevRow?.prev.get(rid) ?? null;

		const changed = d !== prevD || p !== prevP;

		if (!changed) return '';
		if (!Number.isFinite(d) && !p) return '';

		const dText = Number.isFinite(d) ? formatCost(d) : '';
		const pText = p ? formatPrev(p, nodes) : '';

		if (dText && pText) return `${dText}, ${pText}`;
		return dText || pText || '';
	}

	// Formatiert die Menge der besuchten Router (N-Set) für die Anzeige.
	function formatNSet(nSet: string[], nodes: Map<string, any>): string {
		if (!nSet || nSet.length === 0) return '';
		const labels = nSet.map((id) => labelMap.get(id) ?? routerLabel(id, nodes));
		const allSingleChar = labels.every((l) => l.length === 1);
		return allSingleChar ? labels.join('') : labels.join(', ');
	}

	// Schließt das Dijkstra-Modal.
	function close(): void {
		if (typeof onClose === 'function') onClose();
	}

	let compactMode = false;
</script>

{#if open}
	<div class="modal-backdrop" on:click={close} />

	<div
		class="modal"
		class:modal--compact={compactMode}
		role="dialog"
		aria-modal="true"
		aria-label="Dijkstra table"
	>
		<div class="modal-header">
			<div class="modal-title">Dijkstra-Tabelle (Link State)</div>
			<div class="modal-actions">
				<button class="btn" on:click={() => (compactMode = !compactMode)}>
					{compactMode ? 'Full view' : 'Compact view'}
				</button>
				<button class="btn btn--close" on:click={close} title="Close">✖</button>
			</div>
		</div>

		<div class="modal-body">
			{#if !isLinkState}
				<div class="empty">Nur verfügbar, wenn Link-State ausgewählt ist.</div>
			{:else if !currentTopology || !currentNodes}
				<div class="empty">Kein Topologie-Snapshot für den aktuellen Schritt.</div>
			{:else if routerIds.length === 0}
				<div class="empty">Keine Router gefunden.</div>
			{:else}
				<div class="controls">
					<div class="control">
						<span class="control-label">Referenzrouter</span>
						<select bind:value={sourceId} class="control-input">
							{#each routerIds as rid (rid)}
								<option value={rid}>{labelMap.get(rid) ?? 'Unbenannt'}</option>
							{/each}
						</select>
					</div>
					<div class="control meta">
						<div>Schritt <span class="mono">#{currentStepNumber}</span></div>
						<div>History-Index <span class="mono">#{currentHistoryIndex}</span></div>
					</div>
				</div>

				{#if !table || displayRows.length === 0}
					<div class="empty">Keine Dijkstra-Schritte verfügbar.</div>
				{:else}
					{@const otherRouters = table.routerIds.filter((id) => id !== table.sourceId)}
					<div class="table-wrap">
						<table class="dijkstra-table">
							<thead>
								<tr>
									<th class="sticky">Schritt</th>
									<th class="sticky">N</th>
									{#each otherRouters as rid (rid)}
										<th class="sticky">
											D({labelMap.get(rid) ?? 'Unbenannt'}), p({labelMap.get(rid) ?? 'Unbenannt'})
										</th>
									{/each}
								</tr>
							</thead>
							<tbody>
								{#each displayRows as row, idx (row.step)}
									{@const prevRow = idx > 0 ? displayRows[idx - 1] : null}
									<tr>
										<td class="mono">{row.step}</td>
										<td class="mono">{formatNSet(row.nSet, currentNodes)}</td>
										{#each otherRouters as rid (rid)}
											<td class="mono">{cellText(row, idx, prevRow, rid, currentNodes)}</td>
										{/each}
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			{/if}
		</div>
	</div>
{/if}

<style>
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(15, 23, 42, 0.45);
		z-index: 210;
	}

	.modal {
		position: fixed;
		left: 50%;
		top: 100px;
		transform: translateX(-50%);
		width: min(1200px, calc(100vw - 48px));
		max-height: calc(100vh - 180px);
		overflow: hidden;
		border-radius: 16px;
		background: rgba(255, 255, 255, 0.98);
		box-shadow: 0 16px 34px rgba(15, 23, 42, 0.25);
		z-index: 220;
		display: flex;
		flex-direction: column;
	}

	.modal--compact {
		left: 16px;
		right: auto;
		top: 140px;
		transform: none;
		width: min(640px, calc(100vw - 32px));
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 12px 14px;
		border-bottom: 1px solid rgba(15, 23, 42, 0.12);
	}

	.modal-title {
		font-size: 14px;
		font-weight: 900;
		color: #0f172a;
	}

	.modal-actions {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.btn {
		padding: 6px 10px;
		border-radius: 12px;
		border: 1px solid rgba(15, 23, 42, 0.18);
		background: rgba(255, 255, 255, 0.92);
		cursor: pointer;
		font-size: 12px;
	}

	.btn--close {
		font-weight: 900;
	}

	.modal-body {
		padding: 12px 14px 16px;
		overflow: auto;
	}

	.controls {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 16px;
		margin-bottom: 12px;
		flex-wrap: wrap;
	}

	.control {
		display: grid;
		gap: 6px;
	}

	.control-label {
		font-size: 11px;
		font-weight: 800;
		color: rgba(15, 23, 42, 0.8);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.dijkstra-table th:first-child,
	.dijkstra-table td:first-child {
		min-width: 60px;
	}

	.dijkstra-table th:nth-child(2),
	.dijkstra-table td:nth-child(2) {
		min-width: 120px;
	}

	.control-input {
		padding: 6px 10px;
		border-radius: 10px;
		border: 1px solid rgba(15, 23, 42, 0.18);
		font-size: 12px;
		min-width: 180px;
	}

	.control.meta {
		font-size: 12px;
		color: rgba(15, 23, 42, 0.75);
		display: grid;
		gap: 4px;
	}

	.table-wrap {
		overflow: auto;
		max-height: 100%;
		scrollbar-gutter: stable both-edges;
	}

	.dijkstra-table {
		width: max-content;
		min-width: 100%;
		border-collapse: collapse;
		font-size: 11px;
		background: rgba(255, 255, 255, 0.7);
		border: 1px solid rgba(15, 23, 42, 0.18);
	}

	.modal--compact .dijkstra-table {
		font-size: 10.5px;
	}

	.dijkstra-table th,
	.dijkstra-table td {
		padding: 6px 8px;
		border: 1px solid rgba(15, 23, 42, 0.12);
		text-align: left;
		vertical-align: top;
		white-space: nowrap;
	}

	.modal--compact .dijkstra-table th,
	.modal--compact .dijkstra-table td {
		padding: 4px 6px;
	}

	.dijkstra-table th {
		background: rgba(15, 23, 42, 0.06);
		font-weight: 900;
		color: rgba(15, 23, 42, 0.92);
	}

	.sticky {
		position: sticky;
		top: 0;
		z-index: 2;
	}

	.mono {
		font-family:
			ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',
			monospace;
	}

	.empty {
		padding: 10px 12px;
		border-radius: 14px;
		background: rgba(15, 23, 42, 0.05);
		border: 1px solid rgba(15, 23, 42, 0.08);
		color: #0f172a;
		font-size: 12px;
	}

	:global(.dark) .modal-backdrop {
		background: rgba(2, 6, 23, 0.65);
	}

	:global(.dark) .modal {
		background: rgba(7, 11, 28, 0.98);
		box-shadow: 0 16px 34px rgba(2, 6, 23, 0.5);
	}

	:global(.dark) .modal-title {
		color: #e2e8f0;
	}

	:global(.dark) .btn {
		border: 1px solid rgba(148, 163, 184, 0.2);
		background: rgba(15, 23, 42, 0.6);
		color: #e2e8f0;
	}

	:global(.dark) .control-label {
		color: rgba(226, 232, 240, 0.7);
	}

	:global(.dark) .control-input {
		background: rgba(15, 23, 42, 0.6);
		color: #e2e8f0;
		border: 1px solid rgba(148, 163, 184, 0.2);
	}

	:global(.dark) .control.meta {
		color: rgba(226, 232, 240, 0.7);
	}

	:global(.dark) .dijkstra-table {
		background: rgba(2, 6, 23, 0.65);
	}

	:global(.dark) .dijkstra-table th,
	:global(.dark) .dijkstra-table td {
		border: 1px solid rgba(148, 163, 184, 0.12);
		color: #e2e8f0;
	}

	:global(.dark) .dijkstra-table th {
		background: rgba(15, 23, 42, 0.7);
	}

	:global(.dark) .empty {
		background: rgba(15, 23, 42, 0.5);
		border: 1px solid rgba(148, 163, 184, 0.12);
		color: #e2e8f0;
	}

	@media (max-width: 900px) {
		.modal {
			top: 80px;
		}

		.controls {
			align-items: stretch;
		}
	}

	@media (max-width: 640px) {
		.modal {
			top: 0;
			left: 0;
			right: 0;
			transform: none;
			width: 100vw;
			max-height: 100dvh;
			border-radius: 0;
			border-bottom-left-radius: 0;
			border-bottom-right-radius: 0;
		}

		.modal-header {
			padding: 10px 12px;
			padding-top: max(10px, env(safe-area-inset-top));
		}

		.modal-title {
			font-size: 13px;
		}

		.modal-body {
			padding: 10px 10px 16px;
			padding-bottom: max(16px, env(safe-area-inset-bottom));
		}

		.control-input {
			min-width: 0;
			width: 100%;
		}

		.dijkstra-table th,
		.dijkstra-table td {
			padding: 5px 6px;
			font-size: 10px;
		}
	}
</style>
