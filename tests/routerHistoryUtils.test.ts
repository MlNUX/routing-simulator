import { describe, expect, it } from 'vitest';

import {
	computeBellmanSteps,
	getAccessibleSteps,
	getBellmanStepHeading,
	getLectureTimeLabel,
	getVisibleHistorySteps,
	inferHistoryStepType,
	sequenceIndexForStep
} from '../src/lib/components/routerHistoryUtils';
/**
 * Testet die Hilfsfunktionen in routerHistoryUtils, die für die Darstellung der Routerzustände benutzt werden.
 */
describe('routerHistoryUtils', () => {
	it('labels the first DV slot as Initial and the first recompute as t1', () => {
		const steps = [0, 1, 2];
		const types = new Map<number, string>([
			[1, 'recompute'],
			[2, 'update']
		]);

		expect(getLectureTimeLabel(0, steps, types, true, false)).toBe('Initial');
		expect(getLectureTimeLabel(1, steps, types, true, false)).toBe('t1');
		expect(getBellmanStepHeading(0, steps, types, true, false)).toBe('Initial');
		expect(getBellmanStepHeading(1, steps, types, true, false)).toBe('Time slot t1');
	});

	it('only reveals history steps up to the current step in bellman view', () => {
		const steps = [0, 1, 2, 3];
		const types = new Map<number, string>([
			[1, 'recompute'],
			[2, 'update'],
			[3, 'recompute']
		]);

		expect(getVisibleHistorySteps(steps, types, 0, true, true, false)).toEqual([0]);
		expect(getVisibleHistorySteps(steps, types, 1, true, true, false)).toEqual([0, 1]);
		expect(getVisibleHistorySteps(steps, types, 2, true, true, false)).toEqual([0, 1, 2]);
	});

	it('only reveals history steps up to the current step in standard view', () => {
		const steps = [0, 1, 2, 3];
		const types = new Map<number, string>([[2, 'update']]);

		expect(getVisibleHistorySteps(steps, types, 1, false, true, false)).toEqual([0, 1]);
		expect(getVisibleHistorySteps(steps, types, 3, false, true, false)).toEqual([0, 1, 2, 3]);
	});

	it('skips update steps when calculating the sequence index', () => {
		const steps = [4, 0, 2, 1, 3];
		const types = new Map<number, string>([
			[2, 'update'],
			[4, 'send']
		]);

		expect(sequenceIndexForStep(4, steps, types)).toBe(3);
	});

	it('prefers explicit step types and infers algorithm-specific defaults', () => {
		const steps = [0, 1, 2, 3];
		const types = new Map<number, string>([
			[2, 'update'],
			[3, 'recompute']
		]);

		expect(inferHistoryStepType(2, steps, types, true, false)).toBe('update');
		expect(inferHistoryStepType(0, steps, types, false, false)).toBe('init');
		expect(inferHistoryStepType(1, steps, types, false, true)).toBe('recompute');
		expect(inferHistoryStepType(1, steps, types, false, false)).toBe('send');
	});

	it('labels update and initial steps correctly', () => {
		const steps = [0, 1];
		const types = new Map<number, string>([[1, 'update']]);

		expect(getLectureTimeLabel(0, steps, types, true, false)).toBe('Initial');
		expect(getLectureTimeLabel(1, steps, types, true, false)).toBe('Update');
		expect(getBellmanStepHeading(1, steps, types, true, false)).toBe('Update');
	});

	it('returns all steps unchanged when filtering is disabled', () => {
		const steps = [0, 1, 2];
		const types = new Map<number, string>([
			[1, 'send'],
			[2, 'recompute']
		]);

		expect(computeBellmanSteps(steps, types, false, true)).toBe(steps);
	});

	it('handles invalid step indices', () => {
		const steps = [0, 1, 2, 3];
		const types = new Map<number, string>([
			[1, 'send'],
			[2, 'recompute'],
			[3, 'update']
		]);

		expect(getAccessibleSteps(steps, -3)).toEqual([0]);
		expect(getAccessibleSteps(steps, 2.9)).toEqual([0, 1, 2]);
		expect(getVisibleHistorySteps(steps, types, 2.9, true, true, false)).toEqual([0, 2]);
	});
});
