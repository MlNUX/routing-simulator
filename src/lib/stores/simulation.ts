// src/lib/stores/simulation.ts
import { writable, get } from 'svelte/store';

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
// NOTE: nodeOrigin is set to [0.5, 0.5] in Editor.svelte (center-origin),
// so these positions are centers, not top-left corners.
// ---------------------------------------------------------------------------

function createSampleTopology(): Topology {
  const nodes = new Map<string, Node>();

  // R1 routing table
  const r1Table = new RoutingTable();
  r1Table.addEntry('R2', 'R2', 1);
  r1Table.addEntry('R3', 'R2', 2);

  // R2 routing table
  const r2Table = new RoutingTable();
  r2Table.addEntry('R1', 'R1', 1);
  r2Table.addEntry('R3', 'R3', 1);

  // R3 routing table
  const r3Table = new RoutingTable();
  r3Table.addEntry('R2', 'R2', 1);
  r3Table.addEntry('R1', 'R2', 2);

  // These coordinates are "centers" (because of nodeOrigin [0.5, 0.5])
  const r1 = new Router('R1', 'R1', 170, 230, r1Table);
  const r2 = new Router('R2', 'R2', 370, 230, r2Table);
  const r3 = new Router('R3', 'R3', 570, 230, r3Table);

  nodes.set(r1.id, r1);
  nodes.set(r2.id, r2);
  nodes.set(r3.id, r3);

  const l1 = new Link('L1', r1, r2, 1);
  const l2 = new Link('L2', r2, r3, 1);

  // IMPORTANT: initialize neighbors so routing strategies can see links
  r1.neighbors.push(l1);
  r2.neighbors.push(l1);

  r2.neighbors.push(l2);
  r3.neighbors.push(l2);

  const links: Link[] = [l1, l2];

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

// ---------------------------------------------------------------------------
// Placement / tool mode
// ---------------------------------------------------------------------------

export type PlacementMode = 'none' | 'router' | 'link';
export const placementMode = writable<PlacementMode>('none');

// Link creation tool state
export const linkSourceRouterId = writable<string | null>(null);
export const linkTargetRouterId = writable<string | null>(null);
export const linkWeight = writable<number>(1);

export function setLinkWeight(value: number): void {
  const v = Number.isFinite(value) ? value : 1;
  linkWeight.set(v <= 0 ? 1 : v);
}

export function clearLinkSelection(): void {
  linkSourceRouterId.set(null);
  linkTargetRouterId.set(null);
}

export function toggleRouterPlacement(): void {
  placementMode.update((m) => {
    const next = m === 'router' ? 'none' : 'router';
    if (next !== 'link') {
      clearLinkSelection();
    }
    return next;
  });
}

export function toggleLinkPlacement(): void {
  placementMode.update((m) => {
    const next = m === 'link' ? 'none' : 'link';
    if (next === 'link') {
      clearLinkSelection();
    }
    return next;
  });
}

export function clearPlacementMode(): void {
  placementMode.set('none');
  clearLinkSelection();
}

// ---------------------------------------------------------------------------
// Selection behavior (normal selection + link-tool selection)
// ---------------------------------------------------------------------------

export function setSelectedRouter(id: string | null): void {
  selectedRouterId.set(id);

  if (!id) {
    return;
  }

  if (get(placementMode) !== 'link') {
    return;
  }

  // Link tool: only allow routers
  const controller = get(simulation);
  const node = controller.topology.nodes.get(id);
  if (!(node instanceof Router)) {
    return;
  }

  const sourceId = get(linkSourceRouterId);
  if (!sourceId) {
    linkSourceRouterId.set(id);
    linkTargetRouterId.set(null);
    return;
  }

  // clicking the same router again toggles off the source selection
  if (sourceId === id) {
    clearLinkSelection();
    return;
  }

  // second router selected => create link
  linkTargetRouterId.set(id);

  const weight = get(linkWeight);
  try {
    addLink(sourceId, id, Number.isFinite(weight) && weight > 0 ? weight : 1);
  } finally {
    // stay in link mode for rapid linking; clear selection for next link
    clearLinkSelection();
  }
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

export function stepForward(): void {
  nextStep();
}

export function stepBackward(): void {
  simulation.update((controller) => {
    const anyCtrl = controller as any;
    const current: number = anyCtrl.currentStepIndex ?? 0;
    const prev = Math.max(0, current - 1);
    controller.jumpToStep(prev);
    return controller;
  });
}

export function stop(): void {
  simulation.update((controller) => {
    controller.jumpToStep(0);
    return controller;
  });
}

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

