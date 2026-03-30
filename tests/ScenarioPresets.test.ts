import { readdirSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { SimulationController } from '../src/lib/model/SimulationController';
import { Topology } from '../src/lib/model/Topology';

const scenariosDir = new URL('../src/lib/scenarios/', import.meta.url);
const scenarioFiles = readdirSync(scenariosDir)
	.filter((file) => file.endsWith('.json'))
	.sort((a, b) => a.localeCompare(b));
/**
 * Testet die Szenarien-Importfunktionalität der SimulationController Klasse.
 */
describe('Scenario presets', () => {
	it.each(scenarioFiles)('imports and re-exports %s without schema drift', (file) => {
		const json = readFileSync(new URL(file, scenariosDir), 'utf8');
		const controller = new SimulationController(new Topology());

		controller.importJson(json);

		expect(JSON.parse(controller.exportJson())).toEqual(JSON.parse(json));
	});

	it.each([
		'distance-vector-weight-change.json',
		'distance-vector-poisoned-reverse-weight-change.json'
	])(
		'%s starts clean, precomputes once, then applies the cost update',
		(file) => {
			const json = readFileSync(new URL(file, scenariosDir), 'utf8');
			const controller = new SimulationController(new Topology());

			controller.importJson(json);

			expect(controller.history).toHaveLength(3);
			expect((controller.history[1] as any).stepType).toBe('recompute');
			expect((controller.history[2] as any).stepType).toBe('update');
			expect(
				controller.history[1].topologyState.links.find((link) => link.id === 'L2')?.weight
			).toBe(8);
			expect(
				controller.history[2].topologyState.links.find((link) => link.id === 'L2')?.weight
			).toBe(80);
			expect(controller.history[2].executedEvents).toHaveLength(1);
			expect(controller.history[2].executedEvents[0].type).toBe('WEIGHT_CHANGE');
		}
	);
});
