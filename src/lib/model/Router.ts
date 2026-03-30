import { RoutingTable } from './RoutingTable';
import type { RoutingAlgorithm } from './RoutingAlgorithm';
import type { Link } from './Link';
import type { RoutingPacket } from './RoutingPacket';
import type { Topology } from './Topology';

export type DistanceVectorCell = { dist: number; nextHop: string | null };
export type DistanceVectorTable = Record<string, Record<string, DistanceVectorCell>>;
export type DistanceVectorState = {
	dvs: DistanceVectorTable;
	oldDvs: DistanceVectorTable;
	updated: boolean;
};

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
 * Repräsentiert einen Router im Simulationsgraphen.
 */
export class Router {
	public id: string;
	public name: string;
	public xPos: number;
	public yPos: number;
	public neighbors: Link[] = [];
	public routingTable: RoutingTable;
	public algorithm: RoutingAlgorithm | null;
	public optimal: boolean;
	public packetBuffer: RoutingPacket[] = [];
	public disabled: boolean;
	public dvState: DistanceVectorState | null;

	/**
	 * Erstellt einen Router.
	 * @param id Eindeutige Router-ID.
	 * @param name Anzeigename des Routers.
	 * @param xPos X-Koordinate im Editor.
	 * @param yPos Y-Koordinate im Editor.
	 * @param routingTable Optional vorinitialisierte Routing-Tabelle.
	 */
	constructor(id: string, name: string, xPos: number, yPos: number, routingTable?: RoutingTable) {
		this.id = id;
		this.name = name;
		this.xPos = xPos;
		this.yPos = yPos;
		this.routingTable = routingTable ?? new RoutingTable();
		this.algorithm = null;
		this.optimal = false;
		this.disabled = false;
		this.dvState = null;
	}

	/**
	 * Weist dem Router eine Algorithmus-Implementierung zu.
	 * @param algorithm Zu verwendender Routing-Algorithmus.
	 */
	public setAlgorithm(algorithm: RoutingAlgorithm): void {
		this.algorithm = algorithm;
	}

	/**
	 * Stellt sicher, dass für jedes Ziel in der Topologie ein Tabellen-Eintrag existiert.
	 * @param topology Referenztopologie zur Ermittlung aller Ziele.
	 */
	public ensureRoutingTableForTopology(topology: Topology): void {
		const nodes = topology.nodes;

		for (const node of nodes.values()) {
			const destId = node.id;

			if (this.routingTable.entries.has(destId)) continue;

			if (destId === this.id) {
				this.routingTable.addEntry(destId, this.id, 0);
			} else {
				this.routingTable.addEntry(destId, '-', Infinity);
			}
		}
	}

	/**
	 * Legt ein empfangenes Paket im Eingangsbuffer ab.
	 * @param packet Eingehendes Routing-Paket.
	 */
	public receivePacket(packet: RoutingPacket): void {
		this.packetBuffer.push(packet);
	}

	/**
	 * Fügt einen Link zur Nachbarschaftsliste hinzu.
	 * @param link Verknüpfter Link.
	 */
	public addNeighbor(link: Link): void {
		this.neighbors.push(link);
	}

	/**
	 * Entfernt einen Link aus der Nachbarschaftsliste.
	 * @param link Zu entfernender Link.
	 */
	public removeNeighbor(link: Link): void {
		this.neighbors = this.neighbors.filter((l) => l.id !== link.id);
	}

	/**
	 * Prüft, ob eine Router-ID direkt benachbart ist.
	 * @param routerId Zu prüfende Router-ID.
	 * @returns `true`, wenn eine direkte Verbindung besteht.
	 */
	public isNeighborRouterId(routerId: string): boolean {
		const rid = String(routerId);
		for (const link of this.neighbors) {
			const other = link.otherSide(this.id);
			if (other.id === rid) return true;
		}
		return false;
	}

	/**
	 * Erstellt eine tiefe Kopie des Routers ohne Nachbarreferenzen.
	 * @returns Geklonte Router-Instanz.
	 */
	public clone(): Router {
		const r = new Router(this.id, this.name, this.xPos, this.yPos);
		r.algorithm = this.algorithm;
		r.optimal = this.optimal;
		r.disabled = this.disabled;
		r.dvState = this.dvState
			? {
					dvs: cloneDvTable(this.dvState.dvs),
					oldDvs: cloneDvTable(this.dvState.oldDvs),
					updated: !!this.dvState.updated
				}
			: null;
		return r;
	}
}
