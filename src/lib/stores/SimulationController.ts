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
import { RoutingEntry } from "./RoutingEntry";

export class SimulationController {
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
        break;
      case EventType.LINK_ADDITION:
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

  public deleteLinkById(linkId: string): void {
    const link = this.topology.links.find((l) => l.id === linkId);
    if (!link) {
      return;
    }

    this.removeLinkInstance(link);
    this.pushState();
  }

  // -------------------------- Link weight editing ----------------------------

  public updateLinkWeight(linkId: string, newWeight: number): void {
    const link = this.findLinkById(linkId);
    if (!link) {
      return;
    }

    if (!Number.isFinite(newWeight) || newWeight <= 0) {
      return;
    }

    if (link.weight === newWeight) {
      return;
    }

    link.setWeight(newWeight);
    this.pushState();
  }

  // -------------------------- Router editing ---------------------------------

  public updateNodeName(nodeId: string, newName: string): void {
    const node = this.topology.nodes.get(nodeId);
    if (!node) {
      return;
    }

    const trimmed = String(newName ?? "").trim();
    if (trimmed.length === 0) {
      return;
    }

    if (node.name === trimmed) {
      return;
    }

    node.name = trimmed;
    this.pushState();
  }

  public upsertRoutingEntry(
    routerId: string,
    destinationId: string,
    nextHopId: string,
    cost: number
  ): void {
    const node = this.topology.nodes.get(routerId);
    if (!(node instanceof Router)) {
      return;
    }

    const dest = String(destinationId ?? "").trim();
    const hop = String(nextHopId ?? "").trim();

    if (dest.length === 0 || hop.length === 0) {
      return;
    }

    if (!Number.isFinite(cost) || cost < 0) {
      return;
    }

    const entries = node.routingTable.entries;
    const existing = entries.get(dest);

    if (!existing) {
      entries.set(dest, new RoutingEntry(dest, hop, cost));
      this.pushState();
      return;
    }

    const changed = existing.nextHopId !== hop || existing.cost !== cost;
    if (!changed) {
      return;
    }

    existing.nextHopId = hop;
    existing.cost = cost;
    this.pushState();
  }

  public deleteRoutingEntry(routerId: string, destinationId: string): void {
    const node = this.topology.nodes.get(routerId);
    if (!(node instanceof Router)) {
      return;
    }

    const dest = String(destinationId ?? "").trim();
    if (dest.length === 0) {
      return;
    }

    const existed = node.routingTable.entries.delete(dest);
    if (existed) {
      this.pushState();
    }
  }

  // -------------------------- Clear everything -------------------------------

  public clearNetwork(): void {
    const linksCopy = [...this.topology.links];
    for (const link of linksCopy) {
      this.removeLinkInstance(link);
    }

    this.topology.links = [];
    this.topology.nodes.clear();

    this.events = new MinHeap<SimulationEvent>((a, b) => a.step - b.step);
    this.nodeEventMap = new Map<string, SimulationEvent[]>();
    this.linkEventMap = new Map<string, SimulationEvent[]>();

    this.currentStepIndex = 0;
    this.history = [];
    this.playing = false;

    this.pushState();
  }

  // -------------------------- Persist node movement --------------------------

  public moveNode(nodeId: string, xPos: number, yPos: number): void {
    const node = this.topology.nodes.get(nodeId);
    if (!node) {
      return;
    }

    if (!Number.isFinite(xPos) || !Number.isFinite(yPos)) {
      return;
    }

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

    for (const node of this.topology.nodes.values()) {
      if (node instanceof Router && node.strategy) {
        node.strategy.executeStep(node, this.topology);
      }
    }

    this.pushState();
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

    let linkIndex = 1;
    const nextLinkId = (): string => {
      while (newTopology.links.some((l) => l.id === `L${linkIndex}`)) {
        linkIndex++;
      }
      const id = `L${linkIndex}`;
      linkIndex++;
      return id;
    };

    if (Array.isArray(data.links)) {
      for (const raw of data.links) {
        if (!raw) continue;

        const rawId: unknown = raw.id;
        let id: string =
          typeof rawId === "string" && rawId.trim().length > 0 ? rawId.trim() : "";

        if (id === "" || newTopology.links.some((l) => l.id === id)) {
          id = nextLinkId();
        }

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

