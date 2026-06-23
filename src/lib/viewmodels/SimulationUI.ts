import { get, type Writable } from 'svelte/store';

import type {
	SimulationController,
	PlacementMode,
	ConflictInfo
} from '../model/SimulationController';
import { RoutingAlgorithmType, type AlgorithmType } from '../model/RoutingAlgorithmType';
import type { SimulationEvent } from '../model/SimulationEvent';
import type { SimulationState } from '../model/SimulationState';
import { Topology } from '../model/Topology';

import type { UIState, ExplainCell } from './uiState';
import { createInitialPacketPreview } from './uiState';

/**
 * Kapselt alle UI-Aktionen fuer die Simulation und synchronisiert Store-Zustaende.
 */
export class SimulationUI {
	public readonly simulation: Writable<SimulationController>;
	public readonly uiState: Writable<UIState>;
	private playbackTimer: number | null = null;
	private confirmHandler: ((optionId: string) => void) | null = null;

	/**
	 * Initialisiert die UI-Fassade und registriert den Konflikt-Resolver am Controller.
	 */
	public constructor(simulation: Writable<SimulationController>, uiState: Writable<UIState>) {
		this.simulation = simulation;
		this.uiState = uiState;

		this.simulation.subscribe((controller) => {
			if (controller && typeof (controller as any).setConflictResolver === 'function') {
				(controller as any).setConflictResolver(this.conflictResolver);
			}
		});
	}

	/**
	 * Fragt bei Konflikten mit zukuenftigen Schritten eine Bestaetigung durch den Nutzer an.
	 */
	private readonly conflictResolver = (
		conflicts: ConflictInfo,
		proceed: () => void,
		cancel: () => void
	): void => {
		const start = conflicts.currentStep + 1;
		const end = conflicts.currentStep + conflicts.futureSteps;

		this.openConfirmMenu(
			{
				title: 'Future conflicts detected',
				message:
					`You are editing step ${conflicts.currentStep}, but there ` +
					`are ${conflicts.conflictCount} future event(s) touching the same router/link. ` +
					`Continue to delete steps ${start} to ${end}.`,
				options: [
					{ id: 'abort', label: 'Abort change', intent: 'neutral' },
					{
						id: 'truncate',
						label: 'Delete future steps',
						intent: 'danger',
						description: 'Remove all steps after the current one and apply the change.'
					}
				]
			},
			(optionId) => {
				if (optionId === 'truncate') {
					this.simulation.update((controller) => {
						proceed();
						this.syncUndoRedo(controller);
						return controller;
					});
					return;
				}
				cancel();
			}
		);
	};

	/**
	 * Uebernimmt den Undo/Redo-Status aus dem Controller in den UI-Store.
	 */
	private syncUndoRedo(controller: SimulationController): void {
		this.uiState.update((s) => ({
			...s,
			canUndo: controller.canUndo,
			canRedo: controller.canRedo
		}));
	}

	/**
	 * Stoppt einen laufenden Playback-Timer und setzt die Referenz zurueck.
	 */
	private clearPlaybackTimer(): void {
		if (this.playbackTimer !== null) {
			clearInterval(this.playbackTimer);
			this.playbackTimer = null;
		}
	}

	/**
	 * Schaltet zwischen einem Platzierungsmodus und "none" um.
	 */
	public togglePlacementMode(mode: PlacementMode): void {
		const prev = (get(this.uiState) as any)?.placementMode as PlacementMode;

		let next: PlacementMode = prev;
		this.uiState.update((s) => {
			const cur = (s?.placementMode ?? 'none') as PlacementMode;
			next = cur === mode ? 'none' : mode;

			return {
				...s,
				placementMode: next,
				linkDraftSourceId: next === 'link' ? s.linkDraftSourceId : null
			};
		});

		if (
			(prev === 'sendpacket' && next !== 'sendpacket') ||
			(prev !== 'sendpacket' && next === 'sendpacket')
		) {
			this.clearPacketPreview();
		}
	}

	/**
	 * Setzt den Platzierungsmodus auf "none" und verwirft einen offenen Link-Entwurf.
	 */
	public clearPlacementMode(): void {
		const prev = (get(this.uiState) as any)?.placementMode as PlacementMode;

		this.uiState.update((s) => ({
			...s,
			placementMode: 'none',
			linkDraftSourceId: null
		}));

		if (prev === 'sendpacket') this.clearPacketPreview();
	}

