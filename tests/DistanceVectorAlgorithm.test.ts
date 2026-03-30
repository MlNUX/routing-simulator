import { describe, it, expect, beforeEach } from 'vitest';
import { DistanceVectorAlgorithm } from '../src/lib/model/DistanceVectorAlgorithm';
import { Router } from '../src/lib/model/Router';
import { Topology } from '../src/lib/model/Topology';
import { Link } from '../src/lib/model/Link';

function createTopology() {
	const topology = new Topology();
	const routerA = new Router('R1', 'Router A', 0, 0);
	const routerB = new Router('R2', 'Router B', 50, 50);
	const routerC = new Router('R3', 'Router C', 100, 100);
	const routerD = new Router('R4', 'Router D', 150, 150);
	const link = new Link('L1', routerA, routerB, 1);
	const link2 = new Link('L2', routerC, routerD, 2);
	const link3 = new Link('L3', routerB, routerC, 1);
	topology.links.push(link);
	topology.links.push(link2);
	topology.links.push(link3);
	routerA.addNeighbor(link);
	routerB.addNeighbor(link);
	routerC.addNeighbor(link2);
	routerD.addNeighbor(link2);
	routerB.addNeighbor(link3);
	routerC.addNeighbor(link3);
	topology.nodes.set(routerA.id, routerA);
	topology.nodes.set(routerB.id, routerB);
	topology.nodes.set(routerC.id, routerC);
	topology.nodes.set(routerD.id, routerD);

	return { topology, routerA, routerB, routerC, routerD };
}

function nextStep(routers: Router[], algorithm: DistanceVectorAlgorithm, topology: Topology) {
	for (const r of routers) {
		algorithm.executeStep(r, topology);
	}
	for (const r of routers) {
		algorithm.receivePackets(r, topology);
	}
}
/**
 * Testet die Distanvectoralgorithmus-Implementierung auf Korrektheit in verschiedenen Szenarien, einschließlich der Initialisierung von Routingtabellen, Verhalten bei Linkausfällen, Count-to-Infinity-Szenarien und vielen anderen Randfällen.
 */

