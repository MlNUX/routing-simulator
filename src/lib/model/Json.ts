import { RoutingAlgorithmType } from './RoutingAlgorithmType';
import { EventType } from './EventType';
import { SimulationState } from './SimulationState';
import { Router } from './Router';
import { RoutingTable } from './RoutingTable';
import { Topology } from './Topology';
import { SimulationEvent } from './SimulationEvent';
import { Link } from './Link';

type ExportRoutingEntry = {
	destinationId: string;
	nextHopId: string;
	cost: number | string;
};

type ExportNode = {
	id: string;
	type: 'ROUTER';
	name?: string;
	xPos?: number;
	yPos?: number;
	disabled?: boolean;
	routingTable?: {
		entries: ExportRoutingEntry[];
	};
};

type ExportLink = {
	id: string;
	sourceId: string;
	targetId: string;
	weight: number;
};

type ExportEvent = {
	step: number;
	type: EventType;
	targetId: string;
	payload: Record<string, unknown>;
};

type ExportTopology = {
	nodes: ExportNode[];
	links: ExportLink[];
};

type ExportState = {
	step: number;
	stepType?: string;
	topology: ExportTopology;
	events: ExportEvent[];
};

type ExportFormat = {
	algorithm: RoutingAlgorithmType;
	history: ExportState[];
};

export type ImportResult = {
	algorithm: RoutingAlgorithmType;
	states: {
		step: number;
		stepType?: string;
		topology: Topology;
		events: SimulationEvent[];
	}[];
};

function topologyToNodesLinks(topology: Topology): { nodes: ExportNode[]; links: ExportLink[] } {
	const topologyNodeIds = Array.from(topology.nodes.values())
		.map((node) => String(node?.id ?? '').trim())
		.filter((id) => id.length > 0)
		.sort((a, b) => a.localeCompare(b));

	const nodes: ExportNode[] = [];
	for (const node of topology.nodes.values()) {
		const entries = (node as any)?.routingTable?.entries;
		const entryMap = entries instanceof Map ? entries : new Map();
		const nodeId = String(node?.id ?? '').trim();
		const routingTableEntries: ExportRoutingEntry[] = topologyNodeIds.map((destinationId) => {
			const entry = entryMap.get(destinationId);
			const nextHopRaw = entry
				? String((entry as any)?.nextHopId ?? '-').trim()
				: destinationId === nodeId
					? nodeId
					: '-';
			const nextHopId = nextHopRaw.length > 0 ? nextHopRaw : '-';
			const costRaw = entry
				? Number((entry as any)?.cost ?? Number.POSITIVE_INFINITY)
				: destinationId === nodeId
					? 0
					: Number.POSITIVE_INFINITY;
			const cost = Number.isFinite(costRaw) ? costRaw : 'Infinity';
			return { destinationId, nextHopId, cost };
		});

		nodes.push({
			id: node.id,
			type: 'ROUTER',
			name: node.name,
			xPos: node.xPos,
			yPos: node.yPos,
			disabled: (node as any)?.disabled ?? false,
			routingTable: { entries: routingTableEntries }
		});
	}

	const links: ExportLink[] = [];
	for (const link of topology.links) {
		links.push({
			id: link.id,
			sourceId: link.source.id,
			targetId: link.target.id,
			weight: link.weight
		});
	}

	return { nodes, links };
}

function isRoutingAlgorithmType(x: unknown): x is RoutingAlgorithmType {
	return typeof x === 'string' && (Object.values(RoutingAlgorithmType) as string[]).includes(x);
}

function isEventType(x: unknown): x is EventType {
	return typeof x === 'string' && (Object.values(EventType) as string[]).includes(x);
}

const isObj = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Hilfsklasse zum serialisieren und validierten des Simulationszustands als JSON.
 */
