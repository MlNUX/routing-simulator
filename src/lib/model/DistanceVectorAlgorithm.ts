import {
	Router,
	type DistanceVectorCell,
	type DistanceVectorState,
	type DistanceVectorTable
} from './Router';
import { Topology } from './Topology';
import type { RoutingAlgorithm } from './RoutingAlgorithm';
import { RoutingTable } from './RoutingTable';

type NeighborEdge = { id: string; weight: number; node: Router };

const cloneDvTable = (src: DistanceVectorTable): DistanceVectorTable => {
	const out: DistanceVectorTable = {};
	for (const [rowId, row] of Object.entries(src ?? {})) {
		const nextRow: Record<string, DistanceVectorCell> = {};
		for (const [destId, cell] of Object.entries(row ?? {})) {
			const dist = Number(cell?.dist ?? Infinity);
			const nextHop = cell?.nextHop ?? null;
			nextRow[destId] = { dist, nextHop };
		}
		out[rowId] = nextRow;
	}
	return out;
};

/**
 * Implementierung des Distance-Vector-Algorithmus mit optionalem Poisoned Reverse.
 */
export class DistanceVectorAlgorithm implements RoutingAlgorithm {
	public poisoned: boolean;

	/**
	 * Erstellt eine DV-Algorithmusinstanz.
	 * @param poisoned Aktiviert Poisoned Reverse, wenn `true`.
	 */
	constructor(poisoned: boolean) {
		this.poisoned = poisoned;
	}

	/**
	 * Führt die Sendephase aus und verteilt die aktuelle Distanzvektor-Sicht an Nachbarn.
	 * @param router Aktueller Router.
	 * @param topology Aktueller Topologie-Snapshot.
	 */
	public executeStep(router: Router, topology: Topology): void {
		if (!router || router.disabled) return;
		this.ensureDvState(router, topology, false);
		this.sendDV(router, topology);
	}

	/**
	 * Verarbeitet empfangene Distanzvektoren und berechnet die eigene Tabelle neu.
	 * @param router Zielrouter für die Verarbeitung.
	 * @param topology Optionaler Topologie-Snapshot.
	 */
	public receivePackets(router: Router, topology?: Topology): void {
		if (!router || router.disabled) return;
		const topo = topology ?? this.inferTopology(router);
		if (!topo) return;
		this.ensureDvState(router, topo, false);
		this.recomputeDV(router, topo, true);
	}

	/**
	 * Initialisiert DV-Zustand und Routing-Tabelle für einen Router.
	 * @param router Zielrouter.
	 * @param topology Aktuelle Topologie.
	 * @param snapshot Legt fest, ob ein Vorher-Snapshot gespeichert werden soll.
	 */
	public initialize(router: Router, topology: Topology, snapshot: boolean): void {
		if (!router) return;
		this.ensureDvState(router, topology, snapshot);
		this.recomputeDV(router, topology, snapshot);
	}

	/**
	 * Baut den internen DV-Zustand nach Topologieänderungen neu auf.
	 * @param router Zielrouter.
	 * @param topology Aktuelle Topologie.
	 * @param snapshot Legt fest, ob ein Vorher-Snapshot gespeichert werden soll.
	 */
	public reinitializeForTopology(router: Router, topology: Topology, snapshot: boolean): void {
		if (!router) return;
		this.ensureDvState(router, topology, snapshot);
	}

	/**
	 * Rechnet den Distanzvektor nach Topologieänderungen vollständig neu.
	 * @param router Zielrouter.
	 * @param topology Aktuelle Topologie.
	 * @param snapshot Legt fest, ob ein Vorher-Snapshot gespeichert werden soll.
	 */
	public recomputeForTopology(router: Router, topology: Topology, snapshot: boolean): void {
		if (!router) return;
		this.recomputeDV(router, topology, snapshot);
	}

