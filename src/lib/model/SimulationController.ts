import { Topology } from './Topology';
import { SimulationState } from './SimulationState';
import { SimulationEvent } from './SimulationEvent';
import { Link } from './Link';
import { Router } from './Router';
import { RoutingAlgorithmType, type AlgorithmType } from './RoutingAlgorithmType';
import type { RoutingAlgorithm } from './RoutingAlgorithm';
import { LinkStateAlgorithm } from './LinkStateAlgorithm';
import { DistanceVectorAlgorithm } from './DistanceVectorAlgorithm';
import { EventType } from './EventType';
import { Json } from './Json';
import { RoutingPacket } from './RoutingPacket';
import { RoutingTable } from './RoutingTable';

type TopologyAccess = {
	nodes: Map<string, Router>;
	links: Link[];
};

/**
 * Bearbeitungsmodus für Interaktionen im Editor.
 */
export type PlacementMode = 'none' | 'router' | 'link' | 'sendpacket' | 'delete';

/**
 * Beschreibt erkannte Konflikte bei Änderungen in vergangenen Schritten.
 */
export type ConflictInfo = {
	currentStep: number;
	futureSteps: number;
	conflictCount: number;
};

/**
 * Callback-Typ zur Auflösung von Konflikten in der Zukunftshistory.
 */
export type ConflictResolver = (
	conflicts: ConflictInfo,
	proceed: () => void,
	cancel: () => void
) => void;

const readId = (value: unknown): string => String(value ?? '').trim();
const asNodes = (topo: any): Map<string, Router> =>
	topo?.nodes instanceof Map ? topo.nodes : new Map<string, Router>();
const asLinks = (topo: any): any[] => (Array.isArray(topo?.links) ? topo.links : []);

/**
 * Zentrale Steuerklasse für Simulation, History, Bearbeitungen und Algorithmusausführung.
 */
export class SimulationController {
	public readonly instanceId: string;
	public currentStepIndex: number;
	public history: SimulationState[];
	public playing: boolean;

	private initialTopology: Topology;

	private undoStack: SimulationState[];
	private redoStack: SimulationState[];
	private algorithmType: AlgorithmType;
	private conflictResolver: ConflictResolver | null = null;
	private pendingEditBase: SimulationState | null = null;
	private pendingEditBaseSignature: string | null = null;

	/**
	 * Erstellt einen neuen Controller mit initialem History-Snapshot.
	 * @param topology Starttopologie der Simulation.
	 */
	constructor(topology: Topology) {
		this.instanceId = SimulationController.nextInstanceId();
		this.currentStepIndex = 0;
		this.history = [];

		this.playing = false;
		this.undoStack = [];
		this.redoStack = [];

		this.initialTopology = this.cloneTopology(topology);

		// Step 0 snapshot becomes the authoritative mutable topology while currentStepIndex=0.
		const initialTopo = this.cloneTopology(topology);
		this.history.push(new SimulationState(0, initialTopo));

		this.algorithmType = RoutingAlgorithmType.LINK_STATE;
		this.setAlgorithm(this.algorithmType);
	}

	private static instanceCounter = 0;

	/**
	 * Erzeugt eine eindeutige Instanz-ID für Debugging und Identitätsprüfungen.
	 * @returns Eindeutige ID mit Zeit- und Zufallskomponente.
	 */
	private static nextInstanceId(): string {
		const prefix = 'sim';
		const counter = ++SimulationController.instanceCounter;
		const time = Date.now().toString(36);
		const random = Math.floor(Math.random() * 1e6)
			.toString(36)
			.padStart(4, '0');
		return `${prefix}-${time}-${counter.toString(36)}-${random}`;
	}

	/**
	 * Gibt an, ob die Simulation aktuell läuft.
	 */
	public get running(): boolean {
		return this.playing;
	}

	/**
	 * Liefert den aktuell ausgewählten Algorithmustyp.
	 */
	public get algorithm(): AlgorithmType {
		return this.algorithmType;
	}

	/**
	 * Hinterlegt einen Resolver für Konflikte bei Vergangenheitsänderungen.
	 * @param resolver Callback oder `null`, um Konfliktbehandlung zu deaktivieren.
	 */
	public setConflictResolver(resolver: ConflictResolver | null): void {
		this.conflictResolver = typeof resolver === 'function' ? resolver : null;
	}

	/**
	 * Liefert den aktuell aktiven State und repariert leere/ungültige History bei Bedarf.
	 * @returns Aktueller Simulationszustand.
	 */
	private currentState(): SimulationState {
		if (!this.history.length) {
			const topo = new Topology(new Map(), []);
			const st = new SimulationState(0, topo);
			this.history = [st];
			this.currentStepIndex = 0;
		}

		const idx = Math.max(0, Math.min(this.currentStepIndex, this.history.length - 1));
		this.currentStepIndex = idx;
		return this.history[idx];
	}

	/**
	 * Klont ein Ereignis inklusive defensiver Payload-Kopie.
	 * @param e Zu klonendes Ereignis.
	 * @returns Unabhängige Ereigniskopie.
	 */
	private cloneSimulationEvent(e: SimulationEvent): SimulationEvent {
		const payload = (e as any)?.payload;
		const normalized =
			payload && typeof payload === 'object' && !Array.isArray(payload) ? { ...payload } : {};
		return new SimulationEvent(e.step, e.type, e.targetId, normalized);
	}

	/**
	 * Klont einen kompletten Simulationszustand inklusive Topologie und Events.
	 * @param src Quellzustand.
	 * @returns Vollständige Kopie des Zustands.
	 */
	private cloneSimulationState(src: SimulationState): SimulationState {
		const topoClone = this.cloneTopology(src.topologyState);
		const st = new SimulationState(src.stepNumber, topoClone);
		if ((src as any)?.stepType) (st as any).stepType = (src as any).stepType;
		st.executedEvents = Array.isArray(src.executedEvents)
			? src.executedEvents.map((e) => this.cloneSimulationEvent(e))
			: [];
		return st;
	}

	/**
	 * Berechnet eine stabile Signatur der Topologie zum Änderungsvergleich.
	 * @param topo Topologie, deren Signatur erstellt wird.
	 * @returns Serialisierte Signatur aus Knoten- und Linkdaten.
	 */
	private topologySignature(topo: Topology): string {
		const nodes = asNodes(topo as any);
		const links = asLinks(topo as any);

		const nodeSig = Array.from(nodes.values())
			.map((n: any) => ({
				id: String(n?.id ?? ''),
				name: String(n?.name ?? ''),
				x: Number(n?.xPos ?? 0),
				y: Number(n?.yPos ?? 0),
				disabled: !!(n as any)?.disabled
			}))
			.sort((a, b) => a.id.localeCompare(b.id));

		const linkSig = links
			.map((l: any) => ({
				id: String(l?.id ?? ''),
				s: readId(l?.source?.id),
				t: readId(l?.target?.id),
				w: Number(l?.weight ?? 1)
			}))
			.sort((a, b) => a.id.localeCompare(b.id));

		return JSON.stringify({ nodeSig, linkSig });
	}

	/**
	 * Merkt den aktuellen Zustand als Ausgangspunkt für zusammengefasste Pending-Edits.
	 */
	private beginPendingEdit(): void {
		if (this.pendingEditBase) return;
		const base = this.cloneSimulationState(this.currentState());
		this.pendingEditBase = base;
		this.pendingEditBaseSignature = this.topologySignature(base.topologyState);
	}

	/**
	 * Entfernt einen Pending-Edit, wenn keine effektive Änderung mehr vorhanden ist.
	 */
	private clearPendingIfNoDiff(): void {
		if (!this.pendingEditBase) return;
		const baseSig = this.pendingEditBaseSignature ?? '';
		const currentSig = this.topologySignature(this.currentTopology());
		const baseEvents = Array.isArray(this.pendingEditBase.executedEvents)
			? this.pendingEditBase.executedEvents.length
			: 0;
		const currentEvents = Array.isArray(this.currentState().executedEvents)
			? this.currentState().executedEvents.length
			: 0;
		if (baseSig === currentSig && baseEvents === currentEvents) {
			this.pendingEditBase = null;
			this.pendingEditBaseSignature = null;
		}
	}

	/**
	 * Speichert den aktuellen Zustand auf dem Undo-Stack.
	 */
	private pushUndoSnapshot(): void {
		const snapshot = this.cloneSimulationState(this.currentState());
		this.undoStack.push(snapshot);
	}

	/**
	 * Leert den Redo-Stack.
	 */
	private clearRedoStack(): void {
		this.redoStack = [];
	}

	/**
	 * Leert Undo- und Redo-Stack vollständig.
	 */
	public clearUndoRedoStacks(): void {
		this.undoStack = [];
		this.redoStack = [];
	}

	/**
	 * Gibt an, ob ein Undo möglich ist.
	 */
	public get canUndo(): boolean {
		return this.undoStack.length > 0;
	}

	/**
	 * Gibt an, ob ein Redo möglich ist.
	 */
	public get canRedo(): boolean {
		return this.redoStack.length > 0;
	}

	/**
	 * Liefert die Topologie des aktuell ausgewählten History-Schritts.
	 * @returns Aktive Topologie.
	 */
	private currentTopology(): Topology {
		return this.currentState().topologyState;
	}

