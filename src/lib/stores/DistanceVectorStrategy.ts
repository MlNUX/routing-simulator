import { Router } from "./Router";
import type { Topology } from "./Topology";
import type { RoutingStrategy } from "./RoutingStrategy";

export class DistanceVectorStrategy implements RoutingStrategy {
  public poisoned: boolean;

  constructor(poisoned: boolean) {
    this.poisoned = poisoned;
  }

  public executeStep(router: Router, _topology: Topology): void {
    
  }
}
