// ==============================
// FILE: ./lib/stores/SimulationController.ts
// ==============================
import { Topology } from './Topology';
import { SimulationState } from './SimulationState';
import { Router } from './Router';
import { Link } from './Link';
import { EventType } from './EventType';
import type { AlgorithmType } from './RoutingStrategieType';
import { RoutingStrategieType } from './RoutingStrategieType';
import { RoutingEntry } from './RoutingEntry';
import type { EditResult, HistoryEvent } from './historyTypes';

type ExportFormatV1 = {
  version: 1;
  algorithm: AlgorithmType;
  initial: ExportTopology;
  totalSteps: number;
  historyEvents: HistoryEvent[];
};

type ExportFormatV2 = {
  version: 2;
  algorithm: AlgorithmType;
  nodes: ExportNodeV2[];
  links: ExportLinkV2[];
  totalSteps: number;
  events: ExportEventV2[];
};

type ExportEventV2 = {
  step: number;
  type: string; // includes "PLAY" + EventType values
  payload: Record<string, unknown>;
};

type ExportTopology = {
  nodes: ExportNode[];
  links: ExportLink[];
};

type ExportNode = {
  id: string;
  name: string;
  xPos: number;
  yPos: number;
};

type ExportLink = {
  id: string;
  sourceId: string;
  targetId: string;
  weight: number;
};

type ExportNodeV2 = {
  id: string;
  name: string;
  xPos: number;
  yPos: number;
  type?: string;
};

type ExportLinkV2 = {
  id: string;
  sourceId: string;
  targetId: string;
  weight: number;
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (typeof v !== 'object' || v === null) return false;
  return Object.prototype.toString.call(v) === '[object Object]';
}

function cloneTopology(topo: Topology): Topology {
  const nodes = new Map<string, Router>();

  for (const node of topo.nodes.values()) {
    const n: any = node as any;
    const r = new Router(String(n.id), String(n.name), Number(n.xPos), Number(n.yPos));

    // clone UI state
    r.optimalState = (n.optimalState as any) ?? 'pre';
    r.optimal = Boolean(n.optimal ?? false);

    // clone routing table (may include Infinity)
    if (n.routingTable?.entries) {
      for (const [dest, entry] of n.routingTable.entries.entries()) {
        r.routingTable.entries.set(dest, new RoutingEntry(dest, entry.nextHopId, entry.cost));
      }
    }

    nodes.set(r.id, r);
  }

  const links: Link[] = [];
  for (const link of topo.links) {
    const s = nodes.get(link.source.id);
    const t = nodes.get(link.target.id);
    if (!s || !t) continue;

    const l = new Link(link.id, s, t, link.weight);
    links.push(l);
    s.neighbors.push(l);
    t.neighbors.push(l);
  }

  return new Topology(nodes as unknown as Map<string, any>, links);
}

function exportToTopologyV1(exp: ExportTopology): Topology {
  const nodes = new Map<string, Router>();

  for (const n of exp.nodes) {
    const r = new Router(n.id, n.name, n.xPos, n.yPos);
    nodes.set(r.id, r);
  }

  const links: Link[] = [];
  for (const l of exp.links) {
    const s = nodes.get(l.sourceId);
    const t = nodes.get(l.targetId);
    if (!s || !t) continue;

    const link = new Link(l.id, s, t, l.weight);
    links.push(link);
    s.neighbors.push(link);
    t.neighbors.push(link);
  }

  return new Topology(nodes as unknown as Map<string, any>, links);
}

function exportToTopologyV2(nodesIn: ExportNodeV2[], linksIn: ExportLinkV2[]): Topology {
  const nodes = new Map<string, Router>();

  for (const n of nodesIn) {
    const r = new Router(String(n.id), String(n.name ?? n.id), Number(n.xPos ?? 0), Number(n.yPos ?? 0));
    nodes.set(r.id, r);
  }

  const links: Link[] = [];
  for (const l of linksIn) {
    const s = nodes.get(String(l.sourceId));
    const t = nodes.get(String(l.targetId));
    if (!s || !t) continue;

    const link = new Link(String(l.id), s, t, Number(l.weight ?? 1));
    links.push(link);
    s.neighbors.push(link);
    t.neighbors.push(link);
  }

  return new Topology(nodes as unknown as Map<string, any>, links);
}

function topologyToNodesLinksV2(topo: Topology): { nodes: ExportNodeV2[]; links: ExportLinkV2[] } {
  const nodes: ExportNodeV2[] = [];
  for (const n of topo.nodes.values()) {
    const nn: any = n as any;
    nodes.push({
      id: String(nn.id),
      name: String(nn.name ?? nn.id),
      xPos: Number(nn.xPos ?? 0),
      yPos: Number(nn.yPos ?? 0),
      type: 'router'
    });
  }

  const links: ExportLinkV2[] = topo.links.map((l) => ({
    id: String(l.id),
    sourceId: String(l.source.id),
    targetId: String(l.target.id),
    weight: Number(l.weight ?? 1)
  }));

  return { nodes, links };
}

