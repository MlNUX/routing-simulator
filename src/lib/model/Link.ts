import type { Router } from './Router';

/**
 * Modelliert eine ungerichtete Verbindung zwischen zwei Routern.
 */
export class Link {
	public source: Router;
	public target: Router;
	public weight: number;
	public id: string;

	/**
	 * Erstellt eine Verbindung zwischen zwei Routern.
	 * @param id Eindeutige Link-ID.
	 * @param source Erster Endpunkt.
	 * @param target Zweiter Endpunkt.
	 * @param weight Gewicht/Kosten der Verbindung.
	 */
	constructor(id: string, source: Router, target: Router, weight: number) {
		this.id = id;
		this.source = source;
		this.target = target;
		this.weight = weight;
	}

	/**
	 * Liefert den gegenüberliegenden Router einer gegebenen Endpunkt-ID.
	 * @param nodeId Router-ID eines Endpunkts.
	 * @returns Gegenüberliegender Router.
	 * @throws Error Wenn die ID nicht zu diesem Link gehört.
	 */
	public otherSide(nodeId: string): Router {
		if (this.source.id === nodeId) {
			return this.target;
		} else if (this.target.id === nodeId) {
			return this.source;
		} else {
			throw new Error(`Node ID ${nodeId} is not part of this link.`);
		}
	}
}
