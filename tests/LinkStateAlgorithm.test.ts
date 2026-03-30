import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LinkStateAlgorithm } from '../src/lib/model/LinkStateAlgorithm';
import { Router } from '../src/lib/model/Router';
import { Topology } from '../src/lib/model/Topology';
import { Link } from '../src/lib/model/Link';

function createTopology() {
	const topology = new Topology();
	const routerA = new Router('R1', 'Router A', 0, 0);
	const routerB = new Router('R2', 'Router B', 50, 50);
	const routerC = new Router('R3', 'Router C', 100, 100);
	const link = new Link('L1', routerA, routerB, 2);
	const link2 = new Link('L2', routerB, routerC, 3);

	topology.links.push(link);
	topology.links.push(link2);
	routerA.addNeighbor(link);
	routerB.addNeighbor(link);
	routerB.addNeighbor(link2);
	routerC.addNeighbor(link2);
	topology.nodes.set(routerA.id, routerA);
	topology.nodes.set(routerB.id, routerB);
	topology.nodes.set(routerC.id, routerC);

	return { topology, routerA, routerB, routerC };
}

function nextStep(routers: Router[], algorithm: LinkStateAlgorithm, topology: Topology) {
	for (const r of routers) {
		algorithm.executeStep(r, topology);
	}
}

/**
 * Testet die LinkStateAlgorithm-Implementierung auf Korrektheit in verschiedenen Szenarien, einschließlich von Randfällen.
 */

