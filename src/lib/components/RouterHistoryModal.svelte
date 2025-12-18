<script lang="ts">
  import {
    simulation,
    routerHistoryModalOpen,
    routerHistorySelectedRouterIds,
    routerHistorySelectedSteps,
    setRouterHistoryRouters,
    setRouterHistorySteps,
    closeRouterHistory
  } from '$lib/stores/simulation';
  import { Router } from '$lib/stores/Router';

  $: controller = $simulation as any;
  $: isOpen = !!$routerHistoryModalOpen;

  $: topology =
    controller && typeof controller.getTopology === 'function'
      ? controller.getTopology()
      : controller?.topology;

  $: totalSteps =
    controller && typeof controller.getTotalSteps === 'function'
      ? Number(controller.getTotalSteps())
      : controller?.history
        ? Number(controller.history.length)
        : 1;

  function topologyNodesArray(topo: any): any[] {
    if (!topo || !topo.nodes) return [];
    const rawNodes = topo.nodes;
    if (Array.isArray(rawNodes)) return rawNodes;
    if (rawNodes instanceof Map) return Array.from(rawNodes.values());
    return [];
  }

  function getAllRouterIds(topo: any): string[] {
    const arr = topologyNodesArray(topo);
    const ids: string[] = [];

    for (const n of arr) {
      if (n instanceof Router) {
        ids.push(String(n.id));
      }
    }

    ids.sort((a, b) => a.localeCompare(b));
    return ids;
  }

  function sortedUniqueStrings(xs: string[]): string[] {
    const s = new Set<string>();
    for (const x of xs) {
      const v = String(x ?? '').trim();
      if (v.length > 0) s.add(v);
    }
    return Array.from(s.values()).sort((a, b) => a.localeCompare(b));
  }

  function sortedUniqueNumbers(xs: number[]): number[] {
    const s = new Set<number>();
    for (const x of xs) {
      const v = Number(x);
      if (Number.isFinite(v)) s.add(v);
    }
    return Array.from(s.values()).sort((a, b) => a - b);
  }

  $: allRouterIds = getAllRouterIds(topology);
  $: allSteps = Array.from({ length: Math.max(1, totalSteps) }, (_, i) => i);

  $: selectedRouters =
    Array.isArray($routerHistorySelectedRouterIds)
      ? $routerHistorySelectedRouterIds.map((x) => String(x))
      : [];

  $: selectedSteps =
    Array.isArray($routerHistorySelectedSteps)
      ? $routerHistorySelectedSteps.map((x) => Number(x)).filter((n) => Number.isFinite(n))
      : [];

  function toggleRouter(routerId: string) {
    const id = String(routerId);
    if (selectedRouters.includes(id)) {
      setRouterHistoryRouters(selectedRouters.filter((r) => r !== id));
    } else {
      setRouterHistoryRouters(sortedUniqueStrings([...selectedRouters, id]));
    }
  }

  function toggleStep(step: number) {
    const s = Number(step);
    if (selectedSteps.includes(s)) {
      setRouterHistorySteps(selectedSteps.filter((x) => x !== s));
    } else {
      setRouterHistorySteps(sortedUniqueNumbers([...selectedSteps, s]));
    }
  }

  function selectAllRouters() {
    setRouterHistoryRouters([...allRouterIds]);
  }

  function clearRouters() {
    setRouterHistoryRouters([]);
  }

  function selectAllSteps() {
    setRouterHistorySteps([...allSteps]);
  }

  function clearSteps() {
    setRouterHistorySteps([]);
  }

  function fmtCost(cost: number, destinationId: string, routerId: string): string {
    // Pedagogical: router always reaches itself with cost 0.
    if (String(destinationId) === String(routerId)) return '0';
    if (!Number.isFinite(cost)) return '∞';
    return String(cost);
  }

  function fmtHop(hop: string, destinationId: string, routerId: string): string {
    // Pedagogical: router is its own next hop for itself.
    if (String(destinationId) === String(routerId)) return String(routerId);
    const h = String(hop ?? '').trim();
    return h.length === 0 ? '—' : h;
  }

  function getTableAt(routerId: string, step: number): { destinationId: string; nextHopId: string; cost: number }[] {
    const s = Number(step);
    const rid = String(routerId);

    const state = controller?.history?.[s];
    const topo = state?.topologyState;
    const node = topo?.nodes?.get ? topo.nodes.get(rid) : null;

    if (!(node instanceof Router)) return [];

    const entries = node.routingTable?.entries;
    if (!entries) return [];

    const arr = Array.from(entries.values()).map((e: any) => {
      const dest = String(e.destinationId ?? '');
      const isSelf = dest === rid;

      return {
        destinationId: dest,
        nextHopId: isSelf ? rid : String(e.nextHopId ?? ''),
        cost: isSelf ? 0 : Number(e.cost)
      };
    });

    arr.sort((a, b) => {
      if (a.destinationId === rid && b.destinationId !== rid) return -1;
      if (b.destinationId === rid && a.destinationId !== rid) return 1;
      return a.destinationId.localeCompare(b.destinationId);
    });

    return arr;
  }

  function buildDiffMap(prev: any[]): Map<string, { hop: string; cost: number }> {
    const m = new Map<string, { hop: string; cost: number }>();
    for (const e of prev) {
      m.set(String(e.destinationId), { hop: String(e.nextHopId ?? ''), cost: Number(e.cost) });
    }
    return m;
  }

  function isRowChanged(prevMap: Map<string, any>, e: any): boolean {
    const p = prevMap.get(String(e.destinationId));
    if (!p) return true;
    const hopChanged = String(p.hop ?? '') !== String(e.nextHopId ?? '');
    const costChanged = Number(p.cost) !== Number(e.cost);
    return hopChanged || costChanged;
  }

  function isCellChanged(prevMap: Map<string, any>, e: any, key: 'hop' | 'cost'): boolean {
    const p = prevMap.get(String(e.destinationId));
    if (!p) return true;
    if (key === 'hop') return String(p.hop ?? '') !== String(e.nextHopId ?? '');
    return Number(p.cost) !== Number(e.cost);
  }

  function close() {
    closeRouterHistory();
  }
