import type { Link } from "./Link";
import type { Packet } from "./Packet";

export abstract class Node {
  public id: string;
  public name: string;
  public xPos: number;
  public yPos: number;
  public neighbors: Link[] = [];

  constructor(id: string, name: string, xPos: number, yPos: number) {
    this.id = id;
    this.name = name;
    this.xPos = xPos;
    this.yPos = yPos;
  }

  public abstract receivePacket(p: Packet): void;

  public abstract sendPacket(p: Packet, target: string): void;
}