	/**
	 * Setzt das Link-Gewicht als positive ganze Zahl mit Fallback auf 1.
	 */
	public setLinkWeight(value: number): void {
		const w = Math.floor(Number(value));
		const nextW = Number.isFinite(w) && w > 0 ? w : 1;
		this.uiState.update((s) => ({ ...s, linkWeight: nextW }));
	}

	/**
	 * Speichert die aktuell ausgewaehlte Router-ID.
	 */
	public setSelectedRouter(id: string | null): void {
		this.uiState.update((s) => ({ ...s, selectedRouterId: id }));
	}

	/**
	 * Aktualisiert die Quell-ID eines laufenden Link-Entwurfs.
	 */
	public setLinkDraftSourceId(id: string | null): void {
		const rid = id ? String(id).trim() : '';
		this.uiState.update((s) => ({ ...s, linkDraftSourceId: rid.length > 0 ? rid : null }));
	}

	/**
	 * Setzt, ob die Arbeitsflaeche gerade ein Drag-over anzeigt.
	 */
	public setIsDragOver(value: boolean): void {
		this.uiState.update((s) => ({ ...s, isDragOver: !!value }));
	}

	/**
	 * Oeffnet oder schliesst das Hauptmenue und synchronisiert konkurrierende Panels.
	 */
	public toggleMenuOpen(): void {
		let nextOpen = false;
		this.uiState.update((s) => {
			nextOpen = !s.menuOpen;
			return {
				...s,
				menuOpen: nextOpen,
				historyCompactOpen: nextOpen ? false : s.historyCompactOpen,
				showDebugModal: nextOpen ? false : s.showDebugModal,
				showHistoryModal: nextOpen ? false : s.showHistoryModal,
				showDijkstraModal: nextOpen ? false : s.showDijkstraModal,
				showScenarioModal: nextOpen ? false : s.showScenarioModal
			};
		});
		if (!nextOpen) this.clearPlacementMode();
	}

	/**
	 * Oeffnet oder schliesst das Debug-Modal und sorgt fuer konsistente UI-Zustaende.
	 */
	public setShowDebugModal(open: boolean): void {
		const next = !!open;
		if (next) this.clearPlacementMode();
		this.uiState.update((s) => ({
			...s,
			showDebugModal: next,
			historyCompactOpen: next ? false : s.historyCompactOpen,
			showHistoryModal: next ? false : s.showHistoryModal,
			showDijkstraModal: next ? false : s.showDijkstraModal,
			showScenarioModal: next ? false : s.showScenarioModal,
			menuOpen: next ? false : s.menuOpen,
			selectedRouterId: next ? null : s.selectedRouterId
		}));
	}

	/**
	 * Schaltet die Debug-Konsole frei oder sperrt sie wieder.
	 */
	public setDebugUnlocked(open: boolean): void {
		const next = !!open;
		this.uiState.update((s) => ({
			...s,
			debugUnlocked: next,
			showDebugModal: next ? s.showDebugModal : false
		}));
	}

	/**
	 * Schaltet den globalen Hilfe-Modus fuer sichtbare Tooltip-Hinweise um.
	 */
	public toggleHelpMode(): void {
		this.uiState.update((s) => ({ ...s, helpMode: !s.helpMode }));
	}

	/**
	 * Setzt den globalen Hilfe-Modus explizit.
	 */
	public setHelpMode(open: boolean): void {
		this.uiState.update((s) => ({ ...s, helpMode: !!open }));
	}

	/**
	 * Oeffnet oder schliesst das History-Modal und deaktiviert konkurrierende Bereiche.
	 */
	public setShowHistoryModal(open: boolean): void {
		const next = !!open;
		if (next) this.clearPlacementMode();
		this.uiState.update((s) => ({
			...s,
			showHistoryModal: next,
			historyCompactOpen: next ? s.historyCompactOpen : false,
			showDijkstraModal: next ? false : s.showDijkstraModal,
			showDebugModal: next ? false : s.showDebugModal,
			showScenarioModal: next ? false : s.showScenarioModal,
			menuOpen: next ? false : s.menuOpen,
			selectedRouterId: next ? null : s.selectedRouterId
		}));
	}

	/**
	 * Oeffnet oder schliesst das Dijkstra-Modal und schliesst andere Modals bei Bedarf.
	 */
	public setShowDijkstraModal(open: boolean): void {
		const next = !!open;
		if (next) this.clearPlacementMode();
		this.uiState.update((s) => ({
			...s,
			showDijkstraModal: next,
			historyCompactOpen: next ? false : s.historyCompactOpen,
			showHistoryModal: next ? false : s.showHistoryModal,
			showDebugModal: next ? false : s.showDebugModal,
			showScenarioModal: next ? false : s.showScenarioModal,
			menuOpen: next ? false : s.menuOpen
		}));
	}

