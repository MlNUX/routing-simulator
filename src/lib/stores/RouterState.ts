import { RoutingEntry } from "./RoutingEntry";

export class RouterState {
  public entries: Map<string, RoutingEntry[]>;

  constructor() {
    this.entries = new Map<string, RoutingEntry[]>();
  }
}
