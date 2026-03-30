/**
 * Definiert die unterstützten Routing-Algorithmen der Simulation.
 */
export enum RoutingAlgorithmType {
	LINK_STATE = 'LINK_STATE',
	DISTANCE_VECTOR = 'DISTANCE_VECTOR',
	DISTANCE_VECTOR_POISONED = 'DISTANCE_VECTOR_POISONED'
}

/**
 * Semantischer Alias für den aktuell auswählbaren Algorithmustyp.
 */
export type AlgorithmType = RoutingAlgorithmType;
