import { EventType } from './EventType';

/**
 * Beschreibt ein fachliches Ereignis innerhalb eines Simulationsschritts.
 */
export class SimulationEvent {
	public step: number;
	public type: EventType;
	public targetId: string;
	public payload: Record<string, unknown>;

	/**
	 * Erstellt ein Simulationsereignis.
	 * @param step Schrittindex, in dem das Ereignis auftritt.
	 * @param type Ereignistyp.
	 * @param targetId Betroffene Entität (Router/Link).
	 * @param payload Zusatzdaten zum Ereignis.
	 */
	constructor(
		step: number,
		type: EventType,
		targetId: string,
		payload: Record<string, unknown> = {}
	) {
		this.step = step;
		this.type = type;
		this.targetId = targetId;
		this.payload = { ...payload };
	}
}
