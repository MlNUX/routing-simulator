import { Topology } from "./Topology";

export class SimulationState {
  public stepNumber: number;
  public topologyState: Topology;

  constructor(stepNumber: number, topologyState: Topology) {
    this.stepNumber = stepNumber;
    this.topologyState = topologyState;
  }
}
