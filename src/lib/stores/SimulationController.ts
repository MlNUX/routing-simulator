// src/lib/stores/SimulationController.ts

import { Topology } from "./Topology";
import { SimulationState } from "./SimulationState";
import { SimulationEvent } from "./SimulationEvent";
import { MinHeap } from "./MinHeap";
import { EventType } from "./EventType";
import { Link } from "./Link";
import { Router } from "./Router";
import { EndDevice } from "./EndDevice";
import { RoutingStrategieType, type AlgorithmType } from "./RoutingStrategieType";
import { LinkStateStrategy } from "./LinkStateStrategy";
import { DistanceVectorStrategy } from "./DistanceVectorStrategy";

export class SimulationController {
  // made public so Svelte can bind directly (Timeline, Editor, etc.)
  public currentStepIndex: number;
  public history: SimulationState[];
  public topology: Topology;

  private events: MinHeap<SimulationEvent>;
  private nodeEventMap: Map<string, SimulationEvent[]>;
  private linkEventMap: Map<string, SimulationEvent[]>;
  private playing: boolean;

  constructor(topology: Topology) {
    this.topology = topology;
    this.currentStepIndex = 0;
    this.history = [];
    this.events = new MinHeap<SimulationEvent>((a, b) => a.step - b.step);
    this.nodeEventMap = new Map<string, SimulationEvent[]>();
    this.linkEventMap = new Map<string, SimulationEvent[]>();
    this.playing = false;

    this.pushState();
  }

  // convenience getters for UI
  public get running(): boolean {
    return this.playing;
  }

  public get isPlaying(): boolean {
    return this.playing;
  }

  // ----------------------------- Basis / Timeline ----------------------------

  private pushState(): void {
    const state = new SimulationState(this.currentStepIndex, this.topology);
    this.history.push(state);
  }

  public jumpToStep(step: number): SimulationState {
    if (step < 0) {
      step = 0;
    }

    // only simulate forward if needed
    while (this.currentStepIndex < step) {
      this.nextStep();
      if (this.currentStepIndex === step) {
        break;
      }
    }

    const found = this.history.find((s) => s.stepNumber === step);
    return found ?? this.history[this.history.length - 1];
  }

  public play(): void {
    this.playing = true;
  }

  public pause(): void {
    this.playing = false;
  }

  // -------------------------- Routing-Algorithmus ---------------------------

  public setAlgorithm(algo: AlgorithmType): void {
    for (const node of this.topology.nodes.values()) {
      if (node instanceof Router) {
        switch (algo) {
          case RoutingStrategieType.LINK_STATE:
            node.setStrategy(new LinkStateStrategy());
            break;
          case RoutingStrategieType.DISTANCE_VECTOR:
            node.setStrategy(new DistanceVectorStrategy(false));
            break;
          case RoutingStrategieType.DISTANCE_VECTOR_POISONED:
            node.setStrategy(new DistanceVectorStrategy(true));
            break;
          default:
            node.setStrategy(new LinkStateStrategy());
            break;
        }
      }
    }
  }

  public getTopology(): Topology {
    return this.topology;
  }

  // ------------------------------- Events ------------------------------------

  public addEvent(e: SimulationEvent): void {
    this.events.insert(e);

    if (e.type === EventType.NODE_FAILURE || e.type === EventType.NODE_ADDITION) {
      const list = this.nodeEventMap.get(e.targetId) ?? [];
      list.push(e);
      this.nodeEventMap.set(e.targetId, list);
    } else {
      const list = this.linkEventMap.get(e.targetId) ?? [];
      list.push(e);
      this.linkEventMap.set(e.targetId, list);
    }
  }

  private applyEvent(event: SimulationEvent): void {
    switch (event.type) {
      case EventType.NODE_FAILURE: {
        this.deleteNode(event.targetId);
        break;
      }
      case EventType.LINK_FAILURE: {
        const link = this.findLinkById(event.targetId);
        if (link) {
          this.removeLinkInstance(link);
        }
        break;
      }
      case EventType.WEIGHT_CHANGE: {
        const link = this.findLinkById(event.targetId);
        if (link) {
          link.setWeight(event.argument);
        }
        break;
      }
      case EventType.NODE_ADDITION:
        // not clearly specified -> no-op for now
        break;
      case EventType.LINK_ADDITION:
        // not clearly specified -> no-op for now
        break;
      default:
        break;
    }
  }

  private findLinkById(id: string): Link | undefined {
    return this.topology.links.find((l) => l.id === id);
  }

  private removeLinkInstance(link: Link): void {
    this.topology.links = this.topology.links.filter((l) => l !== link);
    link.source.neighbors = link.source.neighbors.filter((l) => l !== link);
    link.target.neighbors = link.target.neighbors.filter((l) => l !== link);
  }

