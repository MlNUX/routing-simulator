import { SimulationController } from "./SimulationController";
import { Topology } from "./Topology";
import { Router } from "./Router";
import { EndDevice } from "./EndDevice";
import { Link } from "./Link";

/**
 * Erzeugt einen festen Beispiel-Network-Graphen:
 *
 *   E1 -- R1 ---- R2 -- E2
 *          |      |
 *         R3 ---- R4
 *
 * Koordinaten sind so gewählt, dass man im Frontend ein schönes Quadrat sieht.
 */
export function createStaticSimulationController(): SimulationController {
  const topology = new Topology();

  // --- Router ---------------------------------------------------------------
  const r1 = new Router("R1", "Router 1", 100, 100);
  const r2 = new Router("R2", "Router 2", 300, 100);
  const r3 = new Router("R3", "Router 3", 100, 300);
  const r4 = new Router("R4", "Router 4", 300, 300);

  topology.nodes.set(r1.id, r1);
  topology.nodes.set(r2.id, r2);
  topology.nodes.set(r3.id, r3);
  topology.nodes.set(r4.id, r4);

  // --- Endgeräte ------------------------------------------------------------
  const e1 = new EndDevice("E1", "Endgerät 1", 20, 100);
  const e2 = new EndDevice("E2", "Endgerät 2", 380, 100);

  topology.nodes.set(e1.id, e1);
  topology.nodes.set(e2.id, e2);

  // --- Links ---------------------------------------------------------------

  const links: Link[] = [];

  function connect(id: string, a: Router | EndDevice, b: Router | EndDevice, weight: number): void {
    const link = new Link(id, a, b, weight);
    links.push(link);
    a.neighbors.push(link);
    b.neighbors.push(link);
  }

  // Quadrat der Router
  connect("L1", r1, r2, 1);
  connect("L2", r2, r4, 1);
  connect("L3", r4, r3, 1);
  connect("L4", r3, r1, 1);

  // Diagonale (alternative Route)
  connect("L5", r1, r4, 2);

  // Endgeräte an R1/R2
  connect("L6", e1, r1, 1);
  connect("L7", e2, r2, 1);

  topology.links = links;

  return new SimulationController(topology);
}
