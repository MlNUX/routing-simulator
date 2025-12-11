import { Node } from "./Node";
import type { Packet } from "./Packet";

export class EndDevice extends Node {
  constructor(id: string, name: string, xPos: number, yPos: number) {
    super(id, name, xPos, yPos);
  }

  public receivePacket(_p: Packet): void {
    // unknown behaviour -> left empty on purpose
  }

  public sendPacket(_p: Packet, _target: string): void {
    // unknown behaviour -> left empty on purpose
  }
}