export class Json {
	/**
	 * Exportiert die Simulations-History in das persistierbare JSON-Format.
	 * @param history Vollständige Historie der Simulationszustände.
	 * @param algorithm Aktueller Algorithmustyp.
	 * @returns Formatierter JSON-String.
	 * @throws Error Wenn die History leer ist.
	 */
	public static exportJson(history: SimulationState[], algorithm: RoutingAlgorithmType): string {
		if (!history.length) {
			throw new Error('Export fehlgeschlagen: history ist leer.');
		}

		const states: ExportState[] = history.map((state, idx) => {
			const step = Math.max(
				0,
				Math.floor(Number((state as any)?.stepNumber ?? (state as any)?.stepNumber ?? idx))
			);
			const topo = state.topologyState;
			const { nodes, links } = topologyToNodesLinks(topo);

			const evs = Array.isArray(state.executedEvents) ? state.executedEvents : [];
			const events: ExportEvent[] = evs
				.map((e) => {
					const type = (e as any).type ?? (e as any).type;
					const targetId = String((e as any).targetId ?? (e as any).targetId ?? '');
					const evStepRaw = Number((e as any).step ?? step);
					const evStep = Number.isFinite(evStepRaw) && evStepRaw >= 0 ? evStepRaw : step;
					const payload = isObj((e as any)?.payload) ? (e as any).payload : {};
					return { step: evStep, type, targetId, payload };
				})
				.filter((e) => isEventType(e.type) && e.targetId.length > 0);

			return {
				step,
				stepType: (state as any)?.stepType ?? undefined,
				topology: { nodes, links },
				events
			};
		});

		states.sort((a, b) => a.step - b.step);

		const doc: ExportFormat = { algorithm, history: states };

		return JSON.stringify(doc, null, 2);
	}

