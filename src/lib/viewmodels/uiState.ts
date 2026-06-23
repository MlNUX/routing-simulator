import { writable, type Writable } from 'svelte/store';
import type { PlacementMode } from '../model/SimulationController';

/**
 * Enthaelt alle berechneten und dargestellten Daten einer Paketvorschau.
 */
export type PacketPreview = {
	sourceId: string | null;
	targetId: string | null;

	nodePath: string[];
	linkPath: string[];

	cost: number | null;
	error: string | null;
};

export type ExplainCell = {
	routerId: string;
	destId: string;
	rowId: string; // via / neighbor
	step: number;
	isBellman: boolean;
};

/**
 * Beschreibt den gesamten Zustand der Benutzeroberflaeche.
 */
export type UIState = {
	// Werkzeuge
	placementMode: PlacementMode;
	linkWeight: number;
	linkDraftSourceId: string | null;

	// Undo/Redo-Status
	canUndo: boolean;
	canRedo: boolean;

	// Auswahl
	selectedRouterId: string | null;

	// Paketvorschau + Hervorhebungen
	highlightedLinkIds: string[];
	actualRouteLinkIds: string[];
	packetPreview: PacketPreview;

	// Hover-Zustand in Routing-Tabellen
	routingHover: {
		sourceId: string | null;
		targetId: string | null;
	};

	// Modale Dialoge/Paneele
	menuOpen: boolean;
	showDebugModal: boolean;
	debugUnlocked: boolean;
	helpMode: boolean;
	showHistoryModal: boolean;
	historyCompactOpen?: boolean;
	showDijkstraModal: boolean;
	showScenarioModal: boolean;
	historyFilterRouterId: string | null;

	// Temporaere Overlays
	isDragOver: boolean;

	// Wiedergabe
	playbackIntervalMs: number;

	// Wiederverwendbares Bestaetigungsmenue
	confirmMenu: {
		open: boolean;
		title: string;
		message: string;
		options: {
			id: string;
			label: string;
			intent?: 'primary' | 'danger' | 'neutral';
			description?: string;
		}[];
	};

	// Explain panel
	explainCell: ExplainCell | null;
	explainPathLinkIds: string[] | null;
	explainPathNodeIds: string[] | null;

	// Easter Egg
	showSurfer: boolean;

	// Viewport
	fitViewRequested: boolean;

	// Temporaerer Hinweis-Toast
	errorToast: {
		open: boolean;
		message: string;
	};
};

/**
 * Erzeugt eine leere Paketvorschau ohne Quelle, Ziel und Route.
 */
export function createInitialPacketPreview(): PacketPreview {
	return {
		sourceId: null,
		targetId: null,
		nodePath: [],
		linkPath: [],
		cost: null,
		error: null
	};
}

/**
 * Erzeugt den initialen Zustand fuer die gesamte UI.
 */
export function createInitialUIState(): UIState {
	return {
		placementMode: 'none',
		linkWeight: 1,
		linkDraftSourceId: null,

		canUndo: false,
		canRedo: false,

		selectedRouterId: null,

		highlightedLinkIds: [],
		actualRouteLinkIds: [],
		packetPreview: createInitialPacketPreview(),
		routingHover: { sourceId: null, targetId: null },

		menuOpen: false,
		showDebugModal: false,
		debugUnlocked: false,
		helpMode: false,
		showHistoryModal: false,
		historyCompactOpen: false,
		showDijkstraModal: false,
		showScenarioModal: false,
		historyFilterRouterId: null,

		explainCell: null,
		explainPathLinkIds: null,
		explainPathNodeIds: null,

		isDragOver: false,
		playbackIntervalMs: 3000,

		confirmMenu: {
			open: false,
			title: '',
			message: '',
			options: []
		},

		showSurfer: false,

		fitViewRequested: false,

		errorToast: {
			open: false,
			message: ''
		}
	};
}

/**
 * Zentraler UI-Store.
 *
 * Der Store bleibt absichtlich Writable, damit Svelte ueber `$uiState` abonnieren kann.
 * Mutationen sollen jedoch ausschliesslich ueber `SimulationUI` (`ui.*`) erfolgen.
 */
export const uiState: Writable<UIState> = writable(createInitialUIState());