	/**
	 * Stellt sicher, dass alle benötigten DV-Zeilen und Zieleinträge vorhanden sind.
	 * @param router Zielrouter.
	 * @param topology Aktuelle Topologie.
	 * @param snapshot Legt fest, ob `oldDvs` aktualisiert wird.
	 */
	private ensureDvState(router: Router, topology: Topology, snapshot: boolean): void {
		const state = this.ensureState(router);
		const routerId = String(router.id);
		const dests = this.routerIdsFromTopology(topology);
		const neighbors = this.neighborsFor(router, topology);
		const activeDests = new Set(dests);
		const allowedRows = new Set<string>([routerId, ...neighbors.map((nb) => nb.id)]);

		for (const rowId of Object.keys(state.dvs ?? {})) {
			if (!allowedRows.has(rowId)) delete state.dvs[rowId];
		}

		state.dvs[routerId] ??= {};
		for (const nb of neighbors) {
			state.dvs[nb.id] ??= {};
		}

		const selfRow = state.dvs[routerId] as Record<string, DistanceVectorCell>;
		for (const destId of Object.keys(selfRow)) {
			if (!activeDests.has(destId)) delete selfRow[destId];
		}

		for (const nb of neighbors) {
			if (!(nb.id in selfRow)) {
				selfRow[nb.id] = { dist: nb.weight, nextHop: nb.id };
			}
		}

		for (const dest of dests) {
			if (!(dest in selfRow)) {
				selfRow[dest] = { dist: Infinity, nextHop: null };
			}
		}

		for (const nb of neighbors) {
			const row = state.dvs[nb.id] as Record<string, DistanceVectorCell>;
			for (const destId of Object.keys(row)) {
				if (!activeDests.has(destId)) delete row[destId];
			}
			for (const dest of dests) {
				if (!(dest in row)) {
					row[dest] = { dist: Infinity, nextHop: null };
				}
			}
		}

		selfRow[routerId] = { dist: 0, nextHop: routerId };

		if (snapshot) {
			state.oldDvs = cloneDvTable(state.dvs);
		}
	}

	/**
	 * Sendet den aktuellen DV-Stand an alle erreichbaren Nachbarn.
	 * @param router Sendender Router.
	 * @param topology Aktuelle Topologie.
	 */
	private sendDV(router: Router, topology: Topology): void {
		const state = router.dvState;
		if (!state) return;
		const topoAny = topology as any;
		if (!Array.isArray(topoAny.sentLinkIds)) topoAny.sentLinkIds = [];
		const routerId = String(router.id);
		const neighbors = this.neighborsFor(router, topology);
		const linkByNeighbor = new Map<string, string>();
		for (const link of router.neighbors ?? []) {
			const other = link.otherSide(router.id);
			if (!other) continue;
			linkByNeighbor.set(String(other.id), String(link.id));
		}

		for (const nb of neighbors) {
			if (nb.node.disabled) continue;
			this.ensureDvState(nb.node, topology, false);
			const targetState = this.ensureState(nb.node);
			const payload = cloneDvTable({ [routerId]: state.dvs[routerId] ?? {} })[routerId] ?? {};

			if (this.poisoned) {
				for (const [destId, cell] of Object.entries(payload)) {
					if (cell?.nextHop === nb.id) {
						payload[destId] = { dist: Infinity, nextHop: null };
					}
				}
			}

			targetState.dvs[routerId] = payload;

			const linkId = linkByNeighbor.get(String(nb.id));
			if (linkId) topoAny.sentLinkIds.push(linkId);
		}
	}

	/**
	 * Führt den Bellman-Ford-Schritt für alle Ziele eines Routers aus.
	 * @param router Zielrouter.
	 * @param topology Aktuelle Topologie.
	 * @param snapshot Legt fest, ob der vorherige Zustand gespeichert wird.
	 */
	private recomputeDV(router: Router, topology: Topology, snapshot: boolean): void {
		const state = this.ensureState(router);
		const routerId = String(router.id);
		const dests = this.routerIdsFromTopology(topology);
		const neighbors = this.neighborsFor(router, topology);

		if (snapshot) {
			state.oldDvs = cloneDvTable(state.dvs);
		}

		state.updated = false;

		const selfRow = state.dvs[routerId] ?? {};

		for (const dest of dests) {
			let minDist = Infinity;
			let nextHop: string | null = null;

			if (dest === routerId) {
				minDist = 0;
				nextHop = routerId;
			} else {
				for (const nb of neighbors) {
					const row = state.dvs[nb.id] ?? {};
					const neighborDist = nb.id === dest ? 0 : (row[dest]?.dist ?? Infinity);
					const dist = neighborDist === Infinity ? Infinity : nb.weight + neighborDist;
					if (dist < minDist) {
						minDist = dist;
						nextHop = nb.id;
					}
				}
			}

			const prev = selfRow[dest];
			if (!prev || prev.dist !== minDist || prev.nextHop !== nextHop) {
				state.updated = true;
			}

			selfRow[dest] = { dist: minDist, nextHop };
		}

		state.dvs[routerId] = selfRow;
		this.syncRoutingTable(router, dests, selfRow);
	}