	/**
	 * Markiert, ob die Historienansicht im Kompaktmodus geoeffnet ist.
	 */
	public setHistoryCompactOpen(open: boolean): void {
		const next = !!open;
		this.uiState.update((s) => ({
			...s,
			historyCompactOpen: s.showHistoryModal ? next : false
		}));
	}

	/**
	 * Setzt den Router-Filter fuer die Historienansicht.
	 */
	public setHistoryFilterRouterId(routerId: string | null): void {
		const rid = routerId ? String(routerId).trim() : '';
		this.uiState.update((s) => ({ ...s, historyFilterRouterId: rid.length > 0 ? rid : null }));
	}

	/**
	 * Oeffnet oder schliesst das Szenario-Modal und raeumt konkurrierende Zustaende auf.
	 */
	public setShowScenarioModal(open: boolean): void {
		const next = !!open;
		if (next) this.clearPlacementMode();
		this.uiState.update((s) => ({
			...s,
			showScenarioModal: next,
			historyCompactOpen: next ? false : s.historyCompactOpen,
			showDebugModal: next ? false : s.showDebugModal,
			showHistoryModal: next ? false : s.showHistoryModal,
			showDijkstraModal: next ? false : s.showDijkstraModal,
			menuOpen: next ? false : s.menuOpen,
			selectedRouterId: next ? null : s.selectedRouterId
		}));
	}

	/**
	 * Blendet das Surfer-Easter-Egg ein oder aus.
	 */
	public setShowSurfer(open: boolean): void {
		this.uiState.update((s) => ({ ...s, showSurfer: !!open }));
	}

	/**
	 * Aktiviert oder deaktiviert einen Router im zugrunde liegenden Controller.
	 */
	public setRouterDisabled(routerId: string, disabled: boolean): void {
		this.simulation.update((controller) => {
			(controller as any).setRouterDisabled(routerId, disabled);
			this.syncUndoRedo(controller);
			return controller;
		});
	}

	/**
	 * Oeffnet ein konfigurierbares Bestaetigungsmenue und registriert optionalen Callback.
	 */
	public openConfirmMenu(
		cfg: {
			title: string;
			message: string;
			options: {
				id: string;
				label: string;
				intent?: 'primary' | 'danger' | 'neutral';
				description?: string;
			}[];
		},
		onSelect?: (optionId: string) => void
	): void {
		this.confirmHandler = typeof onSelect === 'function' ? onSelect : null;
		const opts = Array.isArray(cfg?.options) ? cfg.options : [];
		this.uiState.update((s) => ({
			...s,
			confirmMenu: {
				open: true,
				title: String(cfg?.title ?? ''),
				message: String(cfg?.message ?? ''),
				options: opts.map((o) => ({
					id: String(o?.id ?? ''),
					label: String(o?.label ?? ''),
					intent: o?.intent ?? 'primary',
					description: o?.description ? String(o.description) : undefined
				}))
			}
		}));
	}

	/**
	 * Schliesst das Bestaetigungsmenue und entfernt den zugehoerigen Handler.
	 */
	public closeConfirmMenu(): void {
		this.confirmHandler = null;
		this.uiState.update((s) => ({
			...s,
			confirmMenu: { open: false, title: '', message: '', options: [] }
		}));
	}

	/**
	 * Waehlt eine Option im Bestaetigungsmenue aus und ruft den Handler auf.
	 */
	public chooseConfirmOption(optionId: string): void {
		const handler = this.confirmHandler;
		this.closeConfirmMenu();
		if (typeof handler === 'function') handler(optionId);
	}

	/**
	 * Setzt das Wiedergabe-Intervall in Millisekunden und startet laufendes Playback neu.
	 */
	public setPlaybackInterval(ms: number): void {
		const n = Math.floor(Number(ms));
		// Auf sinnvollen Bereich begrenzen, um zu kleine/zu grosse Intervalle zu vermeiden.
		const clamped = Math.max(250, Math.min(n, 5000));
		this.uiState.update((s) => ({ ...s, playbackIntervalMs: clamped }));

		if (this.playbackTimer !== null && typeof window !== 'undefined') {
			// Timer mit neuem Intervall neu starten, ohne sofort einen Schritt auszufuehren.
			this.clearPlaybackTimer();
			this.playbackTimer = window.setInterval(() => {
				this.simulation.update((controller) => {
					controller.nextStep();
					this.syncUndoRedo(controller);
					return controller;
				});
			}, clamped);
		}
	}

