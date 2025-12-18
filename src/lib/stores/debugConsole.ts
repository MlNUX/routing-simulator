import { get } from 'svelte/store';

import {
  simulation,
  play,
  jumpToStep,
  addNode,
  deleteNode,
  updateNodeName,
  updateNodePosition,
  updateNodePositions,
  addLink,
  deleteLink,
  deleteLinkById,
  updateLinkWeight,
  clearNetwork,
  setAlgorithm,
  resetToInitialAndSetAlgorithm,
  exportJson
} from './simulation';

import { RoutingStrategieType, type AlgorithmType } from './RoutingStrategieType';
import { Router } from './Router';
import type { Topology } from './Topology';

type DebugResult = {
  ok: boolean;
  output: string;
};

type JsonCmd = {
  cmd: string;
  [k: string]: unknown;
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (typeof v !== 'object' || v === null) return false;
  return Object.prototype.toString.call(v) === '[object Object]';
}

function nowStamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function fmtCost(cost: number): string {
  return Number.isFinite(cost) ? String(cost) : 'INF';
}

function fmtHop(hop: unknown): string {
  const h = String(hop ?? '').trim();
  return h.length === 0 ? '-' : h;
}

function readController(): any {
  return get(simulation) as any;
}

function readAlgorithm(ctrl: any): AlgorithmType {
  const raw =
    ctrl && typeof ctrl.getAlgorithm === 'function'
      ? String(ctrl.getAlgorithm())
      : String(ctrl?.algorithm ?? RoutingStrategieType.LINK_STATE);

  if (
    raw === RoutingStrategieType.LINK_STATE ||
    raw === RoutingStrategieType.DISTANCE_VECTOR ||
    raw === RoutingStrategieType.DISTANCE_VECTOR_POISONED
  ) {
    return raw as AlgorithmType;
  }

  return RoutingStrategieType.LINK_STATE;
}

function readTotalSteps(ctrl: any): number {
  if (ctrl && typeof ctrl.getTotalSteps === 'function') {
    return Number(ctrl.getTotalSteps());
  }
  const v = Number(ctrl?.totalSteps ?? 1);
  return Number.isFinite(v) && v > 0 ? v : 1;
}

function readCurrentStep(ctrl: any): number {
  const v = Number(ctrl?.currentStepIndex ?? 0);
  return Number.isFinite(v) && v >= 0 ? v : 0;
}

function readTopology(ctrl: any): Topology | null {
  if (ctrl && typeof ctrl.getTopology === 'function') {
    return ctrl.getTopology() as Topology;
  }
  return (ctrl?.topology as Topology) ?? null;
}

function sortIds(xs: string[]): string[] {
  return [...xs].sort((a, b) => a.localeCompare(b));
}

function getAllRouterIds(topo: any): string[] {
  if (!topo?.nodes) return [];
  if (!(topo.nodes instanceof Map)) return [];

  const ids: string[] = [];
  for (const n of topo.nodes.values()) {
    if (n instanceof Router) ids.push(String(n.id));
  }
  return sortIds(ids);
}

function printTopologyAscii(): string {
  const ctrl = readController();
  const topo = readTopology(ctrl);
  if (!topo) return 'No topology loaded.';

  const algo = readAlgorithm(ctrl);
  const totalSteps = readTotalSteps(ctrl);
  const cur = readCurrentStep(ctrl);

  const nodeLines: string[] = [];
  const linkLines: string[] = [];

  const nodesMap = topo.nodes instanceof Map ? topo.nodes : new Map<string, any>();
  const linksArr = Array.isArray((topo as any).links) ? (topo as any).links : [];

  const nodeIds = sortIds(Array.from(nodesMap.keys()).map((k) => String(k)));

  for (const id of nodeIds) {
    const n: any = nodesMap.get(id);
    const x = Number(n?.xPos ?? 0);
    const y = Number(n?.yPos ?? 0);
    const name = String(n?.name ?? id);
    const kind = n instanceof Router ? 'router' : 'node';
    nodeLines.push(`- ${id} (${kind}) name="${name}" pos=(${x},${y})`);
  }

  const linkIds = sortIds(linksArr.map((l: any) => String(l?.id ?? '')));
  for (const lid of linkIds) {
    const l = linksArr.find((x: any) => String(x?.id ?? '') === lid);
    if (!l) continue;
    const s = String(l?.source?.id ?? '');
    const t = String(l?.target?.id ?? '');
    const w = Number(l?.weight ?? 0);
    linkLines.push(`- ${lid} ${s} <-> ${t} weight=${w}`);
  }

  const parts: string[] = [];
  parts.push(`step=${cur} totalSteps=${totalSteps} algorithm=${algo}`);
  parts.push(`nodes=${nodeLines.length} links=${linkLines.length}`);
  parts.push('');
  parts.push('NODES');
  parts.push(nodeLines.length ? nodeLines.join('\n') : '(none)');
  parts.push('');
  parts.push('LINKS');
  parts.push(linkLines.length ? linkLines.join('\n') : '(none)');

  return parts.join('\n');
}

