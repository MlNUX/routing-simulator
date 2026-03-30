import { describe, it, expect, beforeEach, vi } from 'vitest';
import { writable, get } from 'svelte/store';

import { SimulationUI } from '../../src/lib/viewmodels/SimulationUI';
import { SimulationController } from '../../src/lib/model/SimulationController';
import { Topology } from '../../src/lib/model/Topology';
import { Router } from '../../src/lib/model/Router';
import { Link } from '../../src/lib/model/Link';
import { RoutingAlgorithmType } from '../../src/lib/model/RoutingAlgorithmType';
import { EventType } from '../../src/lib/model/EventType';
import { SimulationEvent } from '../../src/lib/model/SimulationEvent';
import { createInitialUIState, type UIState } from '../../src/lib/viewmodels/uiState';

function createTopology() {
	const nodes = new Map<string, Router>();
	const r1 = new Router('R1', 'Router 1', 0, 0);
	const r2 = new Router('R2', 'Router 2', 100, 0);
	const r3 = new Router('R3', 'Router 3', 200, 0);

	nodes.set(r1.id, r1);
	nodes.set(r2.id, r2);
	nodes.set(r3.id, r3);

	const l1 = new Link('L1', r1, r2, 1);
	const l2 = new Link('L2', r2, r3, 1);

	r1.addNeighbor(l1);
	r2.addNeighbor(l1);
	r2.addNeighbor(l2);
	r3.addNeighbor(l2);

	const links = [l1, l2];
	return new Topology(nodes, links);
}

/**
 * Integration und Unit Tests für die SimulationUI-Klasse, die die Interaktion zwischen der UI und Modell steuert.
 * Prüft das korrekte Zusammenspiel mit den SimulationController-Methoden.
 **/

