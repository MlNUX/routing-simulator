import { writable } from 'svelte/store';

export const simulation = writable({
	running: false,
	step: 0,
	maxStep: 10
});

export const simulationActions = {
	play() {
		simulation.update((s) => ({ ...s, running: true }));
	},
	pause() {
		simulation.update((s) => ({ ...s, running: false }));
	},
	stepForward() {
		simulation.update((s) => ({
			...s,
			step: Math.min(s.step + 1, s.maxStep)
		}));
	},
	stepBack() {
		simulation.update((s) => ({
			...s,
			step: Math.max(s.step - 1, 0)
		}));
	}
};
