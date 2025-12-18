import { writable, get, derived } from 'svelte/store';

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
// Sample topology (used on first load)
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
// Global simulation store
// ---------------------------------------------------------------------------

export const simulation = writable(new SimulationController(createSampleTopology()));

// ---------------------------------------------------------------------------
// UI scale (still used by layout, but zoom buttons can be removed from UI)
// ---------------------------------------------------------------------------

export const uiScale = writable<number>(1);

export function zoomInUI(): void {
  uiScale.update((s) => Math.min(1.5, Number((s + 0.1).toFixed(2))));
}

export function zoomOutUI(): void {
  uiScale.update((s) => Math.max(0.6, Number((s - 0.1).toFixed(2))));
}

// ---------------------------------------------------------------------------
// Routing-table history modal (multi-router + multi-step selection)
// ---------------------------------------------------------------------------

export const routerHistoryModalOpen = writable<boolean>(false);

// Selected routers + steps shown in the history modal
export const routerHistorySelectedRouterIds = writable<string[]>([]);
export const routerHistorySelectedSteps = writable<number[]>([]);

function uniqSortedStrings(xs: string[]): string[] {
  const s = new Set<string>();
  for (const x of xs) {
    const v = String(x ?? '').trim();
    if (v.length > 0) s.add(v);
  }
  return Array.from(s.values()).sort((a, b) => a.localeCompare(b));
}

function uniqSortedNumbers(xs: number[]): number[] {
  const s = new Set<number>();
  for (const x of xs) {
    const v = Number(x);
    if (Number.isFinite(v)) s.add(v);
  }
  return Array.from(s.values()).sort((a, b) => a - b);
}

// Toolbar button: open with nothing selected
export function openRouterHistoryFromToolbar(): void {
  routerHistoryModalOpen.set(true);
  routerHistorySelectedRouterIds.set([]);
  routerHistorySelectedSteps.set([]);
}

// Router-panel button: preselect router (steps default: current only; diffs compare vs previous step automatically)
export function openRouterHistoryForRouter(routerId: string): void {
  const rid = String(routerId ?? '').trim();
  routerHistoryModalOpen.set(true);

  routerHistorySelectedRouterIds.set(rid.length > 0 ? [rid] : []);

  const ctrl = get(simulation) as any;
  const cur = Number(ctrl?.currentStepIndex ?? 0);
  routerHistorySelectedSteps.set(uniqSortedNumbers([cur]));
}

export function closeRouterHistory(): void {
  routerHistoryModalOpen.set(false);
}

// Allow other UI pieces to update selection explicitly if needed
export function setRouterHistoryRouters(routerIds: string[]): void {
  routerHistorySelectedRouterIds.set(uniqSortedStrings(routerIds));
}

export function setRouterHistorySteps(steps: number[]): void {
  routerHistorySelectedSteps.set(uniqSortedNumbers(steps));
}

// ---------------------------------------------------------------------------
// Selection (single + multi)
// ---------------------------------------------------------------------------

export const selectedRouterId = writable<string | null>(null);
export const selectedEdgeId = writable<string | null>(null);

export const selectedNodeIdsMulti = writable<string[]>([]);
export const selectedEdgeIdsMulti = writable<string[]>([]);

export function setSelectedEdge(id: string | null): void {
  selectedEdgeId.set(id);
}

export function setMultiSelection(nodeIds: string[], edgeIds: string[]): void {
  selectedNodeIdsMulti.set(nodeIds);
  selectedEdgeIdsMulti.set(edgeIds);
}

// ---------------------------------------------------------------------------
// Placement / edit mode
// ---------------------------------------------------------------------------

export type PlacementMode = 'none' | 'router' | 'link' | 'delete';
export const placementMode = writable<PlacementMode>('none');

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
    const next: PlacementMode = m === 'router' ? 'none' : 'router';
    if (next !== 'link') {
      clearLinkSelection();
    }
    return next;
  });
}

export function toggleLinkPlacement(): void {
  placementMode.update((m) => {
    const next: PlacementMode = m === 'link' ? 'none' : 'link';
    if (next === 'link') {
      clearLinkSelection();
    }
    return next;
  });
}

export function toggleDeletePlacement(): void {
  placementMode.update((m) => {
    const next: PlacementMode = m === 'delete' ? 'none' : 'delete';
    if (next !== 'link') {
      clearLinkSelection();
    }
    return next;
  });
}

export function clearPlacementMode(): void {
  placementMode.set('none');
  clearLinkSelection();
}