	/**
	 * Zeigt einen Fehler-Toast mit bereinigter Nachricht an.
	 */
	public showErrorToast(message: string): void {
		const msg = String(message ?? '').trim();
		if (!msg) return;
		this.uiState.update((s) => ({
			...s,
			errorToast: { open: true, message: msg }
		}));
	}

	/**
	 * Blendet den Fehler-Toast aus und leert die Nachricht.
	 */
	public hideErrorToast(): void {
		this.uiState.update((s) => ({
			...s,
			errorToast: { open: false, message: '' }
		}));
	}

	/**
	 * Startet die Wiedergabe, fuehrt sofort einen Schritt aus und plant weitere Schritte.
	 */
	public play(): void {
		if (typeof window === 'undefined') return;

		const interval = Math.max(
			250,
			Math.min(Number((get(this.uiState) as any)?.playbackIntervalMs ?? 2000), 5000)
		);

		this.clearPlaybackTimer();

		this.simulation.update((controller) => {
			controller.play();
			this.syncUndoRedo(controller);
			return controller;
		});

		// Sofort einen Schritt ausfuehren, danach im konfigurierten Intervall weiterschalten.
		this.simulation.update((controller) => {
			controller.nextStep();
			this.syncUndoRedo(controller);
			return controller;
		});

		this.playbackTimer = window.setInterval(() => {
			this.simulation.update((controller) => {
				controller.nextStep();
				this.syncUndoRedo(controller);
				return controller;
			});
		}, interval);
	}

	/**
	 * Pausiert die Wiedergabe und stoppt den Playback-Timer.
	 */
	public pause(): void {
		this.clearPlaybackTimer();
		this.simulation.update((controller) => {
			controller.pause();
			this.syncUndoRedo(controller);
			return controller;
		});
	}

	/**
	 * Setzt den Routing-Algorithmus anhand eines Typs oder Alias-Namens.
	 */
	public setAlgorithm(algo: AlgorithmType | string): void {
		const s = String(algo ?? '').trim();
		let selectedAlgo: RoutingAlgorithmType;

		if (s === RoutingAlgorithmType.LINK_STATE) selectedAlgo = RoutingAlgorithmType.LINK_STATE;
		else if (s === RoutingAlgorithmType.DISTANCE_VECTOR)
			selectedAlgo = RoutingAlgorithmType.DISTANCE_VECTOR;
		else if (s === RoutingAlgorithmType.DISTANCE_VECTOR_POISONED)
			selectedAlgo = RoutingAlgorithmType.DISTANCE_VECTOR_POISONED;
		else if (s === 'link') selectedAlgo = RoutingAlgorithmType.LINK_STATE;
		else if (s === 'distance') selectedAlgo = RoutingAlgorithmType.DISTANCE_VECTOR;
		else if (s === 'distancePoisoned') selectedAlgo = RoutingAlgorithmType.DISTANCE_VECTOR_POISONED;
		else throw new Error(`Unknown algorithm type: ${s}`);

		let changed = false;
		this.simulation.update((controller) => {
			const currentAlgo = String((controller as any)?.algorithm ?? '');
			changed = currentAlgo !== selectedAlgo;
			controller.setAlgorithm(selectedAlgo);
			this.syncUndoRedo(controller);
			return controller;
		});

		if (changed) {
			this.uiState.update((state) => ({
				...state,
				showHistoryModal: false,
				showDijkstraModal: false,
				historyCompactOpen: false,
				routingHover: { sourceId: null, targetId: null }
			}));
		}
	}

