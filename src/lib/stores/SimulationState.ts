import type { Topology } from './Topology';
import type { HistoryEvent } from './historyTypes';

export class SimulationState {
  public stepNumber: number;
  public topologyState: Topology;
  public events: HistoryEvent[];

  constructor(stepNumber: number, topologyState: Topology, events?: HistoryEvent[]) {
    this.stepNumber = stepNumber;
    this.topologyState = topologyState;
    this.events = events ?? [];
  }
}

