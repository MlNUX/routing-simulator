import { EventType } from "./EventType";

export class SimulationEvent {
  public step: number;
  public type: EventType;
  public targetId: string;
  public argument: number;

  constructor(step: number, type: EventType, targetId: string, argument: number) {
    this.step = step;
    this.type = type;
    this.targetId = targetId;
    this.argument = argument;
  }
}