	/**
	 * Wechselt den Algorithmus und rekonstruiert die History mit bestehenden Topologien.
	 */
	public setAlgorithmKeepingHistory(algo: AlgorithmType | string): void {
		const s = String(algo ?? '').trim();
		let selectedAlgo: RoutingAlgorithmType;

		if (s === RoutingAlgorithmType.LINK_STATE) selectedAlgo = RoutingAlgorithmType.LINK_STATE;
		else if (s === RoutingAlgorithmType.DISTANCE_VECTOR)
			selectedAlgo = RoutingAlgorithmType.DISTANCE_VECTOR;
		else if (s === RoutingAlgorithmType.DISTANCE_VECTOR_POISONED)
			selectedAlgo = RoutingAlgorithmType.DISTANCE_VECTOR_POISONED;
		else if (s === 'link') selectedAlgo = RoutingAlgorithmType.LINK_STATE;
		else if (s === 'distance') selectedAlgo = RoutingAlgorithmType.DISTANCE_VECTOR;
		else if (s === 'distancePoisoned') selectedAlgo = RoutingAlgorithmType.DISTANCE_VECTOR_POISONED;
		else throw new Error(`Unknown algorithm type: ${s}`);

		let changed = false;
		this.simulation.update((controller) => {
			const currentAlgo = String((controller as any)?.algorithm ?? '');
			changed = currentAlgo !== selectedAlgo;
			if (typeof (controller as any).rebuildHistoryForAlgorithm === 'function') {
				(controller as any).rebuildHistoryForAlgorithm(selectedAlgo);
			} else {
				controller.setAlgorithm(selectedAlgo);
			}
			this.syncUndoRedo(controller);
			return controller;
		});

		if (changed) {
			this.uiState.update((state) => ({
				...state,
				showHistoryModal: false,
				showDijkstraModal: false,
				historyCompactOpen: false,
				routingHover: { sourceId: null, targetId: null }
			}));
		}
	}

	/**
	 * Springt zur angegebenen Simulationsstufe und liefert den resultierenden Zustand.
	 */
	public jumpToStep(step: number): SimulationState {
		let state!: SimulationState;
		this.simulation.update((controller) => {
			state = controller.jumpToStep(step);
			this.syncUndoRedo(controller);
			return controller;
		});
		return state;
	}

	/**
	 * Fuehrt genau einen Simulationsschritt vorwaerts aus.
	 */
	public nextStep(): void {
		this.simulation.update((controller) => {
			controller.nextStep();
			this.syncUndoRedo(controller);
			return controller;
		});
	}

	/**
	 * Alias fuer einen Schritt vorwaerts.
	 */
	public stepForward(): void {
		this.nextStep();
	}

	/**
	 * Springt einen Schritt in der Historie zurueck.
	 */
	public stepBackward(): void {
		this.simulation.update((controller) => {
			const anyCtrl = controller as any;
			const current: number = anyCtrl.currentStepIndex ?? 0;
			const prev = Math.max(0, current - 1);
			controller.jumpToStep(prev);
			this.syncUndoRedo(controller);
			return controller;
		});
	}

	// Beim Stoppen wird jetzt auch pausiert, damit der Running-Status konsistent bleibt.
	/**
	 * Stoppt die Wiedergabe, pausiert den Controller und springt an den Anfang.
	 */
	public stop(): void {
		this.clearPlaybackTimer();
		this.simulation.update((controller) => {
			controller.pause();
			controller.jumpToStep(0);
			this.syncUndoRedo(controller);
			return controller;
		});
	}

	/**
	 * Leert die Topologie vollstaendig und setzt relevante UI-Teile zurueck.
	 */
	public clear(): void {
		this.clearPlaybackTimer();
		this.simulation.update((controller) => {
			const algo = (controller as any).algorithmType ?? controller.algorithm;
			const next = new (controller.constructor as any)(
				new Topology(new Map(), [])
			) as SimulationController;
			if (algo && typeof (next as any).setAlgorithm === 'function') {
				(next as any).setAlgorithm(algo);
			}
			return next;
		});

		this.uiState.update((s) => ({
			...s,
			placementMode: 'none',
			linkDraftSourceId: null,
			selectedRouterId: null,
			highlightedLinkIds: [],
			packetPreview: createInitialPacketPreview(),
			routingHover: { sourceId: null, targetId: null },
			confirmMenu: { open: false, title: '', message: '', options: [] }
		}));

		this.simulation.update((controller) => {
			this.syncUndoRedo(controller);
			return controller;
		});
	}

	/**
	 * Setzt die Simulation auf ihre initiale Topologie zurueck.
	 */
	public reset(): void {
		this.clearPlaybackTimer();
		this.simulation.update((controller) => {
			const algo = (controller as any).algorithmType ?? controller.algorithm;
			const topo =
				typeof (controller as any).getInitialTopology === 'function'
					? (controller as any).getInitialTopology()
					: controller.getTopology();
			const next = new (controller.constructor as any)(topo) as SimulationController;
			if (algo && typeof (next as any).setAlgorithm === 'function') {
				(next as any).setAlgorithm(algo);
			}
			return next;
		});

		this.uiState.update((s) => ({
			...s,
			placementMode: 'none',
			linkDraftSourceId: null,
			selectedRouterId: null,
			highlightedLinkIds: [],
			packetPreview: createInitialPacketPreview(),
			routingHover: { sourceId: null, targetId: null }
		}));

		this.simulation.update((controller) => {
			this.syncUndoRedo(controller);
			return controller;
		});
	}