	/**
	 * Überträgt den berechneten DV-Selbstvektor in die sichtbare Routing-Tabelle.
	 * @param router Zielrouter.
	 * @param dests Liste der Ziel-IDs.
	 * @param selfRow Berechnete Distanzen des Routers.
	 */
	private syncRoutingTable(
		router: Router,
		dests: string[],
		selfRow: Record<string, DistanceVectorCell>
	): void {
		if (!router.routingTable) router.routingTable = new RoutingTable();
		const table = router.routingTable;
		const activeDests = new Set(dests);

		for (const destId of Array.from(table.entries.keys())) {
			if (!activeDests.has(destId)) table.entries.delete(destId);
		}

		for (const dest of dests) {
			const cell = selfRow[dest] ?? { dist: Infinity, nextHop: null };
			const cost = cell.dist;
			const nextHopId = cost === Infinity ? '-' : (cell.nextHop ?? '-');
			const entry = table.entries.get(dest);
			if (entry) {
				entry.cost = cost;
				entry.nextHopId = nextHopId;
			} else {
				table.addEntry(dest, nextHopId, cost);
			}
		}
	}

	/**
	 * Liefert einen initialisierten DV-Zustand und erstellt ihn bei Bedarf.
	 * @param router Zielrouter.
	 * @returns Garantiert vorhandener DV-Zustand.
	 */
	private ensureState(router: Router): DistanceVectorState {
		if (!router.dvState) {
			router.dvState = { dvs: {}, oldDvs: {}, updated: true };
		}
		return router.dvState;
	}

	/**
	 * Ermittelt alle aktiven Nachbarn inklusive Linkkosten.
	 * @param router Ausgangsrouter.
	 * @param topology Aktuelle Topologie.
	 * @returns Nachbarliste mit Gewichtung.
	 */
	private neighborsFor(router: Router, topology: Topology): NeighborEdge[] {
		const out: NeighborEdge[] = [];
		for (const link of router.neighbors ?? []) {
			const other = link.otherSide(router.id);
			if (other.disabled) continue;
			const w = Number(link.weight);
			const weight = Number.isFinite(w) && w > 0 ? w : 1;
			out.push({ id: other.id, weight, node: other });
		}
		return out;
	}

	/**
	 * Liest alle aktiven Router-IDs aus der Topologie.
	 * @param topology Aktuelle Topologie.
	 * @returns Sortierunabhängige Liste aktiver Router-IDs.
	 */
	private routerIdsFromTopology(topology: Topology): string[] {
		const ids: string[] = [];
		const nodes = (topology as any)?.nodes instanceof Map ? (topology as any).nodes : new Map();
		for (const [id, node] of nodes.entries()) {
			if ((node as any)?.disabled) continue;
			ids.push(String(id));
		}
		return ids;
	}

	/**
	 * Versucht aus den Nachbarlinks eines Routers eine Topologie abzuleiten.
	 * @param router Ausgangsrouter.
	 * @returns Abgeleitete Topologie oder `null`, wenn dies nicht möglich ist.
	 */
	private inferTopology(router: Router): Topology | null {
		const links = router.neighbors ?? [];
		if (links.length === 0) return null;
		const nodeMap = new Map<string, any>();
		for (const link of links) {
			const s = link.source;
			const t = link.target;
			if (s) nodeMap.set(String(s.id), s);
			if (t) nodeMap.set(String(t.id), t);
		}
		if (nodeMap.size === 0) return null;
		return new Topology(nodeMap as any, links as any);
	}
}