	/**
	 * Überführt offene Pending-Änderungen in einen dedizierten Update-Schritt.
	 * @returns `true`, wenn ein Commit erfolgt ist, sonst `false`.
	 */
	private commitPendingEditsIfAny(): boolean {
		if (!this.pendingEditBase) return false;

		const baseSig = this.pendingEditBaseSignature ?? '';
		const currentSig = this.topologySignature(this.currentTopology());
		const baseEvents = Array.isArray(this.pendingEditBase.executedEvents)
			? this.pendingEditBase.executedEvents
			: [];
		const currentEvents = Array.isArray(this.currentState().executedEvents)
			? this.currentState().executedEvents
			: [];

		if (baseSig === currentSig && currentEvents.length === baseEvents.length) {
			this.pendingEditBase = null;
			this.pendingEditBaseSignature = null;
			return false;
		}

		const editedTopo = this.cloneTopology(this.currentTopology());
		const updateEvents = currentEvents
			.slice(baseEvents.length)
			.map((e) => this.cloneSimulationEvent(e));

		// Apply algorithm recompute only when committing the update step.
		this.refreshDistanceVector(editedTopo, true, true);
		this.updateRouterOptimalFlags(editedTopo, this.currentStepIndex + 1);

		// Restore base snapshot as the current step.
		const base = this.pendingEditBase;
		base.stepNumber = this.currentStepIndex;
		this.history[this.currentStepIndex] = base;

		const insertIndex = this.currentStepIndex + 1;
		const updateState = new SimulationState(insertIndex, editedTopo);
		(updateState as any).stepType = 'update';
		updateState.executedEvents = updateEvents;

		this.history.splice(insertIndex, 0, updateState);
		for (let i = 0; i < this.history.length; i++) {
			const h = this.history[i] as any;
			h.stepNumber = i;
			if (Array.isArray(h?.executedEvents)) {
				for (const ev of h.executedEvents) {
					if (ev) (ev as any).step = i;
				}
			}
		}

		this.currentStepIndex = insertIndex;
		this.pendingEditBase = null;
		this.pendingEditBaseSignature = null;
		this.clearUndoRedoStacks();
		return true;
	}

	/**
	 * Entfernt alle zukünftigen History-Einträge hinter dem aktuellen Schritt.
	 */
	private truncateFuture(): void {
		const keep = this.currentStepIndex + 1;
		if (keep < this.history.length) this.history = this.history.slice(0, keep);
	}

	/**
	 * Prüft, ob ein Ereignistyp linkbezogen ist.
	 * @param t Zu prüfender Ereignistyp.
	 * @returns `true` bei Link-Events.
	 */
	private isLinkEventType(t: EventType): boolean {
		return (
			t === EventType.LINK_FAILURE || t === EventType.LINK_ADDITION || t === EventType.WEIGHT_CHANGE
		);
	}

	/**
	 * Ermittelt Quell- und Zielrouter eines Links über dessen ID.
	 * @param topo Topologie mit dem gesuchten Link.
	 * @param linkId Link-ID.
	 * @returns Endpunkt-IDs oder `null`, wenn nicht ermittelbar.
	 */
	private getLinkEndpointIds(
		topo: Topology,
		linkId: string
	): { sourceId: string; targetId: string } | null {
		const tAny = topo as any;
		const links: any[] = asLinks(tAny);
		for (const link of links) {
			const id = readId(link?.id);
			if (!id || id !== linkId) continue;

			const sourceId = readId(link?.source?.id);
			const targetId = readId(link?.target?.id);
			if (!sourceId || !targetId) return null;
			return { sourceId, targetId };
		}
		return null;
	}

	/**
	 * Zählt Konflikte mit zukünftigen Events für geänderte Knoten/Links.
	 * @param affectedNodeIds Betroffene Router-IDs.
	 * @param affectedLinkIds Betroffene Link-IDs.
	 * @returns Konfliktinformationen für UI/Resolver.
	 */
	private findFutureConflicts(
		affectedNodeIds: Set<string>,
		affectedLinkIds: Set<string>
	): ConflictInfo {
		const currentStep = this.currentStepIndex;
		const futureSteps = Math.max(0, this.history.length - 1 - currentStep);
		let conflictCount = 0;

		if (futureSteps === 0) {
			return { currentStep, futureSteps, conflictCount };
		}

		for (let i = currentStep + 1; i < this.history.length; i++) {
			const st = this.history[i];
			const evs = Array.isArray((st as any)?.executedEvents) ? (st as any).executedEvents : [];
			if (!evs.length) continue;

			for (const ev of evs) {
				const type = (ev as any)?.type;
				const targetId = String((ev as any)?.targetId ?? '');
				if (!targetId) continue;

				let conflict = affectedNodeIds.has(targetId) || affectedLinkIds.has(targetId);
				if (!conflict && this.isLinkEventType(type) && affectedNodeIds.size > 0) {
					const endpoints = this.getLinkEndpointIds(st.topologyState, targetId);
					if (
						endpoints &&
						(affectedNodeIds.has(endpoints.sourceId) || affectedNodeIds.has(endpoints.targetId))
					) {
						conflict = true;
					}
				}

				if (conflict) conflictCount++;
			}
		}

		return { currentStep, futureSteps, conflictCount };
	}

	/**
	 * Weist einem Router die aktuell gewählte Algorithmusinstanz zu.
	 * @param router Zielrouter.
	 */
	private applyAlgorithmToRouter(router: any): void {
		if (!router) return;
		const impl = this.createAlgorithmInstance();
		if (!impl) return;
		if (typeof router.setAlgorithm === 'function') {
			router.setAlgorithm(impl);
			return;
		}
		router.algorithm = impl;
	}

	/**
	 * Erzeugt eine neue Algorithmusinstanz passend zum aktuellen Typ.
	 * @returns Algorithmusinstanz oder `null`, wenn der Typ unbekannt ist.
	 */
	private createAlgorithmInstance(): RoutingAlgorithm | null {
		if (this.algorithmType === RoutingAlgorithmType.LINK_STATE) return new LinkStateAlgorithm();
		if (this.algorithmType === RoutingAlgorithmType.DISTANCE_VECTOR)
			return new DistanceVectorAlgorithm(false);
		if (this.algorithmType === RoutingAlgorithmType.DISTANCE_VECTOR_POISONED)
			return new DistanceVectorAlgorithm(true);
		return null;
	}

	/**
	 * Prüft, ob aktuell ein Distance-Vector-Algorithmus aktiv ist.
	 * @returns `true` für DV-Varianten.
	 */
	private isDistanceVectorAlgorithm(): boolean {
		return (
			this.algorithmType === RoutingAlgorithmType.DISTANCE_VECTOR ||
			this.algorithmType === RoutingAlgorithmType.DISTANCE_VECTOR_POISONED
		);
	}

	/**
	 * Ermittelt den sequenziellen Index ohne Update-Schritte.
	 * @param stepIndex Index in der History.
	 * @param historyOverride Optionale History-Quelle.
	 */
	private sequenceIndexForStep(stepIndex: number, historyOverride?: SimulationState[]): number {
		const hist = historyOverride ?? this.history;
		if (!hist.length) return 0;
		const max = Math.min(Math.max(0, Math.floor(stepIndex)), hist.length - 1);
		let seq = -1;
		for (let i = 0; i <= max; i++) {
			const st: any = hist[i];
			if (String(st?.stepType ?? '') === 'update') continue;
			seq += 1;
		}
		return Math.max(0, seq);
	}

	/**
	 * Rekonstruiert DV-Zustände aus vorhandenen Routing-Tabellen.
	 * @param topo Zieltopologie.
	 */
	private buildDvStateFromRoutingTables(topo: Topology): void {
		if (!this.isDistanceVectorAlgorithm()) return;
		const nodes: Map<string, Router> = asNodes(topo as any);
		const routerIds: string[] = [];
		for (const [id] of nodes.entries()) {
			routerIds.push(String(id));
		}

		const cloneDv = (
			src: Record<string, Record<string, { dist: number; nextHop: string | null }>>
		) => {
			const out: Record<string, Record<string, { dist: number; nextHop: string | null }>> = {};
			for (const [rowId, row] of Object.entries(src ?? {})) {
				const nextRow: Record<string, { dist: number; nextHop: string | null }> = {};
				for (const [destId, cell] of Object.entries(row ?? {})) {
					nextRow[destId] = { dist: cell?.dist ?? Infinity, nextHop: cell?.nextHop ?? null };
				}
				out[rowId] = nextRow;
			}
			return out;
		};

		const neighborIdsFor = (rid: string): string[] => {
			const node = nodes.get(rid);
			if (!node) return [];
			const ids: string[] = [];
			for (const link of (node as any).neighbors ?? []) {
				const other = link?.otherSide ? link.otherSide(rid) : null;
				ids.push(String(other.id));
			}
			return ids;
		};

		for (const rid of routerIds) {
			const node = nodes.get(rid);
			if (!node) continue;

			const rowIds = [rid, ...neighborIdsFor(rid)];
			const dvs: Record<string, Record<string, { dist: number; nextHop: string | null }>> = {};

			for (const rowId of rowIds) {
				const rowNode = nodes.get(rowId);
				const row: Record<string, { dist: number; nextHop: string | null }> = {};
				const entries = (rowNode as any)?.routingTable?.entries;
				const entriesMap = entries instanceof Map ? entries : new Map();

				for (const destId of routerIds) {
					const entry = entriesMap.get(destId);
					if (entry) {
						const cost = Number(entry?.cost ?? Infinity);
						const nextHopRaw = String(entry?.nextHopId ?? '-');
						row[destId] = {
							dist: Number.isFinite(cost) ? cost : Infinity,
							nextHop: nextHopRaw === '-' ? null : nextHopRaw
						};
					} else {
						row[destId] = { dist: Infinity, nextHop: null };
					}
				}

				dvs[rowId] = row;
			}

			(node as any).dvState = {
				dvs,
				oldDvs: cloneDv(dvs),
				updated: false
			};
		}
	}

