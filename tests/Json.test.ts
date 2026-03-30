import { describe, it, expect } from 'vitest';
import { Json } from '../src/lib/model/Json';
import { RoutingAlgorithmType } from '../src/lib/model/RoutingAlgorithmType';
import { EventType } from '../src/lib/model/EventType';
import { SimulationState } from '../src/lib/model/SimulationState';
import { Router } from '../src/lib/model/Router';
import { Topology } from '../src/lib/model/Topology';
import { SimulationEvent } from '../src/lib/model/SimulationEvent';
import { Link } from '../src/lib/model/Link';

/**
 * Testet das Importieren und Exportieren von Simulationen im JSON-Format über die Klassen Json.ts.
 */

describe('Json', () => {
	describe('exportJson', () => {
		it('export valid History', () => {
			const router = new Router('A', 'A', 0, 0);
			const topology = new Topology(new Map([['A', router]]), []);
			const state = new SimulationState(0, topology);
			state.executedEvents = [new SimulationEvent(0, EventType.NODE_ADDITION, 'A', { x: 1, y: 2 })];
			const json = Json.exportJson([state], RoutingAlgorithmType.LINK_STATE);
			expect(json).toContain('LINK_STATE');
			expect(json).toContain('A');
		});

		it('Throw Error for empty History', () => {
			expect(() => Json.exportJson([], RoutingAlgorithmType.LINK_STATE)).toThrow();
		});
	});

	describe('importJson', () => {
		const validJson = () => {
			const router = new Router('A', 'A', 0, 0);
			const topology = new Topology(new Map([['A', router]]), []);
			const state = new SimulationState(0, topology);
			state.executedEvents = [new SimulationEvent(0, EventType.NODE_ADDITION, 'A', { x: 1, y: 2 })];
			return Json.exportJson([state], RoutingAlgorithmType.LINK_STATE);
		};

		it('import valid JSON', () => {
			const result = Json.importJson(validJson());
			expect(result.algorithm).toBe(RoutingAlgorithmType.LINK_STATE);
			expect(result.states[0].topology.nodes.size).toBe(1);
		});

		it('Throw Error for empty String', () => {
			expect(() => Json.importJson(' ')).toThrow();
		});

		it('Throw Error for invalid JSON', () => {
			expect(() => Json.importJson('{xxx}')).toThrow();
		});

		it('Throw Error for missing algorithm', () => {
			const doc = JSON.parse(validJson());
			delete doc.algorithm;
			expect(() => Json.importJson(JSON.stringify(doc))).toThrow();
		});

		it('Throw Error for invalid algorithm', () => {
			const doc = JSON.parse(validJson());
			doc.algorithm = 'xxx';
			expect(() => Json.importJson(JSON.stringify(doc))).toThrow();
		});

		it('Throw Error for empty history', () => {
			const doc = JSON.parse(validJson());
			doc.history = [];
			expect(() => Json.importJson(JSON.stringify(doc))).toThrow();
		});

		it('Throw Error for duplicate step', () => {
			const doc = JSON.parse(validJson());
			doc.history.push({ ...doc.history[0], step: 0 });
			expect(() => Json.importJson(JSON.stringify(doc))).toThrow();
		});

		it('Throw Error for duplicate node id', () => {
			const doc = JSON.parse(validJson());
			const node = { ...doc.history[0].topology.nodes[1] };
			doc.history[0].topology.nodes.push(node);
			expect(() => Json.importJson(JSON.stringify(doc))).toThrow();
		});

		it('Throw Error for invalid node type', () => {
			const doc = JSON.parse(validJson());
			doc.history[0].topology.nodes[0].type = 'xxx';
			expect(() => Json.importJson(JSON.stringify(doc))).toThrow();
		});

		it('Throw Error for duplicate link id', () => {
			const doc = JSON.parse(validJson());
			const link = { ...doc.history[0].topology.links[0] };
			if (!link) return;
			doc.history[0].topology.links.push(link);
			expect(() => Json.importJson(JSON.stringify(doc))).toThrow();
		});

		it('Throw Error for same sourceId and targetId', () => {
			const doc = JSON.parse(validJson());
			if (!doc.history[0].topology.links[0]) return;
			doc.history[0].topology.links[0].targetId = doc.history[0].topology.links[0].sourceId;
			expect(() => Json.importJson(JSON.stringify(doc))).toThrow();
		});

		it('Throw Error for duplicate Link between two nodes', () => {
			const doc = JSON.parse(validJson());
			const link = { ...doc.history[0].topology.links[0] };
			if (!link) return;
			doc.history[0].topology.links.push({ ...link, id: link.id + '2' });
			expect(() => Json.importJson(JSON.stringify(doc))).toThrow();
		});

		it('Throw Error for unknown node id in Link', () => {
			const doc = JSON.parse(validJson());
			if (!doc.history[0].topology.links[0]) return;
			doc.history[0].topology.links[0].sourceId = 'UNKNOWN';
			expect(() => Json.importJson(JSON.stringify(doc))).toThrow();
		});

		it('Throw Error for invalid EventType', () => {
			const doc = JSON.parse(validJson());
			doc.history[0].events[0].type = 'xxx';
			expect(() => Json.importJson(JSON.stringify(doc))).toThrow();
		});

		it('use all EventTypes', () => {
			const router = new Router('A', 'A', 0, 0);
			const topology = new Topology(new Map([['A', router]]), []);
			const events = [
				new SimulationEvent(0, EventType.WEIGHT_CHANGE, 'A', { weight: 2 }),
				new SimulationEvent(0, EventType.LINK_ADDITION, 'A', { weight: 2 }),
				new SimulationEvent(0, EventType.NODE_MOVE, 'A', { x: 1, y: 2 }),
				new SimulationEvent(0, EventType.NODE_RENAME, 'A', { name: 'B' }),
				new SimulationEvent(0, EventType.NODE_DISABLE, 'A', {}),
				new SimulationEvent(0, EventType.NODE_ENABLE, 'A', {}),
				new SimulationEvent(0, EventType.NODE_ADDITION, 'A', { x: 1, y: 2 }),
				new SimulationEvent(0, EventType.NODE_FAILURE, 'A', {}),
				new SimulationEvent(0, EventType.LINK_FAILURE, 'A', {})
			];
			const state = new SimulationState(0, topology);
			state.executedEvents = events;
			const json = Json.exportJson([state], RoutingAlgorithmType.LINK_STATE);
			const result = Json.importJson(json);
			expect(result.states[0].events.length).toBe(events.length);
		});
	});

	describe('edge cases', () => {
		const smallTopo = () => {
			const routerA = new Router('A', 'A', 0, 0);
			const routerB = new Router('B', 'B', 1, 1);
			const link = new Link('L1', routerA, routerB, 2);
			const topology = new Topology(
				new Map([
					['A', routerA],
					['B', routerB]
				]),
				[link]
			);
			const state = new SimulationState(0, topology);
			return JSON.parse(Json.exportJson([state], RoutingAlgorithmType.LINK_STATE));
		};

		it('throws error for missing fields', () => {
			const router = new Router('A', 'A', 0, 0);
			const topology = new Topology(new Map([['A', router]]), []);
			const state = new SimulationState(0, topology);
			state.executedEvents = [];
			const json = JSON.parse(Json.exportJson([state], RoutingAlgorithmType.LINK_STATE));
			delete json.history[0].topology.nodes[0].id;
			expect(() => Json.importJson(JSON.stringify(json))).toThrow();
		});

		it('unsorted history', () => {
			const router = new Router('A', 'A', 0, 0);
			const topology = new Topology(new Map([['A', router]]), []);
			const state1 = new SimulationState(1, topology);
			const state0 = new SimulationState(0, topology);
			const json = Json.exportJson([state1, state0], RoutingAlgorithmType.LINK_STATE);
			const result = Json.importJson(json);
			expect(result.states[0].step).toBe(0);
			expect(result.states[1].step).toBe(1);
		});

		it('false payloads for events', () => {
			const router = new Router('A', 'A', 0, 0);
			const topology = new Topology(new Map([['A', router]]), []);
			const base = JSON.parse(
				Json.exportJson([new SimulationState(0, topology)], RoutingAlgorithmType.LINK_STATE)
			);
			base.history[0].events = [{ step: 0, type: EventType.NODE_MOVE, targetId: 'A', payload: {} }];
			expect(() => Json.importJson(JSON.stringify(base))).toThrow();
			base.history[0].events = [
				{ step: 0, type: EventType.NODE_RENAME, targetId: 'A', payload: {} }
			];
			expect(() => Json.importJson(JSON.stringify(base))).toThrow();
			base.history[0].events = [
				{ step: 0, type: EventType.WEIGHT_CHANGE, targetId: 'A', payload: { weight: 'foo' } }
			];
			expect(() => Json.importJson(JSON.stringify(base))).toThrow();
		});

		it('import with infinity costs', () => {
			const routerA = new Router('A', 'A', 0, 0);
			const topology = new Topology(new Map([['A', routerA]]), []);
			const state = new SimulationState(0, topology);
			const json = JSON.parse(Json.exportJson([state], RoutingAlgorithmType.LINK_STATE));

			json.history[0].topology.nodes[0].routingTable = {
				entries: [{ destinationId: 'A', nextHopId: '-', cost: '∞' }]
			};

			const result = Json.importJson(JSON.stringify(json));
			expect(result.states[0].topology.nodes.get('A')?.routingTable.entries.get('A')?.cost).toBe(
				Number.POSITIVE_INFINITY
			);
		});

		it('Throw Error for missing destinationId in routing table', () => {
			const router = new Router('A', 'A', 0, 0);
			const topology = new Topology(new Map([['A', router]]), []);
			const base = JSON.parse(
				Json.exportJson([new SimulationState(0, topology)], RoutingAlgorithmType.LINK_STATE)
			);

			base.history[0].topology.nodes[0].routingTable = {
				entries: [{ nextHopId: '-', cost: 0 }]
			};

			expect(() => Json.importJson(JSON.stringify(base))).toThrow();
		});

		it('Throw Error for missing nextHopId in routing table', () => {
			const router = new Router('A', 'A', 0, 0);
			const topology = new Topology(new Map([['A', router]]), []);
			const base = JSON.parse(
				Json.exportJson([new SimulationState(0, topology)], RoutingAlgorithmType.LINK_STATE)
			);

			base.history[0].topology.nodes[0].routingTable = {
				entries: [{ destinationId: 'A', cost: 0 }]
			};

			expect(() => Json.importJson(JSON.stringify(base))).toThrow();
		});

		it('Throw Error for missing cost in routing table', () => {
			const router = new Router('A', 'A', 0, 0);
			const topology = new Topology(new Map([['A', router]]), []);
			const base = JSON.parse(
				Json.exportJson([new SimulationState(0, topology)], RoutingAlgorithmType.LINK_STATE)
			);

			base.history[0].topology.nodes[0].routingTable = {
				entries: [{ destinationId: 'A', nextHopId: '-' }]
			};

			expect(() => Json.importJson(JSON.stringify(base))).toThrow();
		});

		it('Throw Error for invalid cost in routing table', () => {
			const router = new Router('A', 'A', 0, 0);
			const topology = new Topology(new Map([['A', router]]), []);
			const base = JSON.parse(
				Json.exportJson([new SimulationState(0, topology)], RoutingAlgorithmType.LINK_STATE)
			);

			base.history[0].topology.nodes[0].routingTable = {
				entries: [{ destinationId: 'A', nextHopId: '-', cost: -1 }]
			};

			expect(() => Json.importJson(JSON.stringify(base))).toThrow();
		});

		it('Throw Error for unknown destinationId in routing table', () => {
			const routerA = new Router('A', 'A', 0, 0);
			const routerB = new Router('B', 'B', 1, 0);
			const topology = new Topology(
				new Map([
					['A', routerA],
					['B', routerB]
				]),
				[]
			);
			const base = JSON.parse(
				Json.exportJson([new SimulationState(0, topology)], RoutingAlgorithmType.LINK_STATE)
			);

			base.history[0].topology.nodes[0].routingTable = {
				entries: [{ destinationId: 'UNKNOWN', nextHopId: '-', cost: 0 }]
			};

			expect(() => Json.importJson(JSON.stringify(base))).toThrow();
		});

		it('Throw Error for unknown nextHopId in routing table', () => {
			const routerA = new Router('A', 'A', 0, 0);
			const routerB = new Router('B', 'B', 1, 0);
			const topology = new Topology(
				new Map([
					['A', routerA],
					['B', routerB]
				]),
				[]
			);
			const base = JSON.parse(
				Json.exportJson([new SimulationState(0, topology)], RoutingAlgorithmType.LINK_STATE)
			);

			base.history[0].topology.nodes[0].routingTable = {
				entries: [{ destinationId: 'A', nextHopId: 'UNKNOWN', cost: 0 }]
			};

			expect(() => Json.importJson(JSON.stringify(base))).toThrow();
		});

		it('import topo with routing table', () => {
			const routerA = new Router('A', 'A', 0, 0);
			const routerB = new Router('B', 'B', 1, 0);
			const topology = new Topology(
				new Map([
					['A', routerA],
					['B', routerB]
				]),
				[]
			);
			const state = new SimulationState(0, topology);
			const json = JSON.parse(Json.exportJson([state], RoutingAlgorithmType.LINK_STATE));

			json.history[0].topology.nodes[0].routingTable = {
				entries: [
					{ destinationId: 'A', nextHopId: '-', cost: 0 },
					{ destinationId: 'B', nextHopId: '-', cost: 5 }
				]
			};

			const result = Json.importJson(JSON.stringify(json));
			expect(
				result.states[0].topology.nodes.get('A')?.routingTable.entries.get('A')?.nextHopId
			).toBe('-');
			expect(
				result.states[0].topology.nodes.get('A')?.routingTable.entries.get('B')?.nextHopId
			).toBe('-');
		});

		it('importJson falls back to neighbors array when addNeighbor is missing', () => {
			const original = Router.prototype.addNeighbor;
			delete (Router.prototype as any).addNeighbor;

			try {
				const data = {
					algorithm: 'LINK_STATE',
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
						}
					]
				};
				const result = Json.importJson(JSON.stringify(data));
				const topo = result.states[0].topology;
				const r1 = topo.nodes.get('R1') as any;
				const r2 = topo.nodes.get('R2') as any;

				expect(Array.isArray(r1.neighbors)).toBe(true);
				expect(r1.neighbors.length).toBe(1);
				expect(r2.neighbors.length).toBe(1);
			} finally {
				Router.prototype.addNeighbor = original;
			}
		});

		it('export fallbacks and filters invalid events', () => {
			const routerA = new Router('A', 'A', 0, 0);
			const routerB = new Router('B', 'B', 1, 1);
			(routerA as any).disabled = undefined;
			const topology = new Topology(
				new Map([
					['A', routerA],
					['B', routerB]
				]),
				[new Link('L1', routerA, routerB, 5)]
			);
			const fakeState = {
				topologyState: topology,
				stepType: 'update',
				executedEvents: [
					{ type: undefined, targetId: undefined, step: -1, payload: 'xxx' },
					{ type: EventType.NODE_FAILURE, targetId: 'A', payload: 0 }
				]
			} as any;
			const fakeState2 = {
				stepNumber: -3,
				topologyState: topology,
				executedEvents: 'yyy'
			} as any;
			const doc = JSON.parse(
				Json.exportJson([fakeState, fakeState2], RoutingAlgorithmType.LINK_STATE)
			);

			expect(doc.history[0].step).toBe(0);
			expect(doc.history[0].stepType).toBe('update');
			expect(doc.history[0].topology.links).toHaveLength(1);
			expect(doc.history[0].events).toHaveLength(1);
			expect(doc.history[0].events[0].payload).toEqual({});
			expect(doc.history[1].events).toEqual([]);
			expect(doc.history[0].topology.nodes[0].disabled).toBe(false);
		});

		it('exportJson includes routing table entries', () => {
			const routerA = new Router('A', 'A', 0, 0);
			const routerB = new Router('B', 'B', 1, 0);
			const topology = new Topology(
				new Map([
					['A', routerA],
					['B', routerB]
				]),
				[]
			);
			routerA.routingTable.addEntry('A', 'A', 0);
			routerA.routingTable.addEntry('B', 'B', 5);
			const state = new SimulationState(0, topology);

			const parsed = JSON.parse(Json.exportJson([state], RoutingAlgorithmType.LINK_STATE));
			const rt = parsed.history[0].topology.nodes.find((n: any) => n.id === 'A')?.routingTable;

			expect(Array.isArray(rt.entries)).toBe(true);
			expect(rt.entries.length).toBeGreaterThan(0);
		});

		it('throws for undefined input and non-object root', () => {
			expect(() => Json.importJson(undefined as any)).toThrow();
			expect(() => Json.importJson('[]')).toThrow();
		});

		it('throws for false history entries', () => {
			const doc = smallTopo();
			doc.history = [null];
			expect(() => Json.importJson(JSON.stringify(doc))).toThrow();

			const doc2 = smallTopo();
			doc2.history[0].topology = null;
			expect(() => Json.importJson(JSON.stringify(doc2))).toThrow();

			const doc3 = smallTopo();
			doc3.history[0].topology.nodes = {};
			expect(() => Json.importJson(JSON.stringify(doc3))).toThrow();

			const doc4 = smallTopo();
			doc4.history[0].topology.links = {};
			expect(() => Json.importJson(JSON.stringify(doc4))).toThrow();

			const doc5 = smallTopo();
			doc5.history[0].step = -1;
			expect(() => Json.importJson(JSON.stringify(doc5))).toThrow();
		});

		it('throws for false defined node and routing table entry shapes', () => {
			const doc = smallTopo();
			doc.history[0].topology.nodes = [null];
			expect(() => Json.importJson(JSON.stringify(doc))).toThrow();

			const doc2 = smallTopo();
			doc2.history[0].topology.nodes.push(doc2.history[0].topology.nodes[0]);
			expect(() => Json.importJson(JSON.stringify(doc2))).toThrow();

			const doc3 = smallTopo();
			doc3.history[0].topology.nodes[0].name = '   ';
			doc3.history[0].topology.nodes[0].routingTable = { entries: [null] };
			expect(() => Json.importJson(JSON.stringify(doc3))).toThrow();
		});

		it('imports links and events via alternate payload fields', () => {
			const doc = smallTopo();
			doc.history[0].stepType = 'update';
			doc.history[0].step = undefined;
			doc.history[0].events = [
				{ type: EventType.WEIGHT_CHANGE, targetId: 'L1', argument: 7 },
				{ type: EventType.LINK_ADDITION, targetId: 'L1', weight: 3 },
				{ type: EventType.NODE_MOVE, targetId: 'A', payload: { xPos: 8, yPos: 9 } },
				{ type: EventType.NODE_ADDITION, targetId: 'C', payload: { xPos: 4, yPos: 5 } },
				{ type: EventType.NODE_ADDITION, targetId: 'D', payload: { x: 1 } }
			];
			delete doc.history[0].topology.nodes[0].xPos;
			delete doc.history[0].topology.nodes[0].yPos;
			delete doc.history[0].topology.nodes[0].name;
			doc.history[0].topology.nodes[1].xPos = 12;
			doc.history[0].topology.nodes[1].yPos = 13;
			doc.history[0].topology.nodes[1].routingTable = {
				entries: [{ destinationId: 'A', nextHopId: '-', cost: 'inf' }]
			};
			delete doc.history[0].events[0].step;
			doc.history[0].events[1].payload = null;

			const result = Json.importJson(JSON.stringify(doc));
			expect(result.states[0].step).toBe(0);
			expect(result.states[0].stepType).toBe('update');
			expect(result.states[0].topology.links).toHaveLength(1);
			expect(result.states[0].topology.nodes.get('A')?.name).toBe('A');
			expect(result.states[0].topology.nodes.get('A')?.xPos).toBe(0);
			expect(result.states[0].topology.nodes.get('A')?.yPos).toBe(0);
			expect(result.states[0].events[0].payload).toEqual({ weight: 7 });
			expect(result.states[0].events[1].payload).toEqual({ weight: 3 });
			expect(result.states[0].events[2].payload).toEqual({ x: 8, y: 9 });
			expect(result.states[0].events[3].payload).toEqual({ x: 4, y: 5 });
			expect(result.states[0].events[4].payload).toEqual({});
			expect(result.states[0].topology.nodes.get('B')?.routingTable.entries.get('A')?.cost).toBe(
				Infinity
			);
		});

		it('link pair ordering for undirected key generation', () => {
			const doc = smallTopo();
			doc.history.push({
				...doc.history[0],
				step: 1,
				topology: {
					nodes: doc.history[0].topology.nodes,
					links: [{ id: 'L2', sourceId: 'B', targetId: 'A', weight: 3 }]
				},
				events: []
			});

			const result = Json.importJson(JSON.stringify(doc));
			expect(result.states[0].topology.nodes.get('A')?.neighbors.length).toBe(1);
			expect(result.states[0].topology.nodes.get('B')?.neighbors.length).toBe(1);
		});

		it('throws for false defined links and events', () => {
			const doc = smallTopo();
			doc.history[0].topology.links = [null];
			expect(() => Json.importJson(JSON.stringify(doc))).toThrow();

			const doc2 = smallTopo();
			doc2.history[0].topology.links.push({ ...doc2.history[0].topology.links[0] });
			expect(() => Json.importJson(JSON.stringify(doc2))).toThrow();

			const doc3 = smallTopo();
			doc3.history[0].topology.links[0].targetId = doc3.history[0].topology.links[0].sourceId;
			expect(() => Json.importJson(JSON.stringify(doc3))).toThrow();

			const doc4 = smallTopo();
			doc4.history[0].topology.links[0].weight = 0;
			expect(() => Json.importJson(JSON.stringify(doc4))).toThrow();

			const doc5 = smallTopo();
			doc5.history[0].topology.links[0].sourceId = 'xxx';
			expect(() => Json.importJson(JSON.stringify(doc5))).toThrow();

			const doc6 = smallTopo();
			doc6.history[0].topology.links[0].targetId = 'xxx';
			expect(() => Json.importJson(JSON.stringify(doc6))).toThrow();

			const doc7 = smallTopo();
			doc7.history[0].topology.links.push({
				...doc7.history[0].topology.links[0],
				id: 'L2',
				sourceId: 'B',
				targetId: 'A'
			});
			expect(() => Json.importJson(JSON.stringify(doc7))).toThrow();

			const doc8 = smallTopo();
			doc8.history[0].events = {};
			expect(() => Json.importJson(JSON.stringify(doc8))).toThrow();

			const doc9 = smallTopo();
			doc9.history[0].events = [null];
			expect(() => Json.importJson(JSON.stringify(doc9))).toThrow();

			const doc10 = smallTopo();
			doc10.history[0].events = [
				{ step: 1, type: EventType.NODE_FAILURE, targetId: 'A', payload: {} }
			];
			expect(() => Json.importJson(JSON.stringify(doc10))).toThrow();

			const doc11 = smallTopo();
			delete doc11.history[0].events;
			expect(Json.importJson(JSON.stringify(doc11)).states[0].events).toEqual([]);

			const doc12 = smallTopo();
			doc12.history[0].topology.nodes[0].routingTable = {
				entries: [{ destinationId: 'A', nextHopId: '-', cost: 'xxx' }]
			};
			expect(() => Json.importJson(JSON.stringify(doc12))).toThrow();
		});
	});
});
