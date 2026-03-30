import type { SimulationEvent } from './SimulationEvent';
import { Topology } from './Topology';

/**
 * Snapshot eines einzelnen Simulationsschritts inklusive Topologie und Ereignissen.
 */
export class SimulationState {
	public stepNumber: number;
	public topologyState: Topology;
	public executedEvents: SimulationEvent[];
	public stepType?: 'update';

	/**
	 * Erstellt einen Simulationszustand für einen bestimmten Schritt.
	 * @param stepNumber Schrittindex in der History.
	 * @param topologyState Topologie-Snapshot dieses Schritts.
	 */
	constructor(stepNumber: number, topologyState: Topology) {
		this.stepNumber = stepNumber;
		this.topologyState = topologyState;
		this.executedEvents = [];
	}
}