	/**
	 * Initialisiert und berechnet DV-Zustände für alle Router einer Topologie.
	 * @param topo Zieltopologie.
	 * @param snapshot Legt fest, ob Vorherstände gesichert werden.
	 * @param recompute Legt fest, ob direkt neu gerechnet wird.
	 */
	private refreshDistanceVector(topo: Topology, snapshot: boolean, recompute: boolean): void {
		if (!this.isDistanceVectorAlgorithm()) return;
		const nodes: Map<string, Router> = asNodes(topo as any);
		for (const node of nodes.values()) {
			const n: any = node;

			let algo = n.algorithm;
			if (!(algo instanceof DistanceVectorAlgorithm)) {
				const impl = this.createAlgorithmInstance();
				if (impl instanceof DistanceVectorAlgorithm) {
					if (typeof n.setAlgorithm === 'function') n.setAlgorithm(impl);
					else n.algorithm = impl;
					algo = impl;
				}
			}

			if (!(algo instanceof DistanceVectorAlgorithm)) continue;
			algo.reinitializeForTopology(n, topo, snapshot);
		}

		if (!recompute) return;
		for (const node of nodes.values()) {
			const n: any = node;
			const algo = n.algorithm;
			if (!(algo instanceof DistanceVectorAlgorithm)) continue;
			algo.recomputeForTopology(n, topo, snapshot);
		}
	}

	/**
	 * Überträgt eine Änderung auf alle zukünftigen History-Snapshots.
	 * @param apply Änderungsfunktion für Topologien.
	 */
	private propagateToFuture(apply: (topo: Topology) => void): void {
		if (this.currentStepIndex >= this.history.length - 1) return;
		for (let i = this.currentStepIndex + 1; i < this.history.length; i++) {
			const st = this.history[i];
			if (!st?.topologyState) continue;
			apply(st.topologyState);
			this.updateRouterOptimalFlags(st.topologyState, (st as any)?.stepNumber ?? i);
		}
	}

	/**
	 * Führt Änderungen in Vergangenheitszuständen mit Konfliktauflösung aus.
	 * @param affectedNodeIds Betroffene Router.
	 * @param affectedLinkIds Betroffene Links.
	 * @param action Primäre Änderungsaktion.
	 * @param propagate Optionale Weitergabe ohne Trunkierung.
	 */
	private withPastEditResolution(
		affectedNodeIds: Set<string>,
		affectedLinkIds: Set<string>,
		action: () => void,
		propagate?: (topo: Topology) => void
	): void {
		const hasFuture = this.currentStepIndex < this.history.length - 1;
		if (!hasFuture) {
			action();
			return;
		}

		const conflicts = this.findFutureConflicts(affectedNodeIds, affectedLinkIds);
		const proceed = (truncate: boolean) => {
			if (truncate) this.truncateFuture();
			action();
			if (!truncate && propagate) this.propagateToFuture(propagate);
		};

		if (conflicts.conflictCount === 0) {
			proceed(false);
			return;
		}

		if (this.conflictResolver) {
			this.conflictResolver(
				conflicts,
				() => proceed(true),
				() => {}
			);
		}
	}

	/**
	 * Liefert direkten Zugriff auf die aktuelle Topologie-Ansicht.
	 */
	public get topology(): TopologyAccess {
		const topo = this.currentTopology() as any;
		const nodes = asNodes(topo);
		const links = asLinks(topo) as Link[];
		return { nodes, links: links ?? [] };
	}

	/**
	 * Gibt eine defensive Kopie der aktuellen Topologie zurück.
	 * @returns Geklonte Topologie.
	 */
	public getTopology(): Topology {
		// Return a defensive clone so external callers don't mutate internal history snapshots.
		return this.cloneTopology(this.currentTopology());
	}

	/**
	 * Gibt eine defensive Kopie der initialen Starttopologie zurück.
	 * @returns Geklonte Starttopologie.
	 */
	public getInitialTopology(): Topology {
		return this.cloneTopology(this.initialTopology);
	}

