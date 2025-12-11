import { RoutingEntry } from "./RoutingEntry";
import type { Router } from "./Router";
import type { Topology } from "./Topology";
import type { RoutingStrategy } from "./RoutingStrategy";

export class LinkStateStrategy implements RoutingStrategy {
  public executeStep(router: Router, topology: Topology): void {
    const nodes = Array.from(topology.nodes.values());

    // Dijkstra: Distanz- und Vorgänger-Map
    const dist = new Map<string, number>();
    const prev = new Map<string, string | null>();

    for (const node of nodes) {
      dist.set(node.id, Number.POSITIVE_INFINITY);
      prev.set(node.id, null);
    }
    dist.set(router.id, 0);

    const visited = new Set<string>();

    while (visited.size < nodes.length) {
      // Knoten mit minimaler Distanz wählen
      let currentId: string | null = null;
      let currentDist = Number.POSITIVE_INFINITY;

      for (const [id, d] of dist) {
        if (!visited.has(id) && d < currentDist) {
          currentDist = d;
          currentId = id;
        }
      }

      if (currentId === null || currentDist === Number.POSITIVE_INFINITY) {
        break;
      }

      visited.add(currentId);

      const currentNode = topology.nodes.get(currentId);
      if (!currentNode) continue;

      // Nachbarn über die Link-Liste des Knotens
      for (const link of currentNode.neighbors) {
        const neighbor =
          link.source === currentNode ? link.target : link.source;
        const neighborId = neighbor.id;

        if (visited.has(neighborId)) {
          continue;
        }

        const alt =
          (dist.get(currentId) ?? Number.POSITIVE_INFINITY) + link.weight;

        if (alt < (dist.get(neighborId) ?? Number.POSITIVE_INFINITY)) {
          dist.set(neighborId, alt);
          prev.set(neighborId, currentId);
        }
      }
    }

    // Routing-Tabelle des Routers neu aufbauen
    router.routingTable.entries.clear();

    for (const node of nodes) {
      const destId = node.id;
      if (destId === router.id) {
        continue;
      }

      const cost = dist.get(destId);
      if (cost === undefined || cost === Number.POSITIVE_INFINITY) {
        continue; // nicht erreichbar
      }

      const nextHopId = this.getFirstHopOnPath(router.id, destId, prev);
      if (!nextHopId) {
        continue;
      }

      router.routingTable.entries.set(
        destId,
        new RoutingEntry(destId, nextHopId, cost)
      );
    }

    // Optional: Eintrag für sich selbst (Kosten 0)
    router.routingTable.entries.set(
      router.id,
      new RoutingEntry(router.id, router.id, 0)
    );
  }

  private getFirstHopOnPath(
    sourceId: string,
    destId: string,
    prev: Map<string, string | null>
  ): string | null {
    let currentId: string | null = destId;
    let parentId = prev.get(currentId) ?? null;

    if (parentId === null) {
      return null;
    }

    while (parentId !== null && parentId !== sourceId) {
      currentId = parentId;
      parentId = prev.get(currentId) ?? null;
    }

    if (parentId === sourceId && currentId !== null) {
      return currentId;
    }

    return null;
  }
}