	/**
	 * Fuegt einen neuen Router an der angegebenen Position hinzu.
	 */
	public addNode(xPos: number, yPos: number): void {
		this.simulation.update((controller) => {
			controller.addNode(xPos, yPos);
			this.syncUndoRedo(controller);
			return controller;
		});
	}

	/**
	 * Fuegt eine neue Verbindung zwischen zwei Routern hinzu.
	 */
	public addLink(sourceId: string, targetId: string, weight: number): void {
		this.simulation.update((controller) => {
			controller.addLink(sourceId, targetId, weight);
			this.syncUndoRedo(controller);
			return controller;
		});
	}

	/**
	 * Entfernt einen Router inklusive seiner Verbindungen.
	 */
	public deleteNode(nodeId: string): void {
		this.simulation.update((controller) => {
			controller.deleteNode(nodeId);
			this.syncUndoRedo(controller);
			return controller;
		});
	}

	/**
	 * Benennt einen Router auf den angegebenen Namen um.
	 */
	public renameRouter(routerId: string, newName: string): void {
		this.simulation.update((controller) => {
			(controller as any).renameRouter(routerId, newName);
			this.syncUndoRedo(controller);
			return controller;
		});
	}

	/**
	 * Aendert das Gewicht einer einzelnen Verbindung.
	 */
	public changeLinkWeight(sourceId: string, targetId: string, weight: number): void {
		this.simulation.update((controller) => {
			(controller as any).changeLinkWeight(sourceId, targetId, weight);
			this.syncUndoRedo(controller);
			return controller;
		});
	}

	/**
	 * Aendert die Gewichte mehrerer Verbindungen in einem Schritt.
	 */
	public changeLinkWeights(
		changes: { sourceId: string; targetId: string; weight: number }[]
	): void {
		this.simulation.update((controller) => {
			(controller as any).changeLinkWeights(changes);
			this.syncUndoRedo(controller);
			return controller;
		});
	}

	/**
	 * Entfernt eine Verbindung zwischen zwei Routern.
	 */
	public deleteLink(sourceId: string, targetId: string): void {
		this.simulation.update((controller) => {
			controller.deleteLink(sourceId, targetId);
			this.syncUndoRedo(controller);
			return controller;
		});
	}

	/**
	 * Verschiebt einen einzelnen Router auf neue Koordinaten.
	 */
	public updateNodePosition(nodeId: string, xPos: number, yPos: number): void {
		this.simulation.update((controller) => {
			controller.moveNode(nodeId, xPos, yPos);
			this.syncUndoRedo(controller);
			return controller;
		});
	}

	/**
	 * Verschiebt mehrere Router gesammelt auf neue Koordinaten.
	 */
	public updateNodePositions(updates: { id: string; xPos: number; yPos: number }[]): void {
		this.simulation.update((controller) => {
			controller.moveNodes(updates);
			this.syncUndoRedo(controller);
			return controller;
		});
	}

	/**
	 * Fuegt der Simulation ein neues Event hinzu.
	 */
	public addEvent(event: SimulationEvent): void {
		this.simulation.update((controller) => {
			controller.addEvent(event);
			this.syncUndoRedo(controller);
			return controller;
		});
	}

	/**
	 * Gibt die aktuelle Topologie aus dem Controller zurueck.
	 */
	public getTopology(): Topology {
		let topology!: Topology;
		this.simulation.update((controller) => {
			topology = controller.getTopology();
			this.syncUndoRedo(controller);
			return controller;
		});
		return topology;
	}

	/**
	 * Berechnet kuerzeste Distanzen in einer Topologie ab einem Start-Router.
	 */
	public computeShortestPaths(topo: Topology, sourceId: string): Map<string, number> {
		let dist = new Map<string, number>();
		this.simulation.update((controller) => {
			dist = controller.computeShortestPathsForTopology(topo, sourceId);
			this.syncUndoRedo(controller);
			return controller;
		});
		return dist;
	}

	/**
	 * Macht die letzte aendernde Aktion rueckgaengig.
	 */
	public undo(): void {
		this.simulation.update((controller) => {
			controller.undo();
			this.syncUndoRedo(controller);
			return controller;
		});
	}

