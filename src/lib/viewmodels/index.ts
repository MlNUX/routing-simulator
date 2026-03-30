import { writable, derived, type Readable, type Writable } from 'svelte/store';

import { SimulationUI } from './SimulationUI';
import { uiState as uiStateStore, type UIState } from './uiState';

import { SimulationController, type PlacementMode } from '../model/SimulationController';
import { Topology } from '../model/Topology';
const initialTopology = new Topology(new Map(), []);

const simulationControllerStore: Writable<SimulationController> = writable(
	new SimulationController(initialTopology)
);

export const ui = new SimulationUI(simulationControllerStore, uiStateStore);

export const simulation: Readable<SimulationController> = simulationControllerStore;

// Exportiert uiState nur als Readable, um direkte Mutationen aus UI-Code zu vermeiden.
export const uiState: Readable<UIState> = uiStateStore;

export const selectedRouterId: Readable<string | null> = derived(
	uiStateStore,
	(s) => s.selectedRouterId
);
export const placementMode: Readable<PlacementMode> = derived(uiStateStore, (s) => s.placementMode);
export const linkWeight: Readable<number> = derived(uiStateStore, (s) => s.linkWeight);

export type { PlacementMode };

/**
 * Setzt das Standardgewicht fuer neu erstellte Links.
 */
export function setLinkWeight(value: number): void {
	ui.setLinkWeight(value);
}

/**
 * Schaltet den Platzierungsmodus fuer Router um.
 */
export function toggleRouterPlacement(): void {
	ui.togglePlacementMode('router');
}

/**
 * Schaltet den Platzierungsmodus fuer Links um.
 */
export function toggleLinkPlacement(): void {
	ui.togglePlacementMode('link');
}

/**
 * Schaltet den Loeschmodus um.
 */
export function toggleDeletePlacement(): void {
	ui.togglePlacementMode('delete');
}

/**
 * Setzt den Platzierungsmodus auf "none" zurueck.
 */
export function clearPlacementMode(): void {
	ui.clearPlacementMode();
}

/**
 * Speichert den aktuell ausgewaehlten Router.
 */
export function setSelectedRouter(id: string | null): void {
	ui.setSelectedRouter(id);
}

/**
 * Startet die Wiedergabe der Simulation.
 */
export function play(): void {
	ui.play();
}

/**
 * Pausiert die laufende Wiedergabe.
 */
export function pause(): void {
	ui.pause();
}

/**
 * Setzt den aktiven Routing-Algorithmus.
 */
export function setAlgorithm(algo: import('../model/RoutingAlgorithmType').AlgorithmType): void {
	ui.setAlgorithm(algo);
}

/**
 * Springt zu einer bestimmten Simulationsstufe.
 */
export function jumpToStep(step: number): import('../model/SimulationState').SimulationState {
	return ui.jumpToStep(step);
}

/**
 * Fuehrt einen Simulationsschritt nach vorne aus.
 */
export function nextStep(): void {
	ui.nextStep();
}

/**
 * Alias fuer einen Schritt vorwaerts.
 */
export function stepForward(): void {
	ui.stepForward();
}

/**
 * Fuehrt einen Simulationsschritt rueckwaerts aus.
 */
export function stepBackward(): void {
	ui.stepBackward();
}

/**
 * Macht die letzte Aenderung rueckgaengig.
 */
export function undo(): void {
	ui.undo();
}

/**
 * Stellt die zuletzt rueckgaengig gemachte Aenderung wieder her.
 */
export function redo(): void {
	ui.redo();
}

/**
 * Stoppt die Wiedergabe und springt an den Anfang.
 */
export function stop(): void {
	ui.stop();
}

/**
 * Setzt die Simulation auf den Ausgangszustand zurueck.
 */
export function reset(): void {
	ui.reset();
}

/**
 * Zeigt eine Fehlermeldung als Toast in der UI an.
 */
export function showErrorToast(message: string): void {
	ui.showErrorToast(message);
}

