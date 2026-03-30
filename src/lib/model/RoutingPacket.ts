import { Router } from './Router';

/**
 * Repräsentiert ein Routing-Paket zwischen zwei Routern.
 */
export class RoutingPacket {
	public source: Router;
	public target: Router;
	public msg: any;
	public sourceId: string;
	public targetId: string;
	public currentLinkId: any;

	/**
	 * Erstellt ein neues Routing-Paket.
	 * @param source Quellrouter.
	 * @param target Zielrouter.
	 * @param msg Paketinhalt bzw. transportierte Nutzdaten.
	 */
	constructor(source: Router, target: Router, msg: any) {
		this.source = source;
		this.target = target;
		this.msg = msg;
		this.sourceId = source.id;
		this.targetId = target.id;
		this.currentLinkId = msg;
	}
}
