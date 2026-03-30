import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SimulationController } from '../src/lib/model/SimulationController';
import { Topology } from '../src/lib/model/Topology';
import { Router } from '../src/lib/model/Router';
import { Link } from '../src/lib/model/Link';
import { RoutingAlgorithmType } from '../src/lib/model/RoutingAlgorithmType';
import { DistanceVectorAlgorithm } from '../src/lib/model/DistanceVectorAlgorithm';
import { LinkStateAlgorithm } from '../src/lib/model/LinkStateAlgorithm';
import { SimulationEvent } from '../src/lib/model/SimulationEvent';
import { SimulationState } from '../src/lib/model/SimulationState';
import { RoutingPacket } from '../src/lib/model/RoutingPacket';
import { RoutingTable } from '../src/lib/model/RoutingTable';
import { EventType } from '$lib/model/EventType';
import { Json } from '../src/lib/model/Json';

function createTopology() {
	const topology = new Topology();
	const routerA = new Router('R1', 'Router A', 0, 0);
	const routerB = new Router('R2', 'Router B', 100, 0);
	const routerC = new Router('R3', 'Router C', 200, 0);
	const routerD = new Router('R4', 'Router D', 300, 0);

	const initTopoSize = 4;

	const link1 = new Link('L1', routerA, routerB, 1);
	const link2 = new Link('L2', routerB, routerC, 1);
	const link3 = new Link('L3', routerC, routerD, 5);

	topology.links.push(link1, link2, link3);

	routerA.addNeighbor(link1);
	routerB.addNeighbor(link1);
	routerB.addNeighbor(link2);
	routerC.addNeighbor(link2);
	routerC.addNeighbor(link3);
	routerD.addNeighbor(link3);

	topology.nodes.set(routerA.id, routerA);
	topology.nodes.set(routerB.id, routerB);
	topology.nodes.set(routerC.id, routerC);
	topology.nodes.set(routerD.id, routerD);

	return { topology, routerA, routerB, routerC, link1, link2, initTopoSize };
}
/**
 * Testet die SimulationController Klasse, die die Simulation steuert und Historie verwaltet.
 */
