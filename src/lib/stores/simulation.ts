// src/lib/stores/simulation.ts
import { writable, get } from 'svelte/store';

import { SimulationController } from './SimulationController';
import type { AlgorithmType } from './RoutingStrategieType';
import { RoutingStrategieType } from './RoutingStrategieType';
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
// Warnings (shown in toolbar)
// ---------------------------------------------------------------------------

export const warningMessage = writable<string | null>(null);

function clearWarning(): void {
  warningMessage.set(null);
}

function validateTopologyForRun(controller: SimulationController): string | null {
  const nodeCount = controller.topology.nodes.size;
  const linkCount = controller.topology.links.length;

  if (nodeCount < 2) {
    return 'Need at least 2 routers before running the simulation.';
  }
  if (linkCount < 1) {
    return 'Need at least 1 link before running the simulation.';
  }

  for (const l of controller.topology.links) {
    if (!l || typeof l.id !== 'string' || l.id.length === 0) {
      return 'Invalid link detected (missing id).';
    }
    if (!Number.isFinite(l.weight) || l.weight <= 0) {
      return `Invalid weight on link ${l.id} (must be > 0).`;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Undo / Redo
// ---------------------------------------------------------------------------

export const canUndo = writable<boolean>(false);
export const canRedo = writable<boolean>(false);

let undoStack: string[] = [];
let redoStack: string[] = [];
let isRestoring = false;

function syncUndoFlags(): void {
  canUndo.set(undoStack.length > 0);
  canRedo.set(redoStack.length > 0);
}

function snapshotForUndo(controller: SimulationController): void {
  undoStack.push(controller.exportJson());
  redoStack = [];
  syncUndoFlags();
}

function clearUndoHistory(): void {
  undoStack = [];
  redoStack = [];
  syncUndoFlags();
}

function restoreFromJson(json: string): void {
  isRestoring = true;

  selectedRouterId.set(null);
  selectedEdgeId.set(null);
  selectedNodeIdsMulti.set([]);
  selectedEdgeIdsMulti.set([]);
  placementMode.set('none');
  clearLinkSelection();

  simulation.update((controller) => {
    controller.importJson(json);
    controller.setAlgorithm(get(currentAlgorithm));
    return controller;
  });

  isRestoring = false;
}

function performEdit(mutator: (controller: SimulationController) => void): void {
  const controller = get(simulation);

  if (controller.running) {
    warningMessage.set('Pause simulation before editing the topology.');
    return;
  }

  clearWarning();

  simulation.update((c) => {
    if (!isRestoring) {
      snapshotForUndo(c);
    }
    mutator(c);
    return c;
  });
}

export function undo(): void {
  const controller = get(simulation);

  if (controller.running) {
    warningMessage.set('Pause simulation before using undo/redo.');
    return;
  }

  if (undoStack.length === 0) {
    return;
  }

  const current = controller.exportJson();
  const prev = undoStack.pop() as string;

  redoStack.push(current);
  syncUndoFlags();

  restoreFromJson(prev);
}

export function redo(): void {
  const controller = get(simulation);

  if (controller.running) {
    warningMessage.set('Pause simulation before using undo/redo.');
    return;
  }

  if (redoStack.length === 0) {
    return;
  }

  const current = controller.exportJson();
  const next = redoStack.pop() as string;

  undoStack.push(current);
  syncUndoFlags();

  restoreFromJson(next);
}

// ---------------------------------------------------------------------------
// Current algorithm (so undo/redo/import keeps the chosen algo applied)
// ---------------------------------------------------------------------------

export const currentAlgorithm = writable<AlgorithmType>(RoutingStrategieType.LINK_STATE);

// ---------------------------------------------------------------------------
// Sample topology
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
// Selection (router + edge)
// ---------------------------------------------------------------------------

export const selectedRouterId = writable<string | null>(null);
export const selectedEdgeId = writable<string | null>(null);

// Multi-select only used in delete mode
export const selectedNodeIdsMulti = writable<string[]>([]);
export const selectedEdgeIdsMulti = writable<string[]>([]);

export function setSelectedEdge(id: string | null): void {
  selectedEdgeId.set(id);

  if (id) {
    selectedRouterId.set(null);
  }
}

export function setMultiSelection(nodeIds: string[], edgeIds: string[]): void {
  selectedNodeIdsMulti.set(nodeIds);
  selectedEdgeIdsMulti.set(edgeIds);
}

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
  const controller = get(simulation);
  if (controller.running) {
    warningMessage.set('Pause simulation before editing the topology.');
    return;
  }

  placementMode.update((m) => {
    const next = m === 'router' ? 'none' : 'router';
    clearLinkSelection();
    selectedNodeIdsMulti.set([]);
    selectedEdgeIdsMulti.set([]);
    return next;
  });
}

export function toggleLinkPlacement(): void {
  const controller = get(simulation);
  if (controller.running) {
    warningMessage.set('Pause simulation before editing the topology.');
    return;
  }

  placementMode.update((m) => {
    const next = m === 'link' ? 'none' : 'link';
    clearLinkSelection();
    selectedNodeIdsMulti.set([]);
    selectedEdgeIdsMulti.set([]);
    return next;
  });
}

export function toggleDeletePlacement(): void {
  const controller = get(simulation);
  if (controller.running) {
    warningMessage.set('Pause simulation before editing the topology.');
    return;
  }

  placementMode.update((m) => {
    const next = m === 'delete' ? 'none' : 'delete';
    clearLinkSelection();
    if (next !== 'delete') {
      selectedNodeIdsMulti.set([]);
      selectedEdgeIdsMulti.set([]);
    }
    return next;
  });
}

export function clearPlacementMode(): void {
  placementMode.set('none');
  clearLinkSelection();
  selectedNodeIdsMulti.set([]);
  selectedEdgeIdsMulti.set([]);
}

// ---------------------------------------------------------------------------
// Selection behavior (normal + link/delete tools)
// ---------------------------------------------------------------------------

export function setSelectedRouter(id: string | null): void {
  selectedRouterId.set(id);

  if (id) {
    selectedEdgeId.set(null);
  }

  if (!id) {
    return;
  }

  const controller = get(simulation);
  const mode = get(placementMode);

  if (controller.running) {
    warningMessage.set('Pause simulation before editing the topology.');
    return;
  }

  if (mode === 'delete') {
    deleteNode(id);
    selectedRouterId.set(null);
    return;
  }

  if (mode !== 'link') {
    return;
  }

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
  const controller = get(simulation);
  const msg = validateTopologyForRun(controller);
  if (msg) {
    warningMessage.set(msg);
    return;
  }

  clearWarning();

  simulation.update((c) => {
    c.play();
    return c;
  });
}

export function pause(): void {
  clearWarning();
  simulation.update((controller) => {
    controller.pause();
    return controller;
  });
}

export function setAlgorithm(algo: AlgorithmType): void {
  clearWarning();
  currentAlgorithm.set(algo);

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
  const controller = get(simulation);
  const msg = validateTopologyForRun(controller);
  if (msg) {
    warningMessage.set(msg);
    return;
  }

  clearWarning();

  simulation.update((c) => {
    c.nextStep();
    return c;
  });
}

export function stepForward(): void {
  nextStep();
}

export function stepBackward(): void {
  clearWarning();
  simulation.update((controller) => {
    const anyCtrl = controller as any;
    const current: number = anyCtrl.currentStepIndex ?? 0;
    const prev = Math.max(0, current - 1);
    controller.jumpToStep(prev);
    return controller;
  });
}

export function stop(): void {
  clearWarning();
  simulation.update((controller) => {
    controller.jumpToStep(0);
    return controller;
  });
}

export function reset(): void {
  clearWarning();
  clearUndoHistory();

  simulation.update((controller) => {
    const topo = controller.getTopology();
    const next = new SimulationController(topo);
    next.setAlgorithm(get(currentAlgorithm));
    return next;
  });
}

// ---------------------------------------------------------------------------
// Topology operations (undoable)
// ---------------------------------------------------------------------------

export function addNode(xPos: number, yPos: number): void {
  performEdit((controller) => {
    controller.addNode(xPos, yPos);
  });
}

export function addLink(sourceId: string, targetId: string, weight: number): void {
  performEdit((controller) => {
    controller.addLink(sourceId, targetId, weight);
  });
}

export function deleteNode(nodeId: string): void {
  performEdit((controller) => {
    controller.deleteNode(nodeId);
  });
}

export function deleteLink(sourceId: string, targetId: string): void {
  performEdit((controller) => {
    controller.deleteLink(sourceId, targetId);
  });
}

export function deleteLinkById(linkId: string): void {
  performEdit((controller) => {
    controller.deleteLinkById(linkId);
  });
}

export function updateLinkWeight(linkId: string, newWeight: number): void {
  performEdit((controller) => {
    controller.updateLinkWeight(linkId, newWeight);
  });
}

// Router editing
export function updateNodeName(nodeId: string, newName: string): void {
  performEdit((controller) => {
    controller.updateNodeName(nodeId, newName);
  });
}

export function upsertRoutingEntry(
  routerId: string,
  destinationId: string,
  nextHopId: string,
  cost: number
): void {
  performEdit((controller) => {
    controller.upsertRoutingEntry(routerId, destinationId, nextHopId, cost);
  });
}

export function deleteRoutingEntry(routerId: string, destinationId: string): void {
  performEdit((controller) => {
    controller.deleteRoutingEntry(routerId, destinationId);
  });
}

// ---------------------------------------------------------------------------
// Clear network (undoable)
// ---------------------------------------------------------------------------

export function clearNetwork(): void {
  performEdit((controller) => {
    controller.clearNetwork();
  });

  selectedRouterId.set(null);
  selectedEdgeId.set(null);
  selectedNodeIdsMulti.set([]);
  selectedEdgeIdsMulti.set([]);
  placementMode.set('none');
  clearLinkSelection();
}

// ---------------------------------------------------------------------------
// Delete selected (supports multi-selection in delete mode)
// ---------------------------------------------------------------------------

export function deleteSelection(): void {
  const controller = get(simulation);
  if (controller.running) {
    warningMessage.set('Pause simulation before editing the topology.');
    return;
  }

  const multiNodes = get(selectedNodeIdsMulti);
  const multiEdges = get(selectedEdgeIdsMulti);

  if (multiNodes.length > 0 || multiEdges.length > 0) {
    performEdit((c) => {
      for (const eid of multiEdges) {
        c.deleteLinkById(eid);
      }
      for (const nid of multiNodes) {
        c.deleteNode(nid);
      }
    });

    selectedRouterId.set(null);
    selectedEdgeId.set(null);
    selectedNodeIdsMulti.set([]);
    selectedEdgeIdsMulti.set([]);
    return;
  }

  const nodeId = get(selectedRouterId);
  if (nodeId) {
    deleteNode(nodeId);
    selectedRouterId.set(null);
    return;
  }

  const edgeId = get(selectedEdgeId);
  if (edgeId) {
    deleteLinkById(edgeId);
    selectedEdgeId.set(null);
  }
}

// ---------------------------------------------------------------------------
// Movement (undoable; called on drag stop)
// ---------------------------------------------------------------------------

export function updateNodePosition(nodeId: string, xPos: number, yPos: number): void {
  performEdit((controller) => {
    controller.moveNode(nodeId, xPos, yPos);
  });
}

export function updateNodePositions(
  updates: { id: string; xPos: number; yPos: number }[]
): void {
  performEdit((controller) => {
    controller.moveNodes(updates);
  });
}

// ---------------------------------------------------------------------------
// Events (not undoable here)
// ---------------------------------------------------------------------------

export function addEvent(event: SimulationEvent): void {
  clearWarning();
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

// ---------------------------------------------------------------------------
// Import / Export (import is undoable)
// ---------------------------------------------------------------------------

export function importJson(json: string): void {
  performEdit((controller) => {
    controller.importJson(json);
    controller.setAlgorithm(get(currentAlgorithm));
  });

  selectedRouterId.set(null);
  selectedEdgeId.set(null);
  selectedNodeIdsMulti.set([]);
  selectedEdgeIdsMulti.set([]);
  placementMode.set('none');
  clearLinkSelection();
}

export function exportJson(): string {
  let result = '';
  simulation.update((controller) => {
    result = controller.exportJson();
    return controller;
  });
  return result;
}

