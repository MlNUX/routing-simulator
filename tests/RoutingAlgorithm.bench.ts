import { bench, describe } from 'vitest';
import { SimulationController } from '../src/lib/model/SimulationController';
import { Topology } from '../src/lib/model/Topology';
import { RoutingAlgorithmType } from '../src/lib/model/RoutingAlgorithmType';

function createLinearTopology(nodeCount: number): SimulationController {
	const controller = new SimulationController(new Topology(new Map(), []));

	for (let i = 0; i < nodeCount; i++) {
		controller.addNode(i * 50, 0);
	}

	const nodes = Array.from(controller.topology.nodes.keys());
	for (let i = 0; i < nodes.length - 1; i++) {
		controller.addLink(nodes[i], nodes[i + 1], 1);
	}

	return controller;
}

function createStarTopology(nodeCount: number): SimulationController {
	const controller = new SimulationController(new Topology(new Map(), []));

	controller.addNode(0, 0);

	for (let i = 1; i < nodeCount; i++) {
		const angle = (2 * Math.PI * i) / (nodeCount - 1);
		const x = 100 * Math.cos(angle);
		const y = 100 * Math.sin(angle);
		controller.addNode(x, y);
	}

	const nodes = Array.from(controller.topology.nodes.keys());
	const centralNode = nodes[0];
	for (let i = 1; i < nodes.length; i++) {
		controller.addLink(centralNode, nodes[i], 1);
	}

	return controller;
}

function runAlgorithm(controller: SimulationController, steps: number) {
	for (let step = 0; step < steps; step++) {
		controller.nextStep();
	}
}

describe('Distance Vector Algorithm', () => {
	describe('Linear Topology Scaling', () => {
		[5, 10, 50, 100, 500, 1000].forEach((nodeCount) => {
			bench(`DV Linear ${nodeCount} nodes`, () => {
				const controller = createLinearTopology(nodeCount);
				controller.setAlgorithm(RoutingAlgorithmType.DISTANCE_VECTOR);
				runAlgorithm(controller, 50);
			});
		});
	});

	describe('Star Topology Scaling', () => {
		[5, 10, 50, 100, 500, 1000].forEach((nodeCount) => {
			bench(`DV Star ${nodeCount} nodes`, () => {
				const controller = createStarTopology(nodeCount);
				controller.setAlgorithm(RoutingAlgorithmType.DISTANCE_VECTOR);
				runAlgorithm(controller, 50);
			});
		});
	});
});

describe('Link State Algorithm', () => {
	describe('Linear Topology Scaling', () => {
		[5, 10, 50, 100, 500, 1000].forEach((nodeCount) => {
			bench(`LS Linear ${nodeCount} nodes`, () => {
				const controller = createLinearTopology(nodeCount);
				controller.setAlgorithm(RoutingAlgorithmType.LINK_STATE);
				runAlgorithm(controller, 50);
			});
		});
	});

	describe('Star Topology Scaling', () => {
		[5, 10, 50, 100, 500, 1000].forEach((nodeCount) => {
			bench(`LS Star ${nodeCount} nodes`, () => {
				const controller = createStarTopology(nodeCount);
				controller.setAlgorithm(RoutingAlgorithmType.LINK_STATE);
				runAlgorithm(controller, 50);
			});
		});
	});
});
