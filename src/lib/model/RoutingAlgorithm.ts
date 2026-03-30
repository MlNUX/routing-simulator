import type { Router } from './Router';
import type { Topology } from './Topology';

/**
 * Gemeinsame Schnittstelle für alle Routing-Algorithmen.
 */
export interface RoutingAlgorithm {
	/**
	 * Führt einen aktiven Simulationsschritt für einen Router aus.
	 * @param router Router, für den der Schritt berechnet wird.
	 * @param topology Aktueller Topologie-Snapshot.
	 */
	executeStep(router: Router, topology: Topology): void;

	/**
	 * Verarbeitet empfangene Pakete und aktualisiert daraus die Routingdaten.
	 * @param router Router, dessen Eingangsdaten verarbeitet werden.
	 * @param topology Aktueller Topologie-Snapshot.
	 */
	receivePackets?: (router: Router, topology: Topology) => void;
}