describe('DistanceVectorAlgorithm', () => {
	let algorithm: DistanceVectorAlgorithm;
	let topology: Topology;
	let routerA: Router;
	let routerB: Router;

	beforeEach(() => {
		({ topology, routerA, routerB } = createTopology());
		algorithm = new DistanceVectorAlgorithm(false);
	});

	it('initialize routing tables', () => {
		nextStep([routerA, routerB], algorithm, topology);

		expect(routerA.routingTable.entries.get('R1')?.cost).toBe(0);
		expect(routerA.routingTable.entries.get('R2')?.cost).toBe(1);
		expect(routerB.routingTable.entries.get('R1')?.cost).toBe(1);

		nextStep([routerA, routerB], algorithm, topology);
		nextStep([routerA, routerB], algorithm, topology);

		expect(routerB.routingTable.entries.get('R1')?.cost).toBe(1);
		expect(routerA.routingTable.entries.get('R2')?.cost).toBe(1);
	});

	it('poisoned reverse', () => {
		const poisonedAlgo = new DistanceVectorAlgorithm(true);
		nextStep([routerA, routerB], poisonedAlgo, topology);
		nextStep([routerA, routerB], poisonedAlgo, topology);

		expect(routerB.routingTable.entries.get('R1')?.cost).toBe(1);

		nextStep([routerA, routerB], poisonedAlgo, topology);
		expect(routerA.routingTable.entries.get('R2')?.cost).toBe(1);
	});

	it('remove neighbors', () => {
		nextStep([routerA, routerB], algorithm, topology);

		routerA.neighbors = [];
		nextStep([routerA, routerB], algorithm, topology);

		expect(routerA.routingTable.entries.get('R2')?.cost).toBe(Infinity);
	});

	it('route via another router', () => {
		nextStep([routerA, routerB], algorithm, topology);

		const routerC = topology.nodes.get('R3') as Router;
		const linkBC = topology.links.find((l) => {
			const s = l.source.id;
			const t = l.target.id;
			return (s === 'R2' && t === 'R3') || (s === 'R3' && t === 'R2');
		}) as Link | undefined;

		expect(routerC).toBeDefined();
		expect(linkBC).toBeDefined();

		if (linkBC) {
			linkBC.weight = 3;
		}

		nextStep([routerA, routerB, routerC], algorithm, topology);
		nextStep([routerA, routerB, routerC], algorithm, topology);
		nextStep([routerA, routerB, routerC], algorithm, topology);
		nextStep([routerA, routerB, routerC], algorithm, topology);
		nextStep([routerA, routerB, routerC], algorithm, topology);
		nextStep([routerA, routerB, routerC], algorithm, topology);
		nextStep([routerA, routerB, routerC], algorithm, topology);

		expect(routerA.routingTable.entries.get('R3')).toBeDefined();
		expect(routerA.routingTable.entries.get('R3')?.cost).toBe(4);
		expect(routerA.routingTable.entries.get('R3')?.nextHopId).toBe('R2');
	});

	it('changed link weight', () => {
		nextStep([routerA, routerB], algorithm, topology);

		topology.links[0].weight = 10;
		nextStep([routerA, routerB], algorithm, topology);

		expect(routerA.routingTable.entries.get('R2')?.cost).toBe(10);
		expect(routerB.routingTable.entries.get('R1')?.cost).toBe(10);
	});

	it('sends DV even when updated flag is false', () => {
		algorithm.initialize(routerA, topology, false);
		expect(routerA.dvState).toBeTruthy();
		if (routerA.dvState) routerA.dvState.updated = false;

		algorithm.executeStep(routerA, topology);

		expect(routerB.dvState).toBeTruthy();
		const row = routerB.dvState?.dvs?.[routerA.id];
		expect(row).toBeTruthy();
		expect(row?.[routerA.id]?.dist).toBe(0);
	});

	it('records sent link ids when sending DV', () => {
		const topo: any = topology;
		topo.sentLinkIds = [];

		algorithm.initialize(routerA, topology, false);
		(algorithm as any).sendDV(routerA, topology);

		expect(Array.isArray(topo.sentLinkIds)).toBe(true);
		expect(topo.sentLinkIds.length).toBeGreaterThan(0);
		expect(topo.sentLinkIds).toContain('L1');
	});

	it('count to infinity', () => {
		const { topology, routerA, routerB, routerC, routerD } = createTopology();
		nextStep([routerA, routerB, routerC, routerD], algorithm, topology);
		nextStep([routerA, routerB, routerC, routerD], algorithm, topology);
		nextStep([routerA, routerB, routerC, routerD], algorithm, topology);

		routerB.neighbors = routerB.neighbors.filter((link) => {
			const other = link.otherSide(routerB.id);
			return other.id !== routerC.id;
		});
		routerC.neighbors = routerC.neighbors.filter((link) => {
			const other = link.otherSide(routerC.id);
			return other.id !== routerB.id;
		});
		topology.links = topology.links.filter((link) => {
			return !(
				(link.source.id === routerB.id && link.target.id === routerC.id) ||
				(link.source.id === routerC.id && link.target.id === routerB.id)
			);
		});
		nextStep([routerA, routerB, routerC, routerD], algorithm, topology);
		nextStep([routerA, routerB, routerC, routerD], algorithm, topology);
		nextStep([routerA, routerB, routerC, routerD], algorithm, topology);

		expect(routerA.routingTable.entries.get('R3')?.cost).toBeGreaterThan(3);
		expect(routerB.routingTable.entries.get('R4')?.cost).toBeGreaterThan(4);
		expect(routerA.routingTable.entries.get('R3')?.cost).toBeLessThan(100);
		expect(routerB.routingTable.entries.get('R4')?.cost).toBeLessThan(100);
	});

	it('poisoned reverse prevents count to infinity', () => {
		const poisonedAlgo = new DistanceVectorAlgorithm(true);
		const { topology, routerA, routerB, routerC, routerD } = createTopology();
		nextStep([routerA, routerB, routerC, routerD], poisonedAlgo, topology);
		nextStep([routerA, routerB, routerC, routerD], poisonedAlgo, topology);
		nextStep([routerA, routerB, routerC, routerD], poisonedAlgo, topology);

		routerB.neighbors = routerB.neighbors.filter((link) => {
			const other = link.otherSide(routerB.id);
			return other.id !== routerC.id;
		});
		routerC.neighbors = routerC.neighbors.filter((link) => {
			const other = link.otherSide(routerC.id);
			return other.id !== routerB.id;
		});
		topology.links = topology.links.filter((link) => {
			return !(
				(link.source.id === routerB.id && link.target.id === routerC.id) ||
				(link.source.id === routerC.id && link.target.id === routerB.id)
			);
		});
		nextStep([routerA, routerB, routerC, routerD], poisonedAlgo, topology);
		nextStep([routerA, routerB, routerC, routerD], poisonedAlgo, topology);
		nextStep([routerA, routerB, routerC, routerD], poisonedAlgo, topology);

		expect(routerA.routingTable.entries.get('R3')?.cost).toBe(Number.POSITIVE_INFINITY);
		expect(routerA.routingTable.entries.get('R4')?.cost).toBe(Number.POSITIVE_INFINITY);
		expect(routerB.routingTable.entries.get('R4')?.cost).toBe(Number.POSITIVE_INFINITY);
	});

	it('restores routes after router reactivation', () => {
		const { topology, routerA, routerB, routerC, routerD } = createTopology();
		const algo = new DistanceVectorAlgorithm(false);

		nextStep([routerA, routerB, routerC, routerD], algo, topology);
		nextStep([routerA, routerB, routerC, routerD], algo, topology);
		nextStep([routerA, routerB, routerC, routerD], algo, topology);

		expect(routerA.routingTable.entries.get('R4')?.cost).toBe(4);
		expect(routerA.routingTable.entries.get('R4')?.nextHopId).toBe('R2');

		routerC.disabled = true;

		nextStep([routerA, routerB, routerC, routerD], algo, topology);
		nextStep([routerA, routerB, routerC, routerD], algo, topology);
		nextStep([routerA, routerB, routerC, routerD], algo, topology);
		nextStep([routerA, routerB, routerC, routerD], algo, topology);
		nextStep([routerA, routerB, routerC, routerD], algo, topology);

		expect(routerA.routingTable.entries.get('R4')?.cost).toBeGreaterThan(4);

		routerC.disabled = false;

		nextStep([routerA, routerB, routerC, routerD], algo, topology);
		nextStep([routerA, routerB, routerC, routerD], algo, topology);
		nextStep([routerA, routerB, routerC, routerD], algo, topology);

		expect(routerA.routingTable.entries.get('R4')?.cost).toBe(4);
		expect(routerA.routingTable.entries.get('R4')?.nextHopId).toBe('R2');
		expect(routerB.routingTable.entries.get('R4')?.cost).toBe(3);
	});

	it('correct routing table for lecture topology', () => {
		const topology = new Topology();
		const algo = new DistanceVectorAlgorithm(false);

		const A = new Router('A', 'A', 0, 0);
		const B = new Router('B', 'B', 50, 50);
		const C = new Router('C', 'C', 100, 100);
		const D = new Router('D', 'D', 150, 150);
		const E = new Router('E', 'E', 200, 200);

		const links = [
			new Link('EA', E, A, 1),
			new Link('AB', A, B, 7),
			new Link('BC', B, C, 1),
			new Link('CD', C, D, 2),
			new Link('ED', E, D, 2),
			new Link('EB', E, B, 8)
		];

		for (const link of links) {
			topology.links.push(link);
			link.source.addNeighbor(link);
			link.target.addNeighbor(link);
		}

		topology.nodes.set('A', A);
		topology.nodes.set('B', B);
		topology.nodes.set('C', C);
		topology.nodes.set('D', D);
		topology.nodes.set('E', E);

		for (let i = 0; i < 5; i++) {
			nextStep([A, B, C, D, E], algo, topology);
		}

		expect(E.routingTable.entries.get('A')?.cost).toBe(1);
		expect(E.routingTable.entries.get('A')?.nextHopId).toBe('A');

		expect(E.routingTable.entries.get('B')?.cost).toBe(5);
		expect(E.routingTable.entries.get('B')?.nextHopId).toBe('D');

		expect(E.routingTable.entries.get('C')?.cost).toBe(4);
		expect(E.routingTable.entries.get('C')?.nextHopId).toBe('D');

		expect(E.routingTable.entries.get('D')?.cost).toBe(2);
		expect(E.routingTable.entries.get('D')?.nextHopId).toBe('D');
	});

	it('handles multiple equal-cost paths', () => {
		const topology = new Topology();
		const algo = new DistanceVectorAlgorithm(false);

		const A = new Router('A', 'A', 0, 0);
		const B = new Router('B', 'B', 50, 50);
		const C = new Router('C', 'C', 100, 100);
		const D = new Router('D', 'D', 150, 150);

		const links = [
			new Link('AB', A, B, 5),
			new Link('AC', A, C, 5),
			new Link('BD', B, D, 5),
			new Link('CD', C, D, 5)
		];

		for (const link of links) {
			topology.links.push(link);
			link.source.addNeighbor(link);
			link.target.addNeighbor(link);
		}

		topology.nodes.set('A', A);
		topology.nodes.set('B', B);
		topology.nodes.set('C', C);
		topology.nodes.set('D', D);

		for (let i = 0; i < 5; i++) {
			nextStep([A, B, C, D], algo, topology);
		}

		expect(A.routingTable.entries.get('D')?.cost).toBe(10);
		expect(['B', 'C']).toContain(A.routingTable.entries.get('D')?.nextHopId);
	});

	it('handles link weight increase', () => {
		const topology = new Topology();
		const algo = new DistanceVectorAlgorithm(false);

		const A = new Router('A', 'A', 0, 0);
		const B = new Router('B', 'B', 50, 50);
		const C = new Router('C', 'C', 100, 100);

		const linkAC = new Link('AC', A, C, 5);
		const linkAB = new Link('AB', A, B, 2);
		const linkBC = new Link('BC', B, C, 2);

		[linkAC, linkAB, linkBC].forEach((link) => {
			topology.links.push(link);
			link.source.addNeighbor(link);
			link.target.addNeighbor(link);
		});

		topology.nodes.set('A', A);
		topology.nodes.set('B', B);
		topology.nodes.set('C', C);

		for (let i = 0; i < 4; i++) {
			nextStep([A, B, C], algo, topology);
		}

		expect(A.routingTable.entries.get('C')?.cost).toBe(4);
		expect(A.routingTable.entries.get('C')?.nextHopId).toBe('B');

		linkAB.weight = 10;

		for (let i = 0; i < 4; i++) {
			nextStep([A, B, C], algo, topology);
		}

		expect(A.routingTable.entries.get('C')?.cost).toBe(5);
		expect(A.routingTable.entries.get('C')?.nextHopId).toBe('C');
	});

	it('handles network partition and merge', () => {
		const topology = new Topology();
		const algo = new DistanceVectorAlgorithm(false);

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

		for (let i = 0; i < 5; i++) {
			nextStep([A, B, C, D], algo, topology);
		}

		expect(A.routingTable.entries.get('D')?.cost).toBeGreaterThan(3);
		expect(A.routingTable.entries.get('D')?.cost).toBeLessThan(100);
		expect(B.routingTable.entries.get('C')?.cost).toBeGreaterThan(1);
		expect(B.routingTable.entries.get('C')?.cost).toBeLessThan(100);

		const linkAC = new Link('AC', A, C, 2);
		topology.links.push(linkAC);
		A.addNeighbor(linkAC);
		C.addNeighbor(linkAC);

		for (let i = 0; i < 5; i++) {
			nextStep([A, B, C, D], algo, topology);
		}

		expect(A.routingTable.entries.get('D')?.cost).toBe(3);
		expect(A.routingTable.entries.get('D')?.nextHopId).toBe('C');
	});

	it('another topology', () => {
		const topology = new Topology();
		const algo = new DistanceVectorAlgorithm(false);

		const A = new Router('A', 'A', 0, 0);
		const B = new Router('B', 'B', 50, 0);
		const C = new Router('C', 'C', 0, 50);
		const D = new Router('D', 'D', 50, 50);

		const links = [
			new Link('AB', A, B, 1),
			new Link('AC', A, C, 3),
			new Link('BD', B, D, 4),
			new Link('CD', C, D, 1)
		];

		for (const link of links) {
			topology.links.push(link);
			link.source.addNeighbor(link);
			link.target.addNeighbor(link);
		}

		topology.nodes.set('A', A);
		topology.nodes.set('B', B);
		topology.nodes.set('C', C);
		topology.nodes.set('D', D);

		for (let i = 0; i < 6; i++) {
			nextStep([A, B, C, D], algo, topology);
		}

		expect(A.routingTable.entries.get('D')?.cost).toBe(4);
		expect(A.routingTable.entries.get('D')?.nextHopId).toBe('C');
		expect(B.routingTable.entries.get('C')?.cost).toBe(4);
		expect(C.routingTable.entries.get('B')?.cost).toBe(4);
	});

	it('converges on a large topology with 15 routers', () => {
		const topology = new Topology();
		const algo = new DistanceVectorAlgorithm(false);

		const routers: Router[] = [];
		for (let i = 1; i <= 15; i++) {
			const id = `R${i}`;
			routers.push(new Router(id, id, i * 10, i * 10));
		}

		const links: Link[] = [];
		for (let i = 0; i < routers.length - 1; i++) {
			links.push(new Link(`L${i + 1}`, routers[i], routers[i + 1], 1));
		}

		const shortcut1 = new Link('S1', routers[0], routers[7], 4);
		const shortcut2 = new Link('S2', routers[7], routers[14], 4);
		links.push(shortcut1, shortcut2);

		for (const link of links) {
			topology.links.push(link);
			link.source.addNeighbor(link);
			link.target.addNeighbor(link);
		}

		for (const router of routers) {
			topology.nodes.set(router.id, router);
		}

		for (let i = 0; i < 12; i++) {
			nextStep(routers, algo, topology);
		}

		const r1 = routers[0];
		const r8 = routers[7];
		const r15 = routers[14];

		expect(r1.routingTable.entries.get('R15')?.cost).toBe(8);
		expect(r1.routingTable.entries.get('R15')?.nextHopId).toBe('R8');

		expect(r8.routingTable.entries.get('R15')?.cost).toBe(4);
		expect(r8.routingTable.entries.get('R15')?.nextHopId).toBe('R15');

		expect(r1.routingTable.entries.get('R10')?.cost).toBe(6);
		expect(r1.routingTable.entries.get('R10')?.nextHopId).toBe('R8');

		expect(r15.routingTable.entries.get('R1')?.cost).toBe(8);
		expect(r15.routingTable.entries.get('R1')?.nextHopId).toBe('R8');

		expect(r8.routingTable.entries.get('R1')?.cost).toBe(4);
		expect(r8.routingTable.entries.get('R1')?.nextHopId).toBe('R1');

		expect(r15.routingTable.entries.get('R10')?.cost).toBe(5);
		expect(r15.routingTable.entries.get('R10')?.nextHopId).toBe('R14');
	});

	it('exercise 3', () => {
		const topology = new Topology();
		const algo = new DistanceVectorAlgorithm(false);

		const A = new Router('A', 'A', 0, 0);
		const B = new Router('B', 'B', 50, 0);
		const C = new Router('C', 'C', 0, 50);
		const D = new Router('D', 'D', 50, 50);
		const E = new Router('E', 'E', 100, 50);

		const links = [
			new Link('AB', A, B, 4),
			new Link('AC', A, C, 1),
			new Link('BD', B, D, 2),
			new Link('BE', B, E, 4),
			new Link('CD', C, D, 5),
			new Link('DE', D, E, 1)
		];

		for (const link of links) {
			topology.links.push(link);
			link.source.addNeighbor(link);
			link.target.addNeighbor(link);
		}

		topology.nodes.set('A', A);
		topology.nodes.set('B', B);
		topology.nodes.set('C', C);
		topology.nodes.set('D', D);
		topology.nodes.set('E', E);

		for (let i = 0; i < 5; i++) {
			nextStep([A, B, C, D, E], algo, topology);
		}

		expect(A.routingTable.entries.get('B')?.cost).toBe(4);
		expect(A.routingTable.entries.get('B')?.nextHopId).toBe('B');

		expect(A.routingTable.entries.get('C')?.cost).toBe(1);
		expect(A.routingTable.entries.get('C')?.nextHopId).toBe('C');

		expect(A.routingTable.entries.get('D')?.cost).toBe(6);
		expect(['B', 'C']).toContain(A.routingTable.entries.get('D')?.nextHopId);

		expect(A.routingTable.entries.get('E')?.cost).toBe(7);
		expect(['B', 'C']).toContain(A.routingTable.entries.get('E')?.nextHopId);

		expect(B.routingTable.entries.get('A')?.cost).toBe(4);
		expect(B.routingTable.entries.get('A')?.nextHopId).toBe('A');

		expect(B.routingTable.entries.get('D')?.cost).toBe(2);
		expect(B.routingTable.entries.get('D')?.nextHopId).toBe('D');

		expect(B.routingTable.entries.get('E')?.cost).toBe(3);
		expect(B.routingTable.entries.get('E')?.nextHopId).toBe('D');

		expect(B.routingTable.entries.get('C')?.cost).toBe(5);
		expect(B.routingTable.entries.get('C')?.nextHopId).toBe('A');

		expect(C.routingTable.entries.get('A')?.cost).toBe(1);
		expect(C.routingTable.entries.get('A')?.nextHopId).toBe('A');

		expect(C.routingTable.entries.get('D')?.cost).toBe(5);
		expect(C.routingTable.entries.get('D')?.nextHopId).toBe('D');

		expect(C.routingTable.entries.get('B')?.cost).toBe(5);
		expect(C.routingTable.entries.get('B')?.nextHopId).toBe('A');

		expect(C.routingTable.entries.get('E')?.cost).toBe(6);
		expect(C.routingTable.entries.get('E')?.nextHopId).toBe('D');

		expect(D.routingTable.entries.get('B')?.cost).toBe(2);
		expect(D.routingTable.entries.get('B')?.nextHopId).toBe('B');

		expect(D.routingTable.entries.get('E')?.cost).toBe(1);
		expect(D.routingTable.entries.get('E')?.nextHopId).toBe('E');

		expect(D.routingTable.entries.get('A')?.cost).toBe(6);
		expect(['B', 'C']).toContain(D.routingTable.entries.get('A')?.nextHopId);

		expect(D.routingTable.entries.get('C')?.cost).toBe(5);
		expect(D.routingTable.entries.get('C')?.nextHopId).toBe('C');

		expect(E.routingTable.entries.get('D')?.cost).toBe(1);
		expect(E.routingTable.entries.get('D')?.nextHopId).toBe('D');

		expect(E.routingTable.entries.get('B')?.cost).toBe(3);
		expect(E.routingTable.entries.get('B')?.nextHopId).toBe('D');

		expect(E.routingTable.entries.get('C')?.cost).toBe(6);
		expect(E.routingTable.entries.get('C')?.nextHopId).toBe('D');

		expect(E.routingTable.entries.get('A')?.cost).toBe(7);
		expect(E.routingTable.entries.get('A')?.nextHopId).toBe('D');
	});

	it('computes hop counts along multi-hop paths', () => {
		const topology = new Topology();
		const algo = new DistanceVectorAlgorithm(false);

		const A = new Router('A', 'A', 0, 0);
		const B = new Router('B', 'B', 50, 0);
		const C = new Router('C', 'C', 100, 0);

		const linkAB = new Link('AB', A, B, 2);
		const linkBC = new Link('BC', B, C, 3);

		[linkAB, linkBC].forEach((link) => {
			topology.links.push(link);
			link.source.addNeighbor(link);
			link.target.addNeighbor(link);
		});

		topology.nodes.set('A', A);
		topology.nodes.set('B', B);
		topology.nodes.set('C', C);

		for (let i = 0; i < 5; i++) {
			nextStep([A, B, C], algo, topology);
		}

		expect(A.routingTable.entries.get('C')?.cost).toBe(5);
	});

	it('prefers cheaper indirect path over expensive direct link', () => {
		const topology = new Topology();
		const algo = new DistanceVectorAlgorithm(false);

		const A = new Router('A', 'A', 0, 0);
		const B = new Router('B', 'B', 50, 0);
		const C = new Router('C', 'C', 0, 50);

		const directAB = new Link('AB', A, B, 10);
		const linkAC = new Link('AC', A, C, 1);
		const linkCB = new Link('CB', C, B, 1);

		[directAB, linkAC, linkCB].forEach((link) => {
			topology.links.push(link);
			link.source.addNeighbor(link);
			link.target.addNeighbor(link);
		});

		topology.nodes.set('A', A);
		topology.nodes.set('B', B);
		topology.nodes.set('C', C);

		for (let i = 0; i < 5; i++) {
			nextStep([A, B, C], algo, topology);
		}

		expect(A.routingTable.entries.get('B')?.cost).toBe(2);
		expect(A.routingTable.entries.get('B')?.nextHopId).toBe('C');
	});

	it('propagates increased costs on multi-hop routes', () => {
		const topology = new Topology();
		const algo = new DistanceVectorAlgorithm(false);

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

		topology.nodes.set('A', A);
		topology.nodes.set('B', B);
		topology.nodes.set('C', C);

		for (let i = 0; i < 4; i++) {
			nextStep([A, B, C], algo, topology);
		}

		expect(A.routingTable.entries.get('C')?.cost).toBe(2);
		expect(A.routingTable.entries.get('C')?.nextHopId).toBe('B');

		linkBC.weight = 9;

		for (let i = 0; i < 10; i++) {
			nextStep([A, B, C], algo, topology);
		}

		expect(A.routingTable.entries.get('C')?.cost).toBe(10);
		expect(A.routingTable.entries.get('C')?.nextHopId).toBe('B');
	});

	it('sets routes to infinity when an intermediate router is disabled', () => {
		const topology = new Topology();
		const algo = new DistanceVectorAlgorithm(false);

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

		topology.nodes.set('A', A);
		topology.nodes.set('B', B);
		topology.nodes.set('C', C);

		for (let i = 0; i < 4; i++) {
			nextStep([A, B, C], algo, topology);
		}

		expect(A.routingTable.entries.get('C')?.cost).toBe(2);

		B.disabled = true;

		for (let i = 0; i < 3; i++) {
			nextStep([A, B, C], algo, topology);
		}

		expect(A.routingTable.entries.get('C')?.cost).toBe(Number.POSITIVE_INFINITY);
		expect(A.routingTable.entries.get('C')?.nextHopId).toBe('-');
		expect(C.routingTable.entries.get('A')?.cost).toBe(Number.POSITIVE_INFINITY);
		expect(C.routingTable.entries.get('A')?.nextHopId).toBe('-');
	});

	it('removes deleted destinations from active routers tables', () => {
		const topology = new Topology();
		const algo = new DistanceVectorAlgorithm(false);

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

		topology.nodes.set('A', A);
		topology.nodes.set('B', B);
		topology.nodes.set('C', C);

		for (let i = 0; i < 4; i++) {
			nextStep([A, B, C], algo, topology);
		}

		expect(A.routingTable.entries.get('C')?.cost).toBe(2);
		expect(B.routingTable.entries.get('C')?.cost).toBe(1);

		B.removeNeighbor(linkBC);
		C.removeNeighbor(linkBC);
		topology.links = topology.links.filter((link) => link.id !== 'BC');
		topology.nodes.delete('C');

		for (let i = 0; i < 3; i++) {
			nextStep([A, B], algo, topology);
		}

		expect(A.routingTable.entries.has('C')).toBe(false);
		expect(B.routingTable.entries.has('C')).toBe(false);
	});

	it('removes disabled destinations from active routers tables', () => {
		const topology = new Topology();
		const algo = new DistanceVectorAlgorithm(false);

		const A = new Router('A', 'A', 0, 0);
		const B = new Router('B', 'B', 50, 0);

		const linkAB = new Link('AB', A, B, 1);

		topology.links.push(linkAB);
		A.addNeighbor(linkAB);
		B.addNeighbor(linkAB);
		topology.nodes.set('A', A);
		topology.nodes.set('B', B);

		for (let i = 0; i < 3; i++) {
			nextStep([A, B], algo, topology);
		}

		expect(A.routingTable.entries.get('B')?.cost).toBe(1);

		B.disabled = true;

		for (let i = 0; i < 2; i++) {
			nextStep([A, B], algo, topology);
		}

		expect(A.routingTable.entries.has('B')).toBe(false);
	});

	it('switches to cheaper direct link after weight decrease', () => {
		const topology = new Topology();
		const algo = new DistanceVectorAlgorithm(false);

		const A = new Router('A', 'A', 0, 0);
		const B = new Router('B', 'B', 50, 0);
		const C = new Router('C', 'C', 100, 0);

		const linkAB = new Link('AB', A, B, 10);
		const linkAC = new Link('AC', A, C, 5);
		const linkCB = new Link('CB', C, B, 5);

		[linkAB, linkAC, linkCB].forEach((link) => {
			topology.links.push(link);
			link.source.addNeighbor(link);
			link.target.addNeighbor(link);
		});

		topology.nodes.set('A', A);
		topology.nodes.set('B', B);
		topology.nodes.set('C', C);

		for (let i = 0; i < 5; i++) {
			nextStep([A, B, C], algo, topology);
		}

		expect(A.routingTable.entries.get('B')?.cost).toBe(10);
		linkAB.weight = 1;

		for (let i = 0; i < 5; i++) {
			nextStep([A, B, C], algo, topology);
		}

		expect(A.routingTable.entries.get('B')?.cost).toBe(1);
		expect(A.routingTable.entries.get('B')?.nextHopId).toBe('B');
	});

	it('withdraws routes promptly with poisoned reverse on link removal', () => {
		const topology = new Topology();
		const algo = new DistanceVectorAlgorithm(true);

		const A = new Router('A', 'A', 0, 0);
		const B = new Router('B', 'B', 50, 0);
		const C = new Router('C', 'C', 100, 0);

		const linkAB = new Link('AB', A, B, 1);
		const linkBC = new Link('BC', B, C, 1);
		const linkAC = new Link('AC', A, C, 4);

		[linkAB, linkBC, linkAC].forEach((link) => {
			topology.links.push(link);
			link.source.addNeighbor(link);
			link.target.addNeighbor(link);
		});

		topology.nodes.set('A', A);
		topology.nodes.set('B', B);
		topology.nodes.set('C', C);

		for (let i = 0; i < 4; i++) {
			nextStep([A, B, C], algo, topology);
		}

		expect(A.routingTable.entries.get('C')?.cost).toBe(2);
		expect(A.routingTable.entries.get('C')?.nextHopId).toBe('B');

		// Remove shortest-path link B-C
		B.neighbors = B.neighbors.filter((l) => l.id !== 'BC');
		C.neighbors = C.neighbors.filter((l) => l.id !== 'BC');
		topology.links = topology.links.filter((l) => l.id !== 'BC');

		for (let i = 0; i < 5; i++) {
			nextStep([A, B, C], algo, topology);
		}

		expect(A.routingTable.entries.get('C')?.cost).toBe(4);
		expect(A.routingTable.entries.get('C')?.nextHopId).toBe('C');
	});

	it('ignores poisoned infinity advertisements when not using poisoned reverse', () => {
		const topology = new Topology();
		const poisoned = new DistanceVectorAlgorithm(true);
		const plain = new DistanceVectorAlgorithm(false);

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

		topology.nodes.set('A', A);
		topology.nodes.set('B', B);
		topology.nodes.set('C', C);

		for (let i = 0; i < 4; i++) {
			nextStep([A, B, C], poisoned, topology);
		}

		expect(A.routingTable.entries.get('C')?.cost).toBe(2);

		for (let i = 0; i < 3; i++) {
			poisoned.executeStep(B, topology);
			plain.receivePackets(A, topology);
			A.packetBuffer = B.packetBuffer;
			B.packetBuffer = [];
		}

		expect(A.routingTable.entries.get('C')?.cost).toBe(2);
		expect(A.routingTable.entries.get('C')?.nextHopId).toBe('B');
	});

	it('skip disabled routers', () => {
		routerA.disabled = true;

		algorithm.executeStep(routerA, topology);
		algorithm.receivePackets(routerA, topology);

		expect(routerA.dvState).toBeNull();
		expect(routerA.routingTable.entries.size).toBe(0);
	});

	it('infers topology on demand and ignores isolated routers', () => {
		algorithm.receivePackets(routerA);

		expect(routerA.routingTable.entries.get(routerB.id)?.cost).toBe(1);

		const isolated = new Router('R99', 'Isolated', 0, 0);
		algorithm.receivePackets(isolated);
		expect(isolated.dvState).toBeNull();
	});

	it('aborts topology inference when neighbor metadata is missing', () => {
		const loneRouter = new Router('R99', 'Lone', 0, 0);
		const brokenLink = {
			id: 'L99',
			source: undefined,
			target: undefined,
			weight: 1,
			otherSide: () => loneRouter
		} as unknown as Link;
		loneRouter.neighbors = [brokenLink];

		algorithm.receivePackets(loneRouter);

		expect(loneRouter.dvState).toBeNull();
	});

	it('captures deep snapshots when requested', () => {
		algorithm.initialize(routerA, topology, true);

		const state = routerA.dvState;
		expect(state).not.toBeNull();
		if (!state) throw new Error('Distance vector state missing');

		expect(state.oldDvs).not.toBe(state.dvs);
		const snapshotCost = state.oldDvs[routerA.id]?.[routerB.id]?.dist;
		state.dvs[routerA.id][routerB.id].dist = 99;

		expect(snapshotCost).toBe(1);
		expect(state.oldDvs[routerA.id]?.[routerB.id]?.dist).toBe(1);
	});

	it('reinitializes and recomputes after topology changes', () => {
		algorithm.initialize(routerA, topology, false);

		const routerX = new Router('RX', 'Router X', 250, 250);
		const linkAX = new Link('L-AX', routerA, routerX, 2);
		topology.nodes.set(routerX.id, routerX);
		topology.links.push(linkAX);
		routerA.addNeighbor(linkAX);
		routerX.addNeighbor(linkAX);

		algorithm.reinitializeForTopology(routerA, topology, true);
		algorithm.recomputeForTopology(routerA, topology, true);

		const entry = routerA.routingTable.entries.get(routerX.id);
		expect(entry?.cost).toBe(2);
		expect(entry?.nextHopId).toBe(routerX.id);

		const state = routerA.dvState;
		expect(state?.dvs[routerA.id][routerX.id].dist).toBe(2);
	});

	it('defaults invalid link weights to one', () => {
		const singleTopology = new Topology();
		const src = new Router('S', 'Src', 0, 0);
		const dst = new Router('D', 'Dst', 10, 10);
		const invalidLink = new Link('SD', src, dst, 0);
		singleTopology.links.push(invalidLink);
		singleTopology.nodes.set(src.id, src);
		singleTopology.nodes.set(dst.id, dst);
		src.addNeighbor(invalidLink);
		dst.addNeighbor(invalidLink);

		const customAlgo = new DistanceVectorAlgorithm(false);
		for (let i = 0; i < 3; i++) {
			nextStep([src, dst], customAlgo, singleTopology);
		}

		expect(src.routingTable.entries.get(dst.id)?.cost).toBe(1);
		expect(dst.routingTable.entries.get(src.id)?.cost).toBe(1);
	});

	it('ignores disabled nodes when building destination sets', () => {
		routerB.disabled = true;

		algorithm.initialize(routerA, topology, false);

		expect(routerA.routingTable.entries.has(routerB.id)).toBe(false);
		expect(routerA.dvState?.dvs[routerA.id]?.[routerB.id]).toBeUndefined();
	});

	it('skips disabled neighbors in neighborsFor method', () => {
		const { topology, routerA, routerB } = createTopology();

		routerB.disabled = true;

		algorithm.initialize(routerA, topology, false);
		algorithm.executeStep(routerA, topology);

		const neighbors = (algorithm as any).neighborsFor(routerA, topology);
		expect(neighbors.find((n: any) => n.id === routerB.id)).toBeUndefined();
	});

	it('skips disabled routers in routerIdsFromTopology', () => {
		const { topology, routerA, routerB } = createTopology();

		routerB.disabled = true;

		const routerIds = (algorithm as any).routerIdsFromTopology(topology);
		expect(routerIds).not.toContain(routerB.id);
		expect(routerIds).toContain(routerA.id);
	});

	it('handles inferTopology with no neighbors', () => {
		const isolatedRouter = new Router('R1', 'R1', 0, 0);

		const result = (algorithm as any).inferTopology(isolatedRouter);
		expect(result).toBeNull();
	});

	it('tests cloneDvTable with empty tables', () => {
		const { topology, routerA } = createTopology();

		algorithm.initialize(routerA, topology, false);
		algorithm.initialize(routerA, topology, true);
		const oldDvs = routerA.dvState?.oldDvs;
		expect(oldDvs).toBeDefined();
		expect(Object.keys(oldDvs ?? {}).length).toBeGreaterThan(0);
	});

	it('handles null/disabled router guards without changing state', () => {
		const beforeA = routerA.routingTable.entries.size;
		const beforeB = routerB.routingTable.entries.size;

		expect(() => algorithm.executeStep(null as any, topology)).not.toThrow();
		expect(() => algorithm.receivePackets(null as any, topology)).not.toThrow();
		expect(() => algorithm.initialize(null as any, topology, true)).not.toThrow();
		expect(() => algorithm.reinitializeForTopology(null as any, topology, true)).not.toThrow();
		expect(() => algorithm.recomputeForTopology(null as any, topology, true)).not.toThrow();

		routerA.disabled = true;
		expect(() => algorithm.executeStep(routerA, topology)).not.toThrow();
		expect(() => algorithm.receivePackets(routerA, topology)).not.toThrow();

		expect(routerA.routingTable.entries.size).toBe(beforeA);
		expect(routerB.routingTable.entries.size).toBe(beforeB);
	});

	it('receives packets with inferred topology and returns when inference fails', () => {
		const isolated = new Router('R1', 'R1', 0, 0);
		expect(() => algorithm.receivePackets(isolated)).not.toThrow();
		expect((isolated as any).dvState).toBeNull();

		const a = new Router('A', 'A', 0, 0);
		const b = new Router('B', 'B', 10, 0);
		const link = new Link('AB', a, b, 3);
		a.addNeighbor(link);
		b.addNeighbor(link);

		algorithm.executeStep(
			a,
			new Topology(
				new Map([
					[a.id, a],
					[b.id, b]
				]),
				[link]
			)
		);
		algorithm.receivePackets(b);

		expect((b as any).dvState).toBeDefined();
		expect(b.routingTable.entries.get('A')?.cost).toBe(3);
	});

	it('creates routing table when missing and handles sendDV early-return', () => {
		const customTopo = new Topology(
			new Map([
				[routerA.id, routerA],
				[routerB.id, routerB]
			]),
			[routerA.neighbors[0]]
		);

		(routerA as any).routingTable = null;
		algorithm.initialize(routerA, customTopo, true);
		expect(routerA.routingTable).toBeDefined();
		expect(routerA.routingTable.entries.get('R1')?.cost).toBe(0);

		const noStateRouter = new Router('R9', 'R9', 0, 0);
		expect(() => (algorithm as any).sendDV(noStateRouter, customTopo)).not.toThrow();
	});

	it('covers internal fallbacks for neighbors/topology inference helpers', () => {
		const testRouter = new Router('R10', 'R10', 0, 0);
		const other = new Router('R11', 'R11', 0, 0);
		const brokenWeight = new Link('Lx', testRouter, other, -4);
		testRouter.addNeighbor(brokenWeight);
		other.addNeighbor(brokenWeight);

		const neighbors = (algorithm as any).neighborsFor(testRouter, new Topology());
		expect(neighbors).toHaveLength(1);
		expect(neighbors[0].weight).toBe(1);

		(testRouter as any).neighbors = undefined;
		expect((algorithm as any).neighborsFor(testRouter, new Topology())).toEqual([]);

		const fakeTopo = { nodes: {} } as any;
		expect((algorithm as any).routerIdsFromTopology(fakeTopo)).toEqual([]);

		expect((algorithm as any).inferTopology(testRouter)).toBeNull();
	});

	it('skips disabled neighbor in patched sendDV loop', () => {
		const src = new Router('S', 'S', 0, 0);
		const dst = new Router('D', 'D', 0, 0);
		dst.disabled = true;
		const topo = new Topology(
			new Map([
				[src.id, src],
				[dst.id, dst]
			]),
			[]
		);

		(src as any).dvState = {
			dvs: { S: { D: { dist: 1, nextHop: 'D' } } },
			oldDvs: {},
			updated: true
		};
		(algorithm as any).neighborsFor = () => [{ id: 'D', weight: 1, node: dst }];

		expect(() => (algorithm as any).sendDV(src, topo)).not.toThrow();
		expect((dst as any).dvState).toBeNull();
	});

	it('covers recompute and routing-table fallback branches', () => {
		const a = new Router('A', 'A', 0, 0);
		const b = new Router('B', 'B', 0, 0);
		const link = new Link('AB', a, b, 2);
		a.addNeighbor(link);
		b.addNeighbor(link);
		const topo = new Topology(
			new Map([
				[a.id, a],
				[b.id, b]
			]),
			[link]
		);

		(a as any).dvState = { dvs: { A: {} }, oldDvs: {}, updated: false };
		expect(() => (algorithm as any).recomputeDV(a, topo, false)).not.toThrow();

		(a as any).routingTable = null;
		(algorithm as any).syncRoutingTable(a, ['A', 'B', 'C'], {
			A: { dist: 0, nextHop: 'A' },
			B: { dist: 5, nextHop: null }
		});

		expect(a.routingTable.entries.get('A')?.nextHopId).toBe('A');
		expect(a.routingTable.entries.get('B')?.nextHopId).toBe('-');
		expect(a.routingTable.entries.get('C')?.cost).toBe(Number.POSITIVE_INFINITY);
		expect(a.routingTable.entries.get('C')?.nextHopId).toBe('-');
	});

	it('clone/recompute fallbacks with false dvState', () => {
		const a = new Router('A', 'A', 0, 0);
		const b = new Router('B', 'B', 0, 0);
		const link = new Link('AB', a, b, 1);
		a.addNeighbor(link);
		b.addNeighbor(link);
		const topo = new Topology(
			new Map([
				[a.id, a],
				[b.id, b]
			]),
			[link]
		);

		(a as any).dvState = { dvs: undefined, oldDvs: {}, updated: false };
		expect(() => algorithm.recomputeForTopology(a, topo, true)).toThrow();

		(a as any).dvState = {
			dvs: {
				A: { X: undefined },
				BROKEN_ROW: undefined
			},
			oldDvs: {},
			updated: false
		};
		expect(() => algorithm.recomputeForTopology(a, topo, true)).not.toThrow();

		(a as any).dvState = { dvs: { B: {} }, oldDvs: {}, updated: false };
		expect(() => algorithm.recomputeForTopology(a, topo, false)).not.toThrow();
	});

	it('uses sendDV payload fallback when sender is missing', () => {
		const src = new Router('SRC', 'SRC', 0, 0);
		const dst = new Router('DST', 'DST', 0, 0);
		const topo = new Topology(
			new Map([
				[src.id, src],
				[dst.id, dst]
			]),
			[]
		);

		(src as any).dvState = { dvs: {}, oldDvs: {}, updated: true };
		(algorithm as any).neighborsFor = () => [{ id: 'DST', weight: 1, node: dst }];

		expect(() => (algorithm as any).sendDV(src, topo)).not.toThrow();
		expect((dst as any).dvState).toBeDefined();
	});

	it('forces recomputeDV to use Infinity fallback for missing neighbor distance', () => {
		const r = new Router('R', 'R', 0, 0);
		(r as any).dvState = { dvs: { R: {}, N: {} }, oldDvs: {}, updated: false };

		const algoAny = algorithm as any;
		const originalNeighborsFor = algoAny.neighborsFor;
		const originalRouterIdsFromTopology = algoAny.routerIdsFromTopology;

		algoAny.neighborsFor = () => [{ id: 'N', weight: 1, node: new Router('N', 'N', 0, 0) }];
		algoAny.routerIdsFromTopology = () => ['R', 'Z'];

		try {
			expect(() => algoAny.recomputeDV(r, new Topology(), false)).not.toThrow();
			expect(r.routingTable.entries.get('Z')?.cost).toBe(Number.POSITIVE_INFINITY);
		} finally {
			algoAny.neighborsFor = originalNeighborsFor;
			algoAny.routerIdsFromTopology = originalRouterIdsFromTopology;
		}
	});
});
