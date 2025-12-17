import type { Router } from "./Router";
import type { Topology } from "./Topology";
import type { RoutingStrategy } from "./RoutingStrategy";

export class LinkStateStrategy implements RoutingStrategy {
  public executeStep(router: Router, topology: Topology): void {
    
  }
}
