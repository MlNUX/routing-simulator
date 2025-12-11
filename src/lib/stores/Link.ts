import type { Node } from "./Node";

export class Link {
  public source: Node;
  public target: Node;
  public weight: number;
  public id: string;

  constructor(id: string, source: Node, target: Node, weight: number) {
    this.id = id;
    this.source = source;
    this.target = target;
    this.weight = weight;
  }

  public setWeight(newWeight: number): void {
    this.weight = newWeight;
  }

  public updateCost(cost: number): void {
    this.weight = cost;
  }
}