function printRoutingTablesAscii(): string {
  const ctrl = readController();
  const topo = readTopology(ctrl);
  if (!topo) return 'No topology loaded.';

  const ids = getAllRouterIds(topo);
  if (ids.length === 0) return 'No routers in topology.';

  const lines: string[] = [];
  lines.push(`Routing tables at step=${readCurrentStep(ctrl)} algorithm=${readAlgorithm(ctrl)}`);
  lines.push('');

  for (const rid of ids) {
    const r = topo.nodes.get(rid);
    if (!(r instanceof Router)) continue;

    lines.push(`ROUTER ${rid}`);
    const entries = r.routingTable?.entries;
    if (!(entries instanceof Map)) {
      lines.push('(no routing table)');
      lines.push('');
      continue;
    }

    const rows = Array.from(entries.values()).map((e: any) => ({
      dest: String(e?.destinationId ?? ''),
      hop: String(e?.nextHopId ?? ''),
      cost: Number(e?.cost)
    }));
    rows.sort((a, b) => a.dest.localeCompare(b.dest));

    for (const row of rows) {
      lines.push(`- dest=${row.dest} nextHop=${fmtHop(row.hop)} cost=${fmtCost(row.cost)}`);
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

function parseAlgorithm(v: unknown): AlgorithmType | null {
  const s = String(v ?? '').trim();
  if (s === RoutingStrategieType.LINK_STATE) return RoutingStrategieType.LINK_STATE;
  if (s === RoutingStrategieType.DISTANCE_VECTOR) return RoutingStrategieType.DISTANCE_VECTOR;
  if (s === RoutingStrategieType.DISTANCE_VECTOR_POISONED) return RoutingStrategieType.DISTANCE_VECTOR_POISONED;
  return null;
}

function helpText(): string {
  return [
    'Debug console commands (JSON, one per run)',
    '',
    '{ "cmd": "status" }',
    '{ "cmd": "printTopology" }',
    '{ "cmd": "printTables" }',
    '{ "cmd": "exportJson" }',
    '',
    '{ "cmd": "play" }',
    '{ "cmd": "jump", "step": 3 }',
    '',
    '{ "cmd": "addRouter", "x": 180, "y": 140 }',
    '{ "cmd": "deleteRouter", "id": "R2" }',
    '{ "cmd": "renameRouter", "id": "R1", "name": "Router 1" }',
    '{ "cmd": "moveRouter", "id": "R1", "x": 200, "y": 120 }',
    '{ "cmd": "moveRouters", "updates": [ { "id": "R1", "x": 200, "y": 120 }, { "id": "R2", "x": 300, "y": 120 } ] }',
    '',
    '{ "cmd": "addLink", "sourceId": "R1", "targetId": "R2", "weight": 2 }',
    '{ "cmd": "deleteLinkById", "id": "L3" }',
    '{ "cmd": "deleteLink", "sourceId": "R1", "targetId": "R2" }',
    '{ "cmd": "setWeight", "id": "L1", "weight": 7 }',
    '',
    '{ "cmd": "clearNetwork" }',
    '',
    '{ "cmd": "setAlgorithm", "algorithm": "LINK_STATE" }',
    '{ "cmd": "setAlgorithm", "algorithm": "DISTANCE_VECTOR" }',
    '{ "cmd": "setAlgorithm", "algorithm": "DISTANCE_VECTOR_POISONED" }'
  ].join('\n');
}

function statusText(): string {
  const ctrl = readController();
  return [
    `step=${readCurrentStep(ctrl)}`,
    `totalSteps=${readTotalSteps(ctrl)}`,
    `algorithm=${readAlgorithm(ctrl)}`
  ].join(' ');
}

/**
 * Executes exactly one JSON command (the debug modal runs one-at-a-time).
 * Uses the same store functions the UI uses (no direct controller mutation).
 */
export function debugRunCommand(raw: string): DebugResult {
  const trimmed = String(raw ?? '').trim();
  if (trimmed.length === 0) {
    return { ok: false, output: 'Empty input.' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, output: 'Invalid JSON.' };
  }

  if (!isPlainObject(parsed)) {
    return { ok: false, output: 'Command must be a JSON object.' };
  }

  const cmdRaw = (parsed as JsonCmd).cmd;
  const cmd = String(cmdRaw ?? '').trim();
  if (cmd.length === 0) {
    return { ok: false, output: 'Missing "cmd".' };
  }

  try {
    // ---- meta / print ----
    if (cmd === 'help') {
      return { ok: true, output: helpText() };
    }

    if (cmd === 'status') {
      return { ok: true, output: statusText() };
    }

    if (cmd === 'printTopology') {
      return { ok: true, output: printTopologyAscii() };
    }

    if (cmd === 'printTables') {
      return { ok: true, output: printRoutingTablesAscii() };
    }

    if (cmd === 'exportJson') {
      return { ok: true, output: exportJson() };
    }

    // ---- timeline ----
    if (cmd === 'play') {
      play();
      return { ok: true, output: `OK play -> ${statusText()}` };
    }

    if (cmd === 'jump') {
      const step = Number((parsed as any).step);
      if (!Number.isFinite(step) || step < 0) {
        return { ok: false, output: 'jump: "step" must be a number >= 0.' };
      }
      jumpToStep(Math.floor(step));
      return { ok: true, output: `OK jump -> ${statusText()}` };
    }

    // ---- topology edits (these already truncate future like normal editing) ----
    if (cmd === 'addRouter') {
      const x = Number((parsed as any).x);
      const y = Number((parsed as any).y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return { ok: false, output: 'addRouter: "x" and "y" must be numbers.' };
      }
      addNode(x, y);
      return { ok: true, output: `OK addRouter (${x},${y})\n\n${printTopologyAscii()}` };
    }

    if (cmd === 'deleteRouter') {
      const id = String((parsed as any).id ?? '').trim();
      if (id.length === 0) return { ok: false, output: 'deleteRouter: "id" required.' };
      deleteNode(id);
      return { ok: true, output: `OK deleteRouter ${id}\n\n${printTopologyAscii()}` };
    }

    if (cmd === 'renameRouter') {
      const id = String((parsed as any).id ?? '').trim();
      const name = String((parsed as any).name ?? '').trim();
      if (id.length === 0) return { ok: false, output: 'renameRouter: "id" required.' };
      if (name.length === 0) return { ok: false, output: 'renameRouter: "name" required.' };
      updateNodeName(id, name);
      return { ok: true, output: `OK renameRouter ${id} -> "${name}"` };
    }

    if (cmd === 'moveRouter') {
      const id = String((parsed as any).id ?? '').trim();
      const x = Number((parsed as any).x);
      const y = Number((parsed as any).y);
      if (id.length === 0) return { ok: false, output: 'moveRouter: "id" required.' };
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return { ok: false, output: 'moveRouter: "x" and "y" must be numbers.' };
      }
      updateNodePosition(id, x, y);
      return { ok: true, output: `OK moveRouter ${id} -> (${x},${y})` };
    }

    if (cmd === 'moveRouters') {
      const updatesRaw = (parsed as any).updates;
      if (!Array.isArray(updatesRaw) || updatesRaw.length === 0) {
        return { ok: false, output: 'moveRouters: "updates" must be a non-empty array.' };
      }

      const updates: { id: string; xPos: number; yPos: number }[] = [];
      for (const u of updatesRaw) {
        const id = String(u?.id ?? '').trim();
        const xPos = Number(u?.x);
        const yPos = Number(u?.y);
        if (id.length === 0 || !Number.isFinite(xPos) || !Number.isFinite(yPos)) {
          return {
            ok: false,
            output: 'moveRouters: each update needs { "id": "...", "x": number, "y": number }.'
          };
        }
        updates.push({ id, xPos, yPos });
      }

      updateNodePositions(updates);
      return { ok: true, output: `OK moveRouters count=${updates.length}` };
    }

    if (cmd === 'addLink') {
      const sourceId = String((parsed as any).sourceId ?? '').trim();
      const targetId = String((parsed as any).targetId ?? '').trim();
      const weight = Number((parsed as any).weight ?? 1);

      if (sourceId.length === 0 || targetId.length === 0) {
        return { ok: false, output: 'addLink: "sourceId" and "targetId" required.' };
      }
      if (!Number.isFinite(weight) || weight <= 0) {
        return { ok: false, output: 'addLink: "weight" must be a number > 0.' };
      }

      addLink(sourceId, targetId, weight);
      return { ok: true, output: `OK addLink ${sourceId}<->${targetId} w=${weight}\n\n${printTopologyAscii()}` };
    }

    if (cmd === 'deleteLinkById') {
      const id = String((parsed as any).id ?? '').trim();
      if (id.length === 0) return { ok: false, output: 'deleteLinkById: "id" required.' };
      deleteLinkById(id);
      return { ok: true, output: `OK deleteLinkById ${id}\n\n${printTopologyAscii()}` };
    }

    if (cmd === 'deleteLink') {
      const sourceId = String((parsed as any).sourceId ?? '').trim();
      const targetId = String((parsed as any).targetId ?? '').trim();
      if (sourceId.length === 0 || targetId.length === 0) {
        return { ok: false, output: 'deleteLink: "sourceId" and "targetId" required.' };
      }
      deleteLink(sourceId, targetId);
      return { ok: true, output: `OK deleteLink ${sourceId}<->${targetId}\n\n${printTopologyAscii()}` };
    }

    if (cmd === 'setWeight') {
      const id = String((parsed as any).id ?? '').trim();
      const weight = Number((parsed as any).weight);
      if (id.length === 0) return { ok: false, output: 'setWeight: "id" required.' };
      if (!Number.isFinite(weight) || weight <= 0) {
        return { ok: false, output: 'setWeight: "weight" must be a number > 0.' };
      }
      updateLinkWeight(id, weight);
      return { ok: true, output: `OK setWeight ${id} -> ${weight}` };
    }

    if (cmd === 'clearNetwork') {
      clearNetwork();
      return { ok: true, output: `OK clearNetwork\n\n${printTopologyAscii()}` };
    }

    // ---- algorithm (mimic toolbar behavior: if steps>1, confirm then reset) ----
    if (cmd === 'setAlgorithm') {
      const algo = parseAlgorithm((parsed as any).algorithm);
      if (!algo) {
        return {
          ok: false,
          output:
            'setAlgorithm: "algorithm" must be "LINK_STATE" | "DISTANCE_VECTOR" | "DISTANCE_VECTOR_POISONED".'
        };
      }

      const ctrl = readController();
      const steps = readTotalSteps(ctrl);

      if (typeof window !== 'undefined' && steps > 1) {
        const ok = window.confirm(
          'Changing the routing algorithm will reset the simulation to the original topology and delete all steps and edits. Continue?'
        );
        if (!ok) {
          return { ok: true, output: 'Cancelled.' };
        }
        resetToInitialAndSetAlgorithm(algo);
        return { ok: true, output: `OK setAlgorithm(reset) -> ${statusText()}` };
      }

      setAlgorithm(algo);
      return { ok: true, output: `OK setAlgorithm -> ${statusText()}` };
    }

    return { ok: false, output: `Unknown cmd "${cmd}". Use { "cmd": "help" }.` };
  } catch (e) {
    return { ok: false, output: `Command failed: ${String((e as any)?.message ?? e)}` };
  }
}

export function debugFormatLogEntry(input: string, result: DebugResult): string {
  const stamp = nowStamp();
  const header = result.ok ? `[${stamp}] OK` : `[${stamp}] ERROR`;
  const cleaned = String(input ?? '').trim();
  const out = String(result.output ?? '').trimEnd();
  return `${header}\n> ${cleaned}\n\n${out}\n`;
}