	/**
	 * Klont eine Topologie tief inklusive Nachbarschaften, Tabellen und Paketpuffer.
	 * @param src Quelltopologie.
	 * @returns Vollständige Topologiekopie.
	 */
	private cloneTopology(src: Topology): Topology {
		const srcAny = src as any;
		const srcNodes = srcAny.nodes as Map<string, any>;
		const srcLinks = srcAny.links as Link[];

		const nodeCopies = new Map<string, any>();

		for (const [id, node] of (srcNodes ?? new Map()).entries()) {
			const copy = typeof node?.clone === 'function' ? node.clone() : node;

			// Ensure positions are preserved even if clone() is incomplete.
			const sx = (node as any)?.xPos ?? 0;
			const sy = (node as any)?.yPos ?? 0;

			if (copy) {
				(copy as any).xPos = sx;
				(copy as any).yPos = sy;

				if (Array.isArray((copy as any).neighbors)) (copy as any).neighbors = [];
			}

			if ((node as any)?.routingTable) {
				(copy as any).routingTable =
					typeof (node as any).routingTable.clone === 'function'
						? (node as any).routingTable.clone()
						: (node as any).routingTable;
			}

			// Preserve algorithm reference (Router.clone() already does, but keep safe for non-Router clones).
			if ((node as any)?.algorithm && !(copy as any)?.algorithm) {
				(copy as any).algorithm = (node as any).algorithm;
			}

			nodeCopies.set(String(id), copy);
		}

		// Preserve packet buffers for DV across cloned steps, remapping router refs to the new topology.
		for (const [id, node] of (srcNodes ?? new Map()).entries()) {
			const copy = nodeCopies.get(String(id));
			if (!copy) continue;
			const buf = (node as any)?.packetBuffer;
			if (!Array.isArray(buf)) continue;

			const mapped = buf.map((pkt: any) => {
				const srcId = String(pkt?.source?.id ?? pkt?.sourceId ?? '');
				const tgtId = String(pkt?.target?.id ?? pkt?.targetId ?? '');
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

		const newLinks: Link[] = [];
		for (const l of srcLinks ?? []) {
			const la = l as any;
			const sid = readId(la?.source?.id);
			const tid = readId(la?.target?.id);
			const s = nodeCopies.get(sid);
			const t = nodeCopies.get(tid);
			if (!s || !t) continue;

			const id = readId(la?.id);
			const w = Number(la?.weight ?? 1);
			const nl = new Link(id, s, t, Number.isFinite(w) && w > 0 ? w : 1);
			newLinks.push(nl);

			if (typeof (s as any)?.addNeighbor === 'function') (s as any).addNeighbor(nl);
			else if (Array.isArray((s as any)?.neighbors)) (s as any).neighbors.push(nl);

			if (typeof (t as any)?.addNeighbor === 'function') (t as any).addNeighbor(nl);
			else if (Array.isArray((t as any)?.neighbors)) (t as any).neighbors.push(nl);
		}

		const topo = new Topology(nodeCopies as any, newLinks as any);
		const sentLinkIds = (src as any)?.sentLinkIds;
		if (Array.isArray(sentLinkIds)) {
			(topo as any).sentLinkIds = sentLinkIds
				.map((id: any) => String(id ?? '').trim())
				.filter((id: string) => id.length > 0);
		}
		return topo;
	}

	/**
	 * Synchronisiert die Struktur einer Topologie (Router/Links) mit einem Ziel-Snapshot.
	 * @param topo Zieltopologie (wird mutiert).
	 * @param target Strukturvorlage.
	 * @returns `true`, wenn sich die Struktur geändert hat.
	 */
	private syncTopologyStructure(topo: Topology, target: Topology): boolean {
		const beforeSig = this.topologySignature(topo);
		const topoAny: any = topo;
		const nodes: Map<string, any> = asNodes(topoAny);
		const targetNodes: Map<string, any> = asNodes(target as any);

		// Entferne Router, die nicht mehr existieren.
		for (const id of Array.from(nodes.keys())) {
			if (!targetNodes.has(id)) nodes.delete(id);
		}

		// Füge fehlende Router hinzu und gleiche Eigenschaften ab.
		for (const [id, tNode] of targetNodes.entries()) {
			const rid = String(id);
			const targetNode: any = tNode;
			let node = nodes.get(rid);
			const name = String(targetNode?.name ?? rid);
			const xRaw = Number(targetNode?.xPos ?? 0);
			const yRaw = Number(targetNode?.yPos ?? 0);
			const xPos = Number.isFinite(xRaw) ? xRaw : 0;
			const yPos = Number.isFinite(yRaw) ? yRaw : 0;
			const disabled = !!targetNode?.disabled;

			if (!node) {
				node = new Router(rid, name, xPos, yPos);
				(node as any).disabled = disabled;
				this.applyAlgorithmToRouter(node);
				nodes.set(rid, node);
			} else {
				node.name = name;
				node.xPos = xPos;
				node.yPos = yPos;
				(node as any).disabled = disabled;
			}
		}

		// Nachbarschaften leeren, werden über Links neu aufgebaut.
		for (const node of nodes.values()) {
			if (Array.isArray((node as any).neighbors)) (node as any).neighbors = [];
		}

		const newLinks: Link[] = [];
		const targetLinks: any[] = asLinks(target as any);
		for (const l of targetLinks) {
			const id = readId((l as any)?.id);
			if (!id) continue;
			const sId = readId((l as any)?.source?.id);
			const tId = readId((l as any)?.target?.id);
			if (!sId || !tId) continue;
			const s = nodes.get(sId);
			const t = nodes.get(tId);
			if (!s || !t) continue;

			const wRaw = Number((l as any)?.weight ?? 1);
			const w = Number.isFinite(wRaw) && wRaw > 0 ? wRaw : 1;
			const nl = new Link(id, s as any, t as any, w);
			newLinks.push(nl);

			if (typeof (s as any).addNeighbor === 'function') (s as any).addNeighbor(nl);
			else if (Array.isArray((s as any).neighbors)) (s as any).neighbors.push(nl);

			if (typeof (t as any).addNeighbor === 'function') (t as any).addNeighbor(nl);
			else if (Array.isArray((t as any).neighbors)) (t as any).neighbors.push(nl);
		}

		topoAny.nodes = nodes;
		topoAny.links = newLinks;

		const afterSig = this.topologySignature(topo);
		return beforeSig !== afterSig;
	}

	/**
	 * Hängt ein Ereignis an den aktuellen Zustand an.
	 * @param type Ereignistyp.
	 * @param targetId Zielentität des Ereignisses.
	 * @param payload Zusatzdaten.
	 */
	private pushEvent(
		type: EventType,
		targetId: string,
		payload: Record<string, unknown> = {}
	): void {
		const st = this.currentState() as any;
		if (!Array.isArray(st.executedEvents)) st.executedEvents = [];
		st.executedEvents.push(new SimulationEvent(this.currentStepIndex, type, targetId, payload));
	}

	/**
	 * Benennt einen Router im aktuellen Zustand um.
	 * @param routerId Zielrouter-ID.
	 * @param newName Neuer Name.
	 */
	public renameRouter(routerId: string, newName: string): void {
		const id = String(routerId ?? '').trim();
		const name = String(newName ?? '').trim();
		if (!id || !name) return;

		const n: any = this.topology.nodes.get(id);
		if (!n) return;

		const applyRename = (topo: Topology): void => {
			const topoAny = topo as any;
			const nodes: Map<string, any> = topoAny?.nodes instanceof Map ? topoAny.nodes : new Map();
			const target = nodes.get(id);
			if (!target) return;
			if ('name' in target) target.name = name;
		};

		this.withPastEditResolution(
			new Set([id]),
			new Set(),
			() => {
				this.pushUndoSnapshot();
				this.clearRedoStack();

				applyRename(this.currentTopology());
				this.pushEvent(EventType.NODE_RENAME, id, { name });
			},
			applyRename
		);
	}

	/**
	 * Ändert das Gewicht eines einzelnen Links.
	 * @param sourceId Erste Endpunkt-ID.
	 * @param targetId Zweite Endpunkt-ID.
	 * @param weight Neues Gewicht.
	 */
	public changeLinkWeight(sourceId: string, targetId: string, weight: number): void {
		this.changeLinkWeights([{ sourceId, targetId, weight }]);
	}

	/**
	 * Ändert Gewichte mehrerer Links in einem konsolidierten Schritt.
	 * @param changes Liste der gewünschten Gewichtsänderungen.
	 */
	public changeLinkWeights(
		changes: { sourceId: string; targetId: string; weight: number }[]
	): void {
		const items = Array.isArray(changes) ? changes : [];
		if (items.length === 0) return;

		const normalizeId = (v: unknown) => String(v ?? '').trim();
		const pairKey = (a: string, b: string) => (a < b ? `${a}__${b}` : `${b}__${a}`);

		const desired = new Map<string, { sourceId: string; targetId: string; weight: number }>();
		for (const c of items) {
			const sId = normalizeId((c as any)?.sourceId);
			const tId = normalizeId((c as any)?.targetId);
			if (!sId || !tId || sId === tId) continue;
			const w = Math.floor(Number((c as any)?.weight));
			const nextW = Number.isFinite(w) && w > 0 ? w : 1;
			desired.set(pairKey(sId, tId), { sourceId: sId, targetId: tId, weight: nextW });
		}

		if (desired.size === 0) return;

		const topoCheck = this.currentTopology() as any;
		const linksCheck: any[] = asLinks(topoCheck);

		const changedPairs: { sourceId: string; targetId: string; weight: number; linkId: string }[] =
			[];

		for (const link of linksCheck) {
			const ls = readId(link?.source?.id);
			const lt = readId(link?.target?.id);
			if (!ls || !lt) continue;
			const key = pairKey(ls, lt);
			const desiredChange = desired.get(key);
			if (!desiredChange) continue;
			const currentW = Number(link?.weight ?? 1);
			const nextW = desiredChange.weight;
			if (Number.isFinite(currentW) && currentW === nextW) continue;
			const linkId = readId(link?.id);
			changedPairs.push({ sourceId: ls, targetId: lt, weight: nextW, linkId });
		}

		if (changedPairs.length === 0) return;

		const affectedNodes = new Set<string>();
		const affectedLinks = new Set<string>();
		for (const ch of changedPairs) {
			affectedNodes.add(ch.sourceId);
			affectedNodes.add(ch.targetId);
			if (ch.linkId) affectedLinks.add(ch.linkId);
		}

		const applyWeights = (topo: Topology): void => {
			const links: any[] = asLinks(topo as any);
			for (const ch of changedPairs) {
				const link = links.find((l: any) => {
					const ls = readId(l?.source?.id);
					const lt = readId(l?.target?.id);
					return (
						(ls === ch.sourceId && lt === ch.targetId) || (ls === ch.targetId && lt === ch.sourceId)
					);
				});
				if (!link) continue;
				link.weight = ch.weight;
			}
			// Defer DV refresh until edits are committed.
		};

		this.withPastEditResolution(
			affectedNodes,
			affectedLinks,
			() => {
				this.pushUndoSnapshot();
				this.clearRedoStack();
				this.beginPendingEdit();

				applyWeights(this.currentTopology());
				for (const ch of changedPairs) {
					if (ch.linkId) this.pushEvent(EventType.WEIGHT_CHANGE, ch.linkId, { weight: ch.weight });
				}
			},
			applyWeights
		);
	}

	/**
	 * Springt zu einem Schritt und simuliert bei Bedarf bis dorthin vor.
	 * @param step Zielschritt.
	 * @returns Simulationszustand am Zielschritt.
	 */
	public jumpToStep(step: number): SimulationState {
		let s = Math.floor(Number(step));
		if (!Number.isFinite(s)) s = 0;
		if (s < 0) s = 0;

		if (s !== this.currentStepIndex) this.clearUndoRedoStacks();

		// If step exists in history, just navigate.
		const maxExisting = this.history.length - 1;
		if (s <= maxExisting) {
			this.currentStepIndex = s;
			return this.history[s];
		}

		// Otherwise, simulate forward until it exists.
		while (this.history.length - 1 < s) {
			this.nextStep();
		}

		this.currentStepIndex = s;
		return this.history[s] ?? this.history[this.history.length - 1];
	}

	/**
	 * Aktiviert den Wiedergabestatus.
	 */
	public play(): void {
		this.playing = true;
	}

	/**
	 * Deaktiviert den Wiedergabestatus.
	 */
	public pause(): void {
		this.playing = false;
	}

	/**
	 * Wechselt den aktiven Routing-Algorithmus im aktuellen Snapshot.
	 * @param algo Neuer Algorithmustyp.
	 */
	public setAlgorithm(algo: AlgorithmType): void {
		this.algorithmType = algo;

		// Apply to current snapshot only; future snapshots inherit via cloning.
		for (const node of this.topology.nodes.values()) {
			const n: any = node;

			const impl = this.createAlgorithmInstance();
			if (!impl) continue;

			if (typeof n.setAlgorithm === 'function') n.setAlgorithm(impl);
			else n.algorithm = impl;
		}

		if (this.isDistanceVectorAlgorithm()) {
			this.refreshDistanceVector(this.currentTopology(), true, true);
		}
	}

	/**
	 * Setzt den Algorithmus und rekonstruiert die History anhand der Topologie-Snapshots.
	 * Routing-Tabellen werden neu berechnet, Events bleiben erhalten.
	 * @param algo Neuer Algorithmustyp.
	 */
	public rebuildHistoryForAlgorithm(algo: AlgorithmType): void {
		const originalHistory = this.history;

		this.clearUndoRedoStacks();
		this.playing = false;
		this.pendingEditBase = null;
		this.pendingEditBaseSignature = null;

		this.algorithmType = algo;

		if (!originalHistory.length) {
			const emptyTopo = new Topology(new Map(), []);
			this.history = [new SimulationState(0, emptyTopo)];
			this.currentStepIndex = 0;
			this.initialTopology = this.cloneTopology(emptyTopo);
			return;
		}

		const workingTopo = this.cloneTopology(originalHistory[0].topologyState);
		const workingNodes: Map<string, any> = asNodes(workingTopo as any);

		for (const node of workingNodes.values()) {
			const n: any = node;
			n.routingTable = new RoutingTable();
			n.dvState = null;
			n.optimal = false;
			this.applyAlgorithmToRouter(n);
		}
		for (const node of workingNodes.values()) {
			if (typeof (node as any).ensureRoutingTableForTopology === 'function') {
				(node as any).ensureRoutingTableForTopology(workingTopo);
			}
		}

		if (this.isDistanceVectorAlgorithm()) {
			this.refreshDistanceVector(workingTopo, true, true);
		}

		const runSend = (topo: Topology): void => {
			for (const node of (topo as any).nodes.values()) {
				const n: any = node;
				if ((n as any)?.disabled) continue;
				const algoInst = n.algorithm;
				if (algoInst && typeof algoInst.executeStep === 'function') {
					algoInst.executeStep(n, topo);
				}
			}
		};

		const runRecompute = (topo: Topology): void => {
			for (const node of (topo as any).nodes.values()) {
				const n: any = node;
				if ((n as any)?.disabled) continue;
				const algoInst = n.algorithm;
				if (algoInst && typeof algoInst.receivePackets === 'function') {
					algoInst.receivePackets(n, topo);
				}
			}
		};

		const newHistory: SimulationState[] = [];

		for (let i = 0; i < originalHistory.length; i++) {
			const entry: any = originalHistory[i];

			if (i > 0) {
				const targetTopo = entry?.topologyState;
				if (targetTopo) {
					const changed = this.syncTopologyStructure(workingTopo, targetTopo);
					if (changed) {
						for (const node of (workingTopo as any).nodes.values()) {
							if (typeof (node as any).ensureRoutingTableForTopology === 'function') {
								(node as any).ensureRoutingTableForTopology(workingTopo);
							}
						}
					}
				}
			}

			let stepType = String(entry?.stepType ?? '').trim();
			if (!stepType) {
				const seqIndex = this.sequenceIndexForStep(i, originalHistory);
				if (this.isDistanceVectorAlgorithm()) {
					if (i !== 0) stepType = seqIndex % 2 === 1 ? 'send' : 'recompute';
				} else if (this.algorithmType === RoutingAlgorithmType.LINK_STATE) {
					if (i !== 0) stepType = seqIndex % 2 === 0 ? 'send' : 'recompute';
				}
			}

			if (this.isDistanceVectorAlgorithm()) {
				if (stepType === 'send') {
					(workingTopo as any).sentLinkIds = [];
					runSend(workingTopo);
				} else if (stepType === 'recompute') {
					runRecompute(workingTopo);
				} else if (stepType === 'update') {
					this.refreshDistanceVector(workingTopo, true, true);
				}
			} else if (this.algorithmType === RoutingAlgorithmType.LINK_STATE) {
				if (stepType === 'send') {
					runSend(workingTopo);
				}
			}

			this.updateRouterOptimalFlags(workingTopo, i);

			const snapshot = this.cloneTopology(workingTopo);
			const st = new SimulationState(i, snapshot);
			if (stepType) (st as any).stepType = stepType;
			st.executedEvents = Array.isArray(entry?.executedEvents)
				? entry.executedEvents.map((e: any) => this.cloneSimulationEvent(e))
				: [];
			newHistory.push(st);
		}

		this.history = newHistory;
		this.currentStepIndex = 0;
		this.initialTopology = this.cloneTopology(newHistory[0].topologyState);
	}

	/**
	 * Fügt dem aktuellen Zustand ein Ereignis hinzu.
	 * @param e Zu protokollierendes Ereignis.
	 */
	public addEvent(e: SimulationEvent): void {
		if (!e) return;
		const st = this.currentState() as any;
		if (!Array.isArray(st.executedEvents)) st.executedEvents = [];
		st.executedEvents.push(e);
	}

	/**
	 * Entfernt einen Link aus Topologie und Nachbarschaftslisten.
	 * @param topo Zieltopologie.
	 * @param link Zu entfernender Link.
	 */
	private removeLinkInstance(topo: Topology, link: Link): void {
		const l: any = link;
		const id = readId(l?.id);
		if (!id) return;

		const tAny = topo as any;
		const links: Link[] = asLinks(tAny) as Link[];
		tAny.links = links.filter((x: any) => readId(x?.id) !== id);

		const s = l?.source;
		const t = l?.target;

		const removeFrom = (node: any) => {
			if (!node) return;
			if (typeof node.removeNeighbor === 'function') node.removeNeighbor(link);
			if (Array.isArray(node.neighbors))
				node.neighbors = node.neighbors.filter((x: any) => readId(x?.id) !== id);
		};

		removeFrom(s);
		removeFrom(t);
	}

	/**
	 * Aktiviert oder deaktiviert einen Router.
	 * @param routerId Router-ID.
	 * @param disabled Gewünschter Status.
	 */
	public setRouterDisabled(routerId: string, disabled: boolean): void {
		const rid = String(routerId ?? '').trim();
		if (!rid) return;

		const topo = this.currentTopology() as any;
		const nodes: Map<string, any> = asNodes(topo);
		const node = nodes.get(rid);
		if (!node) return;

		const applyDisabled = (topo: Topology): void => {
			const topoAny = topo as any;
			const nodes: Map<string, any> = asNodes(topoAny);
			const target = nodes.get(rid);
			if (!target) return;
			(target as any).disabled = !!disabled;
		};

		this.withPastEditResolution(
			new Set([rid]),
			new Set(),
			() => {
				this.pushUndoSnapshot();
				this.clearRedoStack();
				this.beginPendingEdit();

				applyDisabled(this.currentTopology());

				this.pushEvent(disabled ? EventType.NODE_DISABLE : EventType.NODE_ENABLE, rid, {
					disabled: !!disabled
				});
			},
			applyDisabled
		);
	}

	/**
	 * Erzeugt die nächste freie Router-ID im Format `R<n>`.
	 * @returns Neue Router-ID.
	 */
	private generateRouterId(): string {
		const ids = Array.from(this.topology.nodes.keys());
		let max = 0;
		for (const id of ids) {
			const m = String(id).match(/^R(\d+)$/i);
			if (!m) continue;
			const n = Number(m[1]);
			if (Number.isFinite(n)) max = Math.max(max, n);
		}
		return `R${max + 1}`;
	}

	/**
	 * Erzeugt die nächste freie Link-ID im Format `L<n>`.
	 * @returns Neue Link-ID.
	 */
	private generateLinkId(): string {
		const ids = this.topology.links.map((l: any) => readId(l?.id));
		let max = 0;
		for (const id of ids) {
			const m = String(id).match(/^L(\d+)$/i);
			if (!m) continue;
			const n = Number(m[1]);
			if (Number.isFinite(n)) max = Math.max(max, n);
		}
		return `L${max + 1}`;
	}

	/**
	 * Fügt einen neuen Router mit Startposition hinzu.
	 * @param xPos X-Position.
	 * @param yPos Y-Position.
	 */
	public addNode(xPos: number, yPos: number): void {
		const x = Number.isFinite(xPos) ? xPos : 0;
		const y = Number.isFinite(yPos) ? yPos : 0;

		const id = this.generateRouterId();

		const applyAddNode = (topo: Topology): void => {
			const topoAny = topo as any;
			const nodes: Map<string, any> = topoAny?.nodes instanceof Map ? topoAny.nodes : new Map();
			if (nodes.has(id)) return;

			const r: any = new Router(id, id, x, y);
			this.applyAlgorithmToRouter(r);

			nodes.set(id, r);
			topoAny.nodes = nodes;
		};

		this.withPastEditResolution(
			new Set([id]),
			new Set(),
			() => {
				this.pushUndoSnapshot();
				this.clearRedoStack();
				this.beginPendingEdit();

				applyAddNode(this.currentTopology());
				this.pushEvent(EventType.NODE_ADDITION, id, { x, y });
			},
			applyAddNode
		);
	}

	/**
	 * Fügt einen neuen Link zwischen zwei Routern hinzu.
	 * @param sourceId Erste Endpunkt-ID.
	 * @param targetId Zweite Endpunkt-ID.
	 * @param weight Linkgewicht.
	 */
	public addLink(sourceId: string, targetId: string, weight: number): void {
		const sId = String(sourceId ?? '').trim();
		const tId = String(targetId ?? '').trim();
		if (!sId || !tId || sId === tId) return;

		const topo = this.currentTopology() as any;
		const nodes: Map<string, any> = asNodes(topo);
		const links: Link[] = asLinks(topo) as Link[];

		const w = Number.isFinite(weight) && weight > 0 ? weight : 1;

		const s = nodes.get(sId);
		const t = nodes.get(tId);
		if (!s || !t) return;

		const existing = links.some((l: any) => {
			const ls = readId(l?.source?.id);
			const lt = readId(l?.target?.id);
			return (ls === sId && lt === tId) || (ls === tId && lt === sId);
		});
		if (existing) return;

		const id = this.generateLinkId();
		const affectedNodes = new Set([sId, tId].filter((v) => v));
		const affectedLinks = new Set(id ? [id] : []);

		const applyAddLink = (topo: Topology): void => {
			const topoAny = topo as any;
			const nodes: Map<string, any> = asNodes(topoAny);
			const links: Link[] = asLinks(topoAny) as Link[];

			const s = nodes.get(sId);
			const t = nodes.get(tId);
			if (!s || !t) return;

			const existingLink = links.some((l: any) => {
				const ls = readId(l?.source?.id);
				const lt = readId(l?.target?.id);
				return (ls === sId && lt === tId) || (ls === tId && lt === sId);
			});
			if (existingLink) return;

			const link = new Link(id, s as any, t as any, w);
			topoAny.links = [...links, link];

			const addTo = (node: any) => {
				if (!node) return;
				if (typeof node.addNeighbor === 'function') node.addNeighbor(link);
				else if (Array.isArray(node.neighbors)) node.neighbors.push(link);
			};

			addTo(s);
			addTo(t);
		};

		this.withPastEditResolution(
			affectedNodes,
			affectedLinks,
			() => {
				this.pushUndoSnapshot();
				this.clearRedoStack();
				this.beginPendingEdit();

				// Refresh references after potential truncation.
				applyAddLink(this.currentTopology());
				this.pushEvent(EventType.LINK_ADDITION, id, { weight: w });
			},
			applyAddLink
		);
	}

	/**
	 * Löscht einen Router und alle daran hängenden Links.
	 * @param nodeId Zu löschende Router-ID.
	 */
	public deleteNode(nodeId: string): void {
		const id = String(nodeId ?? '').trim();
		if (!id) return;

		const topo = this.currentTopology();
		const topoAny: any = topo;
		const nodes: Map<string, any> = topoAny?.nodes instanceof Map ? topoAny.nodes : new Map();
		const links: Link[] = Array.isArray(topoAny?.links) ? topoAny.links : [];

		if (!nodes.has(id)) return;

		const linksToRemove = links.filter((l: any) => {
			const ls = String(l?.source?.id ?? '');
			const lt = String(l?.target?.id ?? '');
			return ls === id || lt === id;
		});
		const linkIds = linksToRemove
			.map((l: any) => String(l?.id ?? ''))
			.filter((l: string) => l.length > 0);

		const applyDeleteNode = (topo: Topology): void => {
			const topoAny = topo as any;
			const nodes: Map<string, any> = topoAny?.nodes instanceof Map ? topoAny.nodes : new Map();
			const links: Link[] = Array.isArray(topoAny?.links) ? topoAny.links : [];
			if (!nodes.has(id)) return;

			const linksToRemove = links.filter((l: any) => {
				const ls = String(l?.source?.id ?? '');
				const lt = String(l?.target?.id ?? '');
				return ls === id || lt === id;
			});

			for (const l of linksToRemove) this.removeLinkInstance(topo, l);

			nodes.delete(id);
			topoAny.nodes = nodes;
		};

		this.withPastEditResolution(
			new Set([id]),
			new Set(linkIds),
			() => {
				this.pushUndoSnapshot();
				this.clearRedoStack();
				this.beginPendingEdit();

				applyDeleteNode(this.currentTopology());
				this.pushEvent(EventType.NODE_FAILURE, id, {});
			},
			applyDeleteNode
		);
	}

	/**
	 * Löscht einen Link zwischen zwei Routern.
	 * @param sourceId Erste Endpunkt-ID.
	 * @param targetId Zweite Endpunkt-ID.
	 */
	public deleteLink(sourceId: string, targetId: string): void {
		const sId = String(sourceId ?? '').trim();
		const tId = String(targetId ?? '').trim();
		if (!sId || !tId) return;

		const topo = this.currentTopology();
		const topoAny: any = topo;
		const links: Link[] = Array.isArray(topoAny?.links) ? topoAny.links : [];

		const link = links.find((l: any) => {
			const ls = String(l?.source?.id ?? '');
			const lt = String(l?.target?.id ?? '');
			return (ls === sId && lt === tId) || (ls === tId && lt === sId);
		});
		if (!link) return;
		const linkId = String((link as any)?.id ?? '');
		const affectedNodes = new Set([sId, tId].filter((v) => v));
		const affectedLinks = new Set(linkId ? [linkId] : []);

		const applyDeleteLink = (topo: Topology): void => {
			const topoAny = topo as any;
			const links: Link[] = Array.isArray(topoAny?.links) ? topoAny.links : [];
			const link = links.find((l: any) => {
				const ls = String(l?.source?.id ?? '');
				const lt = String(l?.target?.id ?? '');
				return (ls === sId && lt === tId) || (ls === tId && lt === sId);
			});
			if (!link) return;
			this.removeLinkInstance(topo, link);
		};

		this.withPastEditResolution(
			affectedNodes,
			affectedLinks,
			() => {
				this.pushUndoSnapshot();
				this.clearRedoStack();
				this.beginPendingEdit();

				applyDeleteLink(this.currentTopology());
				if (linkId) this.pushEvent(EventType.LINK_FAILURE, linkId, {});
			},
			applyDeleteLink
		);
	}

	/**
	 * Verschiebt einen Router auf neue Koordinaten.
	 * @param nodeId Router-ID.
	 * @param xPos Neue X-Position.
	 * @param yPos Neue Y-Position.
	 */
	public moveNode(nodeId: string, xPos: number, yPos: number): void {
		const id = String(nodeId ?? '').trim();
		if (!id) return;

		const topo = this.currentTopology() as any;
		const nodes: Map<string, any> = topo?.nodes instanceof Map ? topo.nodes : new Map();
		const n: any = nodes.get(id);
		if (!n) return;
		const applyMove = (topo: Topology): void => {
			const topoAny = topo as any;
			const nodes: Map<string, any> = topoAny?.nodes instanceof Map ? topoAny.nodes : new Map();
			const target = nodes.get(id);
			if (!target) return;

			const x = Number.isFinite(xPos) ? xPos : 0;
			const y = Number.isFinite(yPos) ? yPos : 0;

			target.xPos = x;
			target.yPos = y;
		};

		this.withPastEditResolution(
			new Set([id]),
			new Set(),
			() => {
				this.pushUndoSnapshot();
				this.clearRedoStack();

				const x = Number.isFinite(xPos) ? xPos : 0;
				const y = Number.isFinite(yPos) ? yPos : 0;
				applyMove(this.currentTopology());
				this.pushEvent(EventType.NODE_MOVE, id, { x, y });
			},
			applyMove
		);
	}

	/**
	 * Verschiebt mehrere Router in einem Schritt.
	 * @param updates Liste von Positionsänderungen.
	 */
	public moveNodes(updates: { id: string; xPos: number; yPos: number }[]): void {
		if (!updates?.length) return;

		const topoCheck = this.currentTopology() as any;
		const nodesCheck: Map<string, any> =
			topoCheck?.nodes instanceof Map ? topoCheck.nodes : new Map();
		const hasValid = updates.some((u) => nodesCheck.has(String(u.id ?? '').trim()));
		if (!hasValid) return;

		const affectedNodes = new Set(
			updates.map((u) => String(u.id ?? '').trim()).filter((id) => id && nodesCheck.has(id))
		);

		const applyMoveMany = (topo: Topology): void => {
			const topoAny = topo as any;
			const nodes: Map<string, any> = topoAny?.nodes instanceof Map ? topoAny.nodes : new Map();

			for (const u of updates ?? []) {
				const id = String(u.id ?? '').trim();
				if (!id) continue;
				const n: any = nodes.get(id);
				if (!n) continue;

				const x = Number.isFinite(u.xPos) ? u.xPos : 0;
				const y = Number.isFinite(u.yPos) ? u.yPos : 0;

				n.xPos = x;
				n.yPos = y;
			}
		};

		this.withPastEditResolution(
			affectedNodes,
			new Set(),
			() => {
				this.pushUndoSnapshot();
				this.clearRedoStack();

				applyMoveMany(this.currentTopology());
				for (const u of updates ?? []) {
					const id = String(u.id ?? '').trim();
					if (!id || !nodesCheck.has(id)) continue;
					const x = Number.isFinite(u.xPos) ? u.xPos : 0;
					const y = Number.isFinite(u.yPos) ? u.yPos : 0;
					this.pushEvent(EventType.NODE_MOVE, id, { x, y });
				}
			},
			applyMoveMany
		);
	}

	/**
	 * Führt ein Undo auf dem aktuellen History-Schritt aus.
	 */
	public undo(): void {
		if (!this.canUndo) return;

		const idx = Math.max(0, Math.min(this.currentStepIndex, this.history.length - 1));
		const currentSnapshot = this.cloneSimulationState(this.currentState());
		const prev = this.undoStack.pop()!;
		this.redoStack.push(currentSnapshot);

		const restored = this.cloneSimulationState(prev);
		if (idx < this.history.length) this.history[idx] = restored;
		else this.history = [restored];

		this.currentStepIndex = Math.max(0, Math.min(idx, this.history.length - 1));
		this.playing = false;

		this.clearPendingIfNoDiff();
	}

	/**
	 * Führt ein Redo auf dem aktuellen History-Schritt aus.
	 */
	public redo(): void {
		if (!this.canRedo) return;

		const idx = Math.max(0, Math.min(this.currentStepIndex, this.history.length - 1));
		const currentSnapshot = this.cloneSimulationState(this.currentState());
		const next = this.redoStack.pop()!;
		this.undoStack.push(currentSnapshot);

		const restored = this.cloneSimulationState(next);
		if (idx < this.history.length) this.history[idx] = restored;
		else this.history = [restored];

		this.currentStepIndex = Math.max(0, Math.min(idx, this.history.length - 1));
		this.playing = false;

		this.clearPendingIfNoDiff();
	}

	/**
	 * Berechnet kürzeste Wege ab einem Startknoten (Dijkstra).
	 * @param topo Zieltopologie.
	 * @param sourceId Startknoten.
	 * @returns Distanzmap pro Zielknoten.
	 */
	private computeShortestPaths(topo: Topology, sourceId: string): Map<string, number> {
		const topoAny: any = topo;
		const nodes = Array.from((topoAny?.nodes ?? new Map()).values()).filter(
			(n: any) => !(n as any)?.disabled
		);

		const dist = new Map<string, number>();
		const visited = new Set<string>();

		for (const n of nodes) {
			const id = String((n as any)?.id ?? '');
			if (!id) continue;
			dist.set(id, Number.POSITIVE_INFINITY);
		}
		dist.set(sourceId, 0);

		while (visited.size < nodes.length) {
			let currentId: string | null = null;
			let currentDist = Number.POSITIVE_INFINITY;

			for (const [id, d] of dist) {
				if (!visited.has(id) && d < currentDist) {
					currentDist = d;
					currentId = id;
				}
			}

			if (currentId === null || currentDist === Number.POSITIVE_INFINITY) break;

			visited.add(currentId);
			const currentNode: any = topoAny?.nodes?.get?.(currentId);
			if (!currentNode) continue;

			const neighbors: any[] = Array.isArray(currentNode?.neighbors) ? currentNode.neighbors : [];

			for (const link of neighbors) {
				const neighbor: any = link.otherSide(currentId);
				const neighborId = String(neighbor?.id ?? '');
				if (!neighborId || visited.has(neighborId)) continue;
				if ((neighbor as any)?.disabled) continue;

				const wRaw = Number((link as any)?.weight ?? 1);
				const weight = Number.isFinite(wRaw) && wRaw > 0 ? wRaw : 1;

				const alt = currentDist + weight;
				if (alt < (dist.get(neighborId) ?? Number.POSITIVE_INFINITY)) {
					dist.set(neighborId, alt);
				}
			}
		}

		return dist;
	}

	/**
	 * Vergleicht Router-IDs stabil über Label und Fallback-ID.
	 * @param aId Erste Router-ID.
	 * @param bId Zweite Router-ID.
	 * @param nodes Knotenmap für die Labelauflösung.
	 * @returns Vergleichswert wie bei `localeCompare`.
	 */
	private compareRouterIdsForDijkstra(aId: string, bId: string, nodes: Map<string, any>): number {
		const label = (id: string): string => {
			const n = nodes.get(id);
			const name = String(n?.name ?? '').trim();
			return name.length > 0 ? name : id;
		};
		const aLabel = label(aId);
		const bLabel = label(bId);
		const labelCmp = aLabel.localeCompare(bLabel, undefined, {
			numeric: true,
			sensitivity: 'base'
		});
		if (labelCmp !== 0) return labelCmp;
		return String(aId).localeCompare(String(bId), undefined, {
			numeric: true,
			sensitivity: 'base'
		});
	}

	/**
	 * Ermittelt den Schritt, ab dem Link-State-Ergebnisse als stabil gelten.
	 * @param topo Zieltopologie.
	 * @param sourceId Startknoten.
	 * @returns Stabilitätsschritt oder `null`.
	 */
	private computeDijkstraStableStep(topo: Topology, sourceId: string): number | null {
		const topoAny: any = topo;
		const nodes: Map<string, Router> = asNodes(topoAny);
		const rid = String(sourceId ?? '').trim();
		if (!rid) return null;

		const sourceNode = nodes.get(rid);
		if (!sourceNode || (sourceNode as any)?.disabled) return null;

		const routerIds = Array.from(nodes.entries())
			.filter(([, node]) => !(node as any)?.disabled)
			.map(([id]) => String(id));

		if (!routerIds.includes(rid)) return null;

		routerIds.sort((a, b) => this.compareRouterIdsForDijkstra(a, b, nodes));

		const adjacency = new Map<string, Map<string, number>>();
		const links: any[] = asLinks(topoAny);

		for (const l of links) {
			const sId = readId(l?.source?.id);
			const tId = readId(l?.target?.id);
			if (!sId || !tId) continue;

			const sNode = nodes.get(sId);
			const tNode = nodes.get(tId);
			if (!sNode || !tNode) continue;
			if ((sNode as any)?.disabled || (tNode as any)?.disabled) continue;

			const wRaw = Number(l?.weight ?? 1);
			const w = Number.isFinite(wRaw) && wRaw > 0 ? wRaw : 1;

			if (!adjacency.has(sId)) adjacency.set(sId, new Map());
			if (!adjacency.has(tId)) adjacency.set(tId, new Map());
			adjacency.get(sId)!.set(tId, w);
			adjacency.get(tId)!.set(sId, w);
		}

		const dist = new Map<string, number>();
		const hops = new Map<string, number>();
		const visited = new Set<string>();

		for (const id of routerIds) {
			dist.set(id, Number.POSITIVE_INFINITY);
			hops.set(id, Number.POSITIVE_INFINITY);
		}

		dist.set(rid, 0);
		hops.set(rid, 0);
		visited.add(rid);

		const sourceNeighbors = adjacency.get(rid) ?? new Map();
		for (const [nb, weight] of sourceNeighbors.entries()) {
			dist.set(nb, weight);
			hops.set(nb, 1);
		}

		let lastChangeStep = 0;
		let step = 1;

		while (visited.size < routerIds.length) {
			let nextId: string | null = null;
			let nextDist = Number.POSITIVE_INFINITY;
			let nextHops = Number.POSITIVE_INFINITY;

			for (const id of routerIds) {
				if (visited.has(id)) continue;
				const d = dist.get(id) ?? Number.POSITIVE_INFINITY;
				const h = hops.get(id) ?? Number.POSITIVE_INFINITY;
				if (d < nextDist) {
					nextDist = d;
					nextHops = h;
					nextId = id;
				} else if (d === nextDist) {
					if (h < nextHops) {
						nextHops = h;
						nextId = id;
					} else if (h === nextHops && nextId) {
						const cmp = this.compareRouterIdsForDijkstra(id, nextId, nodes);
						if (cmp < 0) nextId = id;
					}
				}
			}

			if (!nextId || nextDist === Number.POSITIVE_INFINITY) break;

			visited.add(nextId);

			let changed = false;
			const neighbors = adjacency.get(nextId) ?? new Map();
			for (const [nb, weight] of neighbors.entries()) {
				if (visited.has(nb)) continue;
				const alt = nextDist + weight;
				const cur = dist.get(nb) ?? Number.POSITIVE_INFINITY;
				const curHops = hops.get(nb) ?? Number.POSITIVE_INFINITY;
				const altHops = (hops.get(nextId) ?? 0) + 1;

				if (alt < cur || (alt === cur && altHops < curHops)) {
					dist.set(nb, alt);
					hops.set(nb, altHops);
					changed = true;
				}
			}

			if (changed) lastChangeStep = step;
			step += 1;
		}

		return lastChangeStep;
	}

	/**
	 * Berechnet die tatsächlichen Pfadkosten entlang der Next-Hop-Kette.
	 * @param topo Zieltopologie.
	 * @param sourceId Startknoten.
	 * @param targetId Zielknoten.
	 * @returns Pfadkosten oder `null` bei inkonsistenter Route.
	 */
	private computeRoutingPathCost(
		topo: Topology,
		sourceId: string,
		targetId: string
	): number | null {
		const topoAny: any = topo;
		const nodes: Map<string, any> = asNodes(topoAny);

		if (!nodes.has(sourceId) || !nodes.has(targetId)) return null;

		const src = nodes.get(sourceId);
		const tgt = nodes.get(targetId);
		if ((src as any)?.disabled || (tgt as any)?.disabled) return null;

		const visited = new Set<string>();
		let currentId = sourceId;
		let total = 0;
		const maxHops = Math.max(1, nodes.size + 1);

		for (let i = 0; i < maxHops; i++) {
			if (currentId === targetId) return total;
			if (visited.has(currentId)) return null;
			visited.add(currentId);

			const node = nodes.get(currentId);
			if (!node || (node as any)?.disabled) return null;

			const table = (node as any)?.routingTable;
			const entry = table?.entries?.get?.(targetId);
			if (!entry) return null;

			const nextHopId = String((entry as any)?.nextHopId ?? '').trim();
			if (!nextHopId || nextHopId === '-' || nextHopId === currentId) return null;

			const nextNode = nodes.get(nextHopId);
			if (!nextNode || (nextNode as any)?.disabled) return null;

			const neighbors: any[] = Array.isArray((node as any)?.neighbors)
				? (node as any).neighbors
				: [];
			let chosen: any = null;
			for (const link of neighbors) {
				const ls = readId(link?.source?.id);
				const lt = readId(link?.target?.id);
				if ((ls === currentId && lt === nextHopId) || (lt === currentId && ls === nextHopId)) {
					chosen = link;
					break;
				}
			}

			if (!chosen) return null;

			const wRaw = Number((chosen as any)?.weight ?? 1);
			const weight = Number.isFinite(wRaw) && wRaw > 0 ? wRaw : 1;
			total += weight;
			currentId = nextHopId;
		}

		return null;
	}

	/**
	 * Aktualisiert das `optimal`-Flag für alle aktiven Router.
	 * @param topo Zieltopologie.
	 * @param stepNumber Optionaler Referenzschritt.
	 */
	private updateRouterOptimalFlags(topo: Topology, stepNumber?: number): void {
		const topoAny: any = topo;
		const nodes = Array.from((topoAny?.nodes ?? new Map()).values());
		const routers = nodes.filter((n: any) => !(n as any)?.disabled) as any[];

		const rawStep = Number.isFinite(Number(stepNumber))
			? Math.max(0, Math.floor(Number(stepNumber)))
			: null;
		const isLinkState = this.algorithmType === RoutingAlgorithmType.LINK_STATE;
		const step = isLinkState && rawStep !== null ? this.sequenceIndexForStep(rawStep) : rawStep;

		for (const router of routers) {
			const routerId = String((router as any)?.id ?? '');
			if (!routerId) continue;
			if ((router as any)?.disabled) {
				(router as any).optimal = false;
				continue;
			}

			const routingEntries: Map<string, any> =
				router?.routingTable?.entries ?? new Map<string, any>();

			const optimalDistances = this.computeShortestPaths(topo, routerId);

			if (isLinkState && step !== null) {
				const requiredStep = this.computeDijkstraStableStep(topo, routerId);
				if (requiredStep !== null && step < requiredStep) {
					(router as any).optimal = false;
					continue;
				}
			}

			let allOptimal = true;
			for (const other of routers) {
				const destId = String((other as any)?.id ?? '');
				if (!destId || destId === routerId) continue;

				const best = optimalDistances.get(destId);
				const entry = routingEntries.get(destId);
				const entryCost = Number((entry as any)?.cost ?? Number.POSITIVE_INFINITY);
				const nextHopId = String((entry as any)?.nextHopId ?? '').trim();

				let isOptimal: boolean;
				if (best === undefined) {
					isOptimal = false;
				} else if (best === Number.POSITIVE_INFINITY) {
					isOptimal =
						!!entry &&
						entryCost === Number.POSITIVE_INFINITY &&
						(nextHopId.length === 0 || nextHopId === '-');
				} else {
					const pathCost = this.computeRoutingPathCost(topo, routerId, destId);
					isOptimal = !!entry && entryCost === best && pathCost !== null && pathCost === best;
				}

				if (!isOptimal) {
					allOptimal = false;
					break;
				}
			}

			(router as any).optimal = allOptimal;
		}
	}

	/**
	 * Berechnet bzw. navigiert zum nächsten Simulationsschritt.
	 */
	public nextStep(): void {
		if (this.commitPendingEditsIfAny()) return;
		// If we already have a future state, just move the cursor forward.
		const nextIndex = this.currentStepIndex + 1;
		if (nextIndex < this.history.length) {
			if (nextIndex !== this.currentStepIndex) this.clearUndoRedoStacks();
			this.currentStepIndex = nextIndex;
			return;
		}

		this.clearUndoRedoStacks();

		const currentTopo = this.currentTopology();
		const nextSeqIndex = this.sequenceIndexForStep(this.currentStepIndex) + 1;

		const isDV =
			this.algorithmType === RoutingAlgorithmType.DISTANCE_VECTOR ||
			this.algorithmType === RoutingAlgorithmType.DISTANCE_VECTOR_POISONED;
		const isLS = this.algorithmType === RoutingAlgorithmType.LINK_STATE;

		const runSend = (topo: Topology): void => {
			for (const node of (topo as any).nodes.values()) {
				const n: any = node;
				if ((n as any)?.disabled) continue;
				const algo = n.algorithm;
				if (algo && typeof algo.executeStep === 'function') {
					algo.executeStep(n, topo);
				}
			}
		};

		const runRecompute = (topo: Topology): void => {
			for (const node of (topo as any).nodes.values()) {
				const n: any = node;
				if ((n as any)?.disabled) continue;
				const algo = n.algorithm;
				if (algo && typeof algo.receivePackets === 'function') {
					algo.receivePackets(n, topo);
				}
			}
		};

		if (isDV) {
			const isOddStep = nextSeqIndex % 2 === 1;
			if (isOddStep) {
				// Create SEND snapshot then RECOMPUTE snapshot in one "next".
				const sendTopo = this.cloneTopology(currentTopo);
				this.refreshDistanceVector(sendTopo, true, false);
				(sendTopo as any).sentLinkIds = [];
				runSend(sendTopo);
				this.updateRouterOptimalFlags(sendTopo);
				const sendState = new SimulationState(nextIndex, sendTopo);
				(sendState as any).stepType = 'send';
				this.history.push(sendState);

				const recomputeIndex = nextIndex + 1;
				const recomputeTopo = this.cloneTopology(sendTopo);
				runRecompute(recomputeTopo);
				this.updateRouterOptimalFlags(recomputeTopo);
				const recomputeState = new SimulationState(recomputeIndex, recomputeTopo);
				(recomputeState as any).stepType = 'recompute';
				this.history.push(recomputeState);
				this.currentStepIndex = recomputeIndex;
				return;
			}

			// If we're on a send step (odd) and step forward, just recompute.
			const topo = this.cloneTopology(currentTopo);
			runRecompute(topo);
			this.updateRouterOptimalFlags(topo);
			const recomputeState = new SimulationState(nextIndex, topo);
			(recomputeState as any).stepType = 'recompute';
			this.history.push(recomputeState);
			this.currentStepIndex = nextIndex;
			return;
		}

		// --- LS: keep current behavior, but ignore update steps for phase parity ---
		const topo = this.cloneTopology(currentTopo);
		const isSendPhase = !(isLS && nextSeqIndex % 2 === 1);
		if (isSendPhase) {
			runSend(topo);
		}
		this.updateRouterOptimalFlags(topo, nextIndex);
		const nextState = new SimulationState(nextIndex, topo);
		(nextState as any).stepType = isSendPhase ? 'send' : 'recompute';
		this.history.push(nextState);
		this.currentStepIndex = nextIndex;
	}

	/**
	 * Öffentliche Hülle für die kürzeste-Wege-Berechnung.
	 * @param topo Zieltopologie.
	 * @param sourceId Startknoten.
	 * @returns Distanzmap pro Zielknoten.
	 */
	public computeShortestPathsForTopology(topo: Topology, sourceId: string): Map<string, number> {
		return this.computeShortestPaths(topo, sourceId);
	}

	// ------------------------------------------------------------ JSON ------------------------------------------------------------ //

	/**
	 * Ermittelt den tatsächlich aus Routingtabellen resultierenden Weiterleitungspfad.
	 * @param sourceId Startknoten.
	 * @param targetId Zielknoten.
	 * @returns Knoten- und Linkpfad der Weiterleitung.
	 */
	public computeActualPath(
		sourceId: string,
		targetId: string
	): { nodePath: string[]; linkPath: string[] } {
		const topo = this.currentTopology();
		const nodes: Map<string, any> = topo?.nodes instanceof Map ? topo.nodes : new Map();

		// Safety check
		if (!nodes.has(sourceId) || !nodes.has(targetId)) {
			return { nodePath: [], linkPath: [] };
		}

		const nodePath: string[] = [sourceId];
		const linkPath: string[] = [];
		const visited = new Set<string>();

		let currentId = sourceId;

		for (let i = 0; i < 100; i++) {
			if (currentId === targetId) {
				return { nodePath, linkPath };
			}

			if (visited.has(currentId)) break;
			visited.add(currentId);

			const node = nodes.get(currentId);
			if (!node) break;

			if ((node as any).disabled) break;

			const table = (node as any).routingTable;
			if (!table) break;

			const entry = table.entries.get(targetId);
			if (!entry) break;

			const nextHopId = entry.nextHopId;
			if (!nextHopId || nextHopId === '-' || nextHopId === currentId) break;

			const neighbors = (node as any).neighbors || [];
			let chosenLink: any = null;
			for (const link of neighbors) {
				const other = link.otherSide(currentId);
				if (other && (other.id === nextHopId || (other as any).id === nextHopId)) {
					chosenLink = link;
					break;
				}
			}

			if (!chosenLink) break;

			linkPath.push(String(chosenLink.id));
			nodePath.push(nextHopId);
			currentId = nextHopId;
		}

		return { nodePath, linkPath };
	}

	/**
	 * Importiert eine Simulation aus JSON und initialisiert alle abhängigen Zustände neu.
	 * @param jsonString JSON im Exportformat.
	 */
	public importJson(jsonString: string): void {
		const res = Json.importJson(jsonString);

		this.clearUndoRedoStacks();

		this.playing = false;
		this.currentStepIndex = 0;

		this.algorithmType = res.algorithm;

		const applyAlgorithmToTopology = (topo: Topology): void => {
			for (const node of (topo as any).nodes.values()) {
				const n: any = node;

				const impl = this.createAlgorithmInstance();
				if (!impl) continue;

				if (typeof n.setAlgorithm === 'function') n.setAlgorithm(impl);
				else n.algorithm = impl;
			}
		};

		const history: SimulationState[] = [];

		for (const entry of res.states) {
			const topo = this.cloneTopology(entry.topology);
			applyAlgorithmToTopology(topo);
			this.buildDvStateFromRoutingTables(topo);

			const st = new SimulationState(entry.step, topo);
			if ((entry as any)?.stepType) (st as any).stepType = (entry as any).stepType;
			st.executedEvents = Array.isArray(entry.events)
				? entry.events.map((e) => this.cloneSimulationEvent(e))
				: [];

			history.push(st);
		}

		history.sort((a, b) => (a?.stepNumber ?? 0) - (b?.stepNumber ?? 0));

		if (history.length === 0) {
			const emptyTopo = new Topology(new Map(), []);
			history.push(new SimulationState(0, emptyTopo));
		}

		this.history = history;
		this.currentStepIndex = 0;
		for (let i = 0; i < this.history.length; i++) {
			const st = this.history[i];
			if (!st?.topologyState) continue;
			this.updateRouterOptimalFlags(st.topologyState, (st as any)?.stepNumber ?? i);
		}
		this.initialTopology = this.cloneTopology(history[0].topologyState);

		// Restore DV "updated" flags based on history so send steps behave as expected.
		if (this.isDistanceVectorAlgorithm()) {
			const routingEntriesSnapshot = (
				node: any
			): Map<string, { cost: number; nextHop: string }> => {
				const out = new Map<string, { cost: number; nextHop: string }>();
				const entries = node?.routingTable?.entries;
				const map = entries instanceof Map ? entries : new Map();
				for (const [destId, entry] of map.entries()) {
					const cost = Number(entry?.cost ?? Infinity);
					const nextHop = String(entry?.nextHopId ?? '-');
					out.set(String(destId), {
						cost: Number.isFinite(cost) ? cost : Infinity,
						nextHop: nextHop.length > 0 ? nextHop : '-'
					});
				}
				return out;
			};

			const routingTableChanged = (prevNode: any, nextNode: any): boolean => {
				if (!prevNode || !nextNode) return true;
				const prevMap = routingEntriesSnapshot(prevNode);
				const nextMap = routingEntriesSnapshot(nextNode);
				const keys = new Set<string>();
				for (const k of prevMap.keys()) keys.add(k);
				for (const k of nextMap.keys()) keys.add(k);
				for (const k of keys) {
					const prevHas = prevMap.has(k);
					const nextHas = nextMap.has(k);
					if (prevHas !== nextHas) return true;
					const prev = prevMap.get(k) ?? { cost: Infinity, nextHop: '-' };
					const next = nextMap.get(k) ?? { cost: Infinity, nextHop: '-' };
					if (prev.cost !== next.cost || prev.nextHop !== next.nextHop) return true;
				}
				return false;
			};

			const inferStepType = (idx: number): string => {
				const st: any = this.history[idx];
				const explicit = String(st?.stepType ?? '').trim();
				if (explicit) return explicit;
				if (idx === 0) return 'init';
				const seq = this.sequenceIndexForStep(idx, this.history);
				return seq % 2 === 0 ? 'recompute' : 'send';
			};

			const lastUpdatedByRouter = new Map<string, boolean>();
			for (let i = 0; i < this.history.length; i++) {
				const st: any = this.history[i];
				const topo = st?.topologyState;
				if (!topo) continue;
				const nodes = asNodes(topo as any);
				const prevTopo = i > 0 ? (this.history[i - 1] as any)?.topologyState : null;
				const prevNodes = prevTopo ? asNodes(prevTopo as any) : new Map<string, any>();
				const stepType = inferStepType(i);
				const isSendStep = stepType === 'send';

				for (const [id, node] of nodes.entries()) {
					const rid = String(id ?? '');
					if (!rid) continue;
					const dvState = (node as any)?.dvState;
					if (!dvState) continue;
					if (isSendStep) {
						dvState.updated = lastUpdatedByRouter.get(rid) ?? true;
						continue;
					}

					const prevNode = prevNodes.get(rid);
					const updated = routingTableChanged(prevNode, node);
					dvState.updated = updated;
					lastUpdatedByRouter.set(rid, updated);
				}
			}
		}

		// Keep algorithm type but avoid recomputing DV tables on import.
		this.updateRouterOptimalFlags(
			this.currentTopology(),
			(this.currentState() as any)?.stepNumber ?? 0
		);
	}

	/**
	 * Exportiert die komplette History als JSON.
	 * @returns JSON-Dokument der Simulation.
	 */
	public exportJson(): string {
		return Json.exportJson(this.history, this.algorithmType);
	}
}
