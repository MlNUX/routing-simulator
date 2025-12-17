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
// UI Zoom (scales UI chrome, not the canvas)
// ---------------------------------------------------------------------------

export const uiScale = writable<number>(1);

const UI_SCALE_MIN = 0.6;
const UI_SCALE_MAX = 1.6;
const UI_SCALE_STEP = 0.1;

function clampUiScale(v: number): number {
  const clamped = Math.max(UI_SCALE_MIN, Math.min(UI_SCALE_MAX, v));
  return Number(clamped.toFixed(2));
}

export function zoomInUI(): void {
  uiScale.update((s) => clampUiScale(s + UI_SCALE_STEP));
}

export function zoomOutUI(): void {
  uiScale.update((s) => clampUiScale(s - UI_SCALE_STEP));
}

export function resetUIZoom(): void {
  uiScale.set(1);
}

// ---------------------------------------------------------------------------
// Sample topology for testing (3 routers in a line: R1 - R2 - R3)
// ---------------------------------------------------------------------------

function createSampleTopology(): Topology {
  const nodes = new Map<string, Node>();

  const r1Table = new RoutingTable();
  r1Table.addEntry('R2', 'R2', 1);
  r1Table.addEntry('R3', 'R2', 2);

  const r2Table = new RoutingTable();
  r2Table.addEntry('R1', 'R1', 1);
  r2Table.addEntry('R3', 'R3', 1);

  const r3Table = new RoutingTable();
  r3Table.addEntry('R2', 'R2', 1);
  r3Table.addEntry('R1', 'R2', 2);

  const r1 = new Router('R1', 'R1', 170, 230, r1Table);
  const r2 = new Router('R2', 'R2', 370, 230, r2Table);
  const r3 = new Router('R3', 'R3', 570, 230, r3Table);

  nodes.set(r1.id, r1);
  nodes.set(r2.id, r2);
  nodes.set(r3.id, r3);

  const l1 = new Link('L1', r1, r2, 1);
  const l2 = new Link('L2', r2, r3, 1);

  r1.neighbors.push(l1);
  r2.neighbors.push(l1);

  r2.neighbors.push(l2);
  r3.neighbors.push(l2);

  const links: Link[] = [l1, l2];

  return new Topology(nodes, links);
}

// ---------------------------------------------------------------------------
// Main simulation store
// ---------------------------------------------------------------------------

export const simulation = writable(new SimulationController(createSampleTopology()));

// ---------------------------------------------------------------------------
// Router selection
// ---------------------------------------------------------------------------

export const selectedRouterId = writable<string | null>(null);

// ---------------------------------------------------------------------------
// Tool mode
// ---------------------------------------------------------------------------

export type PlacementMode = 'none' | 'router' | 'link' | 'delete';
export const placementMode = writable<PlacementMode>('none');

// Link tool state
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
    clearLinkSelection();
    return next;
  });
}

export function toggleLinkPlacement(): void {
  placementMode.update((m) => {
    const next = m === 'link' ? 'none' : 'link';
    clearLinkSelection();
    return next;
  });
}

export function toggleDeletePlacement(): void {
  placementMode.update((m) => {
    const next = m === 'delete' ? 'none' : 'delete';
    clearLinkSelection();
    return next;
  });
}

export function clearPlacementMode(): void {
  placementMode.set('none');
  clearLinkSelection();
}

// ---------------------------------------------------------------------------
// Selection behavior (normal + link/delete tools)
// ---------------------------------------------------------------------------

export function setSelectedRouter(id: string | null): void {
  selectedRouterId.set(id);

  if (!id) {
    return;
  }

  const mode = get(placementMode);

  if (mode === 'delete') {
    deleteNode(id);
    selectedRouterId.set(null);
    return;
  }

  if (mode !== 'link') {
    return;
  }

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

  if (sourceId === id) {
    clearLinkSelection();
    return;
  }

  linkTargetRouterId.set(id);

  const weight = get(linkWeight);
  try {
    addLink(sourceId, id, Number.isFinite(weight) && weight > 0 ? weight : 1);
  } finally {
    clearLinkSelection();
  }
}

// ---------------------------------------------------------------------------
// Simulation controls
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
// Topology operations
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

export function deleteLinkById(linkId: string): void {
  simulation.update((controller) => {
    controller.deleteLinkById(linkId);
    return controller;
  });
}

// ---------------------------------------------------------------------------
// Clear network
// ---------------------------------------------------------------------------

export function clearNetwork(): void {
  selectedRouterId.set(null);
  placementMode.set('none');
  clearLinkSelection();

  simulation.update((controller) => {
    controller.clearNetwork();
    return controller;
  });
}

// ---------------------------------------------------------------------------
// Movement (used by Editor.svelte)
// ---------------------------------------------------------------------------

export function updateNodePosition(nodeId: string, xPos: number, yPos: number): void {
  simulation.update((controller) => {
    controller.moveNode(nodeId, xPos, yPos);
    return controller;
  });
}

export function updateNodePositions(
  updates: { id: string; xPos: number; yPos: number }[]
): void {
  simulation.update((controller) => {
    controller.moveNodes(updates);
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
  selectedRouterId.set(null);
  placementMode.set('none');
  clearLinkSelection();

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

