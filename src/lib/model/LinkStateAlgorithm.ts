import { RoutingEntry } from './RoutingEntry';
import { Router } from './Router';
import type { Topology } from './Topology';
import type { RoutingAlgorithm } from './RoutingAlgorithm';

/**
 * Implementierung des Link-State-Ansatzes auf Basis von Dijkstra.
 */
export class LinkStateAlgorithm implements RoutingAlgorithm {
	/**
	 * Berechnet für einen Router die aktuellen kürzesten Pfade und aktualisiert dessen Routing-Tabelle.
	 * @param router Router, dessen Tabelle berechnet wird.
	 * @param topology Aktueller Topologie-Snapshot.
	 */
	public executeStep(router: Router, topology: Topology): void {
		const nodes = Array.from(topology.nodes.values()).filter(
			(node: any) => !(node as any)?.disabled
		);
		const dist = new Map<string, number>();
		const prev = new Map<string, string | null>();

		for (const node of nodes) {
			dist.set(node.id, Number.POSITIVE_INFINITY);
			prev.set(node.id, null);
		}

		dist.set(router.id, 0);
		const visited = new Set<string>();

		while (visited.size < nodes.length) {
			let currentId: string | null = null;
			let currentDist = Number.POSITIVE_INFINITY;

			for (const [id, d] of dist) {
				if (!visited.has(id) && d < currentDist) {
					currentDist = d;
					currentId = id;
				}
			}

			if (currentId === null || currentDist === Number.POSITIVE_INFINITY) {
				break;
			}

			visited.add(currentId);
			const currentNode = topology.nodes.get(currentId);
			if (!currentNode) continue;

			for (const link of currentNode.neighbors ?? []) {
				const neighbor = link.source === currentNode ? link.target : link.source;
				const neighborId = neighbor.id;

				if ((neighbor as any)?.disabled) continue;
				if (visited.has(neighborId)) continue;

				const alt = (dist.get(currentId) ?? Number.POSITIVE_INFINITY) + link.weight;

				if (alt < (dist.get(neighborId) ?? Number.POSITIVE_INFINITY)) {
					dist.set(neighborId, alt);
					prev.set(neighborId, currentId);
				}
			}
		}

		router.routingTable.entries.clear();

		for (const node of nodes) {
			const destId = node.id;
			if (destId === router.id) {
				continue;
			}

			const cost = dist.get(destId);
			if (cost === undefined || cost === Number.POSITIVE_INFINITY) {
				router.routingTable.entries.set(
					destId,
					new RoutingEntry(destId, '-', Number.POSITIVE_INFINITY)
				);
				continue;
			}

			const nextHopId = this.getFirstHopOnPath(router.id, destId, prev);
			if (!nextHopId) {
				router.routingTable.entries.set(
					destId,
					new RoutingEntry(destId, '-', Number.POSITIVE_INFINITY)
				);
				continue;
			}

			router.routingTable.entries.set(destId, new RoutingEntry(destId, nextHopId, cost));
		}

		router.routingTable.entries.set(router.id, new RoutingEntry(router.id, router.id, 0));
	}

	/**
	 * Ermittelt aus der Vorgängerbeziehung den ersten Hop vom Start zum Ziel.
	 * @param sourceId Startrouter-ID.
	 * @param destId Zielrouter-ID.
	 * @param prev Vorgängerabbildung aus Dijkstra.
	 * @returns Router-ID des ersten Hops oder `null`, wenn kein Pfad existiert.
	 */
	private getFirstHopOnPath(
		sourceId: string,
		destId: string,
		prev: Map<string, string | null>
	): string | null {
		let currentId: string | null = destId;
		let parentId = prev.get(currentId) ?? null;

		if (parentId === null) {
			return null;
		}

		while (parentId !== null && parentId !== sourceId) {
			currentId = parentId;
			parentId = prev.get(currentId) ?? null;
		}

		if (parentId === sourceId && currentId !== null) {
			return currentId;
		}

		return null;
	}
}