/**
 * Blendet den Fehler-Toast aus.
 */
export function hideErrorToast(): void {
	ui.hideErrorToast();
}

/**
 * Setzt das Wiedergabe-Intervall in Millisekunden.
 */
export function setPlaybackInterval(ms: number): void {
	ui.setPlaybackInterval(ms);
}

/**
 * Aktiviert oder deaktiviert einen Router.
 */
export function setRouterDisabled(routerId: string, disabled: boolean): void {
	ui.setRouterDisabled(routerId, disabled);
}

/**
 * Zeigt oder versteckt das Surfer-Easter-Egg.
 */
export function setShowSurfer(open: boolean): void {
	ui.setShowSurfer(open);
}

/**
 * Schaltet den globalen Hilfe-Modus um.
 */
export function toggleHelpMode(): void {
	ui.toggleHelpMode();
}

/**
 * Setzt den globalen Hilfe-Modus explizit.
 */
export function setHelpMode(open: boolean): void {
	ui.setHelpMode(open);
}

/**
 * Oeffnet ein konfigurierbares Bestaetigungsmenue.
 */
export function openConfirmMenu(
	cfg: Parameters<SimulationUI['openConfirmMenu']>[0],
	onSelect?: Parameters<SimulationUI['openConfirmMenu']>[1]
): void {
	ui.openConfirmMenu(cfg, onSelect);
}

/**
 * Schliesst das geoeffnete Bestaetigungsmenue.
 */
export function closeConfirmMenu(): void {
	ui.closeConfirmMenu();
}

/**
 * Waehlt eine Option aus dem Bestaetigungsmenue.
 */
export function chooseConfirmOption(optionId: string): void {
	ui.chooseConfirmOption(optionId);
}

/**
 * Setzt den Router-Filter fuer die Historienansicht.
 */
export function setHistoryFilterRouterId(routerId: string | null): void {
	ui.setHistoryFilterRouterId(routerId);
}

/**
 * Fuegt einen neuen Router an einer Position hinzu.
 */
export function addNode(xPos: number, yPos: number): void {
	ui.addNode(xPos, yPos);
}

/**
 * Fuegt einen Link zwischen zwei Routern hinzu.
 */
export function addLink(sourceId: string, targetId: string, weight: number): void {
	ui.addLink(sourceId, targetId, weight);
}

/**
 * Entfernt einen Router aus der Topologie.
 */
export function deleteNode(nodeId: string): void {
	ui.deleteNode(nodeId);
}

/**
 * Entfernt einen Link aus der Topologie.
 */
export function deleteLink(sourceId: string, targetId: string): void {
	ui.deleteLink(sourceId, targetId);
}

/**
 * Verschiebt einen Router auf neue Koordinaten.
 */
export function updateNodePosition(nodeId: string, xPos: number, yPos: number): void {
	ui.updateNodePosition(nodeId, xPos, yPos);
}

/**
 * Verschiebt mehrere Router gesammelt.
 */
export function updateNodePositions(updates: { id: string; xPos: number; yPos: number }[]): void {
	ui.updateNodePositions(updates);
}

/**
 * Fuegt ein Simulationsereignis hinzu.
 */
export function addEvent(event: import('../model/SimulationEvent').SimulationEvent): void {
	ui.addEvent(event);
}

/**
 * Gibt die aktuelle Topologie der Simulation zurueck.
 */
export function getTopology(): Topology {
	return ui.getTopology();
}

/**
 * Berechnet kuerzeste Distanzen in einer Topologie ab einem Startknoten.
 */
export function computeShortestPaths(topo: Topology, sourceId: string): Map<string, number> {
	return ui.computeShortestPaths(topo, sourceId);
}

/**
 * Importiert einen Simulationszustand aus JSON.
 */
export function importJson(json: string): void {
	ui.importJson(json);
}

/**
 * Exportiert den aktuellen Simulationszustand als JSON.
 */
export function exportJson(): string {
	return ui.exportJson();
}
