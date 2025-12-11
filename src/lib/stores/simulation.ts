// src/lib/simulationStore.ts
import { writable } from 'svelte/store';

// Imports an dein Backend anpassen:
import { SimulationController } from './SimulationController';
import type { AlgorithmType } from './RoutingStrategieType';
import type { SimulationEvent } from './SimulationEvent';
import type { SimulationState } from './SimulationState';
import { Topology } from './Topology';

// Falls dein SimulationController ohne Parameter gebaut wird,
// ändere die nächste Zeile zu: new SimulationController()
export const simulation = writable(new SimulationController(new Topology()));

/**
 * Jede Wrapper-Funktion nutzt das von dir gewünschte Pattern:
 *
 * simulation.update((controller) => {
 *   controller.someMethod();
 *   return controller;
 * });
 *
 * und gibt ggf. Rückgabewerte sauber nach außen weiter.
 */

// --- Steuerung der Simulation ------------------------------------------------

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

export function setAlgorithm(algo: AlgorithmType): void {
  simulation.update((controller) => {
    controller.setAlgorithm(algo);
    return controller;
  });
}

export function jumpToStep(step: number): SimulationState {
  let state!: SimulationState;
  simulation.update((controller) => {
    state = controller.jumpToStep(step);
    return controller;
  });
  return state;
}

export function nextStep(): void {
  simulation.update((controller) => {
    controller.nextStep();
    return controller;
  });
}

// --- Topologie-Operationen ---------------------------------------------------

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

// --- Events ------------------------------------------------------------------

export function addEvent(event: SimulationEvent): void {
  simulation.update((controller) => {
    controller.addEvent(event);
    return controller;
  });
}

// --- Abfragen / Hilfsfunktionen ---------------------------------------------

export function getTopology() {
  // laut UML gibt es getTopology(): Topology
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

// --- Import / Export ---------------------------------------------------------

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
