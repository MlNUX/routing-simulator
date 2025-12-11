import type { Router } from "./Router";
import type { Topology } from "./Topology";

export interface RoutingStrategy {
  executeStep(router: Router, topology: Topology): void;
}
