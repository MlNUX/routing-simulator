import type { Router } from './Router';
import { Link } from './Link';
import { RoutingPacket } from './RoutingPacket';

/**
 * Enthält den vollständigen Graphen der Simulation (Router und Links).
 */
export class Topology {
	public nodes: Map<string, Router>;
	public links: Link[];

	/**
	 * Erstellt eine neue Topologie.
	 * @param nodes Router-Menge, optional.
	 * @param links Link-Liste, optional.
	 */
	constructor(nodes?: Map<string, Router>, links?: Link[]) {
		this.nodes = nodes ?? new Map<string, Router>();
		this.links = links ?? [];
	}

	/**
	 * Erstellt eine tiefe Kopie der Topologie inklusive Router- und Link-Beziehungen.
	 * @returns Vollständig geklonte Topologie.
	 */
	public clone(): Topology {
		const nodeCopies = new Map<string, Router>();
		for (const [id, node] of this.nodes) {
			const copy = node.clone();
			if ((node as any)?.routingTable) {
				(copy as any).routingTable =
					typeof (node as any).routingTable.clone === 'function'
						? (node as any).routingTable.clone()
						: (node as any).routingTable;
			}
			copy.neighbors = [];
			nodeCopies.set(id, copy);
		}

		const linkCopies: Link[] = [];
		for (const originalLink of this.links) {
			const sId = originalLink.source.id;
			const tId = originalLink.target.id;

			const newSource = nodeCopies.get(sId);
			const newTarget = nodeCopies.get(tId);

			if (!newSource || !newTarget) continue;

			const copiedLink = new Link(originalLink.id, newSource, newTarget, originalLink.weight);

			linkCopies.push(copiedLink);

			newSource.addNeighbor(copiedLink);
			newTarget.addNeighbor(copiedLink);
		}

		// Preserve packet buffers by remapping router references.
		for (const [id, node] of this.nodes) {
			const copy = nodeCopies.get(id);
			if (!copy) continue;
			const buf = (node as any)?.packetBuffer;
			if (!Array.isArray(buf)) continue;

			const mapped = buf.map((pkt: any) => {
				const srcId = String(pkt?.source?.id ?? '');
				const tgtId = String(pkt?.target?.id ?? '');
				const srcCopy = nodeCopies.get(srcId);
				const tgtCopy = nodeCopies.get(tgtId);

				if (pkt && srcCopy && tgtCopy) {
					const msg = pkt?.msg ?? pkt?.currentLinkId;
					return new RoutingPacket(srcCopy, tgtCopy, msg);
				}

				return pkt;
			});

			(copy as any).packetBuffer = mapped;
		}

		return new Topology(nodeCopies, linkCopies);
	}
}
