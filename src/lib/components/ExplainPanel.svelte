<script lang="ts">
	import { fly } from 'svelte/transition';
	import { simulation, ui, uiState } from '$lib/viewmodels';

	$: explainCell = ($uiState as any)?.explainCell ?? null;
	$: ctrl = $simulation as any;
	$: history = Array.isArray(ctrl?.history) ? (ctrl.history as any[]) : [];

	// ── helpers ──────────────────────────────────────────────────────────────

	function extractTopology(state: any): any | null {
		return state?.topologyState ?? null;
	}
	function extractNodesMap(topo: any): Map<string, any> | null {
		const m = topo?.nodes;
		return m instanceof Map ? m : null;
	}
	function readDvState(node: any) {
		const dv = node?.dvState;
		const values = dv?.dvs ?? null;
		if (!values) return null;
		return { values } as {
			values: Record<string, Record<string, { dist: number; nextHop: string | null }>>;
		};
	}
	function linkWeightBetween(rid: string, nid: string, topo: any): number | null {
		const links: any[] = Array.isArray(topo?.links) ? topo.links : [];
		for (const l of links) {
			const sId = String(l?.source?.id ?? '');
			const tId = String(l?.target?.id ?? '');
			if ((sId === rid && tId === nid) || (sId === nid && tId === rid)) {
				const w = Number(l?.weight ?? 1);
				return Number.isFinite(w) && w > 0 ? w : 1;
			}
		}
		return null;
	}
	function rname(id: string, nodes: Map<string, any> | null): string {
		const n = nodes?.get(id);
		const name = String(n?.name ?? '').trim();
		return name || id;
	}
	function fmt(dist: number | undefined): string {
		if (dist === undefined || dist === Infinity) return '∞';
		return String(dist);
	}
	function directNeighborIds(rid: string, topo: any, nodes: Map<string, any>): string[] {
		const links: any[] = Array.isArray(topo?.links) ? topo.links : [];
		const nb = new Set<string>();
		for (const l of links) {
			const sId = String(l?.source?.id ?? '');
			const tId = String(l?.target?.id ?? '');
			if (sId === rid || tId === rid) {
				const other = sId === rid ? tId : sId;
				const node = nodes.get(other);
				if (node && !(node as any).disabled) nb.add(other);
			}
		}
		return Array.from(nb).sort((a, b) => a.localeCompare(b));
	}

	// ── data ─────────────────────────────────────────────────────────────────

	type ExplainData = {
		routerLabel: string;
		destId: string;
		destLabel: string;
		viaId: string;
		viaLabel: string;
		step: number;
		edgeCost: number | null;
		neighborDist: number;
		computedDist: number;
		viaDV: { id: string; label: string; dist: number }[];
		bellman: {
			rowIds: string[];
			rowLabels: string[];
			destIds: string[];
			destLabels: string[];
			values: Record<string, Record<string, { dist: number }>>;
			minByDest: Record<string, number>;
			changedCells: Set<string>; // "viaId:destId" pairs that differ from previous step
		};
	};

	$: data = buildData(explainCell);

	function buildData(cell: any): ExplainData | null {
		if (!cell) return null;
		const { routerId, destId, rowId: viaId, step } = cell;

		const entryIndex = history.findIndex(
			(h: any) => Math.floor(Number(h?.stepNumber ?? -1)) === step
		);
		if (entryIndex < 0) return null;
		const entry = history[entryIndex];

		// Find the previous recompute (or init) step for comparison — skipping
		// intermediate send/update steps, which have transitional dvState data.
		let prevEntry: any = null;
		for (let i = entryIndex - 1; i >= 0; i--) {
			const t = String(history[i]?.stepType ?? '');
			if (t !== 'send' && t !== 'update') {
				prevEntry = history[i];
				break;
			}
		}

		const topo = extractTopology(entry);
		const nodes = extractNodesMap(topo);
		if (!nodes || !topo) return null;

		const node = nodes.get(routerId);
		if (!node) return null;
		const dvState = readDvState(node);
		if (!dvState) return null;

		const edgeCost = linkWeightBetween(routerId, viaId, topo);
		const neighborDist = dvState.values?.[viaId]?.[destId]?.dist ?? Infinity;
		const computedDist =
			edgeCost === null || edgeCost === Infinity || neighborDist === Infinity
				? Infinity
				: edgeCost + neighborDist;

		const allDests = Array.from(nodes.keys())
			.filter((id) => id !== routerId)
			.sort((a, b) => a.localeCompare(b));

		const viaReport = dvState.values?.[viaId] ?? {};
		const viaDV = allDests.map((id) => ({
			id,
			label: rname(id, nodes),
			dist: viaReport?.[id]?.dist ?? Infinity
		}));

		const rowIds = directNeighborIds(routerId, topo, nodes);
		const bellmanValues: Record<string, Record<string, { dist: number }>> = {};
		const minByDest: Record<string, number> = {};
		for (const d of allDests) minByDest[d] = Infinity;
		for (const rid of rowIds) {
			const row: Record<string, { dist: number }> = {};
			const lc = linkWeightBetween(routerId, rid, topo);
			const dvRow = dvState.values?.[rid] ?? {};
			for (const d of allDests) {
				const nd = dvRow?.[d]?.dist ?? Infinity;
				const dist = lc === null || lc === Infinity || nd === Infinity ? Infinity : lc + nd;
				row[d] = { dist };
				if (dist < minByDest[d]) minByDest[d] = dist;
			}
			bellmanValues[rid] = row;
		}

		// Compare with previous step to find changed cells
		const changedCells = new Set<string>();
		if (prevEntry) {
			const prevTopo = extractTopology(prevEntry);
			const prevNodes = prevTopo ? extractNodesMap(prevTopo) : null;
			const prevNode = prevNodes?.get(routerId);
			const prevDvState = prevNode ? readDvState(prevNode) : null;

			for (const rid of rowIds) {
				const lc = linkWeightBetween(routerId, rid, topo);
				const prevLc = prevTopo ? linkWeightBetween(routerId, rid, prevTopo) : null;
				const dvRow = dvState.values?.[rid] ?? {};
				const prevDvRow = prevDvState?.values?.[rid] ?? {};
				for (const d of allDests) {
					const nd = dvRow?.[d]?.dist ?? Infinity;
					const dist = lc === null || lc === Infinity || nd === Infinity ? Infinity : lc + nd;
					const prevNd = prevDvRow?.[d]?.dist ?? Infinity;
					const prevDist =
						prevLc === null || prevLc === Infinity || prevNd === Infinity
							? Infinity
							: prevLc + prevNd;
					if (dist !== prevDist) changedCells.add(`${rid}:${d}`);
				}
			}
		}

		return {
			routerLabel: rname(routerId, nodes),
			destId,
			destLabel: rname(destId, nodes),
			viaId,
			viaLabel: rname(viaId, nodes),
			step,
			edgeCost,
			neighborDist,
			computedDist,
			viaDV,
			bellman: {
				rowIds,
				rowLabels: rowIds.map((id) => rname(id, nodes)),
				destIds: allDests,
				destLabels: allDests.map((id) => rname(id, nodes)),
				values: bellmanValues,
				minByDest,
				changedCells
			}
		};
	}

	let showPath = false;

	function computePath(): { linkIds: string[]; nodeIds: string[] } {
		if (!data || !explainCell) return { linkIds: [], nodeIds: [] };
		const { routerId, destId, rowId: viaId, step } = explainCell;
		const entry = history.find((h: any) => Math.floor(Number(h?.stepNumber ?? -1)) === step);
		if (!entry) return { linkIds: [], nodeIds: [] };
		const topo = extractTopology(entry);
		const nodes = extractNodesMap(topo);
		if (!nodes || !topo) return { linkIds: [], nodeIds: [] };
		const links: any[] = Array.isArray(topo?.links) ? topo.links : [];

		function findLinkId(aId: string, bId: string): string | null {
			for (const l of links) {
				const sId = String(l?.source?.id ?? '');
				const tId = String(l?.target?.id ?? '');
				if ((sId === aId && tId === bId) || (sId === bId && tId === aId))
					return String(l?.id ?? '') || null;
			}
			return null;
		}

		const pathLinkIds = new Set<string>();
		// nodeIds tracks the full ordered sequence (may revisit a node for loop cases)
		const nodeIds: string[] = [routerId];

		// Step 1: routerId → viaId (the explained via edge, always first)
		const viaLinkId = findLinkId(routerId, viaId);
		if (viaLinkId) pathLinkIds.add(viaLinkId);
		nodeIds.push(viaId);

		// Step 2: trace from viaId to destId using each router's routing table.
		// routerId is intentionally NOT pre-added to visited so the path can pass
		// through it again if the via router routes back (e.g. B→D→E).
		const visited = new Set<string>([viaId]);
		let current = viaId;

		for (let i = 0; i < 20; i++) {
			if (current === destId) break;
			const node = nodes.get(current);
			const rtEntries = node?.routingTable?.entries;
			const rtMap = rtEntries instanceof Map ? rtEntries : new Map();
			const rtEntry = rtMap.get(destId);
			const nextHop = String(rtEntry?.nextHopId ?? rtEntry?.nextHop ?? '').trim();
			if (!nextHop || nextHop === '-' || nextHop === current) break;
			const linkId = findLinkId(current, nextHop);
			if (linkId) pathLinkIds.add(linkId);
			nodeIds.push(nextHop);
			if (visited.has(nextHop)) break;
			visited.add(nextHop);
			current = nextHop;
		}
		return { linkIds: Array.from(pathLinkIds), nodeIds };
	}

	function simulatePath() {
		showPath = true;
		const { linkIds, nodeIds } = computePath();
		ui.setExplainPathLinkIds(linkIds);
		ui.setExplainPathNodeIds(nodeIds);
	}

	function clearPath() {
		showPath = false;
		ui.setExplainPathLinkIds(null);
		ui.setExplainPathNodeIds(null);
	}

	function close() {
		clearPath();
		ui.setExplainCell(null);
	}
