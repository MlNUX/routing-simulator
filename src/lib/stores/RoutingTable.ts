import { RoutingEntry } from "./RoutingEntry";

export class RoutingTable {
  public entries: Map<string, RoutingEntry>;

  constructor() {
    this.entries = new Map<string, RoutingEntry>();
  }

  public addEntry(destinationId: string, nextHop: string, cost: number): void {
    const entry = new RoutingEntry(destinationId, nextHop, cost);
    this.entries.set(destinationId, entry);
  }

  public deleteEntry(destinationId: string): void {
    this.entries.delete(destinationId);
  }
}
