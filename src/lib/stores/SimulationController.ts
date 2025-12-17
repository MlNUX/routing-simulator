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
    this.nodeEventMap = new Map();
    this.linkEventMap = new Map();
    this.playing = false;

    this.pushState();
  }

  public get running(): boolean {
    return this.playing;
  }

  public get isPlaying(): boolean {
    return this.playing;
  }

  private pushState(): void {
    this.history.push(new SimulationState(this.currentStepIndex, this.topology));
  }

  public jumpToStep(step: number): SimulationState {
    if (step < 0) {
      step = 0;
    }

    while (this.currentStepIndex < step) {
      this.nextStep();
    }

    return (
      this.history.find((s) => s.stepNumber === step) ??
      this.history[this.history.length - 1]
    );
  }

  public play(): void {
    this.playing = true;
  }

  public pause(): void {
    this.playing = false;
  }

  public setAlgorithm(algo: AlgorithmType): void {
    for (const node of this.topology.nodes.values()) {
      if (node instanceof Router) {
        if (algo === RoutingStrategieType.LINK_STATE) {
          node.setStrategy(new LinkStateStrategy());
        } else if (algo === RoutingStrategieType.DISTANCE_VECTOR) {
          node.setStrategy(new DistanceVectorStrategy(false));
        } else if (algo === RoutingStrategieType.DISTANCE_VECTOR_POISONED) {
          node.setStrategy(new DistanceVectorStrategy(true));
        }
      }
    }
  }

  public getTopology(): Topology {
    return this.topology;
  }

  public addEvent(_e: SimulationEvent): void {}

  private applyEvent(_event: SimulationEvent): void {}

  private findLinkById(_id: string): Link | undefined {
    return undefined;
  }

  private removeLinkInstance(_link: Link): void {}

  private generateRouterId(): string {
    return "";
  }

  private generateLinkId(): string {
    return "";
  }

  public addNode(xPos: number, yPos: number): void {
    const id = `R${this.topology.nodes.size + 1}`;
    this.topology.nodes.set(id, new Router(id, id, xPos, yPos));
    this.pushState();
  }

  public addLink(sourceId: string, targetId: string, weight: number): void {
    const s = this.topology.nodes.get(sourceId);
    const t = this.topology.nodes.get(targetId);
    if (!s || !t) {
      return;
    }

    const link = new Link(`L${this.topology.links.length + 1}`, s, t, weight);
    this.topology.links.push(link);
    s.neighbors.push(link);
    t.neighbors.push(link);

    this.pushState();
  }

  public deleteNode(nodeId: string): void {
    this.topology.nodes.delete(nodeId);
    this.pushState();
  }

  public deleteLink(_sourceId: string, _targetId: string): void {
    this.pushState();
  }

  public moveNode(nodeId: string, xPos: number, yPos: number): void {
    const n = this.topology.nodes.get(nodeId);
    if (!n) return;

    n.xPos = xPos;
    n.yPos = yPos;
    this.pushState();
  }

  public moveNodes(updates: { id: string; xPos: number; yPos: number }[]): void {
    for (const u of updates) {
      const n = this.topology.nodes.get(u.id);
      if (n) {
        n.xPos = u.xPos;
        n.yPos = u.yPos;
      }
    }
    this.pushState();
  }

  public nextStep(): void {
    this.currentStepIndex++;
    this.pushState();
  }

  private getFirstRouterNeighbor(_device: EndDevice): Router | null {
    return null;
  }

  public getPath(_sourceId: string, _targetId: string): string[] {
    return [];
  }

  public importJson(_jsonString: string): void {}

  public exportJson(): string {
    return "";
  }
}

