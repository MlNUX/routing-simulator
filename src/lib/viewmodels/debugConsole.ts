import { get } from 'svelte/store';
import { simulation, ui, uiState } from '$lib/viewmodels';
import { RoutingAlgorithmType, type AlgorithmType } from '../model/RoutingAlgorithmType';
import type { SimulationState } from '../model/SimulationState';

type DebugOk = { ok: true; result: unknown };
type DebugErr = { ok: false; error: string };
type DebugResponse = DebugOk | DebugErr;

type DebugCmd =
	| { cmd: 'help' }
	| { cmd: 'ping' }
	| { cmd: 'state' }
	| { cmd: 'ui' }
	| { cmd: 'history'; limit?: number }
	| { cmd: 'events'; index?: number }
	| { cmd: 'topology'; index?: number }
	| { cmd: 'nodes'; index?: number }
	| { cmd: 'links'; index?: number }
	| { cmd: 'routingTable'; routerId: string; index?: number }
	| { cmd: 'historyTable'; routerId?: string; index?: number }
	| { cmd: 'jumpToStep'; step: number }
	| { cmd: 'jumpToHistoryIndex'; index: number }
	| { cmd: 'nextStep' }
	| { cmd: 'prevStep' }
	| { cmd: 'play' }
	| { cmd: 'pause' }
	| { cmd: 'stop' }
	| { cmd: 'reset' }
	| { cmd: 'setAlgorithm'; algo: AlgorithmType | string }
	| { cmd: 'setMode'; mode: string }
	| { cmd: 'clearMode' }
	| { cmd: 'selectRouter'; routerId: string | null }
	| { cmd: 'renameRouter'; routerId: string; name: string }
	| { cmd: 'addNode'; x: number; y: number }
	| { cmd: 'addLink'; sourceId: string; targetId: string; weight?: number }
	| { cmd: 'deleteNode'; nodeId: string }
	| { cmd: 'deleteLink'; sourceId: string; targetId: string }
	| { cmd: 'changeLinkWeight'; sourceId: string; targetId: string; weight: number }
	| { cmd: 'moveNode'; nodeId: string; x: number; y: number }
	| { cmd: 'previewPacket'; sourceId: string; targetId: string }
	| { cmd: 'clearPacketPreview' }
	| { cmd: 'exportJson' }
	| { cmd: 'importJson'; json: string }
	| { cmd: 'instanceCheck'; sourceId?: string; targetId?: string; weight?: number }
	| { cmd: 'errorToast'; message: string }
	| { cmd: 'surfer'; open?: boolean };

/**
 * Prueft, ob ein Wert ein nicht-null Objekt ist.
 */
function isObject(x: unknown): x is Record<string, unknown> {
	return typeof x === 'object' && x !== null;
}

/**
 * Normalisiert verschiedene Eingaben auf einen gueltigen Algorithmus-Typ.
 */
function normalizeAlgo(value: unknown): AlgorithmType | null {
	const s = String(value ?? '').trim();
	if (s === RoutingAlgorithmType.LINK_STATE) return RoutingAlgorithmType.LINK_STATE;
	if (s === RoutingAlgorithmType.DISTANCE_VECTOR) return RoutingAlgorithmType.DISTANCE_VECTOR;
	if (s === RoutingAlgorithmType.DISTANCE_VECTOR_POISONED)
		return RoutingAlgorithmType.DISTANCE_VECTOR_POISONED;

	// Aliase
	if (s.toLowerCase() === 'link') return RoutingAlgorithmType.LINK_STATE;
	if (s.toLowerCase() === 'distance') return RoutingAlgorithmType.DISTANCE_VECTOR;
	if (s.toLowerCase() === 'distancepoisoned') return RoutingAlgorithmType.DISTANCE_VECTOR_POISONED;

	return null;
}

/**
 * Zerlegt eine Kommandozeile in Tokens inklusive einfacher Anfuehrungszeichen-Unterstuetzung.
 */
function tokenizeLine(input: string): string[] {
	const s = String(input ?? '').trim();
	if (!s) return [];
	const out: string[] = [];
	const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(s))) out.push(m[1] ?? m[2] ?? m[3]);
	return out;
}

/**
 * Liest eine ganze Zahl mit Fallback bei ungueltigen Eingaben.
 */
function safeInt(x: unknown, fallback = 0): number {
	const n = Math.floor(Number(x));
	return Number.isFinite(n) ? n : fallback;
}

/**
 * Liest eine Zahl mit Fallback bei ungueltigen Eingaben.
 */
function safeNum(x: unknown, fallback = 0): number {
	const n = Number(x);
	return Number.isFinite(n) ? n : fallback;
}

/**
 * Begrenzt einen Zahlenwert auf einen inklusiven Bereich.
 */
function clamp(n: number, lo: number, hi: number): number {
	if (n < lo) return lo;
	if (n > hi) return hi;
	return n;
}

/**
 * Liest eine ID als getrimmten String.
 */
function readId(value: unknown): string {
	return String(value ?? '').trim();
}

/**
 * Gibt die Router-Map einer Topologie oder eine leere Map zurueck.
 */
function readNodes(topo: any): Map<string, any> {
	return topo?.nodes instanceof Map ? (topo.nodes as Map<string, any>) : new Map<string, any>();
}

/**
 * Gibt die Link-Liste einer Topologie oder ein leeres Array zurueck.
 */
function readLinks(topo: any): any[] {
	return Array.isArray(topo?.links) ? topo.links : [];
}

/**
 * Prueft, ob ein Router deaktiviert ist.
 */
function isDisabledRouter(node: any): boolean {
	return !!(node as any)?.disabled;
}

/**
 * Ermittelt den Anzeigenamen eines Routers aus Name oder ID.
 */
function routerDisplayName(id: string, nodes?: Map<string, any> | null): string {
	const rid = String(id ?? '').trim();
	if (!rid) return '';
	const node = nodes instanceof Map ? nodes.get(rid) : null;
	const name = String(node?.name ?? node?.name ?? '').trim();
	return name.length > 0 ? name : rid;
}

/**
 * Vergleicht Router-IDs anhand der Anzeige-Namen fuer stabile Sortierung.
 */
