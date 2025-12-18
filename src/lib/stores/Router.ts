import { Node } from "./Node";
import { RoutingTable } from "./RoutingTable";
import type { RoutingStrategy } from "./RoutingStrategy";
import type { Packet } from "./Packet";

export type LinkStateLink = {
  neighborId: string;
  cost: number;
};

export type LinkStateAdvertisement = {
  originId: string;
  seq: number;
  links: LinkStateLink[];
};

export type OptimalState = "pre" | "optimal" | "nonoptimal";

export class Router extends Node {
  public routingTable: RoutingTable;
  public strategy: RoutingStrategy | null = null;

  // UI state:
  // - "pre"  => grey border (step 0)
  // - "optimal" => green border
  // - "nonoptimal" => red border
  public optimalState: OptimalState = "pre";
  public optimal: boolean = false;

  // ---------------------------------------------------------------------------
  // Link-State stepwise internal state (persisted per timestep)
  // ---------------------------------------------------------------------------
  public lsSeq: number = 0;
  public lsSignature: string = "";
  public lsdb: Map<string, LinkStateAdvertisement> = new Map<string, LinkStateAdvertisement>();
  public lsOutbox: Map<string, LinkStateAdvertisement> = new Map<string, LinkStateAdvertisement>();

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

