import { Topology } from "./Topology";
import { SimulationState } from "./SimulationState";
import { SimulationEvent } from "./SimulationEvent";
import { MinHeap } from "./MinHeap";
import type { AlgorithmType } from "./RoutingStrategieType";

export class SimulationController {
  private currentStepIndex: number;
  private history: SimulationState[];
  private topology: Topology;
  private events: MinHeap<SimulationEvent>;
  private nodeEventMap: Map<string, SimulationEvent[]>;
  private linkEventMap: Map<string, SimulationEvent[]>;

  constructor(topology: Topology) {
    this.topology = topology;
    this.currentStepIndex = 0;
    this.history = [];
    this.events = new MinHeap<SimulationEvent>((a, b) => a.step - b.step);
    this.nodeEventMap = new Map<string, SimulationEvent[]>();
    this.linkEventMap = new Map<string, SimulationEvent[]>();
  }

  public jumpToStep(_step: number): SimulationState {
    throw new Error("Method not implemented.");
  }

  public play(): void {
    // unknown behaviour -> left empty on purpose
  }

  public pause(): void {
    // unknown behaviour -> left empty on purpose
  }

  public setAlgorithm(_algo: AlgorithmType): void {
    // unknown behaviour -> left empty on purpose
  }

  public getTopology(): Topology {
    return this.topology;
  }

  public addEvent(_e: SimulationEvent): void {
    // unknown behaviour -> left empty on purpose
  }

  public addNode(_xPos: number, _yPos: number): void {
    // unknown behaviour -> left empty on purpose
  }

  public addLink(_sourceId: string, _targetId: string, _weight: number): void {
    // unknown behaviour -> left empty on purpose
  }

  public deleteNode(_nodeId: string): void {
    // unknown behaviour -> left empty on purpose
  }

  public deleteLink(_sourceId: string, _targetId: string): void {
    // unknown behaviour -> left empty on purpose
  }

  public nextStep(): void {
    // unknown behaviour -> left empty on purpose
  }

  public getPath(_sourceId: string, _targetId: string): string[] {
    throw new Error("Method not implemented.");
  }

  public importJson(_jsonString: string): void {
    // unknown behaviour -> left empty on purpose
  }

  public exportJson(): string {
    throw new Error("Method not implemented.");
  }
}