function compareRouterIds(aId: string, bId: string, nodes?: Map<string, any> | null): number {
	const aLabel = routerDisplayName(aId, nodes);
	const bLabel = routerDisplayName(bId, nodes);
	const labelCmp = aLabel.localeCompare(bLabel, undefined, { numeric: true, sensitivity: 'base' });
	if (labelCmp !== 0) return labelCmp;
	return String(aId).localeCompare(String(bId), undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * Liest den aktuellen SimulationController aus dem Store.
 */
function getCtrlAny(): any {
	return get(simulation) as any;
}

/**
 * Liest den aktuellen UI-Zustand aus dem Store.
 */
function getUiStateAny(): any {
	return get(uiState) as any;
}

/**
 * Gibt die Historie des Controllers als Liste von Snapshots zurueck.
 */
function readHistory(ctrl: any): SimulationState[] {
	return Array.isArray(ctrl?.history) ? (ctrl.history as SimulationState[]) : [];
}

/**
 * Liest Routing-Eintraege eines Routers in eine einfache Map-Struktur.
 */
function readRoutingEntries(
	node: any | null | undefined
): Map<string, { nextHopId: string; cost: number }> {
	if (!node) return new Map();
	const entriesMap = (node as any)?.routingTable?.entries;
	const values: any[] = entriesMap instanceof Map ? Array.from(entriesMap.values()) : [];

	const out = new Map<string, { nextHopId: string; cost: number }>();
	for (const e of values) {
		const destId = String(e?.destinationId ?? e?.destinationId ?? '');
		if (!destId) continue;
		const nextHopId = String(e?.nextHopId ?? e?.nextHopId ?? '');
		const cost = Number(e?.cost ?? e?.cost ?? Infinity);
		out.set(destId, { nextHopId, cost });
	}
	return out;
}

/**
 * Berechnet alle erreichbaren Router-IDs in derselben Zusammenhangskomponente.
 */
function connectedComponentRouterIds(
	topo: any,
	nodes: Map<string, any>,
	routerId: string,
	allowedIds?: string[]
): string[] {
	const rid = String(routerId ?? '').trim();
	if (!rid || !(nodes instanceof Map)) return [];

	const allowed = Array.isArray(allowedIds) ? new Set(allowedIds.map((id) => String(id))) : null;
	const isAllowed = (id: string): boolean => !allowed || allowed.has(id);

	const startNode = nodes.get(rid);
	if (!startNode || isDisabledRouter(startNode) || !isAllowed(rid)) return [];

	const links: any[] = Array.isArray(topo?.links)
		? topo.links: [];
	const adjacency = new Map<string, Set<string>>();

	for (const l of links) {
		const sId = String(l?.source?.id ?? l?.source?.id ?? l?.source?.id ?? '');
		const tId = String(l?.target?.id ?? l?.target?.id ?? l?.target?.id ?? '');
		if (!sId || !tId) continue;
		if (!isAllowed(sId) || !isAllowed(tId)) continue;

		const sNode = nodes.get(sId);
		const tNode = nodes.get(tId);
		if (!sNode || !tNode) continue;
		if (isDisabledRouter(sNode) || isDisabledRouter(tNode)) continue;

		if (!adjacency.has(sId)) adjacency.set(sId, new Set());
		if (!adjacency.has(tId)) adjacency.set(tId, new Set());
		adjacency.get(sId)?.add(tId);
		adjacency.get(tId)?.add(sId);
	}

	const visited = new Set<string>();
	const queue: string[] = [rid];
	visited.add(rid);

	while (queue.length > 0) {
		const cur = queue.shift() as string;
		const neighbors = adjacency.get(cur);
		if (!neighbors) continue;
		for (const nb of neighbors) {
			if (visited.has(nb)) continue;
			visited.add(nb);
			queue.push(nb);
		}
	}

	visited.delete(rid);
	return Array.from(visited.values());
}

/**
 * Ermittelt einen gueltigen Historienindex oder liefert eine aussagekraeftige Fehlermeldung.
 */
function readHistoryIndex(
	ctrl: any,
	indexMaybe?: unknown
): { ok: true; index: number } | { ok: false; error: string } {
	const hist = readHistory(ctrl);
	const max = Math.max(0, hist.length - 1);

	if (indexMaybe === undefined || indexMaybe === null) {
		const cur = safeInt(ctrl?.currentStepIndex ?? 0, 0);
		return { ok: true, index: clamp(cur, 0, max) };
	}

	const idx = safeInt(indexMaybe, 0);
	if (idx < 0 || idx >= hist.length) {
		return {
			ok: false,
			error: `history index out of range: ${idx} (valid: 0..${Math.max(0, hist.length - 1)})`
		};
	}
	return { ok: true, index: idx };
}

/**
 * Extrahiert die Topologie aus einem Historien-Snapshot.
 */
function topoFromState(state: any): any {
	return state?.topologyState ?? null;
}

/**
 * Vereinheitlicht den Zugriff auf Router und Links unabhaengig vom Topologie-Typ.
 */
function accessFromTopology(topo: any): { nodes: Map<string, any>; links: any[] } {
	if (!topo) return { nodes: new Map(), links: [] };

	// Unterstuetzt sowohl Topology als auch die Getter-Form des Controllers.
	const nodes = readNodes(topo);
	const links = readLinks(topo);

	return { nodes, links };
}

/**
 * Erstellt einen Topologie-Snapshot fuer einen bestimmten Historienindex.
 */
function snapshotTopologyAt(ctrl: any, index?: number): unknown {
	const hist = readHistory(ctrl);
	const idxRes = readHistoryIndex(ctrl, index);
	if (!idxRes.ok) return { error: idxRes.error };
	const idx = idxRes.index;
	const state = hist[idx];
	const topo = topoFromState(state) ?? ctrl?.topology;

	const { nodes, links } = accessFromTopology(topo);

	return {
		historyIndex: idx,
		stepNumber: safeInt(state?.stepNumber ?? idx, idx),
		nodes: Array.from(nodes.values()).map((n: any) => ({
			id: readId(n?.id),
			name: readId(n?.name),
			xPos: safeNum(n?.xPos ?? 0, 0),
			yPos: safeNum(n?.yPos ?? 0, 0),
			kind: 'router',
			neighbors: Array.isArray(n?.neighbors) ? n.neighbors.map((l: any) => readId(l?.id)) : []
		})),
		links: (links ?? []).map((l: any) => ({
			id: readId(l?.id),
			sourceId: readId(l?.source?.id),
			targetId: readId(l?.target?.id),
			weight: safeNum(l?.weight ?? 1, 1)
		}))
	};
}

/**
 * Erstellt einen Router-Snapshot fuer einen bestimmten Historienindex.
 */
function snapshotNodesAt(ctrl: any, index?: number): unknown {
	const hist = readHistory(ctrl);
	const idxRes = readHistoryIndex(ctrl, index);
	if (!idxRes.ok) return { error: idxRes.error };
	const idx = idxRes.index;
	const state = hist[idx];
	const topo = topoFromState(state) ?? ctrl?.topology;

	const { nodes } = accessFromTopology(topo);

	return {
		historyIndex: idx,
		stepNumber: safeInt(state?.stepNumber ?? idx, idx),
		nodes: Array.from(nodes.values()).map((n: any) => {
			const rt = n?.routingTable;
			const entries = rt?.entries instanceof Map ? Array.from(rt.entries.values()) : [];

			return {
				id: readId(n?.id),
				name: readId(n?.name),
				xPos: safeNum(n?.xPos ?? 0, 0),
				yPos: safeNum(n?.yPos ?? 0, 0),
				kind: 'router',
				optimal: !!n?.optimal,
				routingTableSize: entries.length
			};
		})
	};
}

/**
 * Erstellt einen Link-Snapshot fuer einen bestimmten Historienindex.
 */
function snapshotLinksAt(ctrl: any, index?: number): unknown {
	const hist = readHistory(ctrl);
	const idxRes = readHistoryIndex(ctrl, index);
	if (!idxRes.ok) return { error: idxRes.error };
	const idx = idxRes.index;
	const state = hist[idx];
	const topo = topoFromState(state) ?? ctrl?.topology;

	const { links } = accessFromTopology(topo);

	return {
		historyIndex: idx,
		stepNumber: safeInt(state?.stepNumber ?? idx, idx),
		links: (links ?? []).map((l: any) => ({
			id: readId(l?.id),
			sourceId: readId(l?.source?.id),
			targetId: readId(l?.target?.id),
			weight: safeNum(l?.weight ?? 1, 1)
		}))
	};
}

/**
 * Gibt eine zusammengefasste Sicht auf die Historie mit optionalem Limit zurueck.
 */
function snapshotHistory(ctrl: any, limit?: number): unknown {
	const hist = readHistory(ctrl);
	const cur = safeInt(ctrl?.currentStepIndex ?? 0, 0);
	const n = hist.length;

	const lim = limit === undefined ? 30 : clamp(safeInt(limit, 30), 1, 500);

	const start = Math.max(0, n - lim);
	const slice = hist.slice(start);

	return {
		currentStepIndex: clamp(cur, 0, Math.max(0, n - 1)),
		historyLength: n,
		shown: slice.length,
		range: [start, start + slice.length - 1],
		items: slice.map((s: any, i: number) => {
			const idx = start + i;
			const topo = topoFromState(s);
			const { nodes, links } = accessFromTopology(topo);
			const evs = Array.isArray(s?.executedEvents) ? s.executedEvents : [];
			return {
				index: idx,
				stepNumber: safeInt(s?.stepNumber ?? s?.stepNumber ?? idx, idx),
				executedEvents: evs.length,
				nodes: nodes.size,
				links: (links ?? []).length
			};
		})
	};
}

/**
 * Liest die ausgefuehrten Events fuer einen Historienindex.
 */
function snapshotEventsAt(ctrl: any, index?: number): unknown {
	const hist = readHistory(ctrl);
	const idxRes = readHistoryIndex(ctrl, index);
	if (!idxRes.ok) return { error: idxRes.error };
	const idx = idxRes.index;
	const state: any = hist[idx];
	const evs = Array.isArray(state?.executedEvents) ? state.executedEvents : [];

	return {
		historyIndex: idx,
		stepNumber: safeInt(state?.stepNumber ?? state?.stepNumber ?? idx, idx),
		executedEvents: evs.map((e: any) => ({
			step: safeInt(e?.step ?? idx, idx),
			type: String(e?.type ?? e?.type ?? ''),
			targetId: String(e?.targetId ?? e?.targetId ?? ''),
			payload: typeof e?.payload === 'object' && e?.payload !== null ? e.payload : {}
		}))
	};
}

/**
 * Liest die Routing-Tabelle eines Routers zu einem Historienindex.
 */
function readRoutingTableAt(ctrl: any, routerId: string, index?: number): unknown {
	const rid = String(routerId ?? '').trim();
	if (!rid) return readAllRoutingTables(ctrl);

	const hist = readHistory(ctrl);
	const idxRes = readHistoryIndex(ctrl, index);
	if (!idxRes.ok) return { error: idxRes.error };
	const idx = idxRes.index;
	const state = hist[idx];
	const topo = topoFromState(state) ?? ctrl?.topology;

	const { nodes } = accessFromTopology(topo);
	const node = nodes.get(rid);

	if (!node) return { error: `Router not found at history index ${idx}: ${rid}` };

	const rt = (node as any)?.routingTable;
	const entries = rt?.entries instanceof Map ? Array.from(rt.entries.values()) : [];

	return {
		routerId: rid,
		historyIndex: idx,
		stepNumber: safeInt(state?.stepNumber ?? state?.stepNumber ?? idx, idx),
		entries: entries.map((e: any) => ({
			destinationId: String(e?.destinationId ?? e?.destinationId ?? ''),
			nextHopId: String(e?.nextHopId ?? e?.nextHopId ?? ''),
			cost: safeNum(e?.cost ?? e?.cost ?? Number.NaN, Number.NaN)
		}))
	};
}

/**
 * Liest Routing-Tabellen aller Router ueber die gesamte Historie.
 */
function readAllRoutingTables(ctrl: any): unknown {
	const hist = readHistory(ctrl);
	const items = hist.map((state: any, idx: number) => {
		const topo = topoFromState(state) ?? ctrl?.topology;
		const { nodes } = accessFromTopology(topo);
		const routers = Array.from(nodes.values())
			.map((n: any) => {
				const rt = n?.routingTable;
				const entries = rt?.entries instanceof Map ? Array.from(rt.entries.values()) : [];
				return {
					routerId: String(n?.id ?? n?.id ?? ''),
					entries: entries.map((e: any) => ({
						destinationId: String(e?.destinationId ?? e?.destinationId ?? ''),
						nextHopId: String(e?.nextHopId ?? e?.nextHopId ?? ''),
						cost: safeNum(e?.cost ?? e?.cost ?? Number.NaN, Number.NaN)
					}))
				};
			})
			.sort((a, b) => a.routerId.localeCompare(b.routerId));

		return {
			historyIndex: idx,
			stepNumber: safeInt(state?.stepNumber ?? state?.stepNumber ?? idx, idx),
			routers
		};
	});

	return {
		historyLength: hist.length,
		items
	};
}

/**
 * Baut eine Distance-Vector-Tabellensicht fuer einen Router im Snapshot auf.
 */
function dvTableForSnapshot(
	routerId: string,
	nodes: Map<string, any>
): { ok: true; table: any } | { ok: false; error: string } {
	const rid = String(routerId ?? '').trim();
	if (!rid) return { ok: false, error: 'Missing router id' };
	if (!(nodes instanceof Map)) return { ok: false, error: 'No nodes for snapshot' };

	const node = nodes.get(rid);
	if (!node) return { ok: false, error: `Router ${rid} not present` };

	const dv = node?.dvState ?? node?.dvState;
	const values = dv?.dvs ?? null;
	const oldValues = dv?.oldDvs ?? null;
	if (!values || !oldValues)
		return { ok: false, error: `No distance-vector data for router ${rid}` };

	const rowIds = Object.keys(values);
	const destIds = Array.from(nodes.entries())
		.filter(([, n]) => !isDisabledRouter(n))
		.map(([id]) => String(id))
		.sort((a, b) => compareRouterIds(a, b, nodes));

	return {
		ok: true,
		table: {
			routerId: rid,
			rowIds,
			destIds,
			values,
			oldValues
		}
	};
}

/**
 * Erstellt eine Historienmatrix fuer Distance-Vector-Tabellen.
 */
function readHistoryTable(ctrl: any, routerId?: string, index?: number): unknown {
	const hist = readHistory(ctrl);
	const rid = String(routerId ?? '').trim();

	const idxRes =
		index === undefined || index === null
			? { ok: true as const, index: null }
			: readHistoryIndex(ctrl, index);
	if (!idxRes.ok) return { error: idxRes.error };

	const indices = idxRes.index === null ? hist.map((_, i) => i) : [idxRes.index];

	const items = indices.map((idx) => {
		const state = hist[idx];
		const topo = topoFromState(state) ?? ctrl?.topology;
		const { nodes } = accessFromTopology(topo);
		const stepNumber = safeInt(state?.stepNumber ?? idx, idx);

		const allRouterIds = Array.from(nodes.entries())
			.filter(([, n]) => !isDisabledRouter(n))
			.map(([id]) => String(id))
			.sort((a, b) => compareRouterIds(a, b, nodes));

		const routerIds = rid ? allRouterIds.filter((id) => id === rid) : allRouterIds;

		const routers = routerIds.map((id) => {
			const res = dvTableForSnapshot(id, nodes);
			if (!res.ok) return { routerId: id, error: res.error };
			return res.table;
		});

		return {
			historyIndex: idx,
			stepNumber,
			routers
		};
	});

	return {
		historyLength: hist.length,
		items
	};
}

/**
 * Parst einen Debug-Konsolenbefehl aus Text oder JSON in ein Kommandoobjekt.
 */
function parseCommand(input: string): DebugResponse {
	const raw = String(input ?? '').trim();
	if (!raw) return { ok: false, error: 'Empty input' };

	const looksJson = raw.startsWith('{') || raw.startsWith('[');
	if (looksJson) {
		try {
			const v = JSON.parse(raw);
			if (!isObject(v))
				return { ok: false, error: 'JSON must be an object like { "cmd": "help" }' };
			const cmd = String((v as any).cmd ?? '').trim();
			if (!cmd) return { ok: false, error: 'Missing "cmd" string field' };
			return { ok: true, result: v };
		} catch {
			// Falls JSON-Parsing scheitert, mit Token-Parsing weitermachen.
		}
	}

	const tokens = tokenizeLine(raw);
	if (tokens.length === 0) return { ok: false, error: 'Empty input' };

	const head = tokens[0].toLowerCase();
	const args = tokens.slice(1);

	// Hilfsfunktionen
	const need = (n: number, usage: string) => {
		if (args.length < n) return { ok: false, error: `Usage: ${usage}` } as DebugResponse;
		return null;
	};

	if (head === 'help' || head === 'h' || head === '?')
		return { ok: true, result: { cmd: 'help' } satisfies DebugCmd };
	if (head === 'ping') return { ok: true, result: { cmd: 'ping' } satisfies DebugCmd };

	if (head === 'state' || head === 'status')
		return { ok: true, result: { cmd: 'state' } satisfies DebugCmd };
	if (head === 'ui') return { ok: true, result: { cmd: 'ui' } satisfies DebugCmd };

	if (head === 'history' || head === 'hist') {
		const limit = args[0] === undefined ? undefined : safeInt(args[0], 30);
		return { ok: true, result: { cmd: 'history', limit } satisfies DebugCmd };
	}

	if (head === 'events' || head === 'ev') {
		const index = args[0] === undefined ? undefined : safeInt(args[0], 0);
		return { ok: true, result: { cmd: 'events', index } satisfies DebugCmd };
	}

	if (head === 'topology' || head === 'topo') {
		const index = args[0] === undefined ? undefined : safeInt(args[0], 0);
		return { ok: true, result: { cmd: 'topology', index } satisfies DebugCmd };
	}

	if (head === 'nodes') {
		const index = args[0] === undefined ? undefined : safeInt(args[0], 0);
		return { ok: true, result: { cmd: 'nodes', index } satisfies DebugCmd };
	}

	if (head === 'links') {
		const index = args[0] === undefined ? undefined : safeInt(args[0], 0);
		return { ok: true, result: { cmd: 'links', index } satisfies DebugCmd };
	}

	if (head === 'rt' || head === 'routingtable' || head === 'table') {
		const routerId = String(args[0] ?? '').trim();
		const index = args[1] === undefined ? undefined : safeInt(args[1], 0);

		return { ok: true, result: { cmd: 'routingTable', routerId, index } satisfies DebugCmd };
	}

	if (head === 'historytable' || head === 'rthistory' || head === 'rthist') {
		const routerId = args[0] === undefined ? undefined : String(args[0]).trim();
		const index = args[1] === undefined ? undefined : safeInt(args[1], 0);
		return { ok: true, result: { cmd: 'historyTable', routerId, index } satisfies DebugCmd };
	}

	if (head === 'jump' || head === 'goto' || head === 'step') {
		const miss = need(1, 'jump <stepNumber>');
		if (miss) return miss;
		const step = safeInt(args[0], Number.NaN as any);
		if (!Number.isFinite(step)) return { ok: false, error: 'stepNumber must be a number' };
		return { ok: true, result: { cmd: 'jumpToStep', step } satisfies DebugCmd };
	}

	if (head === 'jumpi' || head === 'jumpindex' || head === 'gotoindex') {
		const miss = need(1, 'jumpIndex <historyIndex>');
		if (miss) return miss;
		const index = safeInt(args[0], Number.NaN as any);
		if (!Number.isFinite(index)) return { ok: false, error: 'historyIndex must be a number' };
		return { ok: true, result: { cmd: 'jumpToHistoryIndex', index } satisfies DebugCmd };
	}

	if (head === 'next' || head === 'n')
		return { ok: true, result: { cmd: 'nextStep' } satisfies DebugCmd };
	if (head === 'prev' || head === 'back' || head === 'p')
		return { ok: true, result: { cmd: 'prevStep' } satisfies DebugCmd };

	if (head === 'play') return { ok: true, result: { cmd: 'play' } satisfies DebugCmd };
	if (head === 'pause') return { ok: true, result: { cmd: 'pause' } satisfies DebugCmd };
	if (head === 'stop') return { ok: true, result: { cmd: 'stop' } satisfies DebugCmd };
	if (head === 'reset') return { ok: true, result: { cmd: 'reset' } satisfies DebugCmd };

	if (head === 'algo' || head === 'algorithm' || head === 'setalgo' || head === 'setalgorithm') {
		const miss = need(
			1,
			'algo <LINK_STATE|DISTANCE_VECTOR|DISTANCE_VECTOR_POISONED|link|distance|distancePoisoned>'
		);
		if (miss) return miss;
		return { ok: true, result: { cmd: 'setAlgorithm', algo: String(args[0]) } satisfies DebugCmd };
	}

	if (head === 'mode') {
		const miss = need(1, 'mode <none|router|link|sendpacket|delete>');
		if (miss) return miss;
		return { ok: true, result: { cmd: 'setMode', mode: String(args[0] ?? '') } satisfies DebugCmd };
	}

	if (head === 'clearmode') return { ok: true, result: { cmd: 'clearMode' } satisfies DebugCmd };

	if (head === 'select') {
		const v = args[0] === undefined ? '' : String(args[0]);
		const routerId = v.trim().length === 0 || v === 'null' ? null : v.trim();
		return { ok: true, result: { cmd: 'selectRouter', routerId } satisfies DebugCmd };
	}

	if (head === 'rename') {
		const miss = need(2, 'rename <routerId> "<new name>"');
		if (miss) return miss;
		const routerId = String(args[0] ?? '').trim();
		const name = String(args.slice(1).join(' ') ?? '').trim();
		if (!routerId || !name) return { ok: false, error: 'Usage: rename <routerId> "<new name>"' };
		return { ok: true, result: { cmd: 'renameRouter', routerId, name } satisfies DebugCmd };
	}

	if (head === 'addnode') {
		const miss = need(2, 'addNode <x> <y>');
		if (miss) return miss;
		const x = safeNum(args[0], Number.NaN as any);
		const y = safeNum(args[1], Number.NaN as any);
		if (!Number.isFinite(x) || !Number.isFinite(y))
			return { ok: false, error: 'x and y must be numbers' };
		return { ok: true, result: { cmd: 'addNode', x, y } satisfies DebugCmd };
	}

	if (head === 'addlink') {
		const miss = need(2, 'addLink <sourceId> <targetId> [weight]');
		if (miss) return miss;
		const sourceId = String(args[0] ?? '').trim();
		const targetId = String(args[1] ?? '').trim();
		const weight = args[2] === undefined ? undefined : safeInt(args[2], 1);
		return { ok: true, result: { cmd: 'addLink', sourceId, targetId, weight } satisfies DebugCmd };
	}

	if (head === 'delnode' || head === 'deletenode') {
		const miss = need(1, 'deleteNode <nodeId>');
		if (miss) return miss;
		const nodeId = String(args[0] ?? '').trim();
		return { ok: true, result: { cmd: 'deleteNode', nodeId } satisfies DebugCmd };
	}

	if (head === 'dellink' || head === 'deletelink') {
		const miss = need(2, 'deleteLink <sourceId> <targetId>');
		if (miss) return miss;
		const sourceId = String(args[0] ?? '').trim();
		const targetId = String(args[1] ?? '').trim();
		return { ok: true, result: { cmd: 'deleteLink', sourceId, targetId } satisfies DebugCmd };
	}

	if (head === 'weight' || head === 'setw' || head === 'setweight') {
		const miss = need(3, 'weight <sourceId> <targetId> <weight>');
		if (miss) return miss;
		const sourceId = String(args[0] ?? '').trim();
		const targetId = String(args[1] ?? '').trim();
		const weight = safeInt(args[2], Number.NaN as any);
		if (!Number.isFinite(weight) || weight <= 0)
			return { ok: false, error: 'weight must be a positive integer' };
		return {
			ok: true,
			result: { cmd: 'changeLinkWeight', sourceId, targetId, weight } satisfies DebugCmd
		};
	}

	if (head === 'move') {
		const miss = need(3, 'move <nodeId> <x> <y>');
		if (miss) return miss;
		const nodeId = String(args[0] ?? '').trim();
		const x = safeNum(args[1], Number.NaN as any);
		const y = safeNum(args[2], Number.NaN as any);
		if (!nodeId || !Number.isFinite(x) || !Number.isFinite(y))
			return { ok: false, error: 'Usage: move <nodeId> <x> <y>' };
		return { ok: true, result: { cmd: 'moveNode', nodeId, x, y } satisfies DebugCmd };
	}

	if (head === 'preview') {
		const miss = need(2, 'preview <sourceId> <targetId>');
		if (miss) return miss;
		const sourceId = String(args[0] ?? '').trim();
		const targetId = String(args[1] ?? '').trim();
		return { ok: true, result: { cmd: 'previewPacket', sourceId, targetId } satisfies DebugCmd };
	}

	if (head === 'clearpreview')
		return { ok: true, result: { cmd: 'clearPacketPreview' } satisfies DebugCmd };

	if (head === 'export') return { ok: true, result: { cmd: 'exportJson' } satisfies DebugCmd };

	if (head === 'error' || head === 'toast' || head === 'errortoast') {
		const firstSpace = raw.indexOf(' ');
		const message = firstSpace === -1 ? '' : raw.slice(firstSpace + 1).trim();
		if (!message) return { ok: false, error: 'Usage: error <message>' };
		return { ok: true, result: { cmd: 'errorToast', message } satisfies DebugCmd };
	}

	if (head === 'surfer') {
		return { ok: true, result: { cmd: 'surfer', open: true } satisfies DebugCmd };
	}

	if (head === 'import') {
		// Erlaubt: import { ...json... }
		const firstSpace = raw.indexOf(' ');
		const json = firstSpace === -1 ? '' : raw.slice(firstSpace + 1).trim();
		if (!json) return { ok: false, error: 'Usage: import <jsonString>' };
		return { ok: true, result: { cmd: 'importJson', json } satisfies DebugCmd };
	}

	// Instanz-Identitaetscheck
	if (head === 'instance' || head === 'instancecheck' || head === 'checkinstance') {
		// Syntax: instance [sourceId] [targetId] [weight]
		const sourceId = args[0] === undefined ? 'R1' : String(args[0]).trim();
		const targetId = args[1] === undefined ? 'R2' : String(args[1]).trim();
		const weight = args[2] === undefined ? 3 : safeInt(args[2], 3);

		if (!sourceId || !targetId || sourceId === targetId) {
			return { ok: false, error: 'Usage: instance [sourceId] [targetId] [weight]' };
		}
		if (!Number.isFinite(weight) || weight <= 0) {
			return { ok: false, error: 'weight must be a positive integer' };
		}

		return {
			ok: true,
			result: { cmd: 'instanceCheck', sourceId, targetId, weight } satisfies DebugCmd
		};
	}

	return {
		ok: false,
		error: `Unknown command: ${tokens[0]}\n` + `Try: help`
	};
}

/**
 * Erzeugt den formatierten Hilfetext fuer die Debug-Konsole.
 */
export function debugHelpPayload(): string {
	const lines: string[] = [];

	const section = (title: string) => {
		lines.push(title);
	};

	const cmd = (syntax: string, desc: string) => {
		lines.push(`  ${syntax}`);
		lines.push(`    ${desc}`);
	};

	const spacer = () => lines.push('');

	lines.push('Debug Console — help');
	lines.push('───────────────────');
	spacer();

	section('Basics');
	cmd('help', 'Show this help');
	cmd('ping', 'Health check');
	cmd('error <message>', 'Show an error toast in the UI');
	spacer();

	section('Status');
	cmd('state', 'Controller + UI status');
	cmd('ui', 'Dump uiState');
	cmd(
		'instance [sourceId] [targetId] [weight]',
		'Check controller instance identity after action + after reset, reports instanceId (defaults: R1 R2 3)'
	);
	spacer();

	section('History');
	cmd('history [limit]', 'List history (default: 30)');
	cmd('events [historyIndex]', 'Show executedEvents (default: current)');
	spacer();

	section('Topology');
	cmd('topology [historyIndex]', 'Snapshot nodes + links (default: current)');
	cmd('nodes [historyIndex]', 'List nodes (default: current)');
	cmd('links [historyIndex]', 'List links (default: current)');
	cmd('routingtable [routerId] [historyIndex]', 'Routing table (no args: all routers, all steps)');
	cmd(
		'historytable [routerId] [historyIndex]',
		'Routing table history matrix (no args: all routers, all steps)'
	);
	spacer();

	section('Stepping');
	cmd('next', 'Step forward (+1)');
	cmd('prev', 'Step back (-1, via jumpIndex)');
	cmd('jump <stepNumber>', 'Advance until stepNumber');
	cmd('jumpi <historyIndex>', 'Set currentStepIndex (debug-only)');
	spacer();

	section('Algorithm');
	cmd('algo <name>', 'Set algorithm (values below)');
	spacer();

	section('Playback');
	cmd('play', 'Playback control');
	cmd('pause', 'Playback control');
	cmd('stop', 'Playback control');
	cmd('reset', 'Playback control');
	spacer();

	section('UI');
	cmd('mode <none|router|link|sendpacket|delete>', 'Set placement mode');
	cmd('clearMode', 'Clear placement mode');
	cmd('select <routerId|null>', 'Select router (or clear)');
	cmd('rename <routerId> "<new name>"', 'Rename router');
	spacer();

	section('Edit topology');
	cmd('addNode <x> <y>', 'Add router');
	cmd('addLink <sourceId> <targetId> [weight]', 'Add link');
	cmd('deleteNode <nodeId>', 'Delete node');
	cmd('deleteLink <sourceId> <targetId>', 'Delete link');
	cmd('weight <sourceId> <targetId> <weight>', 'Set link weight');
	cmd('move <nodeId> <x> <y>', 'Move node');
	spacer();

	section('Preview');
	cmd('preview <sourceId> <targetId>', 'Shortest path preview + highlight');
	cmd('clearPreview', 'Clear preview + highlights');
	spacer();

	section('Import / Export');
	cmd('export', 'Export JSON');
	cmd('import <jsonString>', 'Import JSON');
	spacer();

	section('JSON mode');
	lines.push('  { "cmd": "...", ... }');
	lines.push('  Examples:');
	lines.push('    { "cmd": "routingTable", "routerId": "R1", "index": 0 }');
	lines.push('    { "cmd": "changeLinkWeight", "sourceId": "R1", "targetId": "R2", "weight": 3 }');
	lines.push('    { "cmd": "instanceCheck", "sourceId": "R1", "targetId": "R2", "weight": 3 }');
	lines.push('    { "cmd": "importJson", "json": "{...}" }');
	lines.push('    { "cmd": "surfer" }');
	spacer();

	section('Algorithm values');
	lines.push(`  ${RoutingAlgorithmType.LINK_STATE}`);
	lines.push(`  ${RoutingAlgorithmType.DISTANCE_VECTOR}`);
	lines.push(`  ${RoutingAlgorithmType.DISTANCE_VECTOR_POISONED}`);

	return lines.join('\n');
}

/**
 * Fuehrt ein geparstes Debug-Kommando aus und liefert ein standardisiertes Ergebnis.
 */
export function debugRunCommand(input: string): DebugResponse {
	const parsed = parseCommand(input);
	if (!parsed.ok) return parsed;

	const cmdObj = parsed.result as any;
	const cmd = String(cmdObj.cmd ?? '').trim();

	const ctrl = getCtrlAny();
	const st = getUiStateAny();

	// Lese-Kommandos
	if (cmd === 'help') return { ok: true, result: debugHelpPayload() };
	if (cmd === 'ping') return { ok: true, result: { pong: true } };

	if (cmd === 'state') {
		const hist = readHistory(ctrl);
		return {
			ok: true,
			result: {
				currentStepIndex: safeInt(ctrl?.currentStepIndex ?? 0, 0),
				historyLength: hist.length,
				running: !!ctrl?.running,
				playing: !!ctrl?.playing,
				algorithm: String(
					ctrl?.algorithm ?? ctrl?.algorithmType ?? RoutingAlgorithmType.LINK_STATE
				),
				ui: {
					placementMode: String(st?.placementMode ?? 'none'),
					selectedRouterId: st?.selectedRouterId ?? null,
					highlightedLinkIds: Array.isArray(st?.highlightedLinkIds)
						? st.highlightedLinkIds.length
						: 0,
					packetPreview: st?.packetPreview ?? null
				}
			}
		};
	}

	if (cmd === 'ui') return { ok: true, result: st };

	if (cmd === 'history') {
		const limit = cmdObj.limit === undefined ? undefined : safeInt(cmdObj.limit, 30);
		return { ok: true, result: snapshotHistory(ctrl, limit) };
	}

	if (cmd === 'events') return { ok: true, result: snapshotEventsAt(ctrl, cmdObj.index) };
	if (cmd === 'topology') return { ok: true, result: snapshotTopologyAt(ctrl, cmdObj.index) };
	if (cmd === 'nodes') return { ok: true, result: snapshotNodesAt(ctrl, cmdObj.index) };
	if (cmd === 'links') return { ok: true, result: snapshotLinksAt(ctrl, cmdObj.index) };

	if (cmd === 'routingTable') {
		return {
			ok: true,
			result: readRoutingTableAt(ctrl, String(cmdObj.routerId ?? ''), cmdObj.index)
		};
	}
	if (cmd === 'historyTable') {
		return { ok: true, result: readHistoryTable(ctrl, cmdObj.routerId, cmdObj.index) };
	}

	try {
		if (cmd === 'instanceCheck') {
			const sourceId = String(cmdObj.sourceId ?? 'R1').trim();
			const targetId = String(cmdObj.targetId ?? 'R2').trim();
			const weight = safeInt(cmdObj.weight ?? 3, 3);

			if (!sourceId || !targetId || sourceId === targetId) {
				return { ok: false, error: 'Usage: instance [sourceId] [targetId] [weight]' };
			}
			if (!Number.isFinite(weight) || weight <= 0) {
				return { ok: false, error: 'weight must be a positive integer' };
			}

			const snapshot = ui.exportJson();

			const c1 = get(simulation);
			(ui as any).changeLinkWeight(sourceId, targetId, weight);
			const c2 = get(simulation);

			ui.reset();
			const c3 = get(simulation);
			ui.importJson(snapshot);

			return {
				ok: true,
				result: {
					used: { sourceId, targetId, weight },
					instanceIds: {
						beforeAction: (c1 as any)?.instanceId ?? null,
						afterAction: (c2 as any)?.instanceId ?? null,
						afterReset: (c3 as any)?.instanceId ?? null
					},
					sameInstanceAfterAction: c1 === c2,
					sameInstanceAfterReset: c2 === c3,
					restored: true
				}
			};
		}

		if (cmd === 'errorToast') {
			const message = String((cmdObj as any)?.message ?? '').trim();
			if (!message) return { ok: false, error: 'message is required' };
			(ui as any).showErrorToast(message);
			return { ok: true, result: { errorToast: message } };
		}

		if (cmd === 'setAlgorithm') {
			const algo = normalizeAlgo(cmdObj.algo);
			if (!algo) {
				return {
					ok: false,
					error: `algo must be one of: ${RoutingAlgorithmType.LINK_STATE}, ${RoutingAlgorithmType.DISTANCE_VECTOR}, ${RoutingAlgorithmType.DISTANCE_VECTOR_POISONED}`
				};
			}
			ui.setAlgorithm(algo);
			return { ok: true, result: { algorithm: algo } };
		}

		if (cmd === 'jumpToStep') {
			const step = safeInt(cmdObj.step, Number.NaN as any);
			if (!Number.isFinite(step) || step < 0)
				return { ok: false, error: 'step must be a non-negative number' };
			ui.jumpToStep(step);
			const after = getCtrlAny();
			return {
				ok: true,
				result: { jumpedToStep: step, currentStepIndex: safeInt(after?.currentStepIndex ?? 0, 0) }
			};
		}

		if (cmd === 'jumpToHistoryIndex') {
			const index = safeInt(cmdObj.index, Number.NaN as any);
			if (!Number.isFinite(index) || index < 0)
				return { ok: false, error: 'index must be a non-negative number' };

			// Nur fuer Debug: currentStepIndex direkt auf den Snapshot-Index setzen.
			// Umgeht Schrittzahlen und funktioniert auch bei mehrfach identischer stepNumber.
			(ui as any).simulation.update((controller: any) => {
				const hist = Array.isArray(controller?.history) ? controller.history : [];
				const max = Math.max(0, hist.length - 1);
				const idx = clamp(index, 0, max);
				controller.currentStepIndex = idx;
				return controller;
			});

			const after = getCtrlAny();
			return {
				ok: true,
				result: {
					jumpedToHistoryIndex: index,
					currentStepIndex: safeInt(after?.currentStepIndex ?? 0, 0)
				}
			};
		}

		if (cmd === 'nextStep') {
			ui.nextStep();
			const after = getCtrlAny();
			return { ok: true, result: { currentStepIndex: safeInt(after?.currentStepIndex ?? 0, 0) } };
		}

		if (cmd === 'prevStep') {
			const after0 = getCtrlAny();
			const cur = safeInt(after0?.currentStepIndex ?? 0, 0);
			const prev = Math.max(0, cur - 1);
			// Index-Sprung verwenden, damit der exakte Historieneintrag erhalten bleibt.
			(ui as any).simulation.update((controller: any) => {
				const hist = Array.isArray(controller?.history) ? controller.history : [];
				const max = Math.max(0, hist.length - 1);
				const idx = clamp(prev, 0, max);
				controller.currentStepIndex = idx;
				return controller;
			});
			const after = getCtrlAny();
			return { ok: true, result: { currentStepIndex: safeInt(after?.currentStepIndex ?? 0, 0) } };
		}

		if (cmd === 'play') {
			ui.play();
			return { ok: true, result: { playing: true } };
		}

		if (cmd === 'pause') {
			ui.pause();
			return { ok: true, result: { playing: false } };
		}

		if (cmd === 'stop') {
			ui.stop();
			const after = getCtrlAny();
			return {
				ok: true,
				result: { stopped: true, currentStepIndex: safeInt(after?.currentStepIndex ?? 0, 0) }
			};
		}

		if (cmd === 'reset') {
			ui.reset();
			const after = getCtrlAny();
			return {
				ok: true,
				result: { reset: true, currentStepIndex: safeInt(after?.currentStepIndex ?? 0, 0) }
			};
		}

		if (cmd === 'setMode') {
			const mode = String(cmdObj.mode ?? '').trim();
			if (!mode) return { ok: false, error: 'mode is required' };

			// Modus exakt setzen, nicht toggeln.
			(ui as any).uiState.update((s: any) => ({
				...s,
				placementMode: mode,
				linkDraftSourceId: mode === 'link' ? s.linkDraftSourceId : null
			}));

			return { ok: true, result: { placementMode: mode } };
		}

		if (cmd === 'clearMode') {
			ui.clearPlacementMode();
			return { ok: true, result: { placementMode: 'none' } };
		}

		if (cmd === 'selectRouter') {
			const rid = cmdObj.routerId === null ? null : String(cmdObj.routerId ?? '').trim();
			ui.setSelectedRouter(rid && rid.length > 0 ? rid : null);
			return { ok: true, result: { selectedRouterId: rid && rid.length > 0 ? rid : null } };
		}

		if (cmd === 'renameRouter') {
			const rid = String(cmdObj.routerId ?? '').trim();
			const name = String(cmdObj.name ?? '').trim();
			if (!rid || !name) return { ok: false, error: 'Usage: renameRouter { routerId, name }' };
			(ui as any).renameRouter(rid, name);
			return { ok: true, result: { renamed: { routerId: rid, name } } };
		}

		if (cmd === 'addNode') {
			const x = safeNum(cmdObj.x, Number.NaN as any);
			const y = safeNum(cmdObj.y, Number.NaN as any);
			if (!Number.isFinite(x) || !Number.isFinite(y))
				return { ok: false, error: 'x and y must be numbers' };
			ui.addNode(x, y);
			const after = getCtrlAny();
			return {
				ok: true,
				result: { addedNodeAt: { x, y }, historyLength: readHistory(after).length }
			};
		}

		if (cmd === 'addLink') {
			const s = String(cmdObj.sourceId ?? '').trim();
			const t = String(cmdObj.targetId ?? '').trim();
			const wRaw = cmdObj.weight === undefined ? 1 : safeInt(cmdObj.weight, 1);
			const w = Number.isFinite(wRaw) && wRaw > 0 ? wRaw : 1;
			if (!s || !t || s === t)
				return { ok: false, error: 'sourceId/targetId required and must differ' };
			ui.addLink(s, t, w);
			const after = getCtrlAny();
			return {
				ok: true,
				result: {
					addedLink: { sourceId: s, targetId: t, weight: w },
					historyLength: readHistory(after).length
				}
			};
		}

		if (cmd === 'deleteNode') {
			const id = String(cmdObj.nodeId ?? '').trim();
			if (!id) return { ok: false, error: 'nodeId is required' };
			ui.deleteNode(id);
			const after = getCtrlAny();
			return { ok: true, result: { deletedNode: id, historyLength: readHistory(after).length } };
		}

		if (cmd === 'deleteLink') {
			const s = String(cmdObj.sourceId ?? '').trim();
			const t = String(cmdObj.targetId ?? '').trim();
			if (!s || !t) return { ok: false, error: 'sourceId and targetId are required' };
			ui.deleteLink(s, t);
			const after = getCtrlAny();
			return {
				ok: true,
				result: {
					deletedLink: { sourceId: s, targetId: t },
					historyLength: readHistory(after).length
				}
			};
		}

		if (cmd === 'changeLinkWeight') {
			const s = String(cmdObj.sourceId ?? '').trim();
			const t = String(cmdObj.targetId ?? '').trim();
			const w = safeInt(cmdObj.weight, Number.NaN as any);
			if (!s || !t) return { ok: false, error: 'sourceId and targetId are required' };
			if (!Number.isFinite(w) || w <= 0)
				return { ok: false, error: 'weight must be a positive integer' };
			(ui as any).changeLinkWeight(s, t, w);
			const after = getCtrlAny();
			return {
				ok: true,
				result: {
					changedWeight: { sourceId: s, targetId: t, weight: w },
					historyLength: readHistory(after).length
				}
			};
		}

		if (cmd === 'moveNode') {
			const id = String(cmdObj.nodeId ?? '').trim();
			const x = safeNum(cmdObj.x, Number.NaN as any);
			const y = safeNum(cmdObj.y, Number.NaN as any);
			if (!id || !Number.isFinite(x) || !Number.isFinite(y))
				return { ok: false, error: 'Usage: moveNode { nodeId, x, y }' };
			ui.updateNodePosition(id, x, y);
			const after = getCtrlAny();
			return {
				ok: true,
				result: { movedNode: { nodeId: id, x, y }, historyLength: readHistory(after).length }
			};
		}

		if (cmd === 'previewPacket') {
			const s = String(cmdObj.sourceId ?? '').trim();
			const t = String(cmdObj.targetId ?? '').trim();
			if (!s || !t || s === t)
				return { ok: false, error: 'sourceId and targetId required and must differ' };
			(ui as any).previewPacket(s, t);
			const afterUi = getUiStateAny();
			return {
				ok: true,
				result: {
					packetPreview: afterUi?.packetPreview ?? null,
					highlightedLinkIds: afterUi?.highlightedLinkIds ?? []
				}
			};
		}

		if (cmd === 'clearPacketPreview') {
			ui.clearPacketPreview();
			const afterUi = getUiStateAny();
			return {
				ok: true,
				result: {
					packetPreview: afterUi?.packetPreview ?? null,
					highlightedLinkIds: afterUi?.highlightedLinkIds ?? []
				}
			};
		}

		if (cmd === 'exportJson') {
			const json = ui.exportJson();
			return { ok: true, result: json };
		}

		if (cmd === 'importJson') {
			const json = String(cmdObj.json ?? '');
			if (!json.trim()) return { ok: false, error: 'json string is required' };
			ui.importJson(json);
			const after = getCtrlAny();
			return {
				ok: true,
				result: {
					imported: true,
					currentStepIndex: safeInt(after?.currentStepIndex ?? 0, 0),
					historyLength: readHistory(after).length
				}
			};
		}

		if (cmd === 'surfer') {
			const open = cmdObj.open === undefined ? true : !!cmdObj.open;
			(ui as any).setShowSurfer(open);
			return { ok: true, result: { surfer: open ? 'open' : 'closed' } };
		}
	} catch (e) {
		return { ok: false, error: (e as Error)?.message ?? String(e) };
	}

	return { ok: false, error: `Unknown cmd: ${cmd}` };
}

/**
 * Formatiert Eingabe und Antwort als Logeintrag mit Zeitstempel.
 */
export function debugFormatLogEntry(input: string, res: DebugResponse): string {
	const t = new Date().toISOString();

	if (!res.ok) {
		return `[${t}] ${String(input ?? '')}\nerror:\n${res.error}\n`;
	}

	if (typeof res.result === 'string') {
		return `[${t}] ${input}\n${res.result}\n`;
	}

	const pretty = JSON.stringify(res.result, null, 2);
	return `[${t}] ${String(input ?? '')}\nresult:\n${pretty}\n`;
}
