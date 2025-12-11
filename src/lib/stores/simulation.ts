// src/lib/stores/simulation.ts
import { writable } from 'svelte/store';

import { SimulationController } from './SimulationController';
import type { AlgorithmType } from './RoutingStrategieType';
import type { SimulationEvent } from './SimulationEvent';
import type { SimulationState } from './SimulationState';
import { Topology } from './Topology';

// main simulation store: one SimulationController singleton
export const simulation = writable(new SimulationController(new Topology()));

// ---------------------------------------------------------------------------
// Router selection state (used by Editor.svelte & RouterTablePanel.svelte)
// ---------------------------------------------------------------------------

export const selectedRouterId = writable<string | null>(null);

export function setSelectedRouter(id: string | null): void {
  selectedRouterId.set(id);
}

// ---------------------------------------------------------------------------
// Control of the simulation (playback etc.)
// ---------------------------------------------------------------------------

export function play(): void {
  simulation.update((controller) => {
    controller.play();
    return controller;
  });
}

export function pause(): void {
  simulation.update((controller) => {
    controller.pause();
    return controller;
  });
}

// setAlgorithm uses your AlgorithmType from RoutingStrategieType.ts
export function setAlgorithm(algo: AlgorithmType): void {
  simulation.update((controller) => {
    controller.setAlgorithm(algo);
    return controller;
  });
}

// Jump to specific step (Timeline)
export function jumpToStep(step: number): SimulationState {
  let state!: SimulationState;
  simulation.update((controller) => {
    state = controller.jumpToStep(step);
    return controller;
  });
  return state;
}

// Underlying "next step" from the backend
export function nextStep(): void {
  simulation.update((controller) => {
    controller.nextStep();
    return controller;
  });
}

// -----------------------------------------------
// Wrappers expected by PlaybackControls.svelte
// -----------------------------------------------

// step forward → just call nextStep()
export function stepForward(): void {
  nextStep();
}

// very simple "step back": read currentStepIndex (via any) and jumpToStep(current - 1)
export function stepBackward(): void {
  simulation.update((controller) => {
    const anyCtrl = controller as any;
    const current: number = anyCtrl.currentStepIndex ?? 0;
    const prev = Math.max(0, current - 1);
    controller.jumpToStep(prev);
    return controller;
  });
}

// stop → go to step 0
export function stop(): void {
  simulation.update((controller) => {
    controller.jumpToStep(0);
    return controller;
  });
}

// reset → recreate controller with same topology (very simple reset)
export function reset(): void {
  simulation.update((controller) => {
    const topo = controller.getTopology();
    return new SimulationController(topo);
  });
}

// ---------------------------------------------------------------------------
// Topology operations (Editor / future palette)
// ---------------------------------------------------------------------------

export function addNode(xPos: number, yPos: number): void {
  simulation.update((controller) => {
    controller.addNode(xPos, yPos);
    return controller;
  });
}

export function addLink(sourceId: string, targetId: string, weight: number): void {
  simulation.update((controller) => {
    controller.addLink(sourceId, targetId, weight);
    return controller;
  });
}

export function deleteNode(nodeId: string): void {
  simulation.update((controller) => {
    controller.deleteNode(nodeId);
    return controller;
  });
}

export function deleteLink(sourceId: string, targetId: string): void {
  simulation.update((controller) => {
    controller.deleteLink(sourceId, targetId);
    return controller;
  });
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export function addEvent(event: SimulationEvent): void {
  simulation.update((controller) => {
    controller.addEvent(event);
    return controller;
  });
}

// ---------------------------------------------------------------------------
// Queries / helpers
// ---------------------------------------------------------------------------

export function getTopology() {
  let topology;
  simulation.update((controller) => {
    topology = controller.getTopology();
    return controller;
  });
  return topology;
}

export function getPath(sourceId: string, targetId: string): string[] {
  let path!: string[];
  simulation.update((controller) => {
    path = controller.getPath(sourceId, targetId);
    return controller;
  });
  return path;
}

// ---------------------------------------------------------------------------
// Import / Export
// ---------------------------------------------------------------------------

export function importJson(json: string): void {
  simulation.update((controller) => {
    controller.importJson(json);
    return controller;
  });
}

export function exportJson(): string {
  let result!: string;
  simulation.update((controller) => {
    result = controller.exportJson();
    return controller;
  });
  return result;
}