	/**
	 * Stellt eine zuvor rueckgaengig gemachte Aktion wieder her.
	 */
	public redo(): void {
		this.simulation.update((controller) => {
			controller.redo();
			this.syncUndoRedo(controller);
			return controller;
		});
	}

	/**
	 * Importiert einen Simulationszustand aus JSON und setzt UI-Ableitungen zurueck.
	 */
	public importJson(json: string): void {
		this.simulation.update((controller) => {
			controller.importJson(json);
			this.syncUndoRedo(controller);

			// Store-Subscriber durch neue Referenz trotz gleicher Daten erneut ausloesen.
			const refreshed = Object.assign(Object.create(Object.getPrototypeOf(controller)), controller);
			return refreshed;
		});

		this.clearPacketPreview();
		this.setSelectedRouter(null);
		this.setLinkDraftSourceId(null);
		this.uiState.update((s) => ({ ...s, fitViewRequested: true }));
	}

	/**
	 * Exportiert den aktuellen Simulationszustand als JSON-String.
	 */
	public exportJson(): string {
		let result = '';
		this.simulation.update((controller) => {
			result = controller.exportJson();
			return controller;
		});
		return result;
	}

	/**
	 * Entfernt Paketvorschau, Link-Highlights und Hover-Informationen.
	 */
	public clearPacketPreview(): void {
		this.uiState.update((s) => ({
			...s,
			...s,
			highlightedLinkIds: [],
			actualRouteLinkIds: [],
			packetPreview: createInitialPacketPreview(),
			linkDraftSourceId: null,
			routingHover: { sourceId: null, targetId: null }
		}));
	}

	public setExplainCell(cell: ExplainCell | null): void {
		this.uiState.update((s) => ({ ...s, explainCell: cell }));
	}

	public setExplainPathLinkIds(links: string[] | null): void {
		this.uiState.update((s) => ({ ...s, explainPathLinkIds: links }));
	}

	public setExplainPathNodeIds(ids: string[] | null): void {
		this.uiState.update((s) => ({ ...s, explainPathNodeIds: ids }));
	}

	/**
	 * Setzt den Hover-Zustand fuer Routing-Tabellen.
	 */
	public setRoutingHover(sourceId: string | null, targetId: string | null): void {
		const src = sourceId ? String(sourceId).trim() : null;
		const tgt = targetId ? String(targetId).trim() : null;
		this.uiState.update((s) => ({
			...s,
			routingHover: {
				sourceId: src && src.length > 0 ? src : null,
				targetId: tgt && tgt.length > 0 ? tgt : null
			}
		}));
	}

	/**
	 * Waehlt Router fuer die Paketvorschau und berechnet bei zweiter Auswahl eine Route.
	 */
	public selectPacketRouter(routerId: string): void {
		const rid = String(routerId ?? '').trim();
		if (!rid) return;

		this.uiState.update((s) => {
			const src = s.packetPreview.sourceId;
			const tgt = s.packetPreview.targetId;

			if (!src || (src && tgt)) {
				return {
					...s,
					...s,
					highlightedLinkIds: [],
					actualRouteLinkIds: [],
					packetPreview: {
						sourceId: rid,
						targetId: null,
						nodePath: [],
						linkPath: [],
						cost: null,
						error: null
					}
				};
			}

			if (src === rid) return s;

			const ctrl = get(this.simulation) as any;
			const res = this.computeShortestPath(ctrl, src, rid);

			let actualRes = { nodePath: [], linkPath: [] };
			if (typeof ctrl.computeActualPath === 'function') {
				actualRes = ctrl.computeActualPath(src, rid);
			} else {
				// Sicherheits-Fallback fuer Entwicklungszeit, falls die Methode fehlen sollte.
				console.warn('computeActualPath missing on controller');
			}

			return {
				...s,
				highlightedLinkIds: res.linkPath,
				actualRouteLinkIds: actualRes.linkPath,
				packetPreview: {
					sourceId: src,
					targetId: rid,
					nodePath: res.nodePath,
					linkPath: res.linkPath,
					cost: res.cost,
					error: res.error
				}
			};
		});
	}