  // ------------------------ Topologie verändern ------------------------------

  private generateRouterId(): string {
    let index = 1;
    while (this.topology.nodes.has(`R${index}`)) {
      index++;
    }
    return `R${index}`;
  }

  private generateLinkId(): string {
    let index = 1;
    while (this.topology.links.some((l) => l.id === `L${index}`)) {
      index++;
    }
    return `L${index}`;
  }

  public addNode(xPos: number, yPos: number): void {
    const id = this.generateRouterId();
    const router = new Router(id, `Router ${id}`, xPos, yPos);
    this.topology.nodes.set(router.id, router);
    this.pushState();
  }

  public addLink(sourceId: string, targetId: string, weight: number): void {
    const source = this.topology.nodes.get(sourceId);
    const target = this.topology.nodes.get(targetId);
    if (!source || !target) {
      throw new Error("Source or target node does not exist");
    }

    const id = this.generateLinkId();
    const link = new Link(id, source, target, weight);
    this.topology.links.push(link);
    source.neighbors.push(link);
    target.neighbors.push(link);

    this.pushState();
  }

  public deleteNode(nodeId: string): void {
    const node = this.topology.nodes.get(nodeId);
    if (!node) {
      return;
    }

    const linksToRemove = this.topology.links.filter(
      (link) => link.source === node || link.target === node
    );
    for (const link of linksToRemove) {
      this.removeLinkInstance(link);
    }

    this.topology.nodes.delete(nodeId);
    this.pushState();
  }

  public deleteLink(sourceId: string, targetId: string): void {
    const source = this.topology.nodes.get(sourceId);
    const target = this.topology.nodes.get(targetId);
    if (!source || !target) {
      return;
    }

    const link = this.topology.links.find(
      (l) =>
        (l.source === source && l.target === target) ||
        (l.source === target && l.target === source)
    );
    if (!link) {
      return;
    }

    this.removeLinkInstance(link);
    this.pushState();
  }

  // -------------------------- NEW: Persist node movement ---------------------

  public moveNode(nodeId: string, xPos: number, yPos: number): void {
    const node = this.topology.nodes.get(nodeId);
    if (!node) {
      return;
    }

    if (!Number.isFinite(xPos) || !Number.isFinite(yPos)) {
      return;
    }

    // Avoid pushing duplicate states (also avoids double-events from multiple listeners)
    if (node.xPos === xPos && node.yPos === yPos) {
      return;
    }

    node.xPos = xPos;
    node.yPos = yPos;

    this.pushState();
  }

  public moveNodes(updates: { id: string; xPos: number; yPos: number }[]): void {
    let changed = false;

    for (const u of updates) {
      const node = this.topology.nodes.get(u.id);
      if (!node) continue;
      if (!Number.isFinite(u.xPos) || !Number.isFinite(u.yPos)) continue;

      if (node.xPos !== u.xPos || node.yPos !== u.yPos) {
        node.xPos = u.xPos;
        node.yPos = u.yPos;
        changed = true;
      }
    }

    if (changed) {
      this.pushState();
    }
  }

  // ---------------------------- Simulationsschritt ---------------------------

  public nextStep(): void {
    this.currentStepIndex++;

    // handle all events scheduled for this step
    while (true) {
      const peek = this.events.peek();
      if (!peek || peek.step > this.currentStepIndex) {
        break;
      }
      const ev = this.events.extractMin();
      if (ev) {
        this.applyEvent(ev);
      }
    }

    // execute routing strategy for all routers
    for (const node of this.topology.nodes.values()) {
      if (node instanceof Router && node.strategy) {
        node.strategy.executeStep(node, this.topology);
      }
    }

    this.pushState();
  }

  // ------------------------- Pfad anhand Routingtabellen ---------------------

  private getFirstRouterNeighbor(device: EndDevice): Router | null {
    for (const link of device.neighbors) {
      const other = link.source === device ? link.target : link.source;
      if (other instanceof Router) {
        return other;
      }
    }
    return null;
  }