</script>

{#if explainCell && data}
	<div class="explain-panel" transition:fly={{ x: -24, duration: 180 }}>

		<!-- ── Header ── -->
		<div class="panel-header">
			<div>
				<div class="header-eyebrow">Bellman-Ford Explanation</div>
				<div class="header-formula">
					D<sup>{data.routerLabel}</sup>({data.destLabel},&nbsp;via&nbsp;{data.viaLabel})
				</div>
			</div>
			<button class="close-btn" on:click={close} title="Close">✖</button>
		</div>

		<!-- ── Scrollable body ── -->
		<div class="panel-body">

			<!-- Colour legend -->
			<div class="legend">
				<span class="dot dot-source"></span><span>{data.routerLabel} (computing)</span>
				<span class="dot dot-via"></span><span>{data.viaLabel} (via)</span>
				<span class="dot dot-dest"></span><span>{data.destLabel} (destination)</span>
			</div>

			<!-- ── Highlighted formula ── -->
			<div class="formula-card">
				<div class="formula-line">
					D<sup>{data.routerLabel}</sup>({data.destLabel},&nbsp;{data.viaLabel})
					&nbsp;=&nbsp;
					<span class="fc-via">c({data.routerLabel},{data.viaLabel})</span>
					&nbsp;+&nbsp;
					<span class="fc-dest">D<sup>{data.viaLabel}</sup>({data.destLabel})</span>
				</div>
				<div class="formula-line formula-numbers">
					<span class="equals-gap"></span>
					<span class="fc-via">{data.edgeCost ?? '?'}</span>
					&nbsp;+&nbsp;
					<span class="fc-dest">{fmt(data.neighborDist)}</span>
					&nbsp;=&nbsp;
					<span class="fc-result">{fmt(data.computedDist)}</span>
				</div>
			</div>

			<!-- ── Tables ── -->
			<div class="tables-row">

				<!-- Left: via's sent DV -->
				<div class="tbl-block">
					<div class="tbl-title">
						D<sup>{data.viaLabel}</sup> &rarr; {data.routerLabel}
						<span class="tbl-subtitle">(what {data.viaLabel} reported)</span>
					</div>
					<table class="etable">
						<thead>
							<tr>
								<th>Dest</th>
								<th class="th-via">D<sup>{data.viaLabel}</sup></th>
							</tr>
						</thead>
						<tbody>
							{#each data.viaDV as row (row.id)}
								<tr class:tr-dest={row.id === data.destId}>
									<td class="td-label">{row.label}</td>
									<td
										class:td-dest-val={row.id === data.destId}
										class:td-inf={row.dist === Infinity}
									>{fmt(row.dist)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>

				<!-- Divider with edge cost -->
				<div class="divider">
					<div class="divider-label">+ c({data.routerLabel},{data.viaLabel}) = {data.edgeCost ?? '?'}</div>
					<div class="divider-arrow">→</div>
				</div>

				<!-- Right: computing router's bellman table -->
				<div class="tbl-block tbl-bellman">
					<div class="tbl-title">
						D<sup>{data.routerLabel}</sup>
						<span class="tbl-subtitle">(step {data.step})</span>
					</div>
					<table class="etable">
						<thead>
							<tr>
								<th class="th-corner"></th>
								{#each data.bellman.rowIds as rid, i (rid)}
									<th class:th-via-col={rid === data.viaId}>{data.bellman.rowLabels[i]}</th>
								{/each}
							</tr>
						</thead>
						<tbody>
							{#each data.bellman.destIds as dest, di (dest)}
								<tr class:tr-dest={dest === data.destId}>
									<td class="td-label">{data.bellman.destLabels[di]}</td>
									{#each data.bellman.rowIds as rid (rid)}
										{@const val = data.bellman.values?.[rid]?.[dest]}
										{@const isSelected = dest === data.destId && rid === data.viaId}
										<td
											class:td-selected={isSelected}
											class:td-inf={val?.dist === Infinity}
										>{fmt(val?.dist)}</td>
									{/each}
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>

			<!-- ── Path simulation buttons ── -->
			<div class="path-buttons">
				<button class="path-btn path-btn-simulate" on:click={simulatePath}>
					Simulate path
				</button>
				<button class="path-btn path-btn-clear" on:click={clearPath} disabled={!showPath}>
					Clear
				</button>
			</div>

		</div>
	</div>
{/if}

<style>
	/* ── Panel shell ──────────────────────────────────────────────────────── */
	.explain-panel {
		position: fixed;
		left: 12px;
		top: 78px;
		bottom: 136px;
		z-index: 50;
		width: min(500px, calc(100vw - 24px));
		background: rgba(223, 243, 255, 0.97);
		border-radius: 14px;
		box-shadow: 0 8px 28px rgba(15, 23, 42, 0.2);
		display: flex;
		flex-direction: column;
		overflow: hidden;
		font-size: 12px;
		color: #0f172a;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
	}
	:global(.dark) .explain-panel {
		background: rgba(15, 23, 42, 0.97);
		color: #f1f5f9;
		box-shadow: 0 8px 28px rgba(56, 189, 248, 0.1);
	}

	/* ── Header ───────────────────────────────────────────────────────────── */
	.panel-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 8px;
		padding: 11px 14px 9px;
		background: rgba(255,255,255,0.55);
		border-bottom: 1px solid rgba(148,163,184,0.25);
		flex-shrink: 0;
	}
	:global(.dark) .panel-header {
		background: rgba(30,41,59,0.7);
		border-color: rgba(71,85,105,0.4);
	}
	.header-eyebrow {
		font-size: 10px;
		font-weight: 700;
		letter-spacing: .07em;
		text-transform: uppercase;
		color: #64748b;
		margin-bottom: 2px;
	}
	:global(.dark) .header-eyebrow { color: #94a3b8; }
	.header-formula {
		font-family: ui-monospace, monospace;
		font-size: 14px;
		font-weight: 600;
		color: #0f172a;
	}
	:global(.dark) .header-formula { color: #e2e8f0; }
	.close-btn {
		background: transparent;
		border: none;
		font-size: 16px;
		cursor: pointer;
		color: #64748b;
		padding: 2px 4px;
		flex-shrink: 0;
		line-height: 1;
	}
	.close-btn:hover { color: #ef4444; }

	/* ── Scrollable body ──────────────────────────────────────────────────── */
	.panel-body {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		overflow-x: auto;
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 12px 14px 16px;
	}

	/* ── Legend ───────────────────────────────────────────────────────────── */
	.legend {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-wrap: wrap;
		font-size: 11px;
		color: #475569;
	}
	:global(.dark) .legend { color: #94a3b8; }
	.dot {
		display: inline-block;
		width: 9px;
		height: 9px;
		border-radius: 50%;
		flex-shrink: 0;
	}
	.dot-source { background: #f59e0b; }
	.dot-via    { background: #22c55e; }
	.dot-dest   { background: #a855f7; }

	/* ── Formula card ─────────────────────────────────────────────────────── */
	.formula-card {
		background: rgba(255,255,255,0.75);
		border: 1px solid rgba(148,163,184,0.3);
		border-radius: 10px;
		padding: 10px 14px;
		display: flex;
		flex-direction: column;
		gap: 4px;
		flex-shrink: 0;
	}
	:global(.dark) .formula-card {
		background: rgba(30,41,59,0.6);
		border-color: rgba(71,85,105,0.4);
	}
	.formula-line {
		font-family: ui-monospace, monospace;
		font-size: 12px;
		color: #334155;
		line-height: 1.5;
	}
	:global(.dark) .formula-line { color: #cbd5e1; }
	.formula-numbers {
		font-size: 15px;
		font-weight: 700;
		padding-top: 2px;
		border-top: 1px solid rgba(148,163,184,0.2);
	}
	.equals-gap {
		/* invisible spacer to align "= X + Y = Z" under the symbolic line */
		visibility: hidden;
		font-size: 12px;
	}
	/* Colour-coded parts */
	.fc-via    { color: #16a34a; font-weight: 700; }
	.fc-dest   { color: #9333ea; font-weight: 700; }
	.fc-result { color: #d97706; font-weight: 800; font-size: 17px; }
	:global(.dark) .fc-via    { color: #4ade80; }
	:global(.dark) .fc-dest   { color: #c084fc; }
	:global(.dark) .fc-result { color: #fbbf24; }

	/* ── Tables row ───────────────────────────────────────────────────────── */
	.tables-row {
		display: flex;
		align-items: flex-start;
		gap: 0;
		flex-shrink: 0;
	}

	.tbl-block {
		flex-shrink: 0;
	}
	.tbl-title {
		font-size: 11px;
		font-weight: 700;
		color: #334155;
		margin-bottom: 5px;
		font-family: ui-monospace, monospace;
	}
	:global(.dark) .tbl-title { color: #cbd5e1; }
	.tbl-subtitle {
		font-size: 10px;
		font-weight: 400;
		color: #64748b;
		margin-left: 4px;
		font-family: inherit;
	}
	:global(.dark) .tbl-subtitle { color: #64748b; }

	/* ── Divider (arrow + edge cost) ──────────────────────────────────────── */
	.divider {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 0 12px;
		gap: 3px;
		align-self: center;
		margin-top: 18px; /* roughly offset for title row */
		flex-shrink: 0;
	}
	.divider-label {
		font-size: 10px;
		font-weight: 700;
		color: #16a34a;
		white-space: nowrap;
		font-family: ui-monospace, monospace;
	}
	:global(.dark) .divider-label { color: #4ade80; }
	.divider-arrow {
		font-size: 18px;
		color: #16a34a;
		line-height: 1;
	}
	:global(.dark) .divider-arrow { color: #4ade80; }

	/* ── Table styles ─────────────────────────────────────────────────────── */
	.etable {
		border-collapse: collapse;
		font-size: 12px;
		text-align: center;
	}
	.etable th,
	.etable td {
		border: 1px solid #334155;
		padding: 4px 9px;
		min-width: 28px;
	}
	:global(.dark) .etable th,
	:global(.dark) .etable td {
		border-color: #475569;
		color: #f1f5f9;
	}
	.etable th {
		font-weight: 700;
		background: #f1f5f9;
	}
	:global(.dark) .etable th { background: #1e293b; }

	.th-corner { background: #f1f5f9; min-width: 24px; }
	:global(.dark) .th-corner { background: #1e293b; }

	/* Via column header: green */
	.th-via,
	.th-via-col {
		background: rgba(34,197,94,0.15) !important;
		color: #15803d;
		font-weight: 800;
	}
	:global(.dark) .th-via,
	:global(.dark) .th-via-col {
		background: rgba(34,197,94,0.2) !important;
		color: #4ade80;
	}

	.td-label {
		font-weight: 700;
		background: #f1f5f9;
		text-align: left;
	}
	:global(.dark) .td-label { background: #1e293b; }

	/* Destination row: solid purple for all cells */
	.tr-dest td {
		background: rgba(168, 85, 247, 0.22);
		color: #6b21a8;
		font-weight: 700;
	}
	:global(.dark) .tr-dest td {
		background: rgba(168, 85, 247, 0.32);
		color: #e9d5ff;
	}
	.tr-dest .td-label {
		background: rgba(168, 85, 247, 0.32) !important;
		color: #6b21a8;
		font-weight: 800;
	}
	:global(.dark) .tr-dest .td-label {
		background: rgba(168, 85, 247, 0.4) !important;
		color: #e9d5ff;
	}

	/* Best value: blue */
	.td-best {
		background: #5b9bd5 !important;
		color: #fff !important;
		font-weight: 700;
	}
	/* In the destination row, best cells keep the purple row color */
	.tr-dest .td-best {
		background: rgba(168, 85, 247, 0.22) !important;
		color: #6b21a8 !important;
	}
	:global(.dark) .tr-dest .td-best {
		background: rgba(168, 85, 247, 0.32) !important;
		color: #e9d5ff !important;
	}

	/* Selected cell (the one being explained): amber */
	.td-selected {
		background: #f59e0b !important;
		color: #fff !important;
		font-weight: 800;
		outline: 2px solid #d97706;
		outline-offset: -2px;
	}

	/* The dest-val cell in the left table: purple */
	.td-dest-val {
		background: rgba(168,85,247,0.2) !important;
		color: #7e22ce !important;
		font-weight: 800;
	}
	:global(.dark) .td-dest-val {
		background: rgba(168,85,247,0.3) !important;
		color: #c084fc !important;
	}

	.td-inf { color: #94a3b8; }

	/* ── Bellman table: all value cells light blue, changed cells dark blue ── */
	.tbl-bellman .etable td:not(.td-label) {
		background: rgba(186, 230, 253, 0.45);
		color: #0369a1;
	}
	/* Changed cell: dark blue */
	.tbl-bellman .etable .td-changed {
		background: #5b9bd5 !important;
		color: #fff !important;
		font-weight: 700;
	}
	/* Destination row stays purple — overrides light blue and dark blue */
	.tbl-bellman .tr-dest td:not(.td-selected) {
		background: rgba(168, 85, 247, 0.22) !important;
		color: #6b21a8 !important;
		font-weight: 700;
	}
	.tbl-bellman .tr-dest .td-label {
		background: rgba(168, 85, 247, 0.32) !important;
	}
	:global(.dark) .tbl-bellman .etable td:not(.td-label) {
		background: rgba(56, 189, 248, 0.12);
		color: #38bdf8;
	}
	:global(.dark) .tbl-bellman .etable .td-changed {
		background: #3b82f6 !important;
		color: #fff !important;
	}
	:global(.dark) .tbl-bellman .tr-dest td:not(.td-selected) {
		background: rgba(168, 85, 247, 0.32) !important;
		color: #e9d5ff !important;
	}

	/* ── Path simulation buttons ──────────────────────────────────────────── */
	.path-buttons {
		display: flex;
		gap: 8px;
		flex-shrink: 0;
	}
	.path-btn {
		flex: 1;
		padding: 7px 12px;
		border-radius: 8px;
		font-size: 12px;
		font-weight: 700;
		border: none;
		cursor: pointer;
		transition: background 0.15s, opacity 0.15s;
	}
	.path-btn:disabled {
		opacity: 0.38;
		cursor: default;
	}
	.path-btn-simulate {
		background: #0ea5e9;
		color: #fff;
	}
	.path-btn-simulate:hover {
		background: #0284c7;
	}
	.path-btn-clear {
		background: #f1f5f9;
		color: #475569;
		border: 1px solid #cbd5e1;
	}
	.path-btn-clear:hover:not(:disabled) {
		background: #e2e8f0;
	}
	:global(.dark) .path-btn-simulate { background: #0284c7; }
	:global(.dark) .path-btn-simulate:hover { background: #0ea5e9; }
	:global(.dark) .path-btn-clear {
		background: #1e293b;
		color: #94a3b8;
		border-color: #334155;
	}
	:global(.dark) .path-btn-clear:hover:not(:disabled) { background: #334155; }

	/* ── Mobile ───────────────────────────────────────────────────────────── */
	@media (max-width: 640px) {
		.explain-panel {
			left: 0; right: 0; top: 0; bottom: 0;
			width: 100vw;
			border-radius: 0;
		}
		.tables-row {
			flex-direction: column;
			gap: 10px;
		}
		.divider {
			flex-direction: row;
			margin-top: 0;
			align-self: auto;
		}
	}
</style>