	/**
	 * Berechnet und speichert eine Paketvorschau fuer Quelle und Ziel.
	 */
	public previewPacket(sourceId: string, targetId: string): void {
		const sId = String(sourceId ?? '').trim();
		const tId = String(targetId ?? '').trim();

		if (!sId || !tId || sId === tId) {
			this.clearPacketPreview();
			this.uiState.update((s) => ({
				...s,
				packetPreview: {
					...s.packetPreview,
					sourceId: sId || null,
					targetId: tId || null,
					error: !sId || !tId ? 'source/target missing' : 'source and target must differ'
				}
			}));
			return;
		}

		const ctrl = get(this.simulation) as any;
		const res = this.computeShortestPath(ctrl, sId, tId);

		let actualRes = { nodePath: [], linkPath: [] };
		if (typeof ctrl.computeActualPath === 'function') {
			actualRes = ctrl.computeActualPath(sId, tId);
		}

		this.uiState.update((s) => ({
			...s,
			highlightedLinkIds: res.linkPath,
			actualRouteLinkIds: actualRes.linkPath,
			packetPreview: {
				sourceId: sId,
				targetId: tId,
				nodePath: res.nodePath,
				linkPath: res.linkPath,
				cost: res.cost,
				error: res.error
			}
		}));
	}

	/**
	 * Berechnet intern den kuerzesten Pfad zwischen zwei Routern auf der aktuellen Topologie.
	 */
	private computeShortestPath(
		ctrl: any,
		sourceId: string,
		targetId: string
	): { nodePath: string[]; linkPath: string[]; cost: number | null; error: string | null } {
		const topo = ctrl?.topology;
		const nodes: Map<string, any> = topo?.nodes instanceof Map ? topo.nodes : new Map();
		const links: any[] = Array.isArray(topo?.links) ? topo.links : [];

		const readId = (value: unknown) => String(value ?? '').trim();

		const isDisabled = (id: string) => {
			const n = nodes.get(id);
			return !!(n as any)?.disabled;
		};

		if (!nodes.has(sourceId) || !nodes.has(targetId)) {
			return { nodePath: [], linkPath: [], cost: null, error: 'unknown router id' };
		}

		if (isDisabled(sourceId) || isDisabled(targetId)) {
			return { nodePath: [], linkPath: [], cost: null, error: 'router disabled' };
		}

		type Adj = { to: string; w: number; linkId: string };
		const adj = new Map<string, Adj[]>();

		const pushAdj = (from: string, to: string, w: number, linkId: string) => {
			if (!adj.has(from)) adj.set(from, []);
			adj.get(from)!.push({ to, w, linkId });
		};

		for (const l of links) {
			const lid = readId(l?.id);
			const s = readId(l?.source?.id);
			const t = readId(l?.target?.id);
			const wRaw = Number(l?.weight ?? 1);
			const w = Number.isFinite(wRaw) && wRaw > 0 ? wRaw : 1;
			if (!lid || !s || !t) continue;
			if (isDisabled(s) || isDisabled(t)) continue;
			pushAdj(s, t, w, lid);
			pushAdj(t, s, w, lid);
		}

		const dist = new Map<string, number>();
		const prev = new Map<string, { node: string; linkId: string }>();
		const unvisited = new Set<string>(Array.from(nodes.keys()));

		for (const id of unvisited) dist.set(id, Infinity);
		dist.set(sourceId, 0);

		while (unvisited.size > 0) {
			let u: string | null = null;
			let best = Infinity;
			for (const id of unvisited) {
				const d = dist.get(id) ?? Infinity;
				if (d < best) {
					best = d;
					u = id;
				}
			}

			if (!u || best === Infinity) break;
			if (u === targetId) break;
			unvisited.delete(u);

			const outs = adj.get(u) ?? [];
			for (const e of outs) {
				if (!unvisited.has(e.to)) continue;
				const alt = best + e.w;
				if (alt < (dist.get(e.to) ?? Infinity)) {
					dist.set(e.to, alt);
					prev.set(e.to, { node: u, linkId: e.linkId });
				}
			}
		}

		const endDist = dist.get(targetId) ?? Infinity;
		if (endDist === Infinity) {
			return { nodePath: [sourceId], linkPath: [], cost: null, error: 'unreachable' };
		}

		const nodePath: string[] = [];
		const linkPath: string[] = [];

		let cur = targetId;
		nodePath.push(cur);

		while (cur !== sourceId) {
			const p = prev.get(cur);
			if (!p) break;
			linkPath.push(p.linkId);
			cur = p.node;
			nodePath.push(cur);
		}

		nodePath.reverse();
		linkPath.reverse();

		return { nodePath, linkPath, cost: endDist, error: null };
	}
}