export function setSelectedRouter(id: string | null): void {
  selectedRouterId.set(id);

  if (!id) {
    return;
  }

  const mode = get(placementMode);

  if (mode === 'delete') {
    deleteNode(id);
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
// Playback controls
// ---------------------------------------------------------------------------

export function play(): void {
  simulation.update((controller) => {
    controller.playOneStep();
    return controller;
  });
}

export function pause(): void {
  // no-op
}

// Compatibility stubs
export const warningMessage = writable<string | null>(null);

export function confirmDiscardFuture(): void {
  warningMessage.set(null);
}

export function cancelDiscardFuture(): void {
  warningMessage.set(null);
}

export function nextStep(): void {
  play();
}

export function previousStep(): void {
  stepBackward();
}

export function stop(): void {
  // no-op
}

export function reset(): void {
  // no-op
}

export function setAlgorithm(algo: AlgorithmType): void {
  simulation.update((controller) => {
    controller.setAlgorithm(algo);
    return controller;
  });
}

export function resetToInitialAndSetAlgorithm(algo: AlgorithmType): void {
  simulation.update((controller) => {
    controller.resetToInitial(algo);
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

export function stepForward(): void {
  simulation.update((controller) => {
    const next = Math.min(controller.currentStepIndex + 1, controller.getTotalSteps() - 1);
    controller.jumpToStep(next);
    return controller;
  });
}

export function stepBackward(): void {
  simulation.update((controller) => {
    const prev = Math.max(0, controller.currentStepIndex - 1);
    controller.jumpToStep(prev);
    return controller;
  });
}

// ---------------------------------------------------------------------------
// Undo / Redo (within current timestep only)
// ---------------------------------------------------------------------------

export const canUndo = derived(simulation, (c) => c.canUndo());
export const canRedo = derived(simulation, (c) => c.canRedo());

export function undo(): void {
  simulation.update((controller) => {
    controller.undo();
    return controller;
  });
}

export function redo(): void {
  simulation.update((controller) => {
    controller.redo();
    return controller;
  });
}

// ---------------------------------------------------------------------------
// Topology edits
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

export function updateLinkWeight(linkId: string, weight: number): void {
  simulation.update((controller) => {
    controller.updateLinkWeight(linkId, weight);
    return controller;
  });
}

export function updateNodeName(nodeId: string, name: string): void {
  simulation.update((controller) => {
    controller.updateNodeName(nodeId, name);
    return controller;
  });
}

export function clearNetwork(): void {
  simulation.update((controller) => {
    controller.clearNetwork();
    clearPlacementMode();
    selectedRouterId.set(null);
    selectedEdgeId.set(null);
    setMultiSelection([], []);
    return controller;
  });
}

export function deleteSelection(): void {
  const routerId = get(selectedRouterId);
  const edgeId = get(selectedEdgeId);

  if (routerId) {
    deleteNode(routerId);
    selectedRouterId.set(null);
  }
  if (edgeId) {
    deleteLinkById(edgeId);
    selectedEdgeId.set(null);
  }

  setMultiSelection([], []);
}

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

export function addEvent(event: SimulationEvent): void {
  simulation.update((controller) => {
    void event;
    return controller;
  });
}

// ---------------------------------------------------------------------------
// Send packet: highlights
// ---------------------------------------------------------------------------

export const shortestPathHighlightEdgeIds = writable<string[]>([]);
export const packetHighlightEdgeIds = writable<string[]>([]);
export const packetHighlightColor = writable<'orange' | 'red' | null>(null);

let highlightTimer: number | null = null;

function clearHighlights(): void {
  shortestPathHighlightEdgeIds.set([]);
  packetHighlightEdgeIds.set([]);
  packetHighlightColor.set(null);
}

export function sendPacket(sourceId: string, targetId: string): void {
  const ctrl = get(simulation);

  // shortest path (green)
  const shortestNodes = ctrl.getShortestPath(String(sourceId), String(targetId));
  const shortestEdges = ctrl.nodePathToEdgeIds(shortestNodes);
  shortestPathHighlightEdgeIds.set(shortestEdges);

  // forwarding path (orange/red)
  const res = ctrl.getForwardingPath(String(sourceId), String(targetId));
  const packetEdges = ctrl.nodePathToEdgeIds(res.path);
  packetHighlightEdgeIds.set(packetEdges);
  packetHighlightColor.set(res.reached ? 'orange' : 'red');

  if (highlightTimer !== null) {
    window.clearTimeout(highlightTimer);
    highlightTimer = null;
  }

  if (typeof window !== 'undefined') {
    highlightTimer = window.setTimeout(() => {
      clearHighlights();
      highlightTimer = null;
    }, 5000);
  }
}

// ---------------------------------------------------------------------------
// Queries / import-export
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
  const ctrl = get(simulation);
  return ctrl.getForwardingPath(String(sourceId), String(targetId)).path;
}

export function importJson(json: string): void {
  simulation.update((controller) => {
    const res = controller.importJson(json);
    warningMessage.set(res.warning ?? null);

    clearPlacementMode();
    selectedRouterId.set(null);
    selectedEdgeId.set(null);
    setMultiSelection([], []);
    clearHighlights();

    // keep modal open state; sanitize selections later in modal if needed
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

