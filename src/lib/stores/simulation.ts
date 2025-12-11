// src/lib/stores/simulation.ts
import { writable } from 'svelte/store';

import { SimulationController } from './SimulationController';
import type { AlgorithmType } from './RoutingStrategieType';
import type { SimulationEvent } from './SimulationEvent';
import type { SimulationState } from './SimulationState';
import { Topology } from './Topology';
import type { Node } from './Node';
import { Router } from './Router';
import { Link } from './Link';
import { RoutingTable } from './RoutingTable';

// ---------------------------------------------------------------------------
// Sample topology for testing (3 routers in a line: R1 - R2 - R3)
// with example routing tables
// ---------------------------------------------------------------------------

function createSampleTopology(): Topology {
  const nodes = new Map<string, Node>();

  // R1 routing table
  const r1Table = new RoutingTable();
  // R1 → R2 direct
  r1Table.addEntry('R2', 'R2', 1);
  // R1 → R3 via R2
  r1Table.addEntry('R3', 'R2', 2);

  // R2 routing table
  const r2Table = new RoutingTable();
  // R2 → R1 direct
  r2Table.addEntry('R1', 'R1', 1);
  // R2 → R3 direct
  r2Table.addEntry('R3', 'R3', 1);

  // R3 routing table
  const r3Table = new RoutingTable();
  // R3 → R2 direct
  r3Table.addEntry('R2', 'R2', 1);
  // R3 → R1 via R2
  r3Table.addEntry('R1', 'R2', 2);

  const r1 = new Router('R1', 'R1', 100, 200, r1Table);
  const r2 = new Router('R2', 'R2', 300, 200, r2Table);
  const r3 = new Router('R3', 'R3', 500, 200, r3Table);

  nodes.set(r1.id, r1);
  nodes.set(r2.id, r2);
  nodes.set(r3.id, r3);

  const links: Link[] = [
    new Link('L1', r1, r2, 1),
    new Link('L2', r2, r3, 1)
  ];

  return new Topology(nodes, links);
}

// ---------------------------------------------------------------------------
// Main simulation store: single SimulationController instance
// ---------------------------------------------------------------------------

export const simulation = writable(new SimulationController(createSampleTopology()));

// ---------------------------------------------------------------------------
// Router selection state (used by Editor.svelte & RouterTablePanel.svelte)
// ---------------------------------------------------------------------------

export const selectedRouterId = writable<string | null>(null);

export function setSelectedRouter(id: string | null): void {
  selectedRouterId.set(id);
}

// ---------------------------------------------------------------------------
// Placement mode: "drawing" routers in the canvas
// ---------------------------------------------------------------------------

export const placementMode = writable<'none' | 'router'>('none');

export function toggleRouterPlacement(): void {
  placementMode.update((m) => (m === 'router' ? 'none' : 'router'));
}

export function clearPlacementMode(): void {
  placementMode.set('none');
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

// ---------------------------------------------------------------------------
// Wrappers expected by PlaybackControls.svelte
// ---------------------------------------------------------------------------

// step forward → just call nextStep()
export function stepForward(): void {
  nextStep();
}

// "step back": read currentStepIndex (via any) and jumpToStep(current - 1)
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

// reset → recreate controller with same topology (simple reset)
export function reset(): void {
  simulation.update((controller) => {
    const topo = controller.getTopology();
    return new SimulationController(topo);
  });
}

// ---------------------------------------------------------------------------
// Topology operations (Editor / palette)
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

export function getTopology(): Topology {
  let topology!: Topology;
  simulation.update((controller) => {
    topology = controller.getTopology();
    return controller;
  });
  return topology;
}

export function getPath(sourceId: string, targetId: string): string[] {
  let path: string[] = [];
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
  let result = '';
  simulation.update((controller) => {
    result = controller.exportJson();
    return controller;
  });
  return result;
}

