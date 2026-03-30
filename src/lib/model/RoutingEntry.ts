/**
 * Beschreibt einen Eintrag in einer Routing-Tabelle.
 */
export class RoutingEntry {
	public destinationId: string;
	public nextHopId: string;
	public cost: number;

	/**
	 * Erstellt einen neuen Routing-Tabelleneintrag.
	 * @param destinationId Zielrouter-ID.
	 * @param nextHopId Nächster Hop zum Ziel (oder "-" für unbekannt/unerreichbar).
	 * @param cost Gesamtkosten zum Ziel.
	 */
	constructor(destinationId: string, nextHopId: string, cost: number) {
		this.destinationId = destinationId;
		this.nextHopId = nextHopId;
		this.cost = cost;
	}
}
