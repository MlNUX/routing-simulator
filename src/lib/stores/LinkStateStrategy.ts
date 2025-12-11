import type { Router } from "./Router";
import type { Topology } from "./Topology";
import type { RoutingStrategy } from "./RoutingStrategy";

export class LinkStateStrategy implements RoutingStrategy {
  public executeStep(_router: Router, _topology: Topology): void {
    // unknown behaviour -> left empty on purpose
  }
}
