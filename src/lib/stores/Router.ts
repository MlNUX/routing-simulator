import { Node } from "./Node";
import { RoutingTable } from "./RoutingTable";
import type { RoutingStrategy } from "./RoutingStrategy";
import type { Packet } from "./Packet";

export class Router extends Node {
  public routingTable: RoutingTable;
  public strategy: RoutingStrategy | null = null;
  public optimal: boolean = false;

  constructor(id: string, name: string, xPos: number, yPos: number, routingTable?: RoutingTable) {
    super(id, name, xPos, yPos);
    this.routingTable = routingTable ?? new RoutingTable();
  }

  public setStrategy(s: RoutingStrategy): void {
    this.strategy = s;
  }

  public executeRoutingStep(): void {
    // unknown behaviour -> left empty on purpose
  }

  public receivePacket(_p: Packet): void {
    // unknown behaviour -> left empty on purpose
  }

  public sendPacket(_p: Packet, _target: string): void {
    // unknown behaviour -> left empty on purpose
  }
}
