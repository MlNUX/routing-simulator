export class RoutingEntry {
  public destinationId: string;
  public nextHopId: string;
  public cost: number;

  constructor(destinationId: string, nextHopId: string, cost: number) {
    this.destinationId = destinationId;
    this.nextHopId = nextHopId;
    this.cost = cost;
  }

  public update(nextHopId: string, cost: number): void {
    this.nextHopId = nextHopId;
    this.cost = cost;
  }
}
