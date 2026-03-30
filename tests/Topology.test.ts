import { describe, it, expect } from 'vitest';
import { Topology } from '../src/lib/model/Topology';
import { Router } from '../src/lib/model/Router';
import { Link } from '../src/lib/model/Link';
import { RoutingPacket } from '../src/lib/model/RoutingPacket';

describe('Topology', () => {
	it('clone preserves links, neighbors, and packet buffers with remapped routers', () => {
		const topology = new Topology();
		const r1 = new Router('R1', 'Router 1', 0, 0);
		const r2 = new Router('R2', 'Router 2', 100, 0);
		const link = new Link('L1', r1, r2, 3);

		r1.addNeighbor(link);
		r2.addNeighbor(link);
		topology.nodes.set(r1.id, r1);
		topology.nodes.set(r2.id, r2);
		topology.links.push(link);

		const packet = new RoutingPacket(r1, r2, 'L1');
		r1.packetBuffer.push(packet);

		const cloned = topology.clone();

		expect(cloned).not.toBe(topology);
		expect(cloned.nodes.size).toBe(2);
		expect(cloned.links.length).toBe(1);

		const r1c = cloned.nodes.get('R1') as Router;
		const r2c = cloned.nodes.get('R2') as Router;
		expect(r1c).toBeTruthy();
		expect(r2c).toBeTruthy();
		expect(r1c).not.toBe(r1);
		expect(r2c).not.toBe(r2);

		expect(r1c.neighbors.length).toBe(1);
		expect(r2c.neighbors.length).toBe(1);
		const clonedLink = r1c.neighbors[0];
		expect(clonedLink).not.toBe(link);
		expect(clonedLink.source === r1c || clonedLink.target === r1c).toBe(true);
		expect(clonedLink.source === r2c || clonedLink.target === r2c).toBe(true);

		expect(r1c.packetBuffer.length).toBe(1);
		const pkt = r1c.packetBuffer[0] as RoutingPacket;
		expect(pkt.source).toBe(r1c);
		expect(pkt.target).toBe(r2c);
	});

	it('Link.otherSide throws for non-endpoint id', () => {
		const r1 = new Router('R1', 'R1', 0, 0);
		const r2 = new Router('R2', 'R2', 0, 0);
		const link = new Link('L1', r1, r2, 1);
		expect(() => link.otherSide('R3')).toThrow();
	});

	it('Router.ensureRoutingTableForTopology fills missing entries', () => {
		const topo = new Topology();
		const r1 = new Router('R1', 'R1', 0, 0);
		const r2 = new Router('R2', 'R2', 0, 0);
		topo.nodes.set(r1.id, r1);
		topo.nodes.set(r2.id, r2);

		r1.ensureRoutingTableForTopology(topo);
		expect(r1.routingTable.entries.get('R1')?.cost).toBe(0);
		expect(r1.routingTable.entries.get('R1')?.nextHopId).toBe('R1');
		expect(r1.routingTable.entries.get('R2')?.cost).toBe(Infinity);
		expect(r1.routingTable.entries.get('R2')?.nextHopId).toBe('-');
	});

	it('Router.receivePacket enqueues packet', () => {
		const r1 = new Router('R1', 'R1', 0, 0);
		const pkt = new RoutingPacket(r1, r1, 'self');
		r1.receivePacket(pkt);
		expect(r1.packetBuffer.length).toBe(1);
		expect(r1.packetBuffer[0]).toBe(pkt);
	});

	it('clone preserves packets that cannot be remapped', () => {
		const topo = new Topology();
		const r1 = new Router('R1', 'R1', 0, 0);
		topo.nodes.set(r1.id, r1);

		const raw: any = { msg: 'orphan', source: null, target: null };
		r1.packetBuffer.push(raw);

		const cloned = topo.clone();
		const r1c = cloned.nodes.get('R1') as Router;
		expect(r1c.packetBuffer.length).toBe(1);
		expect(r1c.packetBuffer[0]).toBe(raw);
	});

	it('clone skips links with missing endpoints', () => {
		const topo = new Topology();
		const r1 = new Router('R1', 'R1', 0, 0);
		const r2 = new Router('R2', 'R2', 0, 0);
		const link = new Link('L1', r1, r2, 1);
		topo.nodes.set(r1.id, r1);
		topo.links.push(link);

		const cloned = topo.clone();
		expect(cloned.links.length).toBe(0);
	});

	it('clone respects custom routingTable clone implementations', () => {
		const topo = new Topology();
		const r1 = new Router('R1', 'R1', 0, 0);
		(r1 as any).routingTable = {
			entries: new Map(),
			clone: () => ({ cloned: true })
		};
		topo.nodes.set(r1.id, r1);

		const cloned = topo.clone();
		const r1c = cloned.nodes.get('R1') as any;
		expect(r1c.routingTable.cloned).toBe(true);
	});
});
