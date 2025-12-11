import type { Node } from "./Node";
import type { Link } from "./Link";

export class Topology {
  public nodes: Map<string, Node>;
  public links: Link[];

  constructor(nodes?: Map<string, Node>, links?: Link[]) {
    this.nodes = nodes ?? new Map<string, Node>();
    this.links = links ?? [];
  }
}