export class SimulationController {
  public currentStepIndex: number;
  public history: SimulationState[];
  public topology: Topology;

  public totalSteps: number;

  private algorithm: AlgorithmType;

  private initialTopology: Topology;
  private historyEvents: HistoryEvent[];

  // Undo/redo only within the current step
  private undoStack: HistoryEvent[];
  private redoStack: HistoryEvent[];

  constructor(topology: Topology) {
    this.initialTopology = cloneTopology(topology);
    this.topology = cloneTopology(topology);

    this.algorithm = RoutingStrategieType.LINK_STATE;

    this.currentStepIndex = 0;
    this.totalSteps = 1; // step 0 only
    this.historyEvents = [];

    this.undoStack = [];
    this.redoStack = [];

    this.history = [];
    this.rebuildHistory();
    this.rebuildUndoRedoForCurrentStep();
  }

  public getTopology(): Topology {
    return this.topology;
  }

  public getTotalSteps(): number {
    return this.totalSteps;
  }

  public getAlgorithm(): AlgorithmType {
    return this.algorithm;
  }

  public setAlgorithm(algo: AlgorithmType): void {
    this.algorithm = algo;
    this.rebuildHistory();
    this.jumpToStep(this.currentStepIndex);
  }

  public resetToInitial(algo: AlgorithmType): void {
    this.algorithm = algo;

    this.currentStepIndex = 0;
    this.totalSteps = 1;
    this.historyEvents = [];

    this.clearUndoRedoStacks();

    this.rebuildHistory();
    this.jumpToStep(0);
  }

  public getEventsForStep(step: number): HistoryEvent[] {
    const s = this.history[step];
    return s ? s.events : [];
  }

  public canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  public canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  public undo(): void {
    if (!this.canUndo()) return;

    const last = this.undoStack[this.undoStack.length - 1];

    for (let i = this.historyEvents.length - 1; i >= 0; i--) {
      const e = this.historyEvents[i];
      if (e.step === last.step && e.type === last.type && e === last) {
        this.historyEvents.splice(i, 1);
        break;
      }
    }

    this.undoStack.pop();
    this.redoStack.push(last);

    this.rebuildHistory();
    this.jumpToStep(this.currentStepIndex);
  }

  public redo(): void {
    if (!this.canRedo()) return;

    const e = this.redoStack.pop() as HistoryEvent;
    this.historyEvents.push(e);
    this.undoStack.push(e);

    this.rebuildHistory();
    this.jumpToStep(this.currentStepIndex);
  }

  public jumpToStep(step: number): SimulationState {
    const clamped = Math.max(0, Math.min(step, this.totalSteps - 1));
    this.currentStepIndex = clamped;

    const state = this.history[clamped];
    if (state) {
      this.topology = cloneTopology(state.topologyState);
    }

    this.rebuildUndoRedoForCurrentStep();
    return state ?? this.history[this.history.length - 1];
  }

  public playOneStep(): void {
    if (this.currentStepIndex < this.totalSteps - 1) {
      this.truncateFutureTo(this.currentStepIndex);
    }

    this.clearUndoRedoStacks();

    this.totalSteps += 1;
    this.rebuildHistory();
    this.jumpToStep(this.currentStepIndex + 1);
  }

  private addHistoryEvent(event: HistoryEvent): EditResult {
    if (this.currentStepIndex < this.totalSteps - 1) {
      this.truncateFutureTo(this.currentStepIndex);
    }

    this.historyEvents.push(event);

    this.undoStack.push(event);
    this.redoStack = [];

    this.rebuildHistory();
    this.jumpToStep(this.currentStepIndex);

    return { applied: true };
  }

  private truncateFutureTo(step: number): void {
    const keepSteps = step + 1;
    this.totalSteps = Math.max(1, keepSteps);
    this.historyEvents = this.historyEvents.filter((e) => e.step <= step);
  }