	/**
	 * Importiert und validiert ein JSON-Dokument in interne Modellstrukturen.
	 * @param jsonString Zu importierender JSON-Text.
	 * @returns Algorithmus und rekonstruierte Zustandsliste.
	 * @throws Error Bei ungültigem Format oder semantischen Validierungsfehlern.
	 */
	public static importJson(jsonString: string): ImportResult {
		const raw = String(jsonString ?? '').trim();
		if (!raw) throw new Error('Import fehlgeschlagen: JSON ist leer.');

		let doc: any;
		try {
			doc = JSON.parse(raw);
		} catch {
			throw new Error('Import fehlgeschlagen: Ungültiges JSON (konnte nicht geparst werden).');
		}

		const fail = (path: string, msg: string): never => {
			throw new Error(`Import fehlgeschlagen (${path}): ${msg}`);
		};

		const str = (v: any, path: string): string => {
			const s = String(v ?? '').trim();
			if (!s) fail(path, 'muss ein nicht-leerer String sein');
			return s;
		};

		const finiteNum = (v: any, path: string): number => {
			const n = Number(v);
			if (!Number.isFinite(n)) fail(path, 'muss eine endliche Zahl sein');
			return n;
		};

		const nonNegInt = (v: any, path: string): number => {
			const n = Math.floor(Number(v));
			if (!Number.isFinite(n) || n < 0) fail(path, 'muss eine ganze Zahl >= 0 sein');
			return n;
		};

		const routingCost = (v: any, path: string): number => {
			if (typeof v === 'string') {
				const s = v.trim().toLowerCase();
				if (s === 'inf' || s === 'infinity' || s === '∞') return Number.POSITIVE_INFINITY;
			}
			const n = Number(v);
			if (!Number.isFinite(n) || n < 0) {
				fail(path, 'muss eine Zahl >= 0 oder "Infinity" sein');
			}
			return n;
		};

		const posInt = (v: any, path: string): number => {
			const n = Math.floor(Number(v));
			if (!Number.isFinite(n) || n <= 0) fail(path, 'muss eine ganze Zahl > 0 sein');
			return n;
		};

		if (!isObj(doc)) fail('$', 'Root muss ein Objekt sein');

		// --- algorithm ---
		if (!isRoutingAlgorithmType(doc.algorithm)) {
			fail(
				'algorithm',
				`ungültig: "${String(doc.algorithm)}" (erlaubt: ${Object.values(RoutingAlgorithmType).join(', ')})`
			);
		}
		const algorithm = doc.algorithm as RoutingAlgorithmType;

		if (!Array.isArray(doc.history) || doc.history.length === 0) {
			fail('history', 'muss ein nicht-leeres Array sein');
		}

		const seenSteps = new Set<number>();
		const states: ImportResult['states'] = [];

		for (let i = 0; i < doc.history.length; i++) {
			const entry = doc.history[i];
			const p = `history[${i}]`;
			if (!isObj(entry)) fail(p, 'muss ein Objekt sein');

			const step = nonNegInt(entry.step ?? i, `${p}.step`);
			if (seenSteps.has(step)) fail(`${p}.step`, `doppelte step "${step}"`);
			seenSteps.add(step);

			const stepTypeRaw = String((entry as any)?.stepType ?? '').trim();
			const stepType = stepTypeRaw.length > 0 ? stepTypeRaw : null;

			if (!isObj(entry.topology)) fail(`${p}.topology`, 'muss ein Objekt sein');
			const topoRaw = entry.topology;

			if (!Array.isArray(topoRaw.nodes)) fail(`${p}.topology.nodes`, 'muss ein Array sein');
			if (!Array.isArray(topoRaw.links)) fail(`${p}.topology.links`, 'muss ein Array sein');

			const nodesMap = new Map<string, any>();
			const routingTables = new Map<
				string,
				{ destinationId: string; nextHopId: string; cost: number }[]
			>();

			for (let ni = 0; ni < topoRaw.nodes.length; ni++) {
				const n = topoRaw.nodes[ni];
				const np = `${p}.topology.nodes[${ni}]`;
				if (!isObj(n)) fail(np, 'muss ein Objekt sein');

				const id = str(n.id, `${np}.id`);
				if (nodesMap.has(id)) fail(`${np}.id`, `doppelte node id "${id}"`);

				const type = str(n.type, `${np}.type`);
				const name = String(n.name ?? id).trim() || id;

				const xPos = n.xPos === undefined ? 0 : finiteNum(n.xPos, `${np}.xPos`);
				const yPos = n.yPos === undefined ? 0 : finiteNum(n.yPos, `${np}.yPos`);

				let node: any;
				if (type === 'ROUTER') {
					node = new Router(id, name, xPos, yPos);
					(node as any).disabled = !!n.disabled;
				} else {
					fail(`${np}.type`, `ungültig: "${type}" (erlaubt: "ROUTER")`);
				}

				// Optional: routing table snapshot for this node.
				const rtRaw = isObj((n as any).routingTable) ? (n as any).routingTable : null;
				const rtEntries = Array.isArray(rtRaw?.entries) ? rtRaw?.entries : null;
				if (rtEntries) {
					const parsed: { destinationId: string; nextHopId: string; cost: number }[] = [];
					for (let ri = 0; ri < rtEntries.length; ri++) {
						const re = rtEntries[ri];
						const rp = `${np}.routingTable.entries[${ri}]`;
						if (!isObj(re)) fail(rp, 'muss ein Objekt sein');
						const destinationId = str((re as any).destinationId, `${rp}.destinationId`);
						const nextHopId = str((re as any).nextHopId, `${rp}.nextHopId`);
						const cost = routingCost((re as any).cost, `${rp}.cost`);
						parsed.push({ destinationId, nextHopId, cost });
					}
					routingTables.set(id, parsed);
				}

				nodesMap.set(id, node);
			}

			// Validate routing tables after all nodes are known.
			for (const [nodeId, entries] of routingTables.entries()) {
				for (let ri = 0; ri < entries.length; ri++) {
					const e = entries[ri];
					const rp = `${p}.topology.nodes[id=${nodeId}].routingTable.entries[${ri}]`;
					if (!nodesMap.has(e.destinationId)) {
						fail(`${rp}.destinationId`, `unbekannte node id "${e.destinationId}"`);
					}
					if (e.nextHopId !== '-' && !nodesMap.has(e.nextHopId)) {
						fail(`${rp}.nextHopId`, `unbekannte node id "${e.nextHopId}"`);
					}
				}
			}

			const links: Link[] = [];
			const linkIds = new Set<string>();
			const undirectedKey = (a: string, b: string) => (a < b ? `${a}__${b}` : `${b}__${a}`);
			const seenPairs = new Set<string>();

			for (let li = 0; li < topoRaw.links.length; li++) {
				const l = topoRaw.links[li];
				const lp = `${p}.topology.links[${li}]`;
				if (!isObj(l)) fail(lp, 'muss ein Objekt sein');

				const id = str(l.id, `${lp}.id`);
				if (linkIds.has(id)) fail(`${lp}.id`, `doppelte link id "${id}"`);

				const sourceId = str(l.sourceId, `${lp}.sourceId`);
				const targetId = str(l.targetId, `${lp}.targetId`);
				if (sourceId === targetId) fail(lp, 'sourceId und targetId müssen verschieden sein');

				const weight = posInt(l.weight, `${lp}.weight`);

				const s = nodesMap.get(sourceId);
				const t = nodesMap.get(targetId);
				if (!s) fail(`${lp}.sourceId`, `unbekannte node id "${sourceId}"`);
				if (!t) fail(`${lp}.targetId`, `unbekannte node id "${targetId}"`);

				const pairKey = undirectedKey(sourceId, targetId);
				if (seenPairs.has(pairKey))
					fail(lp, `doppelter Link zwischen "${sourceId}" und "${targetId}"`);
				seenPairs.add(pairKey);

				const link = new Link(id, s, t, weight);
				links.push(link);
				linkIds.add(id);

				if (typeof (s as any).addNeighbor === 'function') (s as any).addNeighbor(link);
				else if (Array.isArray((s as any).neighbors)) (s as any).neighbors.push(link);

				if (typeof (t as any).addNeighbor === 'function') (t as any).addNeighbor(link);
				else if (Array.isArray((t as any).neighbors)) (t as any).neighbors.push(link);
			}

			const topology = new Topology(nodesMap as any, links as any);
			for (const node of nodesMap.values()) {
				const entries = routingTables.get(node.id);
				if (!entries) continue;
				const rt = new RoutingTable();
				for (const e of entries) rt.addEntry(e.destinationId, e.nextHopId, e.cost);
				node.routingTable = rt;
			}
			for (const node of nodesMap.values()) {
				node.ensureRoutingTableForTopology(topology);
			}

			const eventsRaw = entry.events ?? [];
			if (!Array.isArray(eventsRaw)) fail(`${p}.events`, 'muss ein Array sein');

			const events: SimulationEvent[] = [];
			for (let ei = 0; ei < eventsRaw.length; ei++) {
				const e = eventsRaw[ei];
				const ep = `${p}.events[${ei}]`;
				if (!isObj(e)) fail(ep, 'muss ein Objekt sein');

				const evStep = nonNegInt(e.step ?? step, `${ep}.step`);
				if (evStep !== step) fail(`${ep}.step`, `muss ${step} sein (step des History-Eintrags)`);

				if (!isEventType(e.type)) {
					fail(
						`${ep}.type`,
						`ungültig: "${String(e.type)}" (erlaubt: ${Object.values(EventType).join(', ')})`
					);
				}
				const type = e.type as EventType;

				const targetId = str(e.targetId, `${ep}.targetId`);
				const payloadRaw = isObj(e.payload) ? e.payload : {};

				let payload: Record<string, unknown> = {};
				if (type === EventType.WEIGHT_CHANGE || type === EventType.LINK_ADDITION) {
					const rawWeight = (payloadRaw as any).weight ?? e.argument ?? (e as any).weight;
					const weight = posInt(rawWeight, `${ep}.payload.weight`);
					payload = { weight };
				} else if (type === EventType.NODE_MOVE) {
					const rawX =
						(payloadRaw as any).x ?? (payloadRaw as any).xPos ?? (e as any).x ?? (e as any).xPos;
					const rawY =
						(payloadRaw as any).y ?? (payloadRaw as any).yPos ?? (e as any).y ?? (e as any).yPos;
					const x = finiteNum(rawX, `${ep}.payload.x`);
					const y = finiteNum(rawY, `${ep}.payload.y`);
					payload = { x, y };
				} else if (type === EventType.NODE_RENAME) {
					const name = str((payloadRaw as any).name ?? (e as any).name, `${ep}.payload.name`);
					payload = { name };
				} else if (type === EventType.NODE_DISABLE || type === EventType.NODE_ENABLE) {
					const disabled = type === EventType.NODE_DISABLE ? true : false;
					payload = { disabled };
				} else if (type === EventType.NODE_ADDITION) {
					// Optional coordinates if present.
					const hasX =
						(payloadRaw as any).x !== undefined || (payloadRaw as any).xPos !== undefined;
					const hasY =
						(payloadRaw as any).y !== undefined || (payloadRaw as any).yPos !== undefined;
					if (hasX && hasY) {
						const x = finiteNum(
							(payloadRaw as any).x ?? (payloadRaw as any).xPos,
							`${ep}.payload.x`
						);
						const y = finiteNum(
							(payloadRaw as any).y ?? (payloadRaw as any).yPos,
							`${ep}.payload.y`
						);
						payload = { x, y };
					}
				} else {
					payload = payloadRaw;
				}

				events.push(new SimulationEvent(evStep, type, targetId, payload));
			}

			const st = { step, topology, events } as any;
			if (stepType) st.stepType = stepType;
			states.push(st);
		}

		states.sort((a, b) => a.step - b.step);

		return { algorithm, states };
	}
}
