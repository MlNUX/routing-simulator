import { RoutingEntry } from './RoutingEntry';

/**
 * Kapselt die Routing-Einträge eines Routers.
 */
export class RoutingTable {
	public entries: Map<string, RoutingEntry>;

	/**
	 * Erstellt eine leere Routing-Tabelle.
	 */
	constructor() {
		this.entries = new Map<string, RoutingEntry>();
	}

	/**
	 * Fügt einen Routing-Eintrag hinzu oder überschreibt ihn per Ziel-ID.
	 * @param destinationId Zielrouter-ID.
	 * @param nextHop Nächster Hop zum Ziel.
	 * @param cost Kosten zum Ziel.
	 */
	public addEntry(destinationId: string, nextHop: string, cost: number): void {
		const entry = new RoutingEntry(destinationId, nextHop, cost);
		this.entries.set(destinationId, entry);
	}

	/**
	 * Erstellt eine tiefe Kopie der Routing-Tabelle.
	 * @returns Unabhängige Kopie aller Einträge.
	 */
	public clone(): RoutingTable {
		const newTable = new RoutingTable();
		for (const [destId, entry] of this.entries) {
			newTable.addEntry(destId, entry.nextHopId, entry.cost);
		}
		return newTable;
	}
}