describe('SimulationController', () => {
	let controller: SimulationController;
	let topology: Topology;
	let initTopoSize: number;

	beforeEach(() => {
		({ topology, initTopoSize } = createTopology());
		controller = new SimulationController(topology);
	});

	describe('Algorithms', () => {
		it('set algorithm to DISTANCE_VECTOR', () => {
			controller.setAlgorithm(RoutingAlgorithmType.DISTANCE_VECTOR);
			expect(controller.algorithm).toBe(RoutingAlgorithmType.DISTANCE_VECTOR);
		});

		it('set algorithm to DISTANCE_VECTOR_POISONED', () => {
			controller.setAlgorithm(RoutingAlgorithmType.DISTANCE_VECTOR_POISONED);
			expect(controller.algorithm).toBe(RoutingAlgorithmType.DISTANCE_VECTOR_POISONED);
		});

		it('set algorithm to LINK_STATE', () => {
			controller.setAlgorithm(RoutingAlgorithmType.DISTANCE_VECTOR);
			expect(controller.algorithm).toBe(RoutingAlgorithmType.DISTANCE_VECTOR);
			controller.setAlgorithm(RoutingAlgorithmType.LINK_STATE);
			expect(controller.algorithm).toBe(RoutingAlgorithmType.LINK_STATE);
		});

		it('set algorithm to all routers when changed', () => {
			controller.setAlgorithm(RoutingAlgorithmType.LINK_STATE);
			expect(controller.algorithm).toBe(RoutingAlgorithmType.LINK_STATE);

			controller.setAlgorithm(RoutingAlgorithmType.DISTANCE_VECTOR);
			const nodes = controller.topology.nodes;

			for (const node of nodes.values()) {
				expect(node.algorithm).toBeInstanceOf(DistanceVectorAlgorithm);
				expect((node.algorithm as DistanceVectorAlgorithm).poisoned).toBe(false);
			}
		});
	});

	describe('Simulation Steps', () => {
		it('simulate next step', () => {
			const initialStep = controller.currentStepIndex;
			controller.nextStep();
			expect(controller.currentStepIndex).toBe(initialStep + 1);
		});

		it('create a history entry for each step', () => {
			expect(controller.history.length).toBe(1);
			expect(controller.currentStepIndex).toBe(0);
			controller.nextStep();
			controller.nextStep();
			expect(controller.history.length).toBe(3);
			expect(controller.currentStepIndex).toBe(2);
		});

		it('jump to a specific step', () => {
			controller.nextStep();
			controller.nextStep();
			controller.nextStep();

			controller.jumpToStep(1);
			expect(controller.currentStepIndex).toBe(1);
		});

		it('simulate forward when jumping beyond existing history', () => {
			const initialHistoryLength = controller.history.length;
			controller.jumpToStep(5);

			expect(controller.currentStepIndex).toBe(5);
			expect(controller.history.length).toBeGreaterThan(initialHistoryLength);
		});

		it('commit pending edits into an update step on nextStep', () => {
			controller.addNode(10, 20);
			expect(controller.history.length).toBe(1);
			expect(controller.topology.nodes.size).toBe(initTopoSize + 1);

			controller.nextStep();

			expect(controller.currentStepIndex).toBe(1);
			expect(controller.history.length).toBe(2);
			expect((controller.history[1] as any).stepType).toBe('update');
			expect(controller.history[0].topologyState.nodes.size).toBe(initTopoSize);
			expect(controller.history[1].topologyState.nodes.size).toBe(initTopoSize + 1);
			expect(controller.history[1].executedEvents.length).toBe(1);
			expect(controller.history[1].executedEvents[0].type).toBe(EventType.NODE_ADDITION);
		});

		it('DV nextStep creates send and recompute snapshots in one call', () => {
			controller.setAlgorithm(RoutingAlgorithmType.DISTANCE_VECTOR);
			controller.nextStep();

			expect(controller.currentStepIndex).toBe(2);
			expect(controller.history.length).toBe(3);
			expect((controller.history[1] as any).stepType).toBe('send');
			expect((controller.history[2] as any).stepType).toBe('recompute');
		});
	});

	describe('Play/Pause', () => {
		it('set playing to true when play is called', () => {
			controller.play();
			expect(controller.playing).toBe(true);
		});

		it('set playing  to false when pause is called', () => {
			controller.play();
			controller.pause();
			expect(controller.playing).toBe(false);
		});
	});

	describe('Node Operations', () => {
		it('add a new router', () => {
			const initialNodeCount = controller.topology.nodes.size;
			controller.addNode(0, 100);

			expect(controller.topology.nodes.size).toBe(initialNodeCount + 1);
		});

		it('generate unique router ids', () => {
			controller.addNode(0, 100);
			controller.addNode(100, 100);

			const nodeIds = Array.from(controller.topology.nodes.keys());
			expect(nodeIds.includes('R4')).toBe(true);
			expect(nodeIds.includes('R5')).toBe(true);
		});

		it('position new node at specified coordinates', () => {
			controller.addNode(250, 150);

			const nodes = Array.from(controller.topology.nodes.values());
			const newNode = nodes[nodes.length - 1];

			expect(newNode.xPos).toBe(250);
			expect(newNode.yPos).toBe(150);
		});

		it('delete a router', () => {
			const initialNodeCount = controller.topology.nodes.size;
			controller.deleteNode('R1');

			expect(controller.topology.nodes.size).toBe(initialNodeCount - 1);
			expect(controller.topology.nodes.has('R1')).toBe(false);
		});

		it('remove connected links when deleting a node', () => {
			const initialLinkCount = controller.topology.links.length;
			controller.deleteNode('R2');

			expect(controller.topology.links.length).toBeLessThan(initialLinkCount);
		});

		it('move a node to new position', () => {
			controller.moveNode('R1', 1000, 1000);

			const node = controller.topology.nodes.get('R1') as Router;
			expect(node.xPos).toBe(1000);
			expect(node.yPos).toBe(1000);
		});

		it('move many nodes at once', () => {
			controller.moveNodes([
				{ id: 'R1', xPos: 10, yPos: 20 },
				{ id: 'R2', xPos: 30, yPos: 40 }
			]);

			const node1 = controller.topology.nodes.get('R1') as Router;
			const node2 = controller.topology.nodes.get('R2') as Router;

			expect(node1.xPos).toBe(10);
			expect(node1.yPos).toBe(20);
			expect(node2.xPos).toBe(30);
			expect(node2.yPos).toBe(40);
		});

		it('rename a router', () => {
			controller.renameRouter('R1', 'NewName');

			const node = controller.topology.nodes.get('R1') as Router;
			expect(node.name).toBe('NewName');
		});

		it('handle renaming non-existent router gracefully', () => {
			expect(() => {
				controller.renameRouter('R999', 'Test');
			}).not.toThrow();
		});

		it('disable a router', () => {
			controller.setRouterDisabled('R1', true);

			const node = controller.topology.nodes.get('R1') as Router;
			expect(node.disabled).toBe(true);
		});

		it('enable a disabled router', () => {
			controller.setRouterDisabled('R1', true);
			controller.setRouterDisabled('R1', false);

			const node = controller.topology.nodes.get('R1') as Router;
			expect(node.disabled).toBe(false);
		});
	});

	describe('Link Operations', () => {
		it('add a new link', () => {
			const initialLinkCount = controller.topology.links.length;
			controller.addLink('R1', 'R3', 2);

			expect(controller.topology.links.length).toBe(initialLinkCount + 1);
		});

		it('not add duplicate links', () => {
			const initialLinkCount = controller.topology.links.length;
			controller.addLink('R1', 'R2', 1);

			expect(controller.topology.links.length).toBe(initialLinkCount);
		});

		it('not add link to same node', () => {
			const initialLinkCount = controller.topology.links.length;
			controller.addLink('R1', 'R1', 1);

			expect(controller.topology.links.length).toBe(initialLinkCount);
		});

		it('delete an existing link', () => {
			const initialLinkCount = controller.topology.links.length;
			controller.deleteLink('R1', 'R2');

			expect(controller.topology.links.length).toBe(initialLinkCount - 1);
		});

		it('change link weight', () => {
			controller.changeLinkWeight('R1', 'R2', 5);

			const link = controller.topology.links.find(
				(l) =>
					(l.source.id === 'R1' && l.target.id === 'R2') ||
					(l.source.id === 'R2' && l.target.id === 'R1')
			);

			expect(link?.weight).toBe(5);
		});
	});

	describe('Undo/Redo', () => {
		it('no changes to undo', () => {
			expect(controller.canUndo).toBe(false);
		});

		it('no redo capability initially', () => {
			expect(controller.canRedo).toBe(false);
		});

		it('enable undo after a change', () => {
			controller.addNode(300, 100);
			expect(controller.canUndo).toBe(true);
		});

		it('undo a node addition', () => {
			const initialNodeCount = controller.topology.nodes.size;
			controller.addNode(300, 100);

			controller.undo();
			expect(controller.topology.nodes.size).toBe(initialNodeCount);
		});

		it('enable redo after undo', () => {
			controller.addNode(300, 100);
			controller.undo();

			expect(controller.canRedo).toBe(true);
		});

		it('redo an undone change', () => {
			controller.addNode(300, 100);
			const nodeCountAfterAdd = controller.topology.nodes.size;

			controller.undo();
			expect(controller.topology.nodes.size).toBe(nodeCountAfterAdd - 1);
			controller.redo();

			expect(controller.topology.nodes.size).toBe(nodeCountAfterAdd);
		});

		it('clear redo stack after new change', () => {
			controller.addNode(300, 100);
			controller.undo();

			expect(controller.canRedo).toBe(true);

			controller.addNode(400, 100);
			expect(controller.canRedo).toBe(false);
		});

		it('handle multiple undo operations', () => {
			controller.addNode(300, 100);
			controller.addNode(400, 100);

			controller.undo();
			controller.undo();

			expect(controller.topology.nodes.size).toBe(initTopoSize);
		});

		it('should clear undo and redo stacks', () => {
			controller.addNode(100, 100);
			controller.undo();
			expect(controller.canRedo).toBe(true);
			controller.clearUndoRedoStacks();
			expect(controller.canUndo).toBe(false);
			expect(controller.canRedo).toBe(false);
		});
	});

	describe('Clone Methods', () => {
		it('Topology.clone creates a independent copy', () => {
			const topo = controller.getTopology();
			const clone = topo.clone();

			expect(clone).not.toBe(topo);
			expect(clone.nodes).not.toBe(topo.nodes);
			expect(clone.links).not.toBe(topo.links);

			expect(clone.nodes.size).toBe(topo.nodes.size);
			expect(clone.links.length).toBe(topo.links.length);
			clone.nodes.delete('R1');
			expect(topo.nodes.has('R1')).toBe(true);
		});

		it('RoutingTable.clone creates a independent copy', () => {
			controller.setAlgorithm(RoutingAlgorithmType.LINK_STATE);
			controller.nextStep();
			controller.nextStep();
			const router = controller.topology.nodes.get('R1') as Router;
			const table = router.routingTable;
			const clone = table.clone();

			expect(clone).not.toBe(table);
			expect(clone.entries).not.toBe(table.entries);
			expect(clone.entries.size).toBe(table.entries.size);

			clone.entries.clear();
			expect(table.entries.size).toBeGreaterThan(0);
		});

		it('Router.clone creates a independent copy', () => {
			const router = controller.topology.nodes.get('R1') as Router;
			const clone = router.clone();

			expect(clone).not.toBe(router);
			expect(clone.routingTable).not.toBe(router.routingTable);
			expect(clone.neighbors).not.toBe(router.neighbors);
			expect(clone.routingTable.entries).not.toBe(router.routingTable.entries);

			expect(clone.id).toBe(router.id);
			expect(clone.name).toBe(router.name);
			expect(clone.xPos).toBe(router.xPos);
			expect(clone.yPos).toBe(router.yPos);
		});

		it('Router.clone copies dvState tables', () => {
			const router = controller.topology.nodes.get('R1') as Router;
			router.dvState = {
				dvs: { R1: { R2: { dist: 5, nextHop: 'R2' } } },
				oldDvs: { R1: { R2: { dist: 7, nextHop: 'R2' } } },
				updated: true
			};

			const clone = router.clone();
			expect(clone.dvState).toBeTruthy();
			expect(clone.dvState?.dvs).not.toBe(router.dvState?.dvs);
			expect(clone.dvState?.oldDvs).not.toBe(router.dvState?.oldDvs);
			expect(clone.dvState?.dvs.R1.R2.dist).toBe(5);
			expect(clone.dvState?.oldDvs.R1.R2.dist).toBe(7);
		});
	});

	describe('Topology', () => {
		it('return current topology', () => {
			controller.addNode(0, 0);
			const topo = controller.getTopology();
			expect(topo).toBeDefined();
			expect(topo.nodes.size).toBe(initTopoSize + 1);
		});

		it('return cloned topology', () => {
			const topo1 = controller.getTopology();
			const topo2 = controller.getTopology();

			expect(topo1).not.toBe(topo2);
		});

		it('return initial topology', () => {
			controller.nextStep();
			controller.addNode(0, 0);

			const initialTopo = controller.getInitialTopology();
			expect(initialTopo.nodes.size).toBe(initTopoSize);
		});

		it('return total steps count', () => {
			controller.nextStep();
			controller.nextStep();

			expect(controller.history.length).toBe(3);
		});

		it('compute shortest paths for topology', () => {
			const distances = controller.computeShortestPathsForTopology(topology, 'R1');

			expect(distances.get('R1')).toBe(0);
			expect(distances.get('R2')).toBe(1);
			expect(distances.get('R3')).toBe(2);
			expect(distances.get('R4')).toBe(7);
		});

		it('proof optimality after algorithm execution', () => {
			controller.setAlgorithm(RoutingAlgorithmType.DISTANCE_VECTOR);
			controller.nextStep();

			expect((controller.topology.nodes.get('R1') as Router).optimal).toBe(false);

			controller.nextStep();
			controller.nextStep();
			controller.nextStep();

			expect((controller.topology.nodes.get('R1') as Router).optimal).toBe(true);
		});

		it('proof neighbors of router', () => {
			expect((controller.topology.nodes.get('R2') as Router).isNeighborRouterId('R1')).toBe(true);
			expect((controller.topology.nodes.get('R2') as Router).isNeighborRouterId('R3')).toBe(true);
			expect((controller.topology.nodes.get('R2') as Router).isNeighborRouterId('R4')).toBe(false);
		});
	});

	describe('Json Import/Export', () => {
		it('exportJson returns valid JSON string', () => {
			const jsonString = controller.exportJson();
			expect(() => JSON.parse(jsonString)).not.toThrow();
		});

		it('importJson restores topology from JSON string', () => {
			controller.addNode(400, 400);
			const jsonString = controller.exportJson();

			const newController = new SimulationController(new Topology());
			newController.importJson(jsonString);

			expect(newController.topology.nodes.size).toBe(controller.topology.nodes.size);
			expect(newController.topology.links.length).toBe(controller.topology.links.length);
			expect(newController.topology.nodes.get('R1')?.xPos).toBe(
				controller.topology.nodes.get('R1')?.xPos
			);
			expect(newController.topology.nodes.get('R1')?.yPos).toBe(
				controller.topology.nodes.get('R1')?.yPos
			);
			expect(newController.topology.nodes.get('R5')?.xPos).toBe(
				controller.topology.nodes.get('R5')?.xPos
			);
			expect(newController.topology.nodes.get('R5')?.yPos).toBe(
				controller.topology.nodes.get('R5')?.yPos
			);
		});
		it('import invalid JSON', () => {
			const invalidJson = 'xxxxxx';
			const newController = new SimulationController(new Topology());
			expect(() => newController.importJson(invalidJson)).toThrow();
		});

		it('import JSON with missing fields', () => {
			const incompleteJson = JSON.stringify({ invalid: 'data' });
			const newController = new SimulationController(new Topology());
			expect(() => newController.importJson(incompleteJson)).toThrow();
		});

		it('same import and export', () => {
			controller.addNode(500, 500);
			controller.changeLinkWeight('R1', 'R2', 15);
			const json1 = controller.exportJson();

			const newController = new SimulationController(new Topology());
			newController.importJson(json1);
			const json2 = newController.exportJson();
			const doc1 = JSON.parse(json1);
			const doc2 = JSON.parse(json2);

			expect(doc2.algorithm).toBe(doc1.algorithm);
			expect(doc2.history.length).toBe(doc1.history.length);

			for (let i = 0; i < doc1.history.length; i++) {
				const s1 = doc1.history[i];
				const s2 = doc2.history[i];

				expect(s2.step).toBe(s1.step);
				expect(s2.stepType ?? null).toBe(s1.stepType ?? null);

				const n1 = s1.topology.nodes;
				const n2 = s2.topology.nodes;
				expect(n2.length).toBe(n1.length);

				const nodes2ById = new Map(n2.map((n: any) => [String(n.id), n]));
				for (const node1 of n1) {
					const node2 = nodes2ById.get(String(node1.id));
					expect(node2).toBeTruthy();
					expect(node2.disabled ?? false).toBe(node1.disabled ?? false);
					expect(node2.xPos ?? 0).toBe(node1.xPos ?? 0);
					expect(node2.yPos ?? 0).toBe(node1.yPos ?? 0);

					const rt1 = Array.isArray(node1?.routingTable?.entries)
						? node1.routingTable.entries
						: [];
					const rt2 = Array.isArray(node2?.routingTable?.entries)
						? node2.routingTable.entries
						: [];
					const rt2ByDest = new Map(
						rt2.map((e: any) => [String(e.destinationId), e])
					);
					for (const entry1 of rt1) {
						const entry2 = rt2ByDest.get(String(entry1.destinationId));
						expect(entry2).toBeTruthy();
						expect(entry2.nextHopId).toBe(entry1.nextHopId);
						expect(entry2.cost).toBe(entry1.cost);
					}
				}

				const l1 = s1.topology.links;
				const l2 = s2.topology.links;
				expect(l2.length).toBe(l1.length);
				const linkKey = (l: any) => {
					const a = String(l.sourceId);
					const b = String(l.targetId);
					return a < b ? `${a}__${b}` : `${b}__${a}`;
				};
				const l2ByKey = new Map(l2.map((l: any) => [linkKey(l), l]));
				for (const link1 of l1) {
					const link2 = l2ByKey.get(linkKey(link1));
					expect(link2).toBeTruthy();
					expect(link2.weight).toBe(link1.weight);
				}
			}
		});

		it('same import and export after deleting a node', () => {
			controller.deleteNode('R4');
			const json1 = controller.exportJson();

			const newController = new SimulationController(new Topology());
			newController.importJson(json1);
			const json2 = newController.exportJson();
			expect(JSON.parse(json1)).toEqual(JSON.parse(json2));
		});

		it('handle export/import with disabled routers', () => {
			controller.setRouterDisabled('R1', true);
			controller.setRouterDisabled('R3', true);

			const json = controller.exportJson();
			const newController = new SimulationController(new Topology());
			newController.importJson(json);

			expect((newController.topology.nodes.get('R1') as Router).disabled).toBe(true);
			expect((newController.topology.nodes.get('R3') as Router).disabled).toBe(true);
		});

		it('importJson recalculates optimal flags for imported history snapshots', () => {
			controller.setAlgorithm(RoutingAlgorithmType.DISTANCE_VECTOR);
			controller.nextStep();
			controller.nextStep();
			controller.nextStep();
			controller.nextStep();

			expect((controller.history[4].topologyState.nodes.get('R1') as Router).optimal).toBe(true);

			const json = controller.exportJson();
			const newController = new SimulationController(new Topology());
			newController.importJson(json);
			newController.jumpToStep(4);

			expect((newController.topology.nodes.get('R1') as Router).optimal).toBe(true);
		});
	});

	function runSteps(controller: SimulationController, steps: number) {
		for (let i = 0; i < steps; i++) {
			controller.nextStep();
		}
	}

	describe('Routing Algorithms', () => {
		it('converges via controller DV steps', () => {
			controller.setAlgorithm(RoutingAlgorithmType.DISTANCE_VECTOR);

			runSteps(controller, 6);

			const r1 = controller.topology.nodes.get('R1') as Router;

			expect(r1.routingTable.entries.get('R3')?.cost).toBe(2);
			expect(r1.routingTable.entries.get('R3')?.nextHopId).toBe('R2');
			expect(r1.routingTable.entries.get('R4')?.cost).toBe(7);
			expect(r1.routingTable.entries.get('R4')?.nextHopId).toBe('R2');
		});

		it('updates routes after link weight increase', () => {
			controller.setAlgorithm(RoutingAlgorithmType.DISTANCE_VECTOR);

			runSteps(controller, 6);

			const r1 = controller.topology.nodes.get('R1') as Router;
			expect(r1.routingTable.entries.get('R3')?.cost).toBe(2);

			controller.changeLinkWeight('R2', 'R3', 10);

			runSteps(controller, 10);

			const r1Updated = controller.topology.nodes.get('R1') as Router;

			expect(r1Updated.routingTable.entries.get('R3')?.cost).toBe(11);
			expect(r1Updated.routingTable.entries.get('R3')?.nextHopId).toBe('R2');
		});
	});

	describe('Conflict Resolution', () => {
		it('does not apply conflicting change when no conflict resolver is configured', () => {
			controller.nextStep();
			controller.nextStep();
			controller.jumpToStep(0);
			(controller.history[2] as any).executedEvents = [
				new SimulationEvent(2, EventType.NODE_MOVE, 'R1', {})
			];

			controller.setConflictResolver(null);
			controller.renameRouter('R1', 'xxx');

			expect((controller.topology.nodes.get('R1') as Router).name).toBe('Router A');
			expect(controller.history.length).toBe(3);
			expect(controller.canUndo).toBe(false);
		});

		it('keeps state unchanged when conflict resolver cancels', () => {
			controller.nextStep();
			controller.nextStep();
			controller.jumpToStep(0);
			(controller.history[2] as any).executedEvents = [
				new SimulationEvent(2, EventType.NODE_MOVE, 'R1', {})
			];

			controller.setConflictResolver((_conflicts, _proceed, cancel) => cancel());
			const beforeName = (controller.topology.nodes.get('R1') as Router).name;
			const beforeHistoryLength = controller.history.length;

			controller.renameRouter('R1', 'xxx');

			expect((controller.topology.nodes.get('R1') as Router).name).toBe(beforeName);
			expect(controller.history.length).toBe(beforeHistoryLength);
			expect(controller.canUndo).toBe(false);
		});

		it('truncates future and applies change when conflict resolver proceeds', () => {
			controller.nextStep();
			controller.nextStep();
			controller.jumpToStep(0);
			(controller.history[2] as any).executedEvents = [
				new SimulationEvent(2, EventType.NODE_MOVE, 'R1', {})
			];

			controller.setConflictResolver((_conflicts, proceed, _cancel) => proceed());
			controller.renameRouter('R1', '123');

			expect((controller.topology.nodes.get('R1') as Router).name).toBe('123');
			expect(controller.history.length).toBe(1);
			expect(controller.canUndo).toBe(true);
		});

		it('propagates past edits to future snapshots when no conflict exists', () => {
			controller.nextStep();
			controller.nextStep();
			controller.jumpToStep(0);
			(controller.history[2] as any).executedEvents = [
				new SimulationEvent(2, EventType.NODE_MOVE, 'R4', {})
			];

			controller.renameRouter('R1', 'xxx');

			expect((controller.topology.nodes.get('R1') as Router).name).toBe('xxx');
			expect(controller.history.length).toBe(3);
			expect(controller.history[1].topologyState.nodes.get('R1')?.name).toBe('xxx');
			expect(controller.history[2].topologyState.nodes.get('R1')?.name).toBe('xxx');
		});

		it('handle node additions', () => {
			const initialSize = controller.topology.nodes.size;
			controller.addNode(100, 100);
			controller.addNode(200, 200);

			expect(controller.topology.nodes.size).toBe(initialSize + 2);
		});

		it('handle link additions', () => {
			const initialLinkCount = controller.topology.links.length;
			controller.addLink('R1', 'R3', 2);
			controller.addLink('R1', 'R4', 3);

			expect(controller.topology.links.length).toBe(initialLinkCount + 2);
		});

		it('prevent duplicate link when added multiple times', () => {
			const initialLinkCount = controller.topology.links.length;
			controller.addLink('R1', 'R3', 2);
			controller.addLink('R1', 'R3', 5);
			controller.addLink('R3', 'R1', 10);

			expect(controller.topology.links.length).toBe(initialLinkCount + 1);
		});

		it('handle node deletion during undo/redo', () => {
			controller.addNode(300, 100);
			const nodeCountAfterAdd = controller.topology.nodes.size;

			controller.undo();
			expect(controller.topology.nodes.size).toBe(nodeCountAfterAdd - 1);

			controller.redo();
			expect(controller.topology.nodes.size).toBe(nodeCountAfterAdd);

			controller.undo();
			expect(controller.topology.nodes.size).toBe(nodeCountAfterAdd - 1);
		});

		it('handle link deletion during undo/redo', () => {
			const initialLinkCount = controller.topology.links.length;
			controller.deleteLink('R1', 'R2');

			expect(controller.topology.links.length).toBe(initialLinkCount - 1);

			controller.undo();
			expect(controller.topology.links.length).toBe(initialLinkCount);

			controller.redo();
			expect(controller.topology.links.length).toBe(initialLinkCount - 1);
		});

		it('handle weight change conflict with deleted link', () => {
			controller.addLink('R1', 'R3', 2);
			controller.changeLinkWeight('R1', 'R3', 10);

			const link = controller.topology.links.find(
				(l) =>
					(l.source.id === 'R1' && l.target.id === 'R3') ||
					(l.source.id === 'R3' && l.target.id === 'R1')
			);

			expect(link?.weight).toBe(10);

			controller.deleteLink('R1', 'R3');
			expect(controller.topology.links.length).toBe(3);
		});

		it('handle move and delete node conflict', () => {
			controller.moveNode('R1', 500, 500);
			const node = controller.topology.nodes.get('R1') as Router;
			expect(node.xPos).toBe(500);
			expect(node.yPos).toBe(500);

			controller.deleteNode('R1');
			expect(controller.topology.nodes.has('R1')).toBe(false);

			controller.undo();
			expect(controller.topology.nodes.has('R1')).toBe(true);
			expect((controller.topology.nodes.get('R1') as Router).xPos).toBe(500);
		});

		it('handle rename and delete node', () => {
			controller.renameRouter('R1', 'ImportantRouter');
			const node = controller.topology.nodes.get('R1') as Router;
			expect(node.name).toBe('ImportantRouter');

			controller.deleteNode('R1');
			expect(controller.topology.nodes.has('R1')).toBe(false);

			controller.undo();
			expect((controller.topology.nodes.get('R1') as Router).name).toBe('ImportantRouter');
		});

		it('handle algorithm change during simulation steps', () => {
			controller.setAlgorithm(RoutingAlgorithmType.DISTANCE_VECTOR);
			controller.nextStep();
			controller.nextStep();

			controller.setAlgorithm(RoutingAlgorithmType.LINK_STATE);
			expect(controller.algorithm).toBe(RoutingAlgorithmType.LINK_STATE);

			controller.nextStep();
			const router = controller.topology.nodes.get('R1') as Router;
			expect(router.algorithm).toBeDefined();
		});

		it('handle topology changes during active simulation', () => {
			controller.play();
			expect(controller.playing).toBe(true);

			controller.addNode(250, 250);
			expect(controller.playing).toBe(true);
			expect(controller.topology.nodes.size).toBeGreaterThan(4);
		});

		it('handle disabled router in topology operations', () => {
			controller.setRouterDisabled('R1', true);
			const node = controller.topology.nodes.get('R1') as Router;
			expect(node.disabled).toBe(true);

			controller.moveNode('R1', 600, 600);
			expect(node.xPos).toBe(600);
			expect(node.yPos).toBe(600);
		});

		it('handle multiple undo/redo operations', () => {
			controller.addNode(300, 100);
			controller.addLink('R1', 'R3', 2);
			controller.renameRouter('R1', 'Router1');

			const nodeCount = controller.topology.nodes.size;
			const linkCount = controller.topology.links.length;

			controller.undo();
			controller.undo();
			controller.undo();

			expect(controller.topology.nodes.size).toBe(nodeCount - 1);
			expect(controller.topology.links.length).toBe(linkCount - 1);
			expect((controller.topology.nodes.get('R1') as Router).name).toBe('Router A');
		});

		it('handle jump to step during active simulation', () => {
			controller.play();
			controller.nextStep();
			controller.nextStep();

			expect(controller.currentStepIndex).toBeGreaterThan(0);

			controller.jumpToStep(1);
			expect(controller.currentStepIndex).toBe(1);
		});

		it('handle conflicting moves and position updates', () => {
			controller.moveNode('R1', 100, 100);
			controller.moveNode('R1', 200, 200);

			const node = controller.topology.nodes.get('R1') as Router;
			expect(node.xPos).toBe(200);
			expect(node.yPos).toBe(200);
		});

		it('handle batch move operations consistency', () => {
			controller.moveNodes([
				{ id: 'R1', xPos: 50, yPos: 50 },
				{ id: 'R2', xPos: 150, yPos: 150 },
				{ id: 'R3', xPos: 250, yPos: 250 }
			]);

			const r1 = controller.topology.nodes.get('R1') as Router;
			const r2 = controller.topology.nodes.get('R2') as Router;
			const r3 = controller.topology.nodes.get('R3') as Router;

			expect(r1.xPos).toBe(50);
			expect(r1.yPos).toBe(50);
			expect(r2.xPos).toBe(150);
			expect(r2.yPos).toBe(150);
			expect(r3.xPos).toBe(250);
			expect(r3.yPos).toBe(250);
		});
	});

	describe('computeActualPath', () => {
		it('should return correct node and link path for reachable target', () => {
			controller.setAlgorithm(RoutingAlgorithmType.DISTANCE_VECTOR);
			for (let i = 0; i < 5; i++) controller.nextStep();
			const result = controller.computeActualPath('R1', 'R4');
			expect(result.nodePath[0]).toBe('R1');
			expect(result.nodePath[result.nodePath.length - 1]).toBe('R4');
			expect(result.linkPath.length).toBeGreaterThan(0);
		});
		it('should return empty paths for unreachable or invalid nodes', () => {
			const result = controller.computeActualPath('R1', 'R999');
			expect(result.nodePath).toEqual([]);
			expect(result.linkPath).toEqual([]);
		});
		it('should return empty paths if source is disabled', () => {
			controller.setRouterDisabled('R1', true);
			const result = controller.computeActualPath('R1', 'R2');
			expect (result.nodePath).toEqual(['R1']);
			expect(result.nodePath.length).toBe(1);
		});
		it('returns a trivial path when source equals target', () => {
			const result = controller.computeActualPath('R1', 'R1');
			expect(result.nodePath).toEqual(['R1']);
			expect(result.linkPath).toEqual([]);
		});
	});

	describe('Topology cloning', () => {
		it('getTopology returns a defensive clone', () => {
			const topo = controller.getTopology();
			const orig = controller.topology;

			const node = topo.nodes.get('R1');
			if (node) node.xPos = 999;
			if (topo.links[0]) topo.links[0].weight = 42;

			expect(orig.nodes.get('R1')?.xPos).not.toBe(999);
			expect(orig.links[0]?.weight).not.toBe(42);
		});
	});

	describe('Sequence index', () => {
		it('sequenceIndexForStep skips update steps', () => {
			const topo = controller.topology;
			const st0 = new SimulationState(0, topo);
			const st1 = new SimulationState(1, topo);
			const st2 = new SimulationState(2, topo);
			(st1 as any).stepType = 'update';
			(st2 as any).stepType = 'send';

			(controller as any).history = [st0, st1, st2];

			const seq0 = (controller as any).sequenceIndexForStep(0, (controller as any).history);
			const seq1 = (controller as any).sequenceIndexForStep(1, (controller as any).history);
			const seq2 = (controller as any).sequenceIndexForStep(2, (controller as any).history);

			expect(seq0).toBe(0);
			expect(seq1).toBe(0);
			expect(seq2).toBe(1);
		});
	});

	describe('Topology sync', () => {
		it('syncTopologyStructure updates nodes and links to match target', () => {
			const base = controller.topology;
			const target = new Topology();

			const r1 = new Router('R1', 'Router A', 0, 0);
			const r2 = new Router('R2', 'Router B', 100, 0);
			const r5 = new Router('R5', 'Router E', 200, 0);
			const link = new Link('L99', r1, r5, 7);

			r1.addNeighbor(link);
			r5.addNeighbor(link);

			target.nodes.set(r1.id, r1);
			target.nodes.set(r2.id, r2);
			target.nodes.set(r5.id, r5);
			target.links.push(link);

			const changed = (controller as any).syncTopologyStructure(base, target);
			expect(changed).toBe(true);
			expect(base.nodes.has('R5')).toBe(true);
			expect(base.links.length).toBe(1);
			expect(base.links[0]?.weight).toBe(7);
		});
	});

	describe('History rebuild', () => {
		it('rebuildHistoryForAlgorithm preserves steps and events', () => {
			controller.addNode(300, 300);
			controller.addEvent(new SimulationEvent(0, EventType.NODE_ADDITION, 'R1', {}));
			controller.addEvent(new SimulationEvent(0, EventType.NODE_RENAME, 'R1', { name: 'R1' }));
			controller.nextStep();

			const st = controller['currentState']();
			expect(st.executedEvents.length).toBeGreaterThan(0);

			controller.rebuildHistoryForAlgorithm(RoutingAlgorithmType.DISTANCE_VECTOR);

			expect(controller.history.length).toBeGreaterThan(0);
			expect(controller.algorithm).toBe(RoutingAlgorithmType.DISTANCE_VECTOR);

			const rebuilt = controller['currentState']();
			expect(rebuilt.executedEvents.length).toBeGreaterThanOrEqual(0);

			const n = controller.topology.nodes.get('R1') as Router;
			expect(n.algorithm).toBeTruthy();
		});

		it('importJson assigns algorithm when setAlgorithm is missing', () => {
			const json = controller.exportJson();

			const original = Router.prototype.setAlgorithm;
			// @ts-expect-error test override
			delete (Router.prototype as any).setAlgorithm;

			try {
				const newController = new SimulationController(new Topology());
				newController.importJson(json);
				const node = newController.topology.nodes.get('R1') as any;
				expect(node?.algorithm).toBeTruthy();
			} finally {
				Router.prototype.setAlgorithm = original;
			}
		});

		it('importJson infers DV step types when missing', () => {
			const data = {
				algorithm: 'DISTANCE_VECTOR',
				history: [
					{
						step: 0,
						topology: {
							nodes: [
								{ id: 'R1', type: 'ROUTER' },
								{ id: 'R2', type: 'ROUTER' }
							],
							links: [{ id: 'L1', sourceId: 'R1', targetId: 'R2', weight: 1 }]
						},
						events: []
					},
					{
						step: 1,
						topology: {
							nodes: [
								{ id: 'R1', type: 'ROUTER' },
								{ id: 'R2', type: 'ROUTER' }
							],
							links: [{ id: 'L1', sourceId: 'R1', targetId: 'R2', weight: 1 }]
						},
						events: []
					}
				]
			};
			const newController = new SimulationController(new Topology());
			newController.importJson(JSON.stringify(data));

			const topo1 = newController.history[1].topologyState as any;
			const r1 = topo1.nodes.get('R1');
			expect(r1?.dvState).toBeTruthy();
		});
	});

	describe('Pending edits', () => {
		it('commitPendingEditsIfAny inserts update step when there is a diff', () => {
			controller.addNode(400, 400);
			const beforeLen = controller.history.length;

			const committed = (controller as any).commitPendingEditsIfAny();
			expect(committed).toBe(true);
			expect(controller.history.length).toBe(beforeLen + 1);
			const st = controller.history[controller.currentStepIndex] as any;
			expect(st.stepType).toBe('update');
		});
	});

	describe('Private helpers', () => {
		it('topologySignature is stable for equivalent topologies', () => {
			const topo = controller.topology;
			const sig1 = (controller as any).topologySignature(topo);

			const cloned = controller.getTopology();
			const sig2 = (controller as any).topologySignature(cloned);

			expect(sig2).toBe(sig1);
		});

		it('clearPendingIfNoDiff clears when nothing changed', () => {
			(controller as any).beginPendingEdit();
			expect((controller as any).pendingEditBase).toBeTruthy();

			(controller as any).clearPendingIfNoDiff();
			expect((controller as any).pendingEditBase).toBe(null);
		});

		it('truncateFuture removes snapshots after current step', () => {
			controller.nextStep();
			controller.nextStep();
			controller.nextStep();
			expect(controller.history.length).toBeGreaterThan(1);

			controller.currentStepIndex = 0;
			(controller as any).truncateFuture();

			expect(controller.history.length).toBe(1);
		});

		it('applyAlgorithmToRouter honors algorithm type', () => {
			(controller as any).algorithmType = RoutingAlgorithmType.DISTANCE_VECTOR_POISONED;
			const r = new Router('RX', 'RX', 0, 0);
			(controller as any).applyAlgorithmToRouter(r);
			expect(r.algorithm).toBeInstanceOf(DistanceVectorAlgorithm);
			expect((r.algorithm as DistanceVectorAlgorithm).poisoned).toBe(true);
		});

		it('undo restores snapshot even when history is empty (index beyond length)', () => {
			controller.addNode(200, 200);
			const snapshot = (controller as any).cloneSimulationState(
				(controller as any).currentState()
			);
			(controller as any).undoStack.push(snapshot);
			(controller as any).history = [];
			controller.currentStepIndex = 7;

			controller.undo();
			expect(controller.history.length).toBe(1);
		});
	});
	describe('changeLinkWeights', () => {
		it('should change multiple link weights at once', () => {
			controller.addLink('R1', 'R3', 2);
			controller.addLink('R2', 'R4', 2);
			controller.changeLinkWeights([
				{ sourceId: 'R1', targetId: 'R3', weight: 7 },
				{ sourceId: 'R2', targetId: 'R4', weight: 8 }
			]);
			const link1 = controller.topology.links.find(
				(l) =>
					(l.source.id === 'R1' && l.target.id === 'R3') ||
					(l.source.id === 'R3' && l.target.id === 'R1')
			);
			const link2 = controller.topology.links.find(
				(l) =>
					(l.source.id === 'R2' && l.target.id === 'R4') ||
					(l.source.id === 'R4' && l.target.id === 'R2')
			);
			expect(link1?.weight).toBe(7);
			expect(link2?.weight).toBe(8);
		});
		it('should ignore invalid or duplicate changes', () => {
			const before = controller.topology.links.map((l) => l.weight);
			controller.changeLinkWeights([
				{ sourceId: 'R1', targetId: 'R1', weight: 10 },
				{ sourceId: 'R1', targetId: 'R2', weight: 1 }
			]);
			const after = controller.topology.links.map((l) => l.weight);
			expect(after).toEqual(before);
		});
	});
	describe('addEvent', () => {
		it('should not add if event is null', () => {
			const state = controller['currentState']();
			const before = state.executedEvents.length;
			controller.addEvent(null as any);
			expect(state.executedEvents.length).toBe(before);
		});
	});

	describe('Edge Cases', () => {
		it('handle empty topology gracefully', () => {
			const emptyController = new SimulationController(new Topology(new Map(), []));
			expect(emptyController.topology.nodes.size).toBe(0);
			expect(emptyController.topology.links.length).toBe(0);
			expect(() => emptyController.nextStep()).not.toThrow();
		});

		it('importJson falls back to empty state when parser returns no states', () => {
			const importSpy = vi.spyOn(Json, 'importJson').mockReturnValue({
				algorithm: RoutingAlgorithmType.LINK_STATE,
				states: []
			} as any);

			try {
				controller.importJson('{"algorithm":"LINK_STATE","history":[{}]}');
			} finally {
				importSpy.mockRestore();
			}

			expect(controller.history.length).toBe(1);
			expect(controller.currentStepIndex).toBe(0);
			expect(controller.topology.nodes.size).toBe(0);
			expect(controller.topology.links.length).toBe(0);
		});

		it('handle negative weights in link operations', () => {
			const nodes = Array.from(controller.topology.nodes.keys());
			if (nodes.length >= 2) {
				controller.changeLinkWeight(nodes[0], nodes[1], -5);
				expect(true).toBe(true);
			}
		});

		it('handle large step jumps', () => {
			const initialStep = controller.currentStepIndex;
			controller.jumpToStep(1000);
			expect(controller.currentStepIndex).toBeGreaterThan(initialStep);
			expect(controller.history.length).toBeGreaterThan(1000);
		});

		it('handle jumping to negative steps', () => {
			controller.nextStep();
			controller.jumpToStep(-5);
			expect(controller.currentStepIndex).toBe(0);
		});

		it('handle multiple algorithm changes', () => {
			controller.setAlgorithm(RoutingAlgorithmType.DISTANCE_VECTOR);
			controller.setAlgorithm(RoutingAlgorithmType.LINK_STATE);
			controller.setAlgorithm(RoutingAlgorithmType.DISTANCE_VECTOR_POISONED);
			expect(controller.algorithm).toBe(RoutingAlgorithmType.DISTANCE_VECTOR_POISONED);
		});

		it('handle empty move operations', () => {
			expect(() => controller.moveNodes([])).not.toThrow();
		});

		it('handle empty link weight changes', () => {
			expect(() => controller.changeLinkWeights([])).not.toThrow();
		});

		it('handle duplicate move operations', () => {
			const nodeId = Array.from(controller.topology.nodes.keys())[0];
			const updates = [
				{ id: nodeId, xPos: 50, yPos: 50 },
				{ id: nodeId, xPos: 100, yPos: 100 }
			];
			expect(() => controller.moveNodes(updates)).not.toThrow();
		});

		it('false node in link', () => {
			const links = controller.topology.links;
			const link1 = links[0];
			expect(() => link1.otherSide('R999')).toThrow();
		});

		it('no history', () => {
			const newController = new SimulationController(new Topology());
			newController.history = [];
			expect(newController.history.length).toBe(0);
			(newController as any).currentState();
			expect(newController.history.length).toBe(1);
		});

		it('build dvState for each router when algorithm is DISTANCE_VECTOR', () => {
			controller.setAlgorithm(RoutingAlgorithmType.DISTANCE_VECTOR);
			(controller as any).buildDvStateFromRoutingTables(topology);
			for (const node of topology.nodes.values()) {
				expect((node as any).dvState).toBeDefined();
				expect((node as any).dvState.dvs).toBeDefined();
				expect((node as any).dvState.oldDvs).toBeDefined();
			}
		});

		it('nextStep does not mutate the initial DV snapshot when generating the first send/recompute pair', () => {
			const json = JSON.stringify({
				algorithm: 'DISTANCE_VECTOR',
				history: [
					{
						step: 0,
						topology: {
							nodes: [
								{
									id: 'R1',
									type: 'ROUTER',
									name: 'A',
									xPos: 0,
									yPos: 0,
									disabled: false,
									routingTable: {
										entries: [
											{ destinationId: 'R1', nextHopId: 'R1', cost: 0 },
											{ destinationId: 'R2', nextHopId: '-', cost: 'Infinity' }
										]
									}
								},
								{
									id: 'R2',
									type: 'ROUTER',
									name: 'B',
									xPos: 100,
									yPos: 0,
									disabled: false,
									routingTable: {
										entries: [
											{ destinationId: 'R1', nextHopId: '-', cost: 'Infinity' },
											{ destinationId: 'R2', nextHopId: 'R2', cost: 0 }
										]
									}
								}
							],
							links: [{ id: 'L1', sourceId: 'R1', targetId: 'R2', weight: 1 }]
						},
						events: []
					}
				]
			});

			const c = new SimulationController(new Topology());
			c.importJson(json);
			c.nextStep();

			const step0r1 = c.history[0].topologyState.nodes.get('R1') as Router;
			const step2r1 = c.history[2].topologyState.nodes.get('R1') as Router;

			expect((step0r1 as any).dvState.dvs['R1']['R2'].dist).toBe(Number.POSITIVE_INFINITY);
			expect(step0r1.routingTable.entries.get('R2')?.cost).toBe(Number.POSITIVE_INFINITY);
			expect(step2r1.routingTable.entries.get('R2')?.cost).toBe(1);
			expect((c.history[2] as any).stepType).toBe('recompute');
		});

		it('ConflictResolution: call action if no future steps', () => {
			let called = false;
			const affectedNodeIds = new Set<string>();
			const affectedLinkIds = new Set<string>();
			(controller as any).withPastEditResolution(affectedNodeIds, affectedLinkIds, () => {
				called = true;
			});
			expect(called).toBe(true);
		});

		it('ConflictResolution: call action and truncateFuture if conflicts and proceed(truncate=true)', () => {
			controller.nextStep();
			controller.nextStep();
			let called = false;
			(controller as any).conflictResolver = (
				conflicts: any,
				proceed: () => void,
				cancel: () => void
			) => proceed();
			const affectedNodeIds = new Set<string>(['R2']);
			const affectedLinkIds = new Set<string>();
			(controller as any).withPastEditResolution(affectedNodeIds, affectedLinkIds, () => {
				called = true;
			});
			expect(called).toBe(true);
			expect(controller.history.length).toBe(controller.currentStepIndex + 1);
		});

		it('isLinkEventType', () => {
			expect((controller as any).isLinkEventType(EventType.LINK_FAILURE)).toBe(true);

			expect((controller as any).isLinkEventType(EventType.LINK_ADDITION)).toBe(true);

			expect((controller as any).isLinkEventType(EventType.WEIGHT_CHANGE)).toBe(true);

			expect((controller as any).isLinkEventType(EventType.NODE_ADDITION)).toBe(false);
		});

		it('return correct endpoints for valid linkId', () => {
			const endpoints = (controller as any).getLinkEndpointIds(topology, 'L1');
			expect(endpoints).toEqual({ sourceId: 'R1', targetId: 'R2' });
		});
		it('return null for invalid linkId', () => {
			const endpoints = (controller as any).getLinkEndpointIds(topology, 'invalid');
			expect(endpoints).toBeNull();
		});
		it('return null when link endpoints not exist', () => {
			const malformedTopo = {
				links: [{ id: 'L-bad', source: { id: 'R1' }, target: {} }]
			};
			const endpoints = (controller as any).getLinkEndpointIds(malformedTopo, 'L-bad');
			expect(endpoints).toBeNull();
		});
		it('return 0 conflicts if no future steps', () => {
			const affectedNodeIds = new Set<string>();
			const affectedLinkIds = new Set<string>();
			const result = (controller as any).findFutureConflicts(affectedNodeIds, affectedLinkIds);
			expect(result.conflictCount).toBe(0);
			expect(result.futureSteps).toBe(0);
		});

		it('detect conflicts in future steps', () => {
			controller.nextStep();
			controller.nextStep();
			const event = { type: EventType.LINK_FAILURE, targetId: 'R2' };
			(controller.history[2] as any).executedEvents = [event];
			controller.jumpToStep(0);
			const affectedNodeIds = new Set<string>(['R2']);
			const affectedLinkIds = new Set<string>();
			const result = (controller as any).findFutureConflicts(affectedNodeIds, affectedLinkIds);
			expect(result.conflictCount).toBe(1);
			expect(result.futureSteps).toBe(2);
		});

		it('detect link endpoint conflicts', () => {
			controller.nextStep();
			controller.nextStep();
			const event = { type: EventType.LINK_FAILURE, targetId: 'L1' };
			(controller.history[2] as any).executedEvents = [event];
			controller.jumpToStep(0);
			const affectedNodeIds = new Set<string>(['R1']);
			const affectedLinkIds = new Set<string>();
			const result = (controller as any).findFutureConflicts(affectedNodeIds, affectedLinkIds);
			expect(result.conflictCount).toBe(1);
		});

		it('truncate history after current step', () => {
			controller.nextStep();
			controller.nextStep();
			controller.nextStep();
			controller.jumpToStep(1);
			(controller as any).truncateFuture();
			expect(controller.history.length).toBe(controller.currentStepIndex + 1);
		});

		it('not truncate if current step is last', () => {
			controller.nextStep();
			controller.nextStep();
			controller.jumpToStep(controller.history.length - 1);
			const prevLength = controller.history.length;
			(controller as any).truncateFuture();
			expect(controller.history.length).toBe(prevLength);
		});

		it('handle empty history gracefully', () => {
			const newController = new SimulationController(new Topology());
			newController.history = [];
			newController.currentStepIndex = 0;
			expect(() => (newController as any).truncateFuture()).not.toThrow();
			expect(newController.history.length).toBe(0);
		});

		it('running getter and ignores non-function conflict resolver values', () => {
			expect(controller.running).toBe(false);
			controller.play();
			expect(controller.running).toBe(true);
			controller.setConflictResolver({} as any);
			expect((controller as any).conflictResolver).toBeNull();
		});

		it('returns false and clears pending edit when no diff is present', () => {
			(controller as any).beginPendingEdit();
			const committed = (controller as any).commitPendingEditsIfAny();
			expect(committed).toBe(false);
			expect((controller as any).pendingEditBase).toBeNull();
			expect((controller as any).pendingEditBaseSignature).toBeNull();
		});

		it('createAlgorithmInstance returns null for unknown algorithm type', () => {
			(controller as any).algorithmType = 'xxx';
			expect((controller as any).createAlgorithmInstance()).toBeNull();
			expect((controller as any).isDistanceVectorAlgorithm()).toBe(false);
		});

		it('applyAlgorithmToRouter ignores null routers and sequenceIndexForStep handles empty history', () => {
			expect(() => (controller as any).applyAlgorithmToRouter(null)).not.toThrow();
			expect((controller as any).sequenceIndexForStep(3, [])).toBe(0);
		});

		it('builds DV rows from existing routing table entries', () => {
			controller.setAlgorithm(RoutingAlgorithmType.DISTANCE_VECTOR);
			const r1 = controller.topology.nodes.get('R1') as Router;
			r1.routingTable.addEntry('R2', 'R2', 3);
			(controller as any).buildDvStateFromRoutingTables(controller.topology as any);

			const dvCell = (r1 as any).dvState.dvs['R1']['R2'];
			expect(dvCell.dist).toBe(3);
			expect(dvCell.nextHop).toBe('R2');
		});

		it('refreshDistanceVector assigns DV algorithm on routers without algorithm', () => {
			const r1 = new Router('R1', 'R1', 0, 0);
			const topo = new Topology(new Map([['R1', r1]]), []);
			const c = new SimulationController(topo);
			(c as any).algorithmType = RoutingAlgorithmType.DISTANCE_VECTOR;
			(c as any).refreshDistanceVector(c.topology as any, true, true);
			expect(c.topology.nodes.get('R1')?.algorithm).toBeInstanceOf(DistanceVectorAlgorithm);
		});

		it('cloneTopology preserves packet buffers and neighbor links', () => {
			const r1 = new Router('R1', 'n1', 0, 0);
			const r2 = new Router('R2', 'n2', 0, 0);
			const link = new Link('Lx', r1, r2, 2);
			r1.addNeighbor(link);
			r2.addNeighbor(link);

			r1.algorithm = { k: 'algo' } as any;
			r1.packetBuffer = [new RoutingPacket(r1, r2, 'payload')];

			const topo = new Topology(
				new Map([
					['R1', r1],
					['R2', r2]
				]),
				[link]
			);
			const c = new SimulationController(topo);
			const cloned = (c as any).cloneTopology(topo as any);
			const c1 = cloned.nodes.get('R1') as Router;
			const c2 = cloned.nodes.get('R2') as Router;

			expect(c1.algorithm).toEqual({ k: 'algo' });
			expect(c1.packetBuffer.length).toBe(1);
			expect(c1.packetBuffer[0].source.id).toBe('R1');
			expect(c1.packetBuffer[0].target.id).toBe('R2');
			expect(c1.neighbors.length).toBe(1);
			expect(c2.neighbors.length).toBe(1);
		});

		it('updateRouterOptimalFlags marks route as non-optimal when shortest path map misses a destination', () => {
			const topo = controller.getTopology();
			(controller as any).algorithmType = RoutingAlgorithmType.DISTANCE_VECTOR;
			const computeSpy = vi
				.spyOn(controller as any, 'computeShortestPaths')
				.mockReturnValue(new Map([['R1', 0]]));

			try {
				(controller as any).updateRouterOptimalFlags(topo, 1);
			} finally {
				computeSpy.mockRestore();
			}

			expect((topo.nodes.get('R1') as Router).optimal).toBe(false);
		});

		it('updateRouterOptimalFlags handles routers that disabled', () => {
			const tricky: any = {
				disabled: false,
				optimal: true,
				routingTable: { entries: new Map() },
				neighbors: [],
				get id() {
					this.disabled = true;
					return 'T1';
				}
			};
			const peer: any = {
				id: 'T2',
				disabled: false,
				optimal: true,
				routingTable: { entries: new Map() },
				neighbors: []
			};
			const topo = new Topology(
				new Map([
					['T1', tricky],
					['T2', peer]
				]) as any,
				[]
			);

			(controller as any).algorithmType = RoutingAlgorithmType.DISTANCE_VECTOR;
			(controller as any).updateRouterOptimalFlags(topo, 0);

			expect(tricky.optimal).toBe(false);
		});

		it('undo/redo restore from stacks even when history array is empty', () => {
			const c = new SimulationController(new Topology());
			const topo = new Topology();
			topo.nodes.set('R1', new Router('R1', 'R1', 0, 0));
			const st = new SimulationState(0, topo);

			c.history = [];
			c.currentStepIndex = 0;
			(c as any).undoStack = [st];
			c.undo();
			expect(c.history.length).toBe(1);

			c.history = [];
			c.currentStepIndex = 0;
			(c as any).redoStack = [st];
			c.redo();
			expect(c.history.length).toBe(1);
		});

		it('compareRouterIdsForDijkstra with same ids', () => {
			const nodes = new Map<string, any>([
				['R10', { name: 'xxx' }],
				['R2', { name: 'xxx' }]
			]);
			const cmp = (controller as any).compareRouterIdsForDijkstra('R2', 'R10', nodes);
			expect(cmp).toBeLessThan(0);
		});

		it('computeDijkstraStableStep covers equal-distance lower-hop tie break', () => {
			const s = new Router('S', 'Source', 0, 0);
			const b = new Router('B', 'B', 0, 0);
			const cNode = new Router('C', 'C', 0, 0);
			const a = new Router('A', 'A', 0, 0);
			const l1 = new Link('L1', s, b, 5);
			const l2 = new Link('L2', s, cNode, 2);
			const l3 = new Link('L3', cNode, a, 3);
			s.addNeighbor(l1);
			b.addNeighbor(l1);
			s.addNeighbor(l2);
			cNode.addNeighbor(l2);
			cNode.addNeighbor(l3);
			a.addNeighbor(l3);
			const topo = new Topology(
				new Map([
					['S', s],
					['B', b],
					['C', cNode],
					['A', a]
				]),
				[l1, l2, l3]
			);

			const step = (controller as any).computeDijkstraStableStep(topo, 'S');
			expect(step).not.toBeNull();
		});

		it('computeRoutingPathCost returns finite cost for a valid next-hop', () => {
			const topo = controller.getTopology();
			const r1 = topo.nodes.get('R1') as Router;
			r1.routingTable.addEntry('R2', 'R2', 1);
			const cost = (controller as any).computeRoutingPathCost(topo, 'R1', 'R2');
			expect(cost).toBe(1);
		});

		it('computeRoutingPathCost returns null for self-referential next hop', () => {
			const topo = controller.getTopology();
			const r1 = topo.nodes.get('R1') as Router;
			r1.routingTable.addEntry('R2', 'R1', 1);
			const cost = (controller as any).computeRoutingPathCost(topo, 'R1', 'R2');
			expect(cost).toBeNull();
		});

		it('computeRoutingPathCost returns null for disabled targets', () => {
			const topo = controller.getTopology();
			const r1 = topo.nodes.get('R1') as Router;
			const r3 = topo.nodes.get('R3') as Router;
			r1.routingTable.addEntry('R3', 'R2', 3);
			r3.disabled = true;

			expect((controller as any).computeRoutingPathCost(topo, 'R1', 'R3')).toBeNull();
		});

		it('updateRouterOptimalFlags marks non-optimal when LS stable step not reached', () => {
			const topo = controller.getTopology();
			(controller as any).algorithmType = RoutingAlgorithmType.LINK_STATE;
			const stableSpy = vi.spyOn(controller as any, 'computeDijkstraStableStep').mockReturnValue(5);

			try {
				(controller as any).updateRouterOptimalFlags(topo, 1);
			} finally {
				stableSpy.mockRestore();
			}

			expect((topo.nodes.get('R1') as Router).optimal).toBe(false);
		});

		it('cloneSimulationEvent normalizes non-object payloads', () => {
			const event = new SimulationEvent(0, EventType.NODE_MOVE, 'R1', {} as any);
			(event as any).payload = 'x';
			const cloned = (controller as any).cloneSimulationEvent(event);
			expect(cloned.payload).toEqual({});
		});

		it('findFutureConflicts skips events without targetId', () => {
			controller.nextStep();
			(controller.history[1] as any).executedEvents = [{ type: EventType.NODE_MOVE }];
			controller.jumpToStep(0);

			const res = (controller as any).findFutureConflicts(new Set(['R1']), new Set());
			expect(res.conflictCount).toBe(0);
		});

		it('findFutureConflicts ignores link events with unknown Routers', () => {
			controller.nextStep();
			(controller.history[1] as any).executedEvents = [
				{ type: EventType.LINK_FAILURE, targetId: 'L404' }
			];
			controller.jumpToStep(0);

			const res = (controller as any).findFutureConflicts(new Set(['R1']), new Set());
			expect(res.conflictCount).toBe(0);
		});

		it('cloneSimulationState clones executed events', () => {
			const topo = controller.getTopology();
			const st = new SimulationState(0, topo);
			st.executedEvents = [new SimulationEvent(0, EventType.NODE_MOVE, 'R1', {})];
			const cloned = (controller as any).cloneSimulationState(st);
			expect(cloned.executedEvents.length).toBe(1);
			expect(cloned.executedEvents[0]).not.toBe(st.executedEvents[0]);
		});

		it('invalid operations return without throwing', () => {
			expect(() => controller.renameRouter('', 'x')).not.toThrow();
			expect(() => controller.setRouterDisabled('', true)).not.toThrow();
			expect(() => controller.setRouterDisabled('R404', true)).not.toThrow();
			expect(() => controller.addLink('', 'R1', 1)).not.toThrow();
			expect(() => controller.addLink('R1', 'R1', 1)).not.toThrow();
			expect(() => controller.addLink('R1', 'R2', -5)).not.toThrow();
			expect(() => controller.deleteNode('')).not.toThrow();
			expect(() => controller.deleteNode('R404')).not.toThrow();
			expect(() => controller.deleteLink('', 'R1')).not.toThrow();
			expect(() => controller.changeLinkWeights(null as any)).not.toThrow();
			expect(() =>
				controller.changeLinkWeights([{ sourceId: 'R1', targetId: 'R1', weight: 5 }])
			).not.toThrow();
		});

		it('removeLinkInstance returns for links without id', () => {
			const topo = controller.getTopology();
			const r1 = topo.nodes.get('R1') as Router;
			const r2 = topo.nodes.get('R2') as Router;
			const link = new Link('', r1, r2, 1);
			expect(() => (controller as any).removeLinkInstance(topo, link)).not.toThrow();
		});

		it('changeLinkWeights skips unchanged weights', () => {
			const before = controller.topology.links.map((l) => l.weight);
			controller.changeLinkWeights([{ sourceId: 'R1', targetId: 'R2', weight: before[0] }]);
			const after = controller.topology.links.map((l) => l.weight);
			expect(after).toEqual(before);
		});

		it('propagateToFuture returns when no future snapshots exist', () => {
			controller.currentStepIndex = controller.history.length - 1;
			(controller as any).propagateToFuture(() => {
				throw new Error('should not be called');
			});
			expect(controller.currentStepIndex).toBe(0);
		});

		it('addEvent appends to executed events', () => {
			const before = controller.history[0].executedEvents.length;
			controller.addEvent(new SimulationEvent(0, EventType.NODE_MOVE, 'R1', {}));
			expect(controller.history[0].executedEvents.length).toBe(before + 1);
		});

		it('removeLinkInstance removes via removeNeighbor when present', () => {
			const a = new Router('R1', 'R1', 0, 0);
			const b = new Router('R2', 'R2', 0, 0);
			const link = new Link('L1', a, b, 1);
			a.addNeighbor(link);
			b.addNeighbor(link);
			const topo = new Topology(
				new Map([
					['R1', a],
					['R2', b]
				]),
				[link]
			);
			(controller as any).removeLinkInstance(topo, link);
			expect(topo.links.length).toBe(0);
			expect(a.neighbors.length).toBe(0);
			expect(b.neighbors.length).toBe(0);
		});

		it('handles undefined inputs for id parsing branches', () => {
			expect(() => controller.renameRouter(undefined as any, undefined as any)).not.toThrow();
			expect(() => controller.setRouterDisabled(null as any, true)).not.toThrow();
			expect(() => controller.addLink(undefined as any, undefined as any, 1)).not.toThrow();
			expect(() => controller.deleteNode(undefined as any)).not.toThrow();
		});

		it('setAlgorithm skips when type is unknown', () => {
			controller.setAlgorithm('unknown' as any);
			expect(controller.algorithm).toBe('unknown' as any);
		});

		it('changeLinkWeights covers non-array input and reverse pair ordering', () => {
			controller.changeLinkWeights('not-array' as any);
			controller.changeLinkWeights([{ sourceId: 'R2', targetId: 'R1', weight: 7 }]);

			const updated = controller.topology.links.find(
				(l) =>
					(l.source.id === 'R1' && l.target.id === 'R2') ||
					(l.source.id === 'R2' && l.target.id === 'R1')
			);
			expect(updated?.weight).toBe(7);
		});

		it('deleteLink exits when link is missing', () => {
			const c = new SimulationController(new Topology());
			expect(() => c.deleteLink('R1', 'R2')).not.toThrow();
		});

		it('moveNode uses fallback coordinates for non-finite inputs', () => {
			controller.moveNode('R1', Number.NaN, Number.POSITIVE_INFINITY);
			const node = controller.topology.nodes.get('R1') as Router;
			expect(node.xPos).toBe(0);
			expect(node.yPos).toBe(0);
		});

		it('moveNodes skips invalid ids', () => {
			controller.moveNodes([
				{ id: '', xPos: 1, yPos: 1 },
				{ id: 'R404', xPos: 2, yPos: 2 },
				{ id: 'R1', xPos: 3, yPos: 4 }
			]);
			const r1 = controller.topology.nodes.get('R1') as Router;
			expect(r1.xPos).toBe(3);
			expect(r1.yPos).toBe(4);
		});

		it('moveNode and moveNodes return for invalid ids', () => {
			expect(() => controller.moveNode('', 1, 1)).not.toThrow();
			expect(() => controller.moveNodes([{ id: 'R404', xPos: 1, yPos: 1 }])).not.toThrow();
		});

		it('generate ids ignore non-matching patterns', () => {
			const c = new SimulationController(new Topology());
			(c.history[0] as any).topologyState.nodes.set('X1', new Router('X1', 'X1', 0, 0));
			const r1 = new Router('R1', 'R1', 0, 0);
			const r2 = new Router('R2', 'R2', 0, 0);
			(c.history[0] as any).topologyState.nodes.set('R1', r1);
			(c.history[0] as any).topologyState.nodes.set('R2', r2);
			(c.history[0] as any).topologyState.links.push(new Link('X9', r1, r2, 1));
			expect((c as any).generateRouterId()).toBe('R3');
			expect((c as any).generateLinkId()).toBe('L1');
		});

		it('addNode with infinite coordinates', () => {
			const before = controller.topology.nodes.size;
			controller.addNode(Number.NaN, Number.POSITIVE_INFINITY);
			expect(controller.topology.nodes.size).toBe(before + 1);
		});

		it('deleteNode removes node and links', () => {
			const c = new SimulationController(new Topology());
			const a = new Router('R1', 'R1', 0, 0);
			const b = new Router('R2', 'R2', 0, 0);
			const link = new Link('L1', a, b, 1);
			a.addNeighbor(link);
			b.addNeighbor(link);
			c.topology.nodes.set('R1', a);
			c.topology.nodes.set('R2', b);
			(c.history[0] as any).topologyState.links.push(link);

			c.deleteNode('R1');
			expect(c.topology.nodes.has('R1')).toBe(false);
			expect(c.topology.links.length).toBe(0);
		});

		it('addLink set 1 for negative weights', () => {
			const c = new SimulationController(new Topology());
			c.addNode(0, 0);
			c.addNode(10, 0);
			c.addLink('R1', 'R2', -5);
			const link = c.topology.links.find(
				(l) =>
					(l.source.id === 'R1' && l.target.id === 'R2') ||
					(l.source.id === 'R2' && l.target.id === 'R1')
			);
			expect(link?.weight).toBe(1);
		});

		it('nextStep advances into existing future history and clears undo/redo stacks', () => {
			controller.nextStep();
			controller.jumpToStep(0);

			(controller as any).undoStack.push(controller.history[0]);
			(controller as any).redoStack.push(controller.history[1]);

			controller.nextStep();

			expect(controller.currentStepIndex).toBe(1);
			expect(controller.canUndo).toBe(false);
			expect(controller.canRedo).toBe(false);

			const c = new SimulationController(topology);
			c.setAlgorithm(RoutingAlgorithmType.DISTANCE_VECTOR);
			const sendState = new SimulationState(1, c.getTopology());
			(sendState as any).stepType = 'send';
			c.history = [c.history[0], sendState];
			c.currentStepIndex = 1;
			c.nextStep();
			expect(c.history[c.history.length - 1].stepNumber).toBe(2);
			expect((c.history[c.history.length - 1] as any).stepType).toBe('recompute');
		});

		it('undo/redo when stacks are empty', () => {
			const c = new SimulationController(new Topology());
			c.undo();
			c.redo();
			expect(c.history.length).toBe(1);
			expect(c.currentStepIndex).toBe(0);
		});

		it('commitPendingEdits updates history and skips null events', () => {
			const base = (controller as any).cloneSimulationState(controller.history[0]);
			base.executedEvents = [null as any, new SimulationEvent(0, EventType.NODE_MOVE, 'R1', {})];
			(controller as any).pendingEditBase = base;
			(controller as any).pendingEditBaseSignature = (controller as any).topologySignature(
				base.topologyState
			);

			controller.addNode(1, 1);
			const committed = (controller as any).commitPendingEditsIfAny();
			expect(committed).toBe(true);
			expect(controller.history.length).toBe(2);
			expect(controller.currentStepIndex).toBe(1);
		});

		it('clearPendingIfNoDiff keeps pending edit when a diff exists', () => {
			(controller as any).beginPendingEdit();
			controller.addNode(2, 2);
			(controller as any).clearPendingIfNoDiff();
			expect((controller as any).pendingEditBase).not.toBeNull();
		});

		it('applyAlgorithmToRouter skips when type is unknown', () => {
			(controller as any).algorithmType = 'unknown';
			const router = { setAlgorithm: vi.fn() };
			(controller as any).applyAlgorithmToRouter(router);
			expect(router.setAlgorithm).not.toHaveBeenCalled();
		});

		it('refreshDistanceVector exits when algorithm is not DV', () => {
			const topo = controller.getTopology();
			const r1 = topo.nodes.get('R1') as Router;
			const algo = {
				reinitializeForTopology: vi.fn(),
				recomputeForTopology: vi.fn()
			};
			r1.algorithm = algo as any;
			(controller as any).algorithmType = RoutingAlgorithmType.LINK_STATE;
			(controller as any).refreshDistanceVector(topo, true, true);
			expect(algo.reinitializeForTopology).not.toHaveBeenCalled();
			expect(algo.recomputeForTopology).not.toHaveBeenCalled();
		});

		it('refreshDistanceVector skips recompute when recompute=false', () => {
			const topo = controller.getTopology();
			const r1 = topo.nodes.get('R1') as Router;
			const algo = new DistanceVectorAlgorithm(false);
			const reinitSpy = vi.spyOn(algo, 'reinitializeForTopology');
			const recomputeSpy = vi.spyOn(algo, 'recomputeForTopology');
			r1.setAlgorithm(algo);
			(controller as any).algorithmType = RoutingAlgorithmType.DISTANCE_VECTOR;
			(controller as any).refreshDistanceVector(topo, true, false);
			expect(reinitSpy).toHaveBeenCalled();
			expect(recomputeSpy).not.toHaveBeenCalled();
		});

		it('refreshDistanceVector recomputes when DV algorithm is already assigned', () => {
			const topo = controller.getTopology();
			const r1 = topo.nodes.get('R1') as Router;
			const algo = new DistanceVectorAlgorithm(false);
			const reinitSpy = vi.spyOn(algo, 'reinitializeForTopology');
			const recomputeSpy = vi.spyOn(algo, 'recomputeForTopology');
			r1.setAlgorithm(algo);
			(controller as any).algorithmType = RoutingAlgorithmType.DISTANCE_VECTOR;
			(controller as any).refreshDistanceVector(topo, true, true);
			expect(reinitSpy).toHaveBeenCalled();
			expect(recomputeSpy).toHaveBeenCalled();
		});

		it('computeShortestPaths ignores disabled neighbors', () => {
			const topo = new Topology();
			const r1 = new Router('R1', 'R1', 0, 0);
			const r2 = new Router('R2', 'R2', 0, 0);
			const link = new Link('L1', r1, r2, 3);
			r1.addNeighbor(link);
			r2.addNeighbor(link);
			r2.disabled = true;
			topo.nodes.set('R1', r1);
			topo.nodes.set('R2', r2);
			topo.links.push(link);
			const dist = controller.computeShortestPathsForTopology(topo, 'R1');
			expect(dist.get('R1')).toBe(0);
			expect(dist.has('R2')).toBe(false);
		});

		it('computeDijkstraStableStep returns 0 for disconnected nodes', () => {
			const a = new Router('A', 'A', 0, 0);
			const b = new Router('B', 'B', 0, 0);
			const topo = new Topology(
				new Map([
					['A', a],
					['B', b]
				]),
				[]
			);
			const step = (controller as any).computeDijkstraStableStep(topo, 'A');
			expect(step).toBe(0);
		});

		it('buildDvStateFromRoutingTables uses Infinity for missing entries', () => {
			const a = new Router('R1', 'R1', 0, 0);
			const b = new Router('R2', 'R2', 0, 0);
			const topo = new Topology(
				new Map([
					['R1', a],
					['R2', b]
				]),
				[]
			);
			const c = new SimulationController(topo);
			c.setAlgorithm(RoutingAlgorithmType.DISTANCE_VECTOR);
			(c as any).buildDvStateFromRoutingTables(topo);
			const cell = (a as any).dvState.dvs['R1']['R2'];
			expect(cell.dist).toBe(Infinity);
			expect(cell.nextHop).toBeNull();
		});

		it('cloneSimulationEvent copies object payload', () => {
			const event = new SimulationEvent(0, EventType.NODE_MOVE, 'R1', { x: 1 } as any);
			const cloned = (controller as any).cloneSimulationEvent(event);
			expect(cloned.payload).toEqual({ x: 1 });
			expect(cloned.payload).not.toBe(event.payload);
		});

		it('computeDijkstraStableStep returns null for empty or disabled source', () => {
			const topo = controller.getTopology();
			expect((controller as any).computeDijkstraStableStep(topo, '')).toBeNull();
			const r1 = topo.nodes.get('R1') as Router;
			r1.disabled = true;
			expect((controller as any).computeDijkstraStableStep(topo, 'R1')).toBeNull();
		});

		it('computeRoutingPathCost returns null for missing/disabled/invalid paths', () => {
			const topo = controller.getTopology();
			expect((controller as any).computeRoutingPathCost(topo, 'R1', 'RX')).toBeNull();

			const r1 = topo.nodes.get('R1') as Router;
			r1.disabled = true;
			expect((controller as any).computeRoutingPathCost(topo, 'R1', 'R2')).toBeNull();
			r1.disabled = false;

			expect((controller as any).computeRoutingPathCost(topo, 'R1', 'R2')).toBeNull();
			r1.routingTable.addEntry('R2', '-', 1);
			expect((controller as any).computeRoutingPathCost(topo, 'R1', 'R2')).toBeNull();

			r1.routingTable.addEntry('R2', 'R3', 1);
			expect((controller as any).computeRoutingPathCost(topo, 'R1', 'R2')).toBeNull();
		});

		it('computeRoutingPathCost detects routing loops', () => {
			const topo = new Topology();
			const r1 = new Router('R1', 'R1', 0, 0);
			const r2 = new Router('R2', 'R2', 0, 0);
			const r3 = new Router('R3', 'R3', 0, 0);
			const l1 = new Link('L1', r1, r2, 1);
			r1.addNeighbor(l1);
			r2.addNeighbor(l1);
			topo.nodes.set('R1', r1);
			topo.nodes.set('R2', r2);
			topo.nodes.set('R3', r3);
			topo.links.push(l1);
			r1.routingTable.addEntry('R3', 'R2', 1);
			r2.routingTable.addEntry('R3', 'R1', 1);
			const cost = (controller as any).computeRoutingPathCost(topo, 'R1', 'R3');
			expect(cost).toBeNull();
		});

		it('computeActualPath stops when nextHop is "-"', () => {
			const r1 = controller.topology.nodes.get('R1') as Router;
			r1.routingTable.addEntry('R2', '-', 1);
			const result = controller.computeActualPath('R1', 'R2');
			expect(result.nodePath).toEqual(['R1']);
			expect(result.linkPath).toEqual([]);
		});

		it('computeActualPath stops when no neighbor link exists for next hop', () => {
			const topo = new Topology();
			const r1 = new Router('R1', 'R1', 0, 0);
			const r2 = new Router('R2', 'R2', 0, 0);
			topo.nodes.set('R1', r1);
			topo.nodes.set('R2', r2);
			const c = new SimulationController(topo);
			r1.routingTable.addEntry('R2', 'R2', 1);
			const result = c.computeActualPath('R1', 'R2');
			expect(result.nodePath).toEqual(['R1']);
			expect(result.linkPath).toEqual([]);
		});

		it('updateRouterOptimalFlags marks non-optimal when routing path is inconsistent', () => {
			const r1 = new Router('R1', 'R1', 0, 0);
			const r2 = new Router('R2', 'R2', 0, 0);
			const link = new Link('L1', r1, r2, 1);
			r1.addNeighbor(link);
			r2.addNeighbor(link);
			r1.routingTable.addEntry('R2', 'R3', 1);
			r2.routingTable.addEntry('R1', 'R1', 1);
			const topo = new Topology(
				new Map([
					['R1', r1],
					['R2', r2]
				]),
				[link]
			);

			(controller as any).algorithmType = RoutingAlgorithmType.DISTANCE_VECTOR;
			(controller as any).updateRouterOptimalFlags(topo, 0);

			expect(r1.optimal).toBe(false);
		});

		it('commitPendingEditsIfAny creates update step when only events change', () => {
			(controller as any).beginPendingEdit();
			controller.addEvent(new SimulationEvent(0, EventType.NODE_MOVE, 'R1', { x: 1, y: 2 }));

			const committed = (controller as any).commitPendingEditsIfAny();

			expect(committed).toBe(true);
			expect(controller.history.length).toBe(2);
			expect((controller.history[1] as any).stepType).toBe('update');
			expect(controller.history[1].executedEvents.length).toBe(1);
		});

		it('applyAlgorithmToRouter falls back to assigning algorithm property', () => {
			(controller as any).algorithmType = RoutingAlgorithmType.LINK_STATE;
			const router: any = {};
			(controller as any).applyAlgorithmToRouter(router);
			expect(router.algorithm).toBeInstanceOf(LinkStateAlgorithm);
		});

		it('nextStep in LINK_STATE skips send on odd steps', () => {
			controller.setAlgorithm(RoutingAlgorithmType.LINK_STATE);
			const spy = vi.fn();
			const r1 = controller.topology.nodes.get('R1') as Router;
			r1.algorithm = { executeStep: spy };
			controller.nextStep();
			expect(spy).not.toHaveBeenCalled();
			expect(controller.currentStepIndex).toBe(1);
		});

		it('skips disabled routers during LS send steps', () => {
			const enabledStep = vi.fn();
			const disabledStep = vi.fn();

			(controller.topology.nodes.get('R1') as Router).algorithm = {
				executeStep: enabledStep
			} as any;
			(controller.topology.nodes.get('R2') as Router).algorithm = {
				executeStep: disabledStep
			} as any;
			(controller.topology.nodes.get('R2') as Router).disabled = true;

			controller.nextStep();
			controller.nextStep();

			expect(enabledStep).toHaveBeenCalledTimes(1);
			expect(disabledStep).not.toHaveBeenCalled();
			expect((controller.history[2] as any).stepType).toBe('send');
		});

		it('updateRouterOptimalFlags treats Infinity routes with empty next hop as optimal', () => {
			const a = new Router('R1', 'R1', 0, 0);
			const b = new Router('R2', 'R2', 0, 0);
			a.routingTable.addEntry('R2', '-', Infinity);
			b.routingTable.addEntry('R1', '-', Infinity);
			const topo = new Topology(
				new Map([
					['R1', a],
					['R2', b]
				]),
				[]
			);
			(controller as any).algorithmType = RoutingAlgorithmType.DISTANCE_VECTOR;
			(controller as any).updateRouterOptimalFlags(topo, 0);
			expect((topo.nodes.get('R1') as Router).optimal).toBe(true);
			expect((topo.nodes.get('R2') as Router).optimal).toBe(true);
		});

		it('returns a partial path when routing tables loop back on themselves', () => {
			const topology = new Topology();
			const r1 = new Router('R1', 'R1', 0, 0);
			const r2 = new Router('R2', 'R2', 100, 0);
			const r3 = new Router('R3', 'R3', 200, 0);
			const l1 = new Link('L1', r1, r2, 1);
			const l2 = new Link('L2', r2, r3, 1);

			r1.addNeighbor(l1);
			r2.addNeighbor(l1);
			r2.addNeighbor(l2);
			r3.addNeighbor(l2);

			r1.routingTable = new RoutingTable();
			r2.routingTable = new RoutingTable();
			r3.routingTable = new RoutingTable();
			r1.routingTable.addEntry('R3', 'R2', 2);
			r2.routingTable.addEntry('R3', 'R1', 2);

			topology.nodes.set('R1', r1);
			topology.nodes.set('R2', r2);
			topology.nodes.set('R3', r3);
			topology.links.push(l1, l2);

			const localController = new SimulationController(topology);
			const path = localController.computeActualPath('R1', 'R3');

			expect(path.nodePath).toEqual(['R1', 'R2', 'R1']);
			expect(path.linkPath).toEqual(['L1', 'L1']);
		});

		it('sorts imported history by step number', () => {
			const localController = new SimulationController(new Topology());
			const json = JSON.stringify({
				algorithm: RoutingAlgorithmType.LINK_STATE,
				history: [
					{
						step: 2,
						topology: {
							nodes: [{ id: 'R2', type: 'ROUTER' }],
							links: []
						},
						events: []
					},
					{
						step: 0,
						topology: {
							nodes: [{ id: 'R1', type: 'ROUTER' }],
							links: []
						},
						events: []
					}
				]
			});

			localController.importJson(json);

			expect(localController.history.map((state: SimulationState) => state.stepNumber)).toEqual([
				0, 2
			]);
		});
	});
});