describe('LinkStateAlgorithm', () => {
	let algorithm: LinkStateAlgorithm;
	let topology: Topology;
	let routerA: Router;
	let routerB: Router;
	let routerC: Router;

	beforeEach(() => {
		({ topology, routerA, routerB, routerC } = createTopology());
		algorithm = new LinkStateAlgorithm();
	});

	it('lecture example', () => {
		const routerD = new Router('R4', 'Router C', 0, 100);
		const routerE = new Router('R5', 'Router C', 0, 200);
		const routerF = new Router('R6', 'Router C', 0, 300);
		const link3 = new Link('L3', routerC, routerF, 5);
		const link4 = new Link('L4', routerE, routerF, 2);
		const link5 = new Link('L5', routerD, routerE, 1);
		const link6 = new Link('L6', routerA, routerD, 1);
		const link7 = new Link('L7', routerB, routerD, 2);
		const link8 = new Link('L8', routerC, routerD, 3);
		const link9 = new Link('L9', routerC, routerE, 1);
		const link10 = new Link('L10', routerA, routerC, 5);

		topology.links.push(link3, link4, link5, link6, link7, link8, link9, link10);
		routerC.addNeighbor(link3);
		routerF.addNeighbor(link3);
		routerE.addNeighbor(link4);
		routerF.addNeighbor(link4);
		routerD.addNeighbor(link5);
		routerE.addNeighbor(link5);
		routerA.addNeighbor(link6);
		routerD.addNeighbor(link6);
		routerB.addNeighbor(link7);
		routerD.addNeighbor(link7);
		routerC.addNeighbor(link8);
		routerD.addNeighbor(link8);
		routerC.addNeighbor(link9);
		routerE.addNeighbor(link9);
		routerA.addNeighbor(link10);
		routerC.addNeighbor(link10);

		topology.nodes.set(routerD.id, routerD);
		topology.nodes.set(routerE.id, routerE);
		topology.nodes.set(routerF.id, routerF);

		nextStep([routerA, routerB, routerC, routerD, routerE, routerF], algorithm, topology);

		expect(routerA.routingTable.entries.get('R1')?.cost).toBe(0);
		expect(routerA.routingTable.entries.get('R4')?.cost).toBe(1);
		expect(routerA.routingTable.entries.get('R5')?.cost).toBe(2);
		expect(routerA.routingTable.entries.get('R6')?.cost).toBe(4);
	});

	it('direct neighbors only at start', () => {
		nextStep([routerA, routerB, routerC], algorithm, topology);

		expect(routerA.routingTable.entries.get('R1')?.cost).toBe(0);
		expect(routerA.routingTable.entries.get('R2')?.cost).toBe(2);
		expect(routerA.routingTable.entries.get('R3')?.cost).toBe(5);

		expect(routerB.routingTable.entries.get('R1')?.cost).toBe(2);
		expect(routerB.routingTable.entries.get('R3')?.cost).toBe(3);
		expect(routerB.routingTable.entries.get('R2')?.cost).toBe(0);
	});

	it('computes shortest paths', () => {
		const linkAC = new Link('L3', routerA, routerC, 10);
		topology.links.push(linkAC);
		routerA.addNeighbor(linkAC);
		routerC.addNeighbor(linkAC);

		nextStep([routerA, routerB, routerC], algorithm, topology);

		expect(routerA.routingTable.entries.get('R3')?.cost).toBe(5);
		expect(routerA.routingTable.entries.get('R3')?.nextHopId).toBe('R2');
	});

	it('updates routes when new link appears', () => {
		nextStep([routerA, routerB, routerC], algorithm, topology);
		expect(routerA.routingTable.entries.get('R3')?.cost).toBe(5);

		const better = new Link('L3', routerA, routerC, 1);
		topology.links.push(better);
		routerA.addNeighbor(better);
		routerC.addNeighbor(better);

		nextStep([routerA, routerB, routerC], algorithm, topology);

		expect(routerA.routingTable.entries.get('R3')?.cost).toBe(1);
		expect(routerA.routingTable.entries.get('R3')?.nextHopId).toBe('R3');
	});

	it('remove disabled routers', () => {
		(routerC as any).disabled = true;

		nextStep([routerA, routerB, routerC], algorithm, topology);

		expect(routerA.routingTable.entries.get('R3')).toBeUndefined();
		expect(routerB.routingTable.entries.get('R3')).toBeUndefined();
	});

	it('handles network partition and merge', () => {
		const topology = new Topology();
		const algo = new LinkStateAlgorithm();

		const A = new Router('A', 'A', 0, 0);
		const B = new Router('B', 'B', 50, 50);
		const C = new Router('C', 'C', 100, 100);
		const D = new Router('D', 'D', 150, 150);

		const linkAB = new Link('AB', A, B, 1);
		const linkBC = new Link('BC', B, C, 1);
		const linkCD = new Link('CD', C, D, 1);

		[linkAB, linkBC, linkCD].forEach((link) => {
			topology.links.push(link);
			link.source.addNeighbor(link);
			link.target.addNeighbor(link);
		});

		topology.nodes.set('A', A);
		topology.nodes.set('B', B);
		topology.nodes.set('C', C);
		topology.nodes.set('D', D);

		for (let i = 0; i < 5; i++) {
			nextStep([A, B, C, D], algo, topology);
		}

		expect(A.routingTable.entries.get('D')?.cost).toBe(3);

		B.neighbors = B.neighbors.filter((link) => link.id !== 'BC');
		C.neighbors = C.neighbors.filter((link) => link.id !== 'BC');
		topology.links = topology.links.filter((link) => link.id !== 'BC');

		nextStep([A, B, C, D], algo, topology);
		nextStep([A, B, C, D], algo, topology);

		expect(A.routingTable.entries.get('D')?.cost).toBe(Infinity);
		expect(B.routingTable.entries.get('C')?.cost).toBe(Infinity);

		const linkAC = new Link('AC', A, C, 2);
		topology.links.push(linkAC);
		A.addNeighbor(linkAC);
		C.addNeighbor(linkAC);

		nextStep([A, B, C, D], algo, topology);
		nextStep([A, B, C, D], algo, topology);

		expect(A.routingTable.entries.get('D')?.cost).toBe(3);
		expect(A.routingTable.entries.get('D')?.nextHopId).toBe('C');
	});

	it('disable router', () => {
		const topology = new Topology();
		const algo = new LinkStateAlgorithm();

		const A = new Router('A', 'A', 0, 0);
		const B = new Router('B', 'B', 50, 0);
		const C = new Router('C', 'C', 100, 0);

		const linkAB = new Link('AB', A, B, 1);
		const linkBC = new Link('BC', B, C, 1);

		[linkAB, linkBC].forEach((link) => {
			topology.links.push(link);
			link.source.addNeighbor(link);
			link.target.addNeighbor(link);
		});

		topology.nodes.set(A.id, A);
		topology.nodes.set(B.id, B);
		topology.nodes.set(C.id, C);

		nextStep([A, B, C], algo, topology);
		expect(A.routingTable.entries.get('C')?.cost).toBe(2);
		expect(A.routingTable.entries.get('C')?.nextHopId).toBe('B');

		B.disabled = true;
		nextStep([A, B, C], algo, topology);

		expect(A.routingTable.entries.get('C')?.cost).toBe(Infinity);
		expect(A.routingTable.entries.get('C')?.nextHopId).toBe('-');
	});

	it('drops routes to nodes removed from the topology', () => {
		nextStep([routerA, routerB, routerC], algorithm, topology);
		expect(routerA.routingTable.entries.get('R3')).toBeDefined();

		topology.links = topology.links.filter(
			(link) => link.source !== routerC && link.target !== routerC
		);
		routerA.neighbors = routerA.neighbors.filter(
			(link) => link.source !== routerC && link.target !== routerC
		);
		routerB.neighbors = routerB.neighbors.filter(
			(link) => link.source !== routerC && link.target !== routerC
		);
		topology.nodes.delete(routerC.id);

		nextStep([routerA, routerB], algorithm, topology);

		expect(routerA.routingTable.entries.get('R3')).toBeUndefined();
		expect(routerB.routingTable.entries.get('R3')).toBeUndefined();
	});

	it('computes paths in a 15-node line topology', () => {
		const topology = new Topology();
		const algo = new LinkStateAlgorithm();

		const routers: Router[] = [];
		for (let i = 1; i <= 15; i++) {
			const r = new Router(`R${i}`, `R${i}`, i * 10, 0);
			routers.push(r);
			topology.nodes.set(r.id, r);
		}

		for (let i = 0; i < routers.length - 1; i++) {
			const current = routers[i];
			const next = routers[i + 1];
			const link = new Link(`L${current.id}-${next.id}`, current, next, 1);
			topology.links.push(link);
			current.addNeighbor(link);
			next.addNeighbor(link);
		}

		nextStep(routers, algo, topology);
		nextStep(routers, algo, topology);
		nextStep(routers, algo, topology);

		const first = routers[0];
		const middle = routers[7];
		const end = routers[14];

		expect(first.routingTable.entries.get('R15')?.cost).toBe(14);
		expect(first.routingTable.entries.get('R15')?.nextHopId).toBe('R2');

		expect(middle.routingTable.entries.get('R1')?.cost).toBe(7);
		expect(middle.routingTable.entries.get('R1')?.nextHopId).toBe('R7');

		expect(end.routingTable.entries.get('R1')?.cost).toBe(14);
		expect(end.routingTable.entries.get('R1')?.nextHopId).toBe('R14');

		expect(first.routingTable.entries.get('R9')?.cost).toBe(8);
		expect(first.routingTable.entries.get('R15')?.nextHopId).toBe('R2');

		expect(middle.routingTable.entries.get('R3')?.cost).toBe(5);
		expect(middle.routingTable.entries.get('R3')?.nextHopId).toBe('R7');
	});

	it('lecture topology 5.3', () => {
		const topology = new Topology();
		const algo = new LinkStateAlgorithm();

		const A = new Router('A', 'A', 0, 0);
		const B = new Router('B', 'B', 10, 10);
		const C = new Router('C', 'C', 20, 0);
		const D = new Router('D', 'D', 0, -10);
		const E = new Router('E', 'E', 30, 10);
		const F = new Router('F', 'F', 20, -10);
		const G = new Router('G', 'G', 40, 0);

		const links = [
			new Link('AB', A, B, 11),
			new Link('AD', A, D, 1),
			new Link('BC', B, C, 5),
			new Link('BE', B, E, 2),
			new Link('CF', C, F, 1),
			new Link('CG', C, G, 2),
			new Link('DF', D, F, 2),
			new Link('EG', E, G, 10),
			new Link('FG', F, G, 3)
		];

		[A, B, C, D, E, F, G].forEach((r) => topology.nodes.set(r.id, r));
		links.forEach((link) => {
			topology.links.push(link);
			link.source.addNeighbor(link);
			link.target.addNeighbor(link);
		});

		nextStep([A, B, C, D, E, F, G], algo, topology);

		expect(A.routingTable.entries.get('G')?.cost).toBe(6);
		expect(A.routingTable.entries.get('G')?.nextHopId).toBe('D');

		expect(A.routingTable.entries.get('E')?.cost).toBe(11);
		expect(A.routingTable.entries.get('E')?.nextHopId).toBe('D');

		expect(B.routingTable.entries.get('F')?.cost).toBe(6);
		expect(B.routingTable.entries.get('F')?.nextHopId).toBe('C');

		expect(C.routingTable.entries.get('A')?.cost).toBe(4);
		expect(C.routingTable.entries.get('A')?.nextHopId).toBe('F');
	});

	it('handles isolated router (no neighbors)', () => {
		const topology = new Topology();
		const algo = new LinkStateAlgorithm();
		const A = new Router('A', 'A', 0, 0);
		topology.nodes.set(A.id, A);
		algo.executeStep(A, topology);
		expect(A.routingTable.entries.get('A')?.cost).toBe(0);
		expect(A.routingTable.entries.size).toBe(1);
	});

	it('sets unreachable cost and nextHop for disconnected node', () => {
		const topology = new Topology();
		const algo = new LinkStateAlgorithm();
		const A = new Router('A', 'A', 0, 0);
		const B = new Router('B', 'B', 1, 1);
		topology.nodes.set(A.id, A);
		topology.nodes.set(B.id, B);
		algo.executeStep(A, topology);
		expect(A.routingTable.entries.get('B')?.cost).toBe(Infinity);
		expect(A.routingTable.entries.get('B')?.nextHopId).toBe('-');
	});

	it('handles neighbor with weight 0', () => {
		const topology = new Topology();
		const algo = new LinkStateAlgorithm();
		const A = new Router('A', 'A', 0, 0);
		const B = new Router('B', 'B', 1, 1);
		const link = new Link('L1', A, B, 0);
		topology.nodes.set(A.id, A);
		topology.nodes.set(B.id, B);
		topology.links.push(link);
		A.addNeighbor(link);
		B.addNeighbor(link);
		algo.executeStep(A, topology);
		expect(A.routingTable.entries.get('B')?.cost).toBe(0);
		expect(A.routingTable.entries.get('B')?.nextHopId).toBe('B');
	});

	it('falls back to infinity when first hop cannot be reconstructed', () => {
		const topology = new Topology();
		const algo = new LinkStateAlgorithm() as any;
		const A = new Router('A', 'A', 0, 0);
		const B = new Router('B', 'B', 1, 1);
		const linkAB = new Link('AB', A, B, 2);

		topology.nodes.set(A.id, A);
		topology.nodes.set(B.id, B);
		topology.links.push(linkAB);
		A.addNeighbor(linkAB);
		B.addNeighbor(linkAB);

		const original = algo.getFirstHopOnPath.bind(algo);
		algo.getFirstHopOnPath = () => null;
		try {
			algo.executeStep(A, topology);
		} finally {
			algo.getFirstHopOnPath = original;
		}

		expect(A.routingTable.entries.get('B')?.cost).toBe(Infinity);
		expect(A.routingTable.entries.get('B')?.nextHopId).toBe('-');
	});

	it('getFirstHopOnPath returns null for broken list', () => {
		const algo = new LinkStateAlgorithm() as any;
		const prev = new Map<string, string | null>([
			['B', 'X'],
			['X', null]
		]);

		const hop = algo.getFirstHopOnPath('A', 'B', prev);
		expect(hop).toBeNull();
	});

	it('continues when current node id is missing in topology', () => {
		const topology = new Topology();
		const algo = new LinkStateAlgorithm();
		const inTopology = new Router('T', 'T', 0, 0);
		const outside = new Router('X', 'X', 0, 0);

		topology.nodes.set(inTopology.id, inTopology);
		algo.executeStep(outside, topology);

		expect(outside.routingTable.entries.get('X')?.cost).toBe(0);
	});

	it('uses distance fallbacks when dist entries are missing', () => {
		const topology = new Topology();
		const algo = new LinkStateAlgorithm();
		const A = new Router('A', 'A', 0, 0);
		const external = new Router('E', 'E', 1, 1);
		const linkAE = new Link('AE', A, external, 7);

		topology.nodes.set(A.id, A);
		topology.links.push(linkAE);
		A.addNeighbor(linkAE);
		external.addNeighbor(linkAE);

		const originalGet = Map.prototype.get;
		const getSpy = vi.spyOn(Map.prototype, 'get').mockImplementation(function (
			this: Map<any, any>,
			key: any
		) {
			const val = originalGet.call(this, key);
			if (key === 'A' && typeof val === 'number') {
				return undefined as any;
			}
			return val;
		});

		try {
			algo.executeStep(A, topology);
		} finally {
			getSpy.mockRestore();
		}

		expect(A.routingTable.entries.get('A')?.cost).toBe(0);
	});

	it('skips disabled neighbors during link-state computation', () => {
		const topology = new Topology();
		const algo = new LinkStateAlgorithm();
		const A = new Router('A', 'A', 0, 0);
		const B = new Router('B', 'B', 1, 1);
		const link = new Link('L1', A, B, 1);
		topology.nodes.set(A.id, A);
		topology.nodes.set(B.id, B);
		topology.links.push(link);
		A.addNeighbor(link);
		B.addNeighbor(link);

		B.disabled = true;
		algo.executeStep(A, topology);

		expect(A.routingTable.entries.get('B')).toBeUndefined();
	});

	it('handles nodes with null neighbors property', () => {
		const topology = new Topology();
		const algo = new LinkStateAlgorithm();
		const A = new Router('A', 'A', 0, 0);
		(A as any).neighbors = null;
		topology.nodes.set(A.id, A);

		expect(() => algo.executeStep(A, topology)).not.toThrow();
		expect(A.routingTable.entries.get('A')?.cost).toBe(0);
	});

	it('getFirstHopOnPath returns null if no path exists', () => {
		const algo = new LinkStateAlgorithm();
		const prev = new Map<string, string | null>();
		prev.set('B', null);
		expect(algo['getFirstHopOnPath']('A', 'B', prev)).toBeNull();
	});
});