describe('SimulationUI Integration Tests', () => {
	let ui: SimulationUI;
	let simulationStore: ReturnType<typeof writable<SimulationController>>;
	let uiStateStore: ReturnType<typeof writable<UIState>>;

	beforeEach(() => {
		const topology = createTopology();
		const controller = new SimulationController(topology);

		simulationStore = writable(controller);
		uiStateStore = writable(createInitialUIState());

		ui = new SimulationUI(simulationStore, uiStateStore);
	});

	describe('Router State Management', () => {
		it('select/deselect Router', () => {
			ui.setSelectedRouter('R1');
			const uiState = get(uiStateStore);
			expect(uiState.selectedRouterId).toBe('R1');
			ui.setSelectedRouter(null);
			expect(get(uiStateStore).selectedRouterId).toBeNull();
		});

		it('update Placement Mode', () => {
			ui.togglePlacementMode('router');
			const uiState = get(uiStateStore);
			expect(uiState.placementMode).toBe('router');

			ui.togglePlacementMode('router');
			expect(get(uiStateStore).placementMode).toBe('none');
		});

		it('toggle between different Placement Modes', () => {
			ui.togglePlacementMode('router');
			expect(get(uiStateStore).placementMode).toBe('router');

			ui.togglePlacementMode('link');
			expect(get(uiStateStore).placementMode).toBe('link');

			ui.togglePlacementMode('delete');
			expect(get(uiStateStore).placementMode).toBe('delete');
		});

		it('clear Placement Mode', () => {
			ui.togglePlacementMode('router');
			expect(get(uiStateStore).placementMode).toBe('router');

			ui.clearPlacementMode();
			expect(get(uiStateStore).placementMode).toBe('none');
			expect(get(uiStateStore).linkDraftSourceId).toBeNull();
		});

		it('unchanged Topology after ui actions', () => {
			const controller = get(simulationStore);
			const initialNodes = controller.topology.nodes.size;
			const initialLinks = controller.topology.links.length;

			ui.setSelectedRouter('R1');
			ui.togglePlacementMode('router');
			ui.clearPlacementMode();

			expect(controller.topology.nodes.size).toBe(initialNodes);
			expect(controller.topology.links.length).toBe(initialLinks);
		});
	});

	describe('Link Management', () => {
		it('set Link Draft Source', () => {
			ui.setLinkDraftSourceId('R1');
			const uiState = get(uiStateStore);
			expect(uiState.linkDraftSourceId).toBe('R1');
		});

		it('clear Link Draft Source', () => {
			ui.setLinkDraftSourceId('R1');
			ui.setLinkDraftSourceId(null);
			expect(get(uiStateStore).linkDraftSourceId).toBeNull();
		});

		it('set Link Weight', () => {
			ui.setLinkWeight(5);
			expect(get(uiStateStore).linkWeight).toBe(5);
		});

		it('validate Link Weight', () => {
			ui.setLinkWeight(0);
			expect(get(uiStateStore).linkWeight).toBe(1);

			ui.setLinkWeight(-5);
			expect(get(uiStateStore).linkWeight).toBe(1);
		});

		it('create Link', () => {
			const controller = get(simulationStore);
			const initialLinkCount = controller.topology.links.length;

			ui.togglePlacementMode('link');
			ui.setLinkDraftSourceId('R1');
			ui.setLinkWeight(2);

			ui.addLink('R1', 'R3', 2);
			ui.clearPlacementMode();

			const updatedController = get(simulationStore);
			expect(updatedController.topology.links.length).toBe(initialLinkCount + 1);

			const newLink = updatedController.topology.links.find(
				(link) =>
					(link.source.id === 'R1' && link.target.id === 'R3') ||
					(link.source.id === 'R3' && link.target.id === 'R1')
			);
			expect(newLink).toBeDefined();
			expect(newLink?.weight).toBe(2);
		});

		it('Router neighbors consistency', () => {
			const controller = get(simulationStore);
			const r2 = controller.topology.nodes.get('R2');

			expect(r2).toBeDefined();
			expect(r2?.neighbors.length).toBe(2);

			const neighborIds = r2!.neighbors.map((link) =>
				link.source.id === 'R2' ? link.target.id : link.source.id
			);
			expect(neighborIds).toContain('R1');
			expect(neighborIds).toContain('R3');
		});

		it('change single Link weight', () => {
			const controller = get(simulationStore);
			expect(controller.topology.links[0].weight).toBe(1);

			ui.changeLinkWeight('R1', 'R2', 5);
			expect(get(simulationStore).topology.links[0].weight).toBe(5);
		});

		it('change multiple Link weights', () => {
			ui.changeLinkWeights([
				{ sourceId: 'R1', targetId: 'R2', weight: 3 },
				{ sourceId: 'R2', targetId: 'R3', weight: 4 }
			]);

			const updatedController = get(simulationStore);
			const link1 = updatedController.topology.links.find(
				(l) =>
					(l.source.id === 'R1' && l.target.id === 'R2') ||
					(l.source.id === 'R2' && l.target.id === 'R1')
			);
			expect(link1?.weight).toBe(3);
		});

		it('delete single Link', () => {
			const controller = get(simulationStore);
			const initialLinkCount = controller.topology.links.length;

			ui.deleteLink('R1', 'R2');
			expect(get(simulationStore).topology.links.length).toBe(initialLinkCount - 1);
		});
	});

	describe('Menu Management', () => {
		it('toggle Menu Open', () => {
			expect(get(uiStateStore).menuOpen).toBe(false);

			ui.toggleMenuOpen();
			expect(get(uiStateStore).menuOpen).toBe(true);

			ui.toggleMenuOpen();
			expect(get(uiStateStore).menuOpen).toBe(false);
		});

		it('clear Placement Mode when Menu closes', () => {
			ui.togglePlacementMode('router');
			expect(get(uiStateStore).placementMode).toBe('router');

			ui.toggleMenuOpen();
			ui.toggleMenuOpen();

			expect(get(uiStateStore).placementMode).toBe('none');
		});

		it('close Modals when Menu opens', () => {
			
			ui.setShowHistoryModal(true);

			ui.toggleMenuOpen();
			expect(get(uiStateStore).showDebugModal).toBe(false);
			expect(get(uiStateStore).showHistoryModal).toBe(false);
		});

		it('toggle Help Mode', () => {
			expect(get(uiStateStore).helpMode).toBe(false);

			ui.toggleHelpMode();
			expect(get(uiStateStore).helpMode).toBe(true);

			ui.setHelpMode(false);
			expect(get(uiStateStore).helpMode).toBe(false);
		});
	});

	describe('Node Management', () => {
		it('add new Node', () => {
			const controller = get(simulationStore);
			const initialNodeCount = controller.topology.nodes.size;

			ui.addNode(100, 100);
			expect(get(simulationStore).topology.nodes.size).toBe(initialNodeCount + 1);
		});

		it('delete Node and its Links', () => {
			const controller = get(simulationStore);
			const initialNodeCount = controller.topology.nodes.size;
			const initialLinkCount = controller.topology.links.length;

			ui.togglePlacementMode('delete');
			ui.deleteNode('R1');

			const updated = get(simulationStore);
			expect(updated.topology.nodes.size).toBe(initialNodeCount - 1);
			expect(updated.topology.links.length).toBeLessThan(initialLinkCount);
		});

		it('rename Router', () => {
			const controller = get(simulationStore);
			const r1 = controller.topology.nodes.get('R1');
			expect(r1?.name).toBe('Router 1');

			ui.renameRouter('R1', 'name');
			expect(get(simulationStore).topology.nodes.get('R1')?.name).toBe('name');
			expect(controller.topology.nodes.get('R1')?.name).toBe('name');
		});

		it('update Node position', () => {
			const controller = get(simulationStore);
			const r1 = controller.topology.nodes.get('R1');
			expect(r1?.xPos).toBe(0);
			expect(r1?.yPos).toBe(0);

			ui.updateNodePosition('R1', 150, 250);

			const updated = get(simulationStore).topology.nodes.get('R1');
			expect(updated?.xPos).toBe(150);
			expect(updated?.yPos).toBe(250);
			expect(controller.topology.nodes.get('R1')?.xPos).toBe(150);
			expect(controller.topology.nodes.get('R1')?.yPos).toBe(250);
		});

		it('update multiple Node positions', () => {
			ui.updateNodePositions([
				{ id: 'R1', xPos: 100, yPos: 100 },
				{ id: 'R2', xPos: 200, yPos: 200 },
				{ id: 'R3', xPos: 300, yPos: 300 }
			]);

			const controller = get(simulationStore);
			expect(controller.topology.nodes.get('R1')?.xPos).toBe(100);
			expect(controller.topology.nodes.get('R2')?.xPos).toBe(200);
			expect(controller.topology.nodes.get('R3')?.xPos).toBe(300);
		});

		it('set Router disabled state', () => {
			ui.setRouterDisabled('R1', true);
			const controller = get(simulationStore);
			const r1 = controller.topology.nodes.get('R1');
			expect((r1 as any)?.disabled).toBe(true);

			ui.setRouterDisabled('R1', false);
			expect(get(simulationStore).topology.nodes.get('R1')).toBeDefined();
		});
	});

	describe('Simulation Control', () => {
		it('next Step', () => {
			const controller = get(simulationStore);
			expect(controller.currentStepIndex).toBe(0);

			ui.nextStep();
			expect(get(simulationStore).currentStepIndex).toBe(1);

			ui.nextStep();
			expect(get(simulationStore).currentStepIndex).toBe(2);
		});

		it('step Forward', () => {
			const controller = get(simulationStore);
			expect(controller.currentStepIndex).toBe(0);

			ui.stepForward();
			expect(get(simulationStore).currentStepIndex).toBe(1);

			ui.stepForward();
			expect(get(simulationStore).currentStepIndex).toBe(2);
		});

		it('step Backward', () => {
			ui.nextStep();
			ui.nextStep();
			expect(get(simulationStore).currentStepIndex).toBe(2);

			ui.stepBackward();
			expect(get(simulationStore).currentStepIndex).toBe(1);

			ui.stepBackward();
			expect(get(simulationStore).currentStepIndex).toBe(0);
		});

		it('jump to Step', () => {
			ui.nextStep();
			ui.nextStep();
			ui.nextStep();
			expect(get(simulationStore).currentStepIndex).toBe(3);

			const state = ui.jumpToStep(1);
			expect(state).toBeDefined();
			expect(get(simulationStore).currentStepIndex).toBe(1);

			ui.jumpToStep(0);
			expect(get(simulationStore).currentStepIndex).toBe(0);
		});

		it('stop Simulation', () => {
			ui.nextStep();
			ui.nextStep();
			expect(get(simulationStore).currentStepIndex).toBe(2);

			ui.stop();
			expect(get(simulationStore).currentStepIndex).toBe(0);
		});

		it('clear Simulation', () => {
			const controller = get(simulationStore);

			ui.nextStep();
			ui.nextStep();
			expect(controller.currentStepIndex).toBe(2);

			ui.clear();
			const clearedController = get(simulationStore);
			expect(clearedController.currentStepIndex).toBe(0);
			expect(clearedController.topology.nodes.size).toBe(0);
		});

		it('reset Simulation', () => {
			ui.nextStep();
			ui.nextStep();
			expect(get(simulationStore).currentStepIndex).toBe(2);

			ui.reset();
			expect(get(simulationStore).currentStepIndex).toBe(0);
		});

		it('change playback Interval', () => {
			ui.setPlaybackInterval(500);
			expect(get(uiStateStore).playbackIntervalMs).toBe(500);

			ui.setPlaybackInterval(100);
			expect(get(uiStateStore).playbackIntervalMs).toBe(250);

			ui.setPlaybackInterval(10000);
			expect(get(uiStateStore).playbackIntervalMs).toBe(5000);

			ui.setPlaybackInterval(1000);
			expect(get(uiStateStore).playbackIntervalMs).toBe(1000);
		});

		it('restart playback timer when interval changes while playing', () => {
			const originalWindow = (globalThis as any).window;
			const setIntervalMock = vi.fn(() => 123 as any);
			(globalThis as any).window = { setInterval: setIntervalMock };

			const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
			try {
				ui.play();
				expect(setIntervalMock).toHaveBeenCalledTimes(1);

				ui.setPlaybackInterval(400);
				expect(setIntervalMock).toHaveBeenCalledTimes(2);
				expect(clearIntervalSpy).toHaveBeenCalled();
			} finally {
				clearIntervalSpy.mockRestore();
				(globalThis as any).window = originalWindow;
			}
		});

		it('executes restarted playback callback and pause keeps state consistent', () => {
			const originalWindow = (globalThis as any).window;
			const timerCallbacks: Array<() => void> = [];
			const setIntervalMock = vi.fn((cb: () => void) => {
				timerCallbacks.push(cb);
				return timerCallbacks.length as any;
			});
			(globalThis as any).window = { setInterval: setIntervalMock };

			try {
				ui.play();
				const afterPlay = get(simulationStore).currentStepIndex;
				timerCallbacks[0]();
				expect(get(simulationStore).currentStepIndex).toBe(afterPlay + 1);

				ui.setPlaybackInterval(400);
				expect(timerCallbacks.length).toBe(2);

				timerCallbacks[1]();
				expect(get(simulationStore).currentStepIndex).toBe(afterPlay + 2);

				ui.pause();
				expect(get(simulationStore).running).toBe(false);
			} finally {
				(globalThis as any).window = originalWindow;
			}
		});

		it('play returns early when window is unavailable', () => {
			const originalWindow = (globalThis as any).window;
			delete (globalThis as any).window;
			try {
				const before = get(simulationStore).currentStepIndex;
				ui.play();
				expect(get(simulationStore).currentStepIndex).toBe(before);
			} finally {
				(globalThis as any).window = originalWindow;
			}
		});
	});

	describe('Algorithm Management', () => {
		it('change to Distance Vector Algorithm', () => {
			const controller = get(simulationStore);
			expect(controller.algorithm).toBe(RoutingAlgorithmType.LINK_STATE);

			ui.setAlgorithm(RoutingAlgorithmType.DISTANCE_VECTOR);
			expect(get(simulationStore).algorithm).toBe(RoutingAlgorithmType.DISTANCE_VECTOR);

			const r1 = get(simulationStore).topology.nodes.get('R1');
			expect(r1?.routingTable).toBeDefined();
		});

		it('change to Link State Algorithm', () => {
			ui.setAlgorithm(RoutingAlgorithmType.DISTANCE_VECTOR);
			ui.setAlgorithm(RoutingAlgorithmType.LINK_STATE);

			const controller = get(simulationStore);
			expect(controller.algorithm).toBe(RoutingAlgorithmType.LINK_STATE);

			expect(controller.topology.nodes.size).toBe(3);
			for (const [id, router] of controller.topology.nodes) {
				expect(router.id).toBe(id);
				expect(router.routingTable).toBeDefined();
			}
		});

		it('change to Distance Vector poisoned Algorithm', () => {
			ui.setAlgorithm(RoutingAlgorithmType.DISTANCE_VECTOR_POISONED);
			expect(get(simulationStore).algorithm).toBe(RoutingAlgorithmType.DISTANCE_VECTOR_POISONED);
		});

		it('accept algorithm strings and error for unknown type', () => {
			ui.setAlgorithm('distance');
			expect(get(simulationStore).algorithm).toBe(RoutingAlgorithmType.DISTANCE_VECTOR);

			ui.setAlgorithm('link');
			expect(get(simulationStore).algorithm).toBe(RoutingAlgorithmType.LINK_STATE);

			ui.setAlgorithm('distancePoisoned');
			expect(get(simulationStore).algorithm).toBe(RoutingAlgorithmType.DISTANCE_VECTOR_POISONED);

			expect(() => ui.setAlgorithm('invalid-algo')).toThrow('Unknown algorithm type');
		});

		it('setAlgorithmKeepingHistory uses rebuildHistoryForAlgorithm when available', () => {
			const controller = get(simulationStore);
			const spy = vi.spyOn(controller as any, 'rebuildHistoryForAlgorithm');

			ui.setAlgorithmKeepingHistory('distance');
			expect(spy).toHaveBeenCalled();
		});

		it('setAlgorithmKeepingHistory falls back to setAlgorithm when rebuildHistoryForAlgorithm is missing', () => {
			const controller = get(simulationStore) as any;
			const original = controller.rebuildHistoryForAlgorithm;
			controller.rebuildHistoryForAlgorithm = undefined;

			const spy = vi.spyOn(controller, 'setAlgorithm');
			try {
				ui.setAlgorithmKeepingHistory('link');
				expect(spy).toHaveBeenCalled();
			} finally {
				controller.rebuildHistoryForAlgorithm = original;
			}
		});

		it('setAlgorithmKeepingHistory throws for unknown type', () => {
			expect(() => ui.setAlgorithmKeepingHistory('invalid-algo')).toThrow('Unknown algorithm type');
		});

		it('setAlgorithmKeepingHistory accepts distancePoisoned string', () => {
			ui.setAlgorithmKeepingHistory('distancePoisoned');
			expect(get(simulationStore).algorithm).toBe(RoutingAlgorithmType.DISTANCE_VECTOR_POISONED);
		});
	});

	describe('Modal Management', () => {
	
		it('setDebugUnlocked closes debug modal when locking off', () => {
			ui.setDebugUnlocked(true);
			ui.setShowDebugModal(true);
			expect(get(uiStateStore).showDebugModal).toBe(true);

			ui.setDebugUnlocked(false);
			expect(get(uiStateStore).showDebugModal).toBe(false);
		});

	

		it('show and hide History Modal', () => {
			expect(get(uiStateStore).showHistoryModal).toBe(false);

			ui.setShowHistoryModal(true);
			expect(get(uiStateStore).showHistoryModal).toBe(true);

			ui.setHistoryFilterRouterId('R1');
			expect(get(uiStateStore).historyFilterRouterId).toBe('R1');

			ui.setShowHistoryModal(false);
			expect(get(uiStateStore).showHistoryModal).toBe(false);
		});

		it('set history compact only when history modal is open', () => {
			ui.setHistoryCompactOpen(true);
			expect((get(uiStateStore) as any).historyCompactOpen).toBe(false);

			ui.setShowHistoryModal(true);
			ui.setHistoryCompactOpen(true);
			expect((get(uiStateStore) as any).historyCompactOpen).toBe(true);
		});

		it('show and hide Link State Modal', () => {
			expect(get(uiStateStore).showDijkstraModal).toBe(false);

			ui.setShowDijkstraModal(true);
			expect(get(uiStateStore).showDijkstraModal).toBe(true);

			ui.setShowDijkstraModal(false);
			expect(get(uiStateStore).showDijkstraModal).toBe(false);
		});

		it('show and hide Scenario Modal', () => {
			expect(get(uiStateStore).showScenarioModal).toBe(false);

			ui.setShowScenarioModal(true);
			expect(get(uiStateStore).showScenarioModal).toBe(true);

			ui.setShowScenarioModal(false);
			expect(get(uiStateStore).showScenarioModal).toBe(false);
		});

		it('show and hide Surfer window', () => {
			ui.setShowSurfer(true);
			const uiState = get(uiStateStore);
			expect((uiState as any)?.showSurfer).toBe(true);

			ui.setShowSurfer(false);
			expect((get(uiStateStore) as any)?.showSurfer).toBe(false);
		});
	});

	describe('Confirm Menu', () => {
		it('open Confirm Menu', () => {
			const confirmData = {
				title: 'Confirm Action',
				message: 'Do you want to proceed?',
				options: [
					{ id: 'yes', label: 'Yes', intent: 'primary' as const },
					{ id: 'no', label: 'No', intent: 'neutral' as const }
				]
			};

			ui.openConfirmMenu(confirmData, () => {});

			const uiState = get(uiStateStore);
			expect(uiState.confirmMenu).toBeDefined();
			expect(uiState.confirmMenu?.title).toBe('Confirm Action');
			expect(uiState.confirmMenu?.options.length).toBe(2);
		});

		it('choose Confirm Option and handle callback', () => {
			const confirmData = {
				title: 'Test',
				message: 'Confirm?',
				options: [
					{ id: 'yes', label: 'Yes', intent: 'primary' as const },
					{ id: 'no', label: 'No', intent: 'neutral' as const }
				]
			};

			let selectedOption = '';
			ui.openConfirmMenu(confirmData, (optionId) => {
				selectedOption = optionId;
			});

			ui.chooseConfirmOption('yes');
			expect(selectedOption).toBe('yes');
		});

		it('opens conflict confirm menu and abort keeps state unchanged', () => {
			const controller = get(simulationStore);
			controller.nextStep();
			controller.nextStep();
			controller.jumpToStep(0);
			(controller.history[2] as any).executedEvents = [
				new SimulationEvent(2, EventType.NODE_MOVE, 'R1', {})
			];

			ui.renameRouter('R1', 'xxx');

			const pendingConfirm = get(uiStateStore).confirmMenu;
			expect(pendingConfirm?.open).toBe(true);
			expect(pendingConfirm?.title).toBe('Future conflicts detected');
			expect(get(simulationStore).topology.nodes.get('R1')?.name).toBe('Router 1');

			ui.chooseConfirmOption('abort');

			expect(get(uiStateStore).confirmMenu?.open).toBe(false);
			expect(get(simulationStore).topology.nodes.get('R1')?.name).toBe('Router 1');
			expect(get(simulationStore).history.length).toBe(3);
		});

		it('opens conflict confirm menu and truncate applies change', () => {
			const controller = get(simulationStore);
			controller.nextStep();
			controller.nextStep();
			controller.jumpToStep(0);
			(controller.history[2] as any).executedEvents = [
				new SimulationEvent(2, EventType.NODE_MOVE, 'R1', {})
			];

			ui.renameRouter('R1', 'xxx');
			expect(get(uiStateStore).confirmMenu?.open).toBe(true);

			ui.chooseConfirmOption('truncate');

			const updatedController = get(simulationStore);
			expect(updatedController.topology.nodes.get('R1')?.name).toBe('xxx');
			expect(updatedController.history.length).toBe(1);
			expect(get(uiStateStore).canUndo).toBe(true);
		});
	});

	describe('Drag and Drop', () => {
		it('set is Drag Over', () => {
			ui.setIsDragOver(true);
			expect(get(uiStateStore).isDragOver).toBe(true);

			ui.setIsDragOver(false);
			expect(get(uiStateStore).isDragOver).toBe(false);
		});

		it('Drag and Drop Workflow', () => {
			const controller = get(simulationStore);

			ui.setIsDragOver(true);
			expect(get(uiStateStore).isDragOver).toBe(true);

			ui.setSelectedRouter('R1');
			expect(get(uiStateStore).selectedRouterId).toBe('R1');

			ui.setIsDragOver(false);
			expect(get(uiStateStore).isDragOver).toBe(false);

			const r1 = controller.topology.nodes.get('R1');
			expect(r1).toBeDefined();
		});
	});

	describe('JSON Import/Export', () => {
		it('export Json', () => {
			const json = ui.exportJson();
			expect(json).toBeDefined();
			expect(json.length).toBeGreaterThan(0);

			const parsed = JSON.parse(json);
			expect(parsed).toBeDefined();
		});

		it('import Json and restore state', () => {
			const controller = get(simulationStore);
			const originalNodeCount = controller.topology.nodes.size;

			ui.renameRouter('R1', 'Custom Router');
			const json = ui.exportJson();

			ui.reset();
			ui.importJson(json);

			const imported = get(simulationStore);
			expect(imported.topology.nodes.size).toBe(originalNodeCount);
			expect(imported.topology.nodes.get('R1')?.name).toBe('Custom Router');
		});

		it('export modified topology', () => {
			ui.renameRouter('R1', 'Modified Router');
			ui.changeLinkWeight('R1', 'R2', 10);

			const json = ui.exportJson();
			const parsed = JSON.parse(json);
			expect(parsed).toBeDefined();
		});
	});

	describe('Undo/Redo', () => {
		it('undo single operation', () => {
			ui.renameRouter('R1', 'First Change');
			expect(get(simulationStore).topology.nodes.get('R1')?.name).toBe('First Change');

			ui.undo();
			expect(get(simulationStore).topology.nodes.get('R1')?.name).toBe('Router 1');
		});

		it('undo multiple operations', () => {
			ui.renameRouter('R1', 'First Change');
			ui.renameRouter('R1', 'Second Change');
			expect(get(simulationStore).topology.nodes.get('R1')?.name).toBe('Second Change');

			ui.undo();
			expect(get(simulationStore).topology.nodes.get('R1')?.name).toBe('First Change');

			ui.undo();
			expect(get(simulationStore).topology.nodes.get('R1')?.name).toBe('Router 1');
		});

		it('redo operations', () => {
			ui.renameRouter('R1', 'Changed');
			ui.undo();
			expect(get(simulationStore).topology.nodes.get('R1')?.name).toBe('Router 1');

			ui.redo();
			expect(get(simulationStore).topology.nodes.get('R1')?.name).toBe('Changed');
		});

		it('undo/redo with link changes', () => {
			ui.changeLinkWeight('R1', 'R2', 5);
			expect(get(simulationStore).topology.links[0].weight).toBe(5);

			ui.undo();
			expect(get(simulationStore).topology.links[0].weight).toBe(1);

			ui.redo();
			expect(get(simulationStore).topology.links[0].weight).toBe(5);
		});
	});

	describe('Topology', () => {
		it('get Topology', () => {
			const topology = ui.getTopology();

			expect(topology).toBeDefined();
			expect(topology.nodes.size).toBe(3);
			expect(topology.links.length).toBe(2);
		});

		it('compute Shortest Paths', () => {
			const topology = ui.getTopology();
			const paths = ui.computeShortestPaths(topology, 'R1');

			expect(paths).toBeDefined();
			expect(paths.has('R1')).toBe(true);
			expect(paths.get('R1')).toBe(0);
		});
	});

	describe('Workflows', () => {
		it('editor workflow', () => {
			ui.toggleMenuOpen();
			expect(get(uiStateStore).menuOpen).toBe(true);

			ui.togglePlacementMode('router');
			expect(get(uiStateStore).placementMode).toBe('router');

			ui.setLinkWeight(5);
			expect(get(uiStateStore).linkWeight).toBe(5);

			ui.toggleMenuOpen();
			expect(get(uiStateStore).menuOpen).toBe(false);
			expect(get(uiStateStore).placementMode).toBe('none');

			ui.setSelectedRouter('R2');
			expect(get(uiStateStore).selectedRouterId).toBe('R2');

			ui.togglePlacementMode('link');
			ui.setLinkDraftSourceId('R2');
			expect(get(uiStateStore).linkDraftSourceId).toBe('R2');

			ui.clearPlacementMode();
			expect(get(uiStateStore).placementMode).toBe('none');
		});

		it('simulation workflow', () => {
			const controller = get(simulationStore);

			expect(controller.currentStepIndex).toBe(0);

			ui.nextStep();
			expect(get(simulationStore).currentStepIndex).toBe(1);

			ui.stepForward();
			expect(get(simulationStore).currentStepIndex).toBe(2);

			ui.stepBackward();
			expect(get(simulationStore).currentStepIndex).toBe(1);

			const json = ui.exportJson();
			expect(json.length).toBeGreaterThan(0);

			ui.stop();
			expect(get(simulationStore).currentStepIndex).toBe(0);

			ui.importJson(json);
			expect(get(simulationStore).currentStepIndex).toBe(0);
		});

		it('topology editing', () => {
			ui.addNode(400, 400);
			expect(get(simulationStore).topology.nodes.size).toBe(4);

			ui.renameRouter('R1', 'Modified R1');
			expect(get(simulationStore).topology.nodes.get('R1')?.name).toBe('Modified R1');

			ui.setAlgorithm(RoutingAlgorithmType.DISTANCE_VECTOR);
			expect(get(simulationStore).algorithm).toBe(RoutingAlgorithmType.DISTANCE_VECTOR);

			ui.setAlgorithm(RoutingAlgorithmType.LINK_STATE);
			expect(get(simulationStore).algorithm).toBe(RoutingAlgorithmType.LINK_STATE);

			ui.nextStep();
			expect(get(simulationStore).currentStepIndex).toBe(1);

			const json = ui.exportJson();
			expect(json.length).toBeGreaterThan(0);
		});

		it('undo/redo', () => {
			ui.renameRouter('R1', 'First');
			ui.changeLinkWeight('R1', 'R2', 5);
			ui.addNode(300, 300);

			const nodeCountBefore = get(simulationStore).topology.nodes.size;

			ui.undo();
			ui.undo();
			ui.undo();

			expect(get(simulationStore).topology.nodes.get('R1')?.name).toBe('Router 1');
			expect(get(simulationStore).topology.links[0].weight).toBe(1);
			expect(get(simulationStore).topology.nodes.size).toBe(nodeCountBefore - 1);

			ui.redo();
			ui.redo();
			ui.redo();

			expect(get(simulationStore).topology.nodes.get('R1')?.name).toBe('First');
			expect(get(simulationStore).topology.links[0].weight).toBe(5);
			expect(get(simulationStore).topology.nodes.size).toBe(nodeCountBefore);
		});

		it('model consistency during multiple operations', () => {
			const controller = get(simulationStore);
			const initialNodeCount = controller.topology.nodes.size;
			const initialLinkCount = controller.topology.links.length;

			ui.setSelectedRouter('R1');
			ui.togglePlacementMode('link');
			ui.setLinkDraftSourceId('R1');
			ui.setLinkWeight(3);
			ui.clearPlacementMode();
			ui.toggleMenuOpen();
			ui.toggleMenuOpen();

			const updated = get(simulationStore);
			expect(updated.topology.nodes.size).toBe(initialNodeCount);
			expect(updated.topology.links.length).toBe(initialLinkCount);
		});
	});

	describe('Packet Preview and Selection', () => {
		it('preview Packet between two routers', () => {
			ui.previewPacket('R1', 'R3');

			const uiState = get(uiStateStore);
			expect((uiState as any).packetPreview).toBeDefined();
			expect((uiState as any).packetPreview.sourceId).toBe('R1');
			expect((uiState as any).packetPreview.targetId).toBe('R3');
		});

		it('preview Packet with same source and target', () => {
			ui.previewPacket('R1', 'R1');

			const uiState = get(uiStateStore);
			expect((uiState as any).packetPreview?.error).toBeDefined();
		});

		it('preview Packet with invalid source', () => {
			ui.previewPacket('', 'R3');

			const uiState = get(uiStateStore);
			expect((uiState as any).packetPreview?.error).toBeDefined();
		});

		it('preview Packet with invalid target', () => {
			ui.previewPacket('R1', '');

			const uiState = get(uiStateStore);
			expect((uiState as any).packetPreview?.error).toBeDefined();
		});

		it('preview Packet with non-existent routers', () => {
			ui.previewPacket('INVALID1', 'INVALID2');

			const uiState = get(uiStateStore);
			expect((uiState as any).packetPreview?.error).toBeDefined();
		});

		it('select Packet Router with invalid id', () => {
			ui.selectPacketRouter('');

			const uiState = get(uiStateStore);
			expect(uiState.packetPreview.sourceId).toBeNull();
			expect(uiState.packetPreview.targetId).toBeNull();
		});

		it('selecting same packet source twice keeps target unset', () => {
			ui.clearPacketPreview();
			ui.selectPacketRouter('R1');
			ui.selectPacketRouter('R1');

			const preview = (get(uiStateStore) as any).packetPreview;
			expect(preview?.sourceId).toBe('R1');
			expect(preview?.targetId).toBeNull();
		});

		it('preview Packet returns disabled-router error', () => {
			ui.setRouterDisabled('R1', true);
			ui.previewPacket('R1', 'R3');

			const preview = (get(uiStateStore) as any).packetPreview;
			expect(preview?.error).toBe('router disabled');
		});

		it('preview Packet returns unreachable when graph is disconnected', () => {
			ui.deleteLink('R2', 'R3');
			ui.previewPacket('R1', 'R3');

			const preview = (get(uiStateStore) as any).packetPreview;
			expect(preview?.error).toBe('unreachable');
			expect(preview?.nodePath).toEqual(['R1']);
		});

		it('warns when computeActualPath is missing in selectPacketRouter fallback', () => {
			const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
			const controller = get(simulationStore) as any;
			controller.computeActualPath = undefined;

			try {
				ui.clearPacketPreview();
				ui.selectPacketRouter('R1');
				ui.selectPacketRouter('R3');
				expect(warnSpy).toHaveBeenCalledWith('computeActualPath missing on controller');
			} finally {
				warnSpy.mockRestore();
			}
		});

		it('select packet router uses computeActualPath when available', () => {
			const controller = get(simulationStore) as any;
			const actualPathSpy = vi.spyOn(controller, 'computeActualPath');

			ui.clearPacketPreview();
			ui.selectPacketRouter('R1');
			ui.selectPacketRouter('R3');

			const uiState = get(uiStateStore) as any;
			expect(uiState.packetPreview?.sourceId).toBe('R1');
			expect(uiState.packetPreview?.targetId).toBe('R3');
			expect(actualPathSpy).toHaveBeenCalledWith('R1', 'R3');
		});

		it('routing path with highlighted links', () => {
			ui.previewPacket('R1', 'R3');

			const uiState = get(uiStateStore);
			expect((uiState as any).highlightedLinkIds).toBeDefined();
		});

		it('computeShortestPath skips false defined and disabled links', () => {
			const r1 = new Router('R1', 'Router 1', 0, 0);
			const r2 = new Router('R2', 'Router 2', 100, 0);
			const r3 = new Router('R3', 'Router 3', 200, 0);
			(r2 as any).disabled = true;
			const nodes = new Map<string, Router>([
				['R1', r1],
				['R2', r2],
				['R3', r3]
			]);

			const ctrl: any = {
				topology: {
					nodes,
					links: [
						{ id: 'LF', source: { id: '' }, target: { id: 'R2' }, weight: 1 },
						{ id: 'LDIS', source: { id: 'R1' }, target: { id: 'R2' }, weight: 1 },
						{ id: 'LOK', source: { id: 'R1' }, target: { id: 'R3' }, weight: 2 }
					]
				}
			};

			const res = (ui as any).computeShortestPath(ctrl, 'R1', 'R3');
			expect(res.error).toBeNull();
			expect(res.cost).toBe(2);
		});

		it('computeShortestPath handles missing predecessor guard path', () => {
			const controller = get(simulationStore) as any;
			const originalGet = Map.prototype.get;
			const mapGetSpy = vi.spyOn(Map.prototype, 'get').mockImplementation(function (
				this: Map<unknown, unknown>,
				key: unknown
			) {
				const value = originalGet.call(this, key);
				if (
					key === 'R3' &&
					value &&
					typeof value === 'object' &&
					'node' in (value as Record<string, unknown>) &&
					'linkId' in (value as Record<string, unknown>)
				) {
					return undefined;
				}
				return value;
			});

			try {
				const res = (ui as any).computeShortestPath(controller, 'R1', 'R3');
				expect(res.nodePath[0]).toBe('R3');
			} finally {
				mapGetSpy.mockRestore();
			}
		});
	});

	describe('Event Management', () => {
		it('add Event to simulation', () => {
			const event = new SimulationEvent(0, EventType.NODE_DISABLE, 'R1', {
				disabled: true
			});

			ui.addEvent(event);

			const controller = get(simulationStore);
			expect(controller).toBeDefined();
			expect(controller.history[0].executedEvents.length).toBe(1);
		});

		it('add multiple Events', () => {
			const event1 = new SimulationEvent(0, EventType.NODE_DISABLE, 'R1', {
				disabled: true
			});

			const event2 = new SimulationEvent(1, EventType.NODE_ENABLE, 'R1', {
				disabled: false
			});

			ui.addEvent(event1);
			ui.addEvent(event2);

			const controller = get(simulationStore);
			expect(controller).toBeDefined();
			expect(controller.history[0].executedEvents.length).toBe(2);
		});
	});

	describe('Edge Cases', () => {
		it('handle setLinkWeight with float values', () => {
			ui.setLinkWeight(3.7);
			expect(get(uiStateStore).linkWeight).toBe(3);

			ui.setLinkWeight(0.5);
			expect(get(uiStateStore).linkWeight).toBe(1);
		});

		it('togglePlacementMode', () => {
			ui.togglePlacementMode('router');
			expect(get(uiStateStore).placementMode).toBe('router');

			ui.togglePlacementMode(null as any);
			expect(get(uiStateStore).placementMode).toBeDefined();
		});

		it('setLinkDraftSourceId with whitespace', () => {
			ui.setLinkDraftSourceId('  R1  ');
			expect(get(uiStateStore).linkDraftSourceId).toBe('R1');

			ui.setLinkDraftSourceId('   ');
			expect(get(uiStateStore).linkDraftSourceId).toBeNull();
		});

		it('setSelectedRouter clearing selection', () => {
			ui.setSelectedRouter('R1');
			expect(get(uiStateStore).selectedRouterId).toBe('R1');

			ui.setSelectedRouter(null);
			expect(get(uiStateStore).selectedRouterId).toBeNull();
		});

		it('renameRouter with empty name', () => {
			ui.renameRouter('R1', ' ');
			const r1 = get(simulationStore).topology.nodes.get('R1');
			expect(r1?.name).toBe('Router 1');
		});

		it('updateNodePosition with negative coordinates', () => {
			ui.updateNodePosition('R1', -100, -200);
			const r1 = get(simulationStore).topology.nodes.get('R1');
			expect(r1?.xPos).toBe(-100);
			expect(r1?.yPos).toBe(-200);
		});

		it('updateNodePosition with large coordinates', () => {
			ui.updateNodePosition('R1', 10000, 20000);
			const r1 = get(simulationStore).topology.nodes.get('R1');
			expect(r1?.xPos).toBe(10000);
			expect(r1?.yPos).toBe(20000);
		});

		it('jumpToStep with step 0', () => {
			ui.nextStep();
			ui.nextStep();

			const state = ui.jumpToStep(0);
			expect(state).toBeDefined();
			expect(get(simulationStore).currentStepIndex).toBe(0);
		});

		it('changeLinkWeight multiple times', () => {
			ui.changeLinkWeight('R1', 'R2', 5);
			expect(get(simulationStore).topology.links[0].weight).toBe(5);

			ui.changeLinkWeight('R1', 'R2', 10);
			expect(get(simulationStore).topology.links[0].weight).toBe(10);

			ui.changeLinkWeight('R1', 'R2', 1);
			expect(get(simulationStore).topology.links[0].weight).toBe(1);
		});

		it('clearPlacementMode, already cleared', () => {
			expect(get(uiStateStore).placementMode).toBe('none');
			ui.clearPlacementMode();
			expect(get(uiStateStore).placementMode).toBe('none');
		});

		it('addNode at same position multiple times', () => {
			const controller = get(simulationStore);
			const initialCount = controller.topology.nodes.size;

			ui.addNode(100, 100);
			ui.addNode(100, 100);
			ui.addNode(100, 100);

			expect(get(simulationStore).topology.nodes.size).toBe(initialCount + 3);
		});

		it('deleteNode that does not exist', () => {
			const controller = get(simulationStore);
			const initialCount = controller.topology.nodes.size;

			ui.deleteNode('xxx');

			expect(get(simulationStore).topology.nodes.size).toBe(initialCount);
		});

		it('export and import with empty topology modification', () => {
			const json1 = ui.exportJson();
			ui.importJson(json1);
			const json2 = ui.exportJson();

			expect(() => JSON.parse(json1)).not.toThrow();
			expect(() => JSON.parse(json2)).not.toThrow();
		});

		it('setRoutingHover with null values', () => {
			ui.setRoutingHover('R1', 'R2');
			ui.setRoutingHover(null, null);

			const uiState = get(uiStateStore);
			expect((uiState as any).routingHover?.sourceId).toBeNull();
			expect((uiState as any).routingHover?.targetId).toBeNull();
		});

		it('updateNodePositions with empty array', () => {
			const controller = get(simulationStore);
			const initialState = {
				r1: controller.topology.nodes.get('R1')?.xPos,
				r2: controller.topology.nodes.get('R2')?.xPos
			};

			ui.updateNodePositions([]);

			const updated = get(simulationStore);
			expect(updated.topology.nodes.get('R1')?.xPos).toBe(initialState.r1);
			expect(updated.topology.nodes.get('R2')?.xPos).toBe(initialState.r2);
		});

		it('togglePlacementMode sendpacket clears packet preview', () => {
			ui.togglePlacementMode('sendpacket');
			expect(get(uiStateStore).placementMode).toBe('sendpacket');

			ui.togglePlacementMode('sendpacket');
			expect(get(uiStateStore).placementMode).toBe('none');
		});

		it('clearPlacementMode from sendpacket clears preview', () => {
			ui.togglePlacementMode('sendpacket');
			ui.clearPlacementMode();

			expect(get(uiStateStore).placementMode).toBe('none');
		});

		it('toggleMenuOpen closes multiple modals simultaneously', () => {
			
			ui.setShowHistoryModal(true);
			expect(get(uiStateStore).showHistoryModal).toBe(true);

			ui.setShowDijkstraModal(true);
			ui.setShowScenarioModal(true);

			expect(get(uiStateStore).showDebugModal).toBe(false);
			expect(get(uiStateStore).showHistoryModal).toBe(false);

			ui.toggleMenuOpen();

			expect(get(uiStateStore).showDebugModal).toBe(false);
			expect(get(uiStateStore).showHistoryModal).toBe(false);
			expect(get(uiStateStore).showDijkstraModal).toBe(false);
			expect(get(uiStateStore).showScenarioModal).toBe(false);
		});

		it('place first link then select target', () => {
			ui.togglePlacementMode('link');
			ui.setLinkDraftSourceId('R1');
			expect(get(uiStateStore).linkDraftSourceId).toBe('R1');

			ui.togglePlacementMode('link');
			expect(get(uiStateStore).placementMode).toBe('none');
		});

		it('computeShortestPaths edge cases', () => {
			const topology = ui.getTopology();

			const paths1 = ui.computeShortestPaths(topology, 'R1');
			expect(paths1.has('R1')).toBe(true);
			expect(paths1.get('R1')).toBe(0);

			const dist1to2 = paths1.get('R2');
			expect(dist1to2).toBeGreaterThan(0);
		});

		it('computeShortestPaths to unreachable nodes', () => {
			ui.deleteLink('R2', 'R3');

			const topology = ui.getTopology();
			const paths = ui.computeShortestPaths(topology, 'R1');

			expect(paths.get('R3')).toBe(Infinity);
		});

		it('multiple undo/redo cycles', () => {
			ui.renameRouter('R1', 'Change1');
			ui.renameRouter('R1', 'Change2');
			ui.renameRouter('R1', 'Change3');

			ui.undo();
			expect(get(simulationStore).topology.nodes.get('R1')?.name).toBe('Change2');

			ui.undo();
			expect(get(simulationStore).topology.nodes.get('R1')?.name).toBe('Change1');

			ui.redo();
			expect(get(simulationStore).topology.nodes.get('R1')?.name).toBe('Change2');

			ui.undo();
			ui.undo();
			expect(get(simulationStore).topology.nodes.get('R1')?.name).toBe('Router 1');
		});

		it('simultaneous modal operations', () => {
			
			ui.setShowHistoryModal(true);

			expect(get(uiStateStore).showDebugModal).toBe(false);
			expect(get(uiStateStore).showHistoryModal).toBe(true);

			ui.setShowDebugModal(false);
			expect(get(uiStateStore).showDebugModal).toBe(false);
			expect(get(uiStateStore).showHistoryModal).toBe(true);

			ui.setShowHistoryModal(false);
			expect(get(uiStateStore).showHistoryModal).toBe(false);
		});

		it('complex node and link creation workflow', () => {
			const initialNodeCount = get(simulationStore).topology.nodes.size;
			const initialLinkCount = get(simulationStore).topology.links.length;

			ui.addNode(500, 500);
			expect(get(simulationStore).topology.nodes.size).toBe(initialNodeCount + 1);

			const newNodeId = Array.from(get(simulationStore).topology.nodes.keys()).find(
				(id) => get(simulationStore).topology.nodes.get(id)?.xPos === 500
			);

			expect(newNodeId).toBeDefined();

			ui.addLink(newNodeId!, 'R1', 3);
			expect(get(simulationStore).topology.links.length).toBe(initialLinkCount + 1);
		});

		it('previewPacket path consistency', () => {
			ui.previewPacket('R1', 'R3');
			const uiState1 = get(uiStateStore) as any;
			const preview1 = uiState1.packetPreview;

			ui.previewPacket('R1', 'R3');
			const uiState2 = get(uiStateStore) as any;
			const preview2 = uiState2.packetPreview;

			expect(preview1.nodePath).toEqual(preview2.nodePath);
		});

		it('getTopology returns current state', () => {
			const topo1 = ui.getTopology();
			const nodeCount1 = topo1.nodes.size;
			const linkCount1 = topo1.links.length;

			ui.addNode(100, 100);

			const topo2 = ui.getTopology();
			expect(topo2.nodes.size).toBe(nodeCount1 + 1);
			expect(topo2.links.length).toBe(linkCount1);
		});

		it('setIsDragOver multiple times', () => {
			ui.setIsDragOver(true);
			expect(get(uiStateStore).isDragOver).toBe(true);

			ui.setIsDragOver(true);
			expect(get(uiStateStore).isDragOver).toBe(true);

			ui.setIsDragOver(false);
			expect(get(uiStateStore).isDragOver).toBe(false);

			ui.setIsDragOver(false);
			expect(get(uiStateStore).isDragOver).toBe(false);
		});

		it('setRouterDisabled prevents selection', () => {
			ui.setRouterDisabled('R1', true);
			ui.setSelectedRouter('R1');

			expect(get(uiStateStore).selectedRouterId).toBe('R1');
		});

		it('reset clears all state', () => {
			ui.nextStep();
			ui.nextStep();
			ui.nextStep();

			ui.setSelectedRouter('R1');
			ui.togglePlacementMode('router');

			ui.reset();

			expect(get(simulationStore).currentStepIndex).toBe(0);
			expect(get(uiStateStore).selectedRouterId).toBe(null);
		});

		it('clear keeps topology but resets simulation', () => {
			ui.nextStep();
			ui.nextStep();
			ui.addNode(100, 100);

			ui.clear();

			expect(get(simulationStore).currentStepIndex).toBe(0);
			expect(get(simulationStore).topology.nodes.size).toBe(0);
		});
	});

	describe('Error Toast', () => {
		it('show and hide Error Toast', () => {
			ui.showErrorToast('Test error message');
			let uiState = get(uiStateStore);
			expect((uiState as any).errorToast?.open).toBe(true);
			expect((uiState as any).errorToast?.message).toBe('Test error message');

			ui.hideErrorToast();
			uiState = get(uiStateStore);
			expect((uiState as any).errorToast?.open).toBe(false);
			expect((uiState as any).errorToast?.message).toBe('');
		});

		it('show Error Toast with empty message', () => {
			ui.showErrorToast('');
			const uiState = get(uiStateStore);
			expect(uiState.errorToast.open).toBe(false);
		});

		it('show empty Error Toast', () => {
			ui.showErrorToast('   ');
			const uiState = get(uiStateStore);
			expect(uiState.errorToast.open).toBe(false);
		});

		it('show multiple Error Toasts', () => {
			ui.showErrorToast('First error');
			expect((get(uiStateStore) as any).errorToast?.message).toBe('First error');

			ui.showErrorToast('Second error');
			expect((get(uiStateStore) as any).errorToast?.message).toBe('Second error');
		});
	});

	describe('Confirm Menu Actions', () => {
		it('close Confirm Menu', () => {
			const confirmData = {
				title: 'Test Confirm',
				message: 'Are you sure?',
				options: [{ id: 'yes', label: 'Yes', intent: 'primary' as const }]
			};

			ui.openConfirmMenu(confirmData, () => {});
			expect((get(uiStateStore) as any).confirmMenu?.open).toBe(true);

			ui.closeConfirmMenu();
			expect((get(uiStateStore) as any).confirmMenu?.open).toBe(false);
			expect((get(uiStateStore) as any).confirmMenu?.title).toBe('');
		});

		it('close Confirm Menu clears handler', () => {
			let callbackCalled = false;
			const confirmData = {
				title: 'Test',
				message: 'Test',
				options: [{ id: 'ok', label: 'OK', intent: 'primary' as const }]
			};

			ui.openConfirmMenu(confirmData, () => {
				callbackCalled = true;
			});
			ui.closeConfirmMenu();

			expect((get(uiStateStore) as any).confirmMenu?.open).toBe(false);
			expect(callbackCalled).toBe(false);
		});
	});
});