  public getPath(sourceId: string, targetId: string): string[] {
    const sourceNode = this.topology.nodes.get(sourceId);
    const targetNode = this.topology.nodes.get(targetId);

    if (!sourceNode || !targetNode) {
      return [];
    }

    let startRouter: Router | null = null;
    let targetRouter: Router | null = null;
    const path: string[] = [];

    // start
    if (sourceNode instanceof Router) {
      startRouter = sourceNode;
      path.push(sourceNode.id);
    } else if (sourceNode instanceof EndDevice) {
      const r = this.getFirstRouterNeighbor(sourceNode);
      if (!r) return [];
      startRouter = r;
      path.push(sourceNode.id, r.id);
    } else {
      return [];
    }

    // target
    let appendTargetDevice = false;
    if (targetNode instanceof Router) {
      targetRouter = targetNode;
    } else if (targetNode instanceof EndDevice) {
      const r = this.getFirstRouterNeighbor(targetNode);
      if (!r) return [];
      targetRouter = r;
      appendTargetDevice = true;
    } else {
      return [];
    }

    if (!startRouter || !targetRouter) {
      return [];
    }

    const visited = new Set<string>();
    let currentId = startRouter.id;
    visited.add(currentId);

    while (currentId !== targetRouter.id) {
      const currentNode = this.topology.nodes.get(currentId);
      if (!(currentNode instanceof Router) || !currentNode.routingTable) {
        return [];
      }

      const entry = currentNode.routingTable.entries.get(targetRouter.id);
      if (!entry) {
        return [];
      }

      const nextHopId = entry.nextHopId;
      if (visited.has(nextHopId)) {
        return [];
      }
      visited.add(nextHopId);

      if (path[path.length - 1] !== nextHopId) {
        path.push(nextHopId);
      }

      currentId = nextHopId;

      if (path.length > this.topology.nodes.size + 2) {
        return [];
      }
    }

    if (appendTargetDevice && path[path.length - 1] !== targetId) {
      path.push(targetId);
    }

    for (const node of this.topology.nodes.values()) {
      if (node instanceof Router) {
        node.optimal = false;
      }
    }
    for (const id of path) {
      const node = this.topology.nodes.get(id);
      if (node instanceof Router) {
        node.optimal = true;
      }
    }

    return path;
  }

  // ------------------------------ JSON Import/Export -------------------------

  public importJson(jsonString: string): void {
    const data = JSON.parse(jsonString);

    const newTopology = new Topology();

    if (Array.isArray(data.nodes)) {
      for (const raw of data.nodes) {
        if (!raw || typeof raw.id !== "string") {
          continue;
        }
        const id: string = raw.id;
        const name: string = raw.name ?? raw.id;
        const xPos: number = typeof raw.xPos === "number" ? raw.xPos : 0;
        const yPos: number = typeof raw.yPos === "number" ? raw.yPos : 0;
        const type: string = raw.type ?? "router";

        let node: Router | EndDevice;
        if (type === "endDevice") {
          node = new EndDevice(id, name, xPos, yPos);
        } else {
          node = new Router(id, name, xPos, yPos);
        }
        newTopology.nodes.set(id, node);
      }
    }

    if (Array.isArray(data.links)) {
      for (const raw of data.links) {
        if (!raw) continue;
        const id: string = raw.id ?? "";
        const sourceId: string = raw.sourceId;
        const targetId: string = raw.targetId;
        const weight: number = typeof raw.weight === "number" ? raw.weight : 1;

        const source = newTopology.nodes.get(sourceId);
        const target = newTopology.nodes.get(targetId);
        if (!source || !target) continue;

        const link = new Link(id, source, target, weight);
        newTopology.links.push(link);
        source.neighbors.push(link);
        target.neighbors.push(link);
      }
    }

    this.topology = newTopology;

    this.events = new MinHeap<SimulationEvent>((a, b) => a.step - b.step);
    this.nodeEventMap = new Map<string, SimulationEvent[]>();
    this.linkEventMap = new Map<string, SimulationEvent[]>();

    if (Array.isArray(data.events)) {
      for (const raw of data.events) {
        if (!raw) continue;
        const step: number = typeof raw.step === "number" ? raw.step : 0;
        const type: EventType = raw.type as EventType;
        const targetId: string = raw.targetId;
        const argument: number = typeof raw.argument === "number" ? raw.argument : 0;

        const e = new SimulationEvent(step, type, targetId, argument);
        this.addEvent(e);
      }
    }

    this.currentStepIndex = 0;
    this.history = [];
    this.playing = false;
    this.pushState();
  }

  public exportJson(): string {
    const nodes = Array.from(this.topology.nodes.values()).map((n) => ({
      id: n.id,
      name: n.name,
      xPos: n.xPos,
      yPos: n.yPos,
      type: n instanceof EndDevice ? "endDevice" : "router",
    }));

    const links = this.topology.links.map((l) => ({
      id: l.id,
      sourceId: l.source.id,
      targetId: l.target.id,
      weight: l.weight,
    }));

    const events: {
      step: number;
      type: EventType;
      targetId: string;
      argument: number;
    }[] = [];

    for (const list of this.nodeEventMap.values()) {
      for (const e of list) {
        events.push({
          step: e.step,
          type: e.type,
          targetId: e.targetId,
          argument: e.argument,
        });
      }
    }

    for (const list of this.linkEventMap.values()) {
      for (const e of list) {
        events.push({
          step: e.step,
          type: e.type,
          targetId: e.targetId,
          argument: e.argument,
        });
      }
    }

    return JSON.stringify({ nodes, links, events }, null, 2);
  }
}

