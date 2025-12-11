import { RoutingEntry } from "./RoutingEntry";
import { Router } from "./Router";
import type { Topology } from "./Topology";
import type { RoutingStrategy } from "./RoutingStrategy";

export class DistanceVectorStrategy implements RoutingStrategy {
  public poisoned: boolean;

  constructor(poisoned: boolean) {
    this.poisoned = poisoned;
  }

  public executeStep(router: Router, _topology: Topology): void {
    const INF = Number.POSITIVE_INFINITY;
    const entries = router.routingTable.entries;
    const selfId = router.id;

    // Basis: Eintrag für sich selbst (Kosten 0)
    let selfEntry = entries.get(selfId);
    if (!selfEntry) {
      selfEntry = new RoutingEntry(selfId, selfId, 0);
      entries.set(selfId, selfEntry);
    } else {
      selfEntry.cost = 0;
      selfEntry.nextHopId = selfId;
    }

    // 1. Direktverbindungen: Einträge zu direkten Nachbarn (Router + Endgeräte)
    for (const link of router.neighbors) {
      const neighbor =
        link.source === router ? link.target : link.source;
      const neighborId = neighbor.id;
      const directCost = link.weight;

      const existing = entries.get(neighborId);
      if (!existing || directCost < existing.cost) {
        entries.set(
          neighborId,
          new RoutingEntry(neighborId, neighborId, directCost)
        );
      }
    }

    // 2. Distance-Vector-Update: Tabellen von Router-Nachbarn einbeziehen
    let updated = false;

    for (const link of router.neighbors) {
      const neighborNode =
        link.source === router ? link.target : link.source;

      // Nur Router sind DV-Nachbarn, Endgeräte nicht
      if (!(neighborNode instanceof Router)) {
        continue;
      }

      const neighborRouter = neighborNode as Router;
      const neighborEntries = neighborRouter.routingTable.entries;
      const linkCost = link.weight;

      for (const [destId, neighborEntry] of neighborEntries) {
        // Das Ziel sind wir selbst? -> ignorieren
        if (destId === selfId) {
          continue;
        }

        // Poisoned Reverse: Nachbar sagt "über mich zu dir"
        if (this.poisoned && neighborEntry.nextHopId === selfId) {
          continue;
        }

        const viaCost = linkCost + (neighborEntry.cost ?? INF);
        const current = entries.get(destId);

        if (!current) {
          entries.set(
            destId,
            new RoutingEntry(destId, neighborRouter.id, viaCost)
          );
          updated = true;
        } else if (viaCost < current.cost) {
          current.cost = viaCost;
          current.nextHopId = neighborRouter.id;
          updated = true;
        }
      }
    }

    // Das Flag `updated` könnte später im SimulationController genutzt werden,
    // um Konvergenz zu erkennen. Hier wird es nur "verbraucht", um TS ruhigzustellen.
    void updated;
  }
}