</script>

{#if isOpen}
  <div class="modal-backdrop" on:click={close} />

  <div class="modal" role="dialog" aria-modal="true" aria-label="Routing table history">
    <div class="modal-header">
      <div class="modal-title">Routing table history</div>

      <div class="modal-actions">
        <div class="bulk">
          <span class="bulk-label">Routers</span>
          <button class="btn" on:click={selectAllRouters} title="Select all routers">All</button>
          <button class="btn" on:click={clearRouters} title="Clear router selection">Clear</button>
        </div>

        <div class="bulk">
          <span class="bulk-label">Steps</span>
          <button class="btn" on:click={selectAllSteps} title="Select all steps">All</button>
          <button class="btn" on:click={clearSteps} title="Clear step selection">Clear</button>
        </div>

        <button class="btn btn--close" on:click={close} title="Close">✖</button>
      </div>
    </div>

    <div class="modal-body">
      <div class="selectors">
        <div class="selectors-col">
          <div class="selectors-head">
            <div class="selectors-title">Routers</div>
          </div>

          <div class="selectors-list">
            {#if allRouterIds.length === 0}
              <div class="empty">No routers in topology.</div>
            {:else}
              {#each allRouterIds as rid (rid)}
                <label class="check-item">
                  <input
                    type="checkbox"
                    checked={selectedRouters.includes(rid)}
                    on:change={() => toggleRouter(rid)}
                  />
                  <span class="mono">{rid}</span>
                </label>
              {/each}
            {/if}
          </div>
        </div>

        <div class="selectors-col">
          <div class="selectors-head">
            <div class="selectors-title">Steps</div>
          </div>

          <div class="selectors-list">
            {#if allSteps.length === 0}
              <div class="empty">No steps.</div>
            {:else}
              {#each allSteps as s (s)}
                <label class="check-item">
                  <input
                    type="checkbox"
                    checked={selectedSteps.includes(s)}
                    on:change={() => toggleStep(s)}
                  />
                  <span class="mono">#{s}</span>
                </label>
              {/each}
            {/if}
          </div>
        </div>
      </div>

      <div class="tables">
        {#if selectedRouters.length === 0 || selectedSteps.length === 0}
          <div class="empty big">
            Select one or more routers and steps to display routing tables.
          </div>
        {:else}
          {#each selectedRouters as rid (rid)}
            <div class="router-block">
              <div class="router-block-title">Router {rid}</div>

              {#each selectedSteps as step (step)}
                {@const table = getTableAt(rid, step)}
                {@const prevStep = step > 0 ? step - 1 : null}
                {@const prevTable = prevStep === null ? [] : getTableAt(rid, prevStep)}
                {@const prevMap = buildDiffMap(prevTable)}

                <div class="table-block">
                  <div class="table-block-title">Step #{step}</div>

                  {#if table.length === 0}
                    <div class="empty">No routing table data for this selection.</div>
                  {:else}
                    <table class="rt-table">
                      <thead>
                        <tr>
                          <th>Destination</th>
                          <th>Next hop</th>
                          <th>Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {#each table as e (e.destinationId)}
                          <tr class={prevStep !== null && isRowChanged(prevMap, e) ? 'row-changed' : ''}>
                            <td class="mono">{e.destinationId}</td>
                            <td
                              class={`mono ${
                                prevStep !== null && isCellChanged(prevMap, e, 'hop') ? 'cell-changed' : ''
                              }`}
                            >
                              {fmtHop(e.nextHopId, e.destinationId, rid)}
                            </td>
                            <td class={prevStep !== null && isCellChanged(prevMap, e, 'cost') ? 'cell-changed' : ''}>
                              {fmtCost(e.cost, e.destinationId, rid)}
                            </td>
                          </tr>
                        {/each}
                      </tbody>
                    </table>

                    {#if prevStep !== null}
                      <div class="diff-hint">
                        Highlighting shows changes vs the previous timestep (#{prevStep}), even if that step is not selected.
                      </div>
                    {/if}
                  {/if}
                </div>
              {/each}
            </div>
          {/each}
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.45);
    z-index: 200;
  }

  .modal {
    position: fixed;
    left: 50%;
    top: 70px;
    transform: translateX(-50%);
    width: min(1080px, calc(100vw - 48px));
    max-height: calc(100vh - 120px);
    overflow: hidden;
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.98);
    box-shadow: 0 14px 28px rgba(15, 23, 42, 0.25);
    z-index: 210;
    display: flex;
    flex-direction: column;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 14px;
    border-bottom: 1px solid rgba(15, 23, 42, 0.12);
  }

  .modal-title {
    font-size: 14px;
    font-weight: 900;
    color: #0f172a;
  }

  .modal-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .bulk {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 6px;
    border-radius: 12px;
    background: rgba(15, 23, 42, 0.04);
    border: 1px solid rgba(15, 23, 42, 0.10);
  }

  .bulk-label {
    font-size: 11px;
    font-weight: 800;
    color: #0f172a;
    opacity: 0.9;
    margin-right: 2px;
  }

  .btn {
    padding: 6px 10px;
    border-radius: 12px;
    border: 1px solid rgba(15, 23, 42, 0.18);
    background: rgba(255, 255, 255, 0.92);
    cursor: pointer;
    font-size: 12px;
    white-space: nowrap;
  }

  .btn:hover {
    background: rgba(255, 255, 255, 0.98);
  }

  .btn--close {
    font-weight: 900;
  }

  .modal-body {
    display: grid;
    grid-template-columns: 320px 1fr;
    min-height: 0;
    flex: 1;
  }

  .selectors {
    border-right: 1px solid rgba(15, 23, 42, 0.12);
    display: grid;
    grid-template-columns: 1fr 1fr;
    min-height: 0;
  }

  .selectors-col {
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .selectors-col + .selectors-col {
    border-left: 1px solid rgba(15, 23, 42, 0.10);
  }

  .selectors-head {
    padding: 12px 12px 8px 12px;
    border-bottom: 1px solid rgba(15, 23, 42, 0.10);
  }

  .selectors-title {
    font-size: 12px;
    font-weight: 900;
    color: #0f172a;
  }

  .selectors-list {
    padding: 10px 12px;
    overflow: auto;
    display: grid;
    gap: 8px;
  }

  .check-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: #0f172a;
    user-select: none;
  }

  .tables {
    padding: 12px 14px;
    overflow: auto;
  }

  .router-block + .router-block {
    margin-top: 14px;
    padding-top: 14px;
    border-top: 1px solid rgba(15, 23, 42, 0.10);
  }

  .router-block-title {
    font-size: 12px;
    font-weight: 900;
    color: #0f172a;
    margin-bottom: 8px;
  }

  .table-block + .table-block {
    margin-top: 14px;
    padding-top: 14px;
    border-top: 1px solid rgba(15, 23, 42, 0.08);
  }

  .table-block-title {
    font-size: 12px;
    font-weight: 900;
    color: #0f172a;
    margin-bottom: 8px;
  }

  .rt-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }

  .rt-table th,
  .rt-table td {
    padding: 6px 6px;
    text-align: left;
    vertical-align: top;
    border-bottom: 1px solid rgba(15, 23, 42, 0.08);
  }

  .mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
      'Liberation Mono', 'Courier New', monospace;
  }

  .row-changed {
    background: rgba(245, 158, 11, 0.08);
  }

  .cell-changed {
    background: rgba(34, 197, 94, 0.12);
    border-radius: 6px;
  }

  .diff-hint {
    margin-top: 6px;
    font-size: 11px;
    opacity: 0.75;
    color: #0f172a;
  }

  .empty {
    padding: 10px 12px;
    border-radius: 14px;
    background: rgba(15, 23, 42, 0.05);
    border: 1px solid rgba(15, 23, 42, 0.08);
    color: #0f172a;
    font-size: 12px;
  }

  .empty.big {
    font-size: 13px;
    font-weight: 700;
  }
</style>