  private clearUndoRedoStacks(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  private rebuildUndoRedoForCurrentStep(): void {
    const step = this.currentStepIndex;
    this.undoStack = this.historyEvents.filter((e) => e.step === step);
    this.redoStack = [];
  }

  // ---------------------------------------------------------------------------
  // History building + algorithm per step
  // ---------------------------------------------------------------------------

  /**
   * Semantics (UI-consistent / Option A):
   * - Within a step, topology edits DO NOT re-run the routing algorithm.
   * - The algorithm runs only when you advance to the next step (PLAY).
   *
   * Therefore, for step k (k>=1):
   * 1) start from step k-1 topology (after its edits),
   * 2) run one algorithm round to produce routing tables for step k,
   * 3) apply step k edits to the topology WITHOUT changing routing tables,
   * 4) ensure routing tables have rows for newly added/removed destinations (∞ for new ones).
   */
  private rebuildHistory(): void {
    const states: SimulationState[] = [];

    // step 0: start from initial, apply step0 edits, then initialize ALL routing tables to ∞ (self=0).
    // No algorithm is considered to have run at step 0.
    const step0Topo = cloneTopology(this.initialTopology);
    const step0Events = this.getRawEventsForStep(0);
    this.applyEventsToTopology(step0Topo, step0Events);
    this.initializeRoutingTablesBlank(step0Topo);

    // At step 0, we still want the UI to show whether routing tables are consistent with reachability.
    this.markOptimalityAgainstDijkstra(step0Topo);

    states.push(new SimulationState(0, step0Topo, step0Events));

    for (let step = 1; step < this.totalSteps; step++) {
      const prevState = states[step - 1];
      const prevTopo = prevState.topologyState;

      // 1) carry topology forward from previous step
      const topo = cloneTopology(prevTopo);

      // 2) run exactly one algorithm round to produce the routing tables for this step
      this.runAlgorithmOneRound(step, topo, prevTopo);

      // 3) apply edits of THIS step without re-running algorithm
      const events = this.getRawEventsForStep(step);
      this.applyEventsToTopology(topo, events);

      // 4) Option A: keep tables as-is, but adjust the "shape" (new rows => ∞, removed nodes => removed rows)
      this.normalizeRoutingTablesForCurrentNodeSet(topo);

      this.markOptimalityAgainstDijkstra(topo);

      states.push(new SimulationState(step, topo, events));
    }

    this.history = states;

    const current = this.history[this.currentStepIndex];
    if (current) {
      this.topology = cloneTopology(current.topologyState);
    }
  }

  private getRawEventsForStep(step: number): HistoryEvent[] {
    return this.historyEvents.filter((e) => e.step === step);
  }

  private applyEventsToTopology(topo: Topology, events: HistoryEvent[]): void {
    for (const e of events) {
      if (e.type === EventType.NODE_ADDITION) {
        const id = String((e.payload as any).nodeId ?? '');
        const name = String((e.payload as any).name ?? id);
        const xPos = Number((e.payload as any).xPos ?? 0);
        const yPos = Number((e.payload as any).yPos ?? 0);
        const router = new Router(id, name, xPos, yPos);
        topo.nodes.set(id, router);
      } else if (e.type === EventType.NODE_DELETION) {
        const id = String((e.payload as any).nodeId ?? '');
        topo.nodes.delete(id);

        topo.links = topo.links.filter((l) => l.source.id !== id && l.target.id !== id);
        for (const n of topo.nodes.values()) {
          (n as any).neighbors = (n as any).neighbors.filter(
            (l: any) => l.source.id !== id && l.target.id !== id
          );
        }
      } else if (e.type === EventType.LINK_ADDITION) {
        const id = String((e.payload as any).linkId ?? '');
        const sourceId = String((e.payload as any).sourceId ?? '');
        const targetId = String((e.payload as any).targetId ?? '');
        const weight = Number((e.payload as any).weight ?? 1);

        const s = topo.nodes.get(sourceId) as any;
        const t = topo.nodes.get(targetId) as any;
        if (!s || !t) continue;

        const link = new Link(id, s, t, weight);
        topo.links.push(link);
        s.neighbors.push(link);
        t.neighbors.push(link);
      } else if (e.type === EventType.LINK_DELETION) {
        const linkId = String((e.payload as any).linkId ?? '');
        topo.links = topo.links.filter((l) => l.id !== linkId);
        for (const n of topo.nodes.values()) {
          (n as any).neighbors = (n as any).neighbors.filter((l: any) => l.id !== linkId);
        }
      } else if (e.type === EventType.WEIGHT_CHANGE) {
        const linkId = String((e.payload as any).linkId ?? '');
        const weight = Number((e.payload as any).weight ?? 1);

        const link = topo.links.find((l) => l.id === linkId);
        if (link) link.weight = weight;
      } else if (e.type === EventType.NODE_RENAME) {
        const nodeId = String((e.payload as any).nodeId ?? '');
        const name = String((e.payload as any).name ?? '');
        const node = topo.nodes.get(nodeId) as any;
        if (node) node.name = name;
      } else if (e.type === EventType.NODE_MOVE) {
        const nodeId = String((e.payload as any).nodeId ?? '');
        const xPos = Number((e.payload as any).xPos ?? 0);
        const yPos = Number((e.payload as any).yPos ?? 0);
        const node = topo.nodes.get(nodeId) as any;
        if (node) {
          node.xPos = xPos;
          node.yPos = yPos;
        }
      } else if (e.type === EventType.NODES_MOVE) {
        const updates: any[] = Array.isArray((e.payload as any).updates)
          ? ((e.payload as any).updates as any[])
          : [];
        for (const u of updates) {
          const id = String(u.id ?? '');
          const node = topo.nodes.get(id) as any;
          if (!node) continue;
          node.xPos = Number(u.xPos ?? 0);
          node.yPos = Number(u.yPos ?? 0);
        }
      } else if (e.type === EventType.NETWORK_CLEAR) {
        topo.nodes.clear();
        topo.links = [];
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Step 0 routing table initialization (pedagogical "freshly spawned router")
  // ---------------------------------------------------------------------------

  private initializeRoutingTablesBlank(topo: Topology): void {
    const destIds = Array.from(topo.nodes.values())
      .map((n: any) => String(n?.id ?? ''))
      .filter((id) => id.length > 0)
      .sort((a, b) => a.localeCompare(b));

    for (const n of topo.nodes.values()) {
      if (!(n instanceof Router)) continue;

      const r = n as Router;
      r.routingTable.entries.clear();

      for (const destId of destIds) {
        if (destId === String(r.id)) {
          r.routingTable.entries.set(destId, new RoutingEntry(destId, String(r.id), 0));
        } else {
          r.routingTable.entries.set(destId, new RoutingEntry(destId, '', Number.POSITIVE_INFINITY));
        }
      }
    }
  }

  /**
   * Option A: after topology edits inside a step, do NOT recompute routes.
   * Only keep the table "shape" consistent with the current node set.
   */
  private normalizeRoutingTablesForCurrentNodeSet(topo: Topology): void {
    const destIds = this.getAllRouterIds(topo);
    const keep = new Set<string>(destIds);

    for (const n of topo.nodes.values()) {
      if (!(n instanceof Router)) continue;

      const r = n as Router;
      const selfId = String(r.id);

      // Remove rows for deleted nodes
      for (const k of Array.from(r.routingTable.entries.keys())) {
        if (!keep.has(String(k))) {
          r.routingTable.entries.delete(k);
        }
      }

      // Add rows for new nodes (∞), keep existing costs/hops untouched
      for (const destId of destIds) {
        if (destId === selfId) {
          const e = r.routingTable.entries.get(destId);
          if (!e) {
            r.routingTable.entries.set(destId, new RoutingEntry(destId, selfId, 0));
          } else {
            e.destinationId = destId;
            e.nextHopId = selfId;
            e.cost = 0;
          }
          continue;
        }

        const e = r.routingTable.entries.get(destId);
        if (!e) {
          r.routingTable.entries.set(destId, new RoutingEntry(destId, '', Number.POSITIVE_INFINITY));
        } else {
          e.destinationId = destId;
        }
      }
    }
  }

  private runAlgorithmOneRound(step: number, topo: Topology, prevTopo: Topology): void {
    if (this.algorithm === RoutingStrategieType.LINK_STATE) {
      this.runLinkState(topo);
      return;
    }

    const poisoned = this.algorithm === RoutingStrategieType.DISTANCE_VECTOR_POISONED;
    this.runDistanceVectorRound(topo, prevTopo, poisoned);

    void step;
  }

  private getAllRouterIds(topo: Topology): string[] {
    const ids: string[] = [];
    for (const n of topo.nodes.values()) {
      ids.push(String((n as any).id));
    }
    ids.sort((a, b) => a.localeCompare(b));
    return ids;
  }

  // ---------------- Link-State (Dijkstra for each router) -------------------

  private runLinkState(topo: Topology): void {
    const ids = this.getAllRouterIds(topo);

    for (const node of topo.nodes.values()) {
      const router = node as unknown as Router;

      const dist = new Map<string, number>();
      const prev = new Map<string, string | null>();
      const visited = new Set<string>();

      for (const id of ids) {
        dist.set(id, Number.POSITIVE_INFINITY);
        prev.set(id, null);
      }
      dist.set((router as any).id, 0);

      while (visited.size < ids.length) {
        let currentId: string | null = null;
        let best = Number.POSITIVE_INFINITY;

        for (const id of ids) {
          const d = dist.get(id) ?? Number.POSITIVE_INFINITY;
          if (!visited.has(id) && d < best) {
            best = d;
            currentId = id;
          }
        }

        if (currentId === null || best === Number.POSITIVE_INFINITY) break;

        visited.add(currentId);

        const currentNode = topo.nodes.get(currentId) as any;
        if (!currentNode) continue;

        for (const link of currentNode.neighbors) {
          const neighbor = link.source === currentNode ? link.target : link.source;
          const neighborId = String(neighbor.id);

          if (visited.has(neighborId)) continue;

          const alt = (dist.get(currentId) ?? Number.POSITIVE_INFINITY) + Number(link.weight ?? 0);
          if (alt < (dist.get(neighborId) ?? Number.POSITIVE_INFINITY)) {
            dist.set(neighborId, alt);
            prev.set(neighborId, currentId);
          }
        }
      }

      (router as any).routingTable.entries.clear();

      for (const destId of ids) {
        if (destId === (router as any).id) {
          (router as any).routingTable.entries.set(destId, new RoutingEntry(destId, (router as any).id, 0));
          continue;
        }

        const cost = dist.get(destId) ?? Number.POSITIVE_INFINITY;
        if (cost === Number.POSITIVE_INFINITY) {
          (router as any).routingTable.entries.set(destId, new RoutingEntry(destId, '', Number.POSITIVE_INFINITY));
          continue;
        }

        const hop = this.getFirstHopOnPath((router as any).id, destId, prev);
        (router as any).routingTable.entries.set(destId, new RoutingEntry(destId, hop ?? '', cost));
      }
    }
  }

  private getFirstHopOnPath(sourceId: string, destId: string, prev: Map<string, string | null>): string | null {
    let currentId: string | null = destId;
    let parentId = prev.get(currentId) ?? null;

    if (parentId === null) return null;

    while (parentId !== null && parentId !== sourceId) {
      currentId = parentId;
      parentId = prev.get(currentId) ?? null;
    }

    if (parentId === sourceId && currentId !== null) return currentId;
    return null;
  }

  // ---------------- Distance-Vector (synchronous round) -------------------

  private runDistanceVectorRound(topo: Topology, prevTopo: Topology, poisoned: boolean): void {
    const ids = this.getAllRouterIds(topo);

    const prevTables = new Map<string, Map<string, RoutingEntry>>();
    for (const [id, n] of prevTopo.nodes.entries()) {
      const r = n as unknown as Router;
      prevTables.set(String(id), (r as any).routingTable.entries);
    }

    for (const node of topo.nodes.values()) {
      const router = node as unknown as Router;
      const selfId = String((router as any).id);

      const prevSelf = prevTables.get(selfId);

      const nextEntries = new Map<string, RoutingEntry>();

      for (const destId of ids) {
        if (destId === selfId) {
          nextEntries.set(destId, new RoutingEntry(destId, selfId, 0));
          continue;
        }

        const prevEntry = prevSelf ? prevSelf.get(destId) : undefined;
        const baseCost = prevEntry ? prevEntry.cost : Number.POSITIVE_INFINITY;
        const baseHop = prevEntry ? prevEntry.nextHopId : '';

        let bestCost = baseCost;
        let bestHop = baseHop;

        const direct = this.getDirectLinkCost(router as any, destId);
        if (direct !== null && direct < bestCost) {
          bestCost = direct;
          bestHop = destId;
        }

        for (const link of (router as any).neighbors) {
          const neighbor = link.source === router ? link.target : link.source;
          const neighborId = String(neighbor.id);

          const linkCost = Number(link.weight ?? 0);

          const neighborTable = prevTables.get(neighborId);
          const neighborEntry = neighborTable ? neighborTable.get(destId) : undefined;

          let neighborCost = neighborEntry ? neighborEntry.cost : Number.POSITIVE_INFINITY;

          if (poisoned && neighborEntry && String(neighborEntry.nextHopId) === selfId) {
            neighborCost = Number.POSITIVE_INFINITY;
          }

          const via = linkCost + neighborCost;
          if (via < bestCost) {
            bestCost = via;
            bestHop = neighborId;
          }
        }

        nextEntries.set(destId, new RoutingEntry(destId, bestHop ?? '', bestCost));
      }

      (router as any).routingTable.entries.clear();
      for (const [destId, entry] of nextEntries.entries()) {
        (router as any).routingTable.entries.set(destId, entry);
      }
    }
  }

  private getDirectLinkCost(router: Router, neighborId: string): number | null {
    for (const link of (router as any).neighbors) {
      const other = link.source === router ? link.target : link.source;
      if (String((other as any).id) === String(neighborId)) {
        return Number(link.weight ?? 0);
      }
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Optimality markers (UI)
  // ---------------------------------------------------------------------------

  private markRoutersPre(topo: Topology): void {
    for (const n of topo.nodes.values()) {
      if (n instanceof Router) {
        n.optimalState = 'pre';
        n.optimal = false;
      }
    }
  }

  private markOptimalityAgainstDijkstra(topo: Topology): void {
    const ids = this.getAllRouterIds(topo);

    for (const n of topo.nodes.values()) {
      if (!(n instanceof Router)) continue;

      const dist = this.computeDijkstraDistances(topo, String(n.id), ids);

      let ok = true;

      for (const destId of ids) {
        const expected = dist.get(destId) ?? Number.POSITIVE_INFINITY;

        const entry = n.routingTable.entries.get(destId);
        const actualRaw = entry ? entry.cost : Number.POSITIVE_INFINITY;

        const actual = Number.isFinite(actualRaw) ? Number(actualRaw) : Number.POSITIVE_INFINITY;

        const expInf = expected === Number.POSITIVE_INFINITY;
        const actInf = actual === Number.POSITIVE_INFINITY;

        if (expInf !== actInf) {
          ok = false;
          break;
        }
        if (!expInf && actual !== expected) {
          ok = false;
          break;
        }
      }

      n.optimalState = ok ? 'optimal' : 'nonoptimal';
      n.optimal = ok;
    }
  }

  private computeDijkstraDistances(topo: Topology, sourceId: string, ids: string[]): Map<string, number> {
    const dist = new Map<string, number>();
    const visited = new Set<string>();

    for (const id of ids) dist.set(id, Number.POSITIVE_INFINITY);
    dist.set(sourceId, 0);

    while (visited.size < ids.length) {
      let currentId: string | null = null;
      let best = Number.POSITIVE_INFINITY;

      for (const id of ids) {
        const d = dist.get(id) ?? Number.POSITIVE_INFINITY;
        if (!visited.has(id) && d < best) {
          best = d;
          currentId = id;
        }
      }

      if (currentId === null || best === Number.POSITIVE_INFINITY) break;

      visited.add(currentId);

      const currentNode = topo.nodes.get(currentId) as any;
      if (!currentNode) continue;

      for (const link of currentNode.neighbors ?? []) {
        const neighbor = link.source === currentNode ? link.target : link.source;
        const neighborId = String(neighbor.id);

        if (visited.has(neighborId)) continue;

        const alt = (dist.get(currentId) ?? Number.POSITIVE_INFINITY) + Number(link.weight ?? 0);
        if (alt < (dist.get(neighborId) ?? Number.POSITIVE_INFINITY)) {
          dist.set(neighborId, alt);
        }
      }
    }

    return dist;
  }

  // ---------------------------------------------------------------------------
  // IDs
  // ---------------------------------------------------------------------------

  private generateRouterId(topo: Topology): string {
    let i = 1;
    while (topo.nodes.has(`R${i}`)) i++;
    return `R${i}`;
  }

  private generateLinkId(topo: Topology): string {
    let i = 1;
    const used = new Set(topo.links.map((l) => l.id));
    while (used.has(`L${i}`)) i++;
    return `L${i}`;
  }

  // ---------------------------------------------------------------------------
  // Public edits
  // ---------------------------------------------------------------------------

  public addNode(xPos: number, yPos: number): EditResult {
    const id = this.generateRouterId(this.topology);
    return this.addHistoryEvent({
      step: this.currentStepIndex,
      type: EventType.NODE_ADDITION,
      payload: { nodeId: id, name: id, xPos, yPos }
    });
  }

  public addLink(sourceId: string, targetId: string, weight: number): EditResult {
    const linkId = this.generateLinkId(this.topology);
    return this.addHistoryEvent({
      step: this.currentStepIndex,
      type: EventType.LINK_ADDITION,
      payload: { linkId, sourceId, targetId, weight }
    });
  }

  public deleteNode(nodeId: string): EditResult {
    return this.addHistoryEvent({
      step: this.currentStepIndex,
      type: EventType.NODE_DELETION,
      payload: { nodeId }
    });
  }

  public deleteLink(sourceId: string, targetId: string): EditResult {
    const link = this.topology.links.find(
      (l) =>
        (l.source.id === sourceId && l.target.id === targetId) ||
        (l.source.id === targetId && l.target.id === sourceId)
    );

    if (!link) return { applied: true };

    return this.deleteLinkById(link.id);
  }

  public deleteLinkById(linkId: string): EditResult {
    return this.addHistoryEvent({
      step: this.currentStepIndex,
      type: EventType.LINK_DELETION,
      payload: { linkId }
    });
  }

  public updateLinkWeight(linkId: string, weight: number): EditResult {
    return this.addHistoryEvent({
      step: this.currentStepIndex,
      type: EventType.WEIGHT_CHANGE,
      payload: { linkId, weight }
    });
  }

  public moveNode(nodeId: string, xPos: number, yPos: number): EditResult {
    return this.addHistoryEvent({
      step: this.currentStepIndex,
      type: EventType.NODE_MOVE,
      payload: { nodeId, xPos, yPos }
    });
  }

  public moveNodes(updates: { id: string; xPos: number; yPos: number }[]): EditResult {
    return this.addHistoryEvent({
      step: this.currentStepIndex,
      type: EventType.NODES_MOVE,
      payload: { updates }
    });
  }

  public updateNodeName(nodeId: string, name: string): EditResult {
    return this.addHistoryEvent({
      step: this.currentStepIndex,
      type: EventType.NODE_RENAME,
      payload: { nodeId, name }
    });
  }

  public clearNetwork(): EditResult {
    return this.addHistoryEvent({
      step: this.currentStepIndex,
      type: EventType.NETWORK_CLEAR,
      payload: {}
    });
  }

  // ---------------------------------------------------------------------------
  // Path finding for "Send packet"
  // ---------------------------------------------------------------------------

  public getLinkIdBetween(aId: string, bId: string): string | null {
    for (const l of this.topology.links) {
      const s = String(l.source.id);
      const t = String(l.target.id);
      if ((s === aId && t === bId) || (s === bId && t === aId)) {
        return String(l.id);
      }
    }
    return null;
  }

  public nodePathToEdgeIds(path: string[]): string[] {
    const out: string[] = [];
    for (let i = 0; i + 1 < path.length; i++) {
      const a = String(path[i]);
      const b = String(path[i + 1]);
      const id = this.getLinkIdBetween(a, b);
      if (id) out.push(id);
    }
    return out;
  }

  public getShortestPath(sourceId: string, targetId: string): string[] {
    const ids = this.getAllRouterIds(this.topology);
    if (!this.topology.nodes.has(sourceId) || !this.topology.nodes.has(targetId)) return [];
    if (sourceId === targetId) return [sourceId];

    const dist = new Map<string, number>();
    const prev = new Map<string, string | null>();
    const visited = new Set<string>();

    for (const id of ids) {
      dist.set(id, Number.POSITIVE_INFINITY);
      prev.set(id, null);
    }
    dist.set(sourceId, 0);

    while (visited.size < ids.length) {
      let currentId: string | null = null;
      let best = Number.POSITIVE_INFINITY;

      for (const id of ids) {
        const d = dist.get(id) ?? Number.POSITIVE_INFINITY;
        if (!visited.has(id) && d < best) {
          best = d;
          currentId = id;
        }
      }

      if (currentId === null || best === Number.POSITIVE_INFINITY) break;
      if (currentId === targetId) break;

      visited.add(currentId);

      const currentNode: any = this.topology.nodes.get(currentId);
      if (!currentNode) continue;

      for (const link of currentNode.neighbors ?? []) {
        const neighbor = link.source === currentNode ? link.target : link.source;
        const neighborId = String(neighbor.id);

        if (visited.has(neighborId)) continue;

        const alt = (dist.get(currentId) ?? Number.POSITIVE_INFINITY) + Number(link.weight ?? 0);
        if (alt < (dist.get(neighborId) ?? Number.POSITIVE_INFINITY)) {
          dist.set(neighborId, alt);
          prev.set(neighborId, currentId);
        }
      }
    }

    const d = dist.get(targetId) ?? Number.POSITIVE_INFINITY;
    if (d === Number.POSITIVE_INFINITY) return [];

    const path: string[] = [];
    let cur: string | null = targetId;

    while (cur !== null) {
      path.push(cur);
      cur = prev.get(cur) ?? null;
    }

    path.reverse();
    if (path.length > 0 && path[0] === sourceId) return path;
    return [];
  }

  public getForwardingPath(sourceId: string, targetId: string): { path: string[]; reached: boolean } {
    if (!this.topology.nodes.has(sourceId) || !this.topology.nodes.has(targetId)) {
      return { path: [], reached: false };
    }
    if (sourceId === targetId) return { path: [sourceId], reached: true };

    const maxHops = Math.max(3, this.topology.nodes.size + 5);

    const path: string[] = [sourceId];
    const visited = new Set<string>();
    visited.add(sourceId);

    let currentId = sourceId;

    for (let i = 0; i < maxHops; i++) {
      if (currentId === targetId) {
        return { path, reached: true };
      }

      const node = this.topology.nodes.get(currentId);
      if (!(node instanceof Router)) {
        return { path, reached: false };
      }

      const entry = node.routingTable.entries.get(targetId);
      const nextHopId = String(entry?.nextHopId ?? '').trim();

      if (nextHopId.length === 0 || nextHopId === currentId) {
        return { path, reached: false };
      }

      const linkId = this.getLinkIdBetween(currentId, nextHopId);
      if (!linkId) {
        return { path, reached: false };
      }

      path.push(nextHopId);

      if (nextHopId === targetId) {
        return { path, reached: true };
      }

      if (visited.has(nextHopId)) {
        return { path, reached: false };
      }

      visited.add(nextHopId);
      currentId = nextHopId;
    }

    return { path, reached: false };
  }

  // ---------------------------------------------------------------------------
  // Export / Import (v2 + legacy + v1)
  // ---------------------------------------------------------------------------

  public exportJson(): string {
    const { nodes, links } = topologyToNodesLinksV2(this.initialTopology);

    const events: ExportEventV2[] = [];

    for (let step = 0; step < this.totalSteps; step++) {
      if (step > 0) {
        events.push({ step, type: 'PLAY', payload: {} });
      }

      for (const e of this.historyEvents) {
        if (Number(e.step) !== step) continue;
        events.push({
          step,
          type: String(e.type),
          payload: isPlainObject(e.payload) ? e.payload : {}
        });
      }
    }

    const doc: ExportFormatV2 = {
      version: 2,
      algorithm: this.algorithm,
      nodes,
      links,
      totalSteps: this.totalSteps,
      events
    };

    return JSON.stringify(doc, null, 2);
  }

  public importJson(jsonString: string): EditResult {
    let parsed: any;
    try {
      parsed = JSON.parse(jsonString);
    } catch {
      return { applied: false, warning: 'Invalid JSON.' };
    }

    // v1
    if (parsed && parsed.version === 1) {
      const doc = parsed as ExportFormatV1;

      this.algorithm = doc.algorithm;
      this.initialTopology = exportToTopologyV1(doc.initial);
      this.totalSteps = Math.max(1, Number(doc.totalSteps ?? 1));
      this.historyEvents = Array.isArray(doc.historyEvents) ? doc.historyEvents : [];

      this.currentStepIndex = 0;
      this.clearUndoRedoStacks();

      this.rebuildHistory();
      this.jumpToStep(0);

      return { applied: true };
    }

    // v2 / legacy
    const hasNodes = Array.isArray(parsed?.nodes);
    const hasLinks = Array.isArray(parsed?.links);
    if (!hasNodes || !hasLinks) {
      return { applied: false, warning: 'Unsupported JSON format.' };
    }

    const algoRaw = parsed?.algorithm;
    const algoStr = typeof algoRaw === 'string' ? algoRaw : '';
    const algo: AlgorithmType =
      algoStr === RoutingStrategieType.LINK_STATE ||
      algoStr === RoutingStrategieType.DISTANCE_VECTOR ||
      algoStr === RoutingStrategieType.DISTANCE_VECTOR_POISONED
        ? (algoStr as AlgorithmType)
        : RoutingStrategieType.LINK_STATE;

    const nodesIn = parsed.nodes as any[];
    const linksIn = parsed.links as any[];

    const topo = exportToTopologyV2(
      nodesIn.map((n) => ({
        id: String(n?.id ?? ''),
        name: String(n?.name ?? n?.id ?? ''),
        xPos: Number(n?.xPos ?? 0),
        yPos: Number(n?.yPos ?? 0),
        type: typeof n?.type === 'string' ? String(n.type) : undefined
      })),
      linksIn.map((l) => ({
        id: String(l?.id ?? ''),
        sourceId: String(l?.sourceId ?? ''),
        targetId: String(l?.targetId ?? ''),
        weight: Number(l?.weight ?? 1)
      }))
    );

    const rawEvents: any[] = Array.isArray(parsed?.events) ? parsed.events : [];
    const validTypes = new Set<string>(Object.values(EventType));

    const historyEvents: HistoryEvent[] = [];
    let maxStep = 0;
    let ignored = 0;

    for (const ev of rawEvents) {
      const step = Number(ev?.step ?? 0);
      const type = String(ev?.type ?? '');
      const payloadRaw = ev?.payload;

      if (Number.isFinite(step)) {
        if (step > maxStep) maxStep = step;
      }

      if (type === 'PLAY') continue;

      if (!validTypes.has(type)) {
        ignored += 1;
        continue;
      }

      const payload: Record<string, unknown> = isPlainObject(payloadRaw) ? payloadRaw : {};

      historyEvents.push({
        step: Number.isFinite(step) ? step : 0,
        type: type as EventType,
        payload
      });
    }

    const explicitTotalSteps = Number(parsed?.totalSteps ?? NaN);
    const totalSteps =
      Number.isFinite(explicitTotalSteps) && explicitTotalSteps > 0
        ? Math.floor(explicitTotalSteps)
        : Math.max(1, maxStep + 1);

    this.algorithm = algo;
    this.initialTopology = topo;
    this.totalSteps = totalSteps;
    this.historyEvents = historyEvents;

    this.currentStepIndex = 0;
    this.clearUndoRedoStacks();

    this.rebuildHistory();
    this.jumpToStep(0);

    const warning =
      algoStr.length === 0
        ? 'Imported legacy topology JSON without "algorithm"; defaulted to LINK_STATE.'
        : ignored > 0
          ? `Ignored ${ignored} unknown event(s).`
          : undefined;

    return warning ? { applied: true, warning } : { applied: true };
  }
}

