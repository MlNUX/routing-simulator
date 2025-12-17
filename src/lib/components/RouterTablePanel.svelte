<script lang="ts">
  import {
    simulation,
    selectedRouterId,
    selectedEdgeId,
    setSelectedEdge,
    setSelectedRouter,
    updateLinkWeight,
    updateNodeName,
    upsertRoutingEntry,
    deleteRoutingEntry
  } from '$lib/stores/simulation';

  type RoutingEntryView = {
    destinationId: string;
    nextHopId: string;
    cost: number;
  };

  type NeighborView = {
    linkId: string;
    otherId: string;
    weight: number;
  };

  $: controller = $simulation as any;
  $: isRunning = !!controller?.running;

  $: topology =
    typeof controller.getTopology === 'function'
      ? controller.getTopology()
      : controller.topology;

  $: selectedId = $selectedRouterId;
  $: edgeId = $selectedEdgeId;

  function getRouterById(topo: any, id: string | null): any | null {
    if (!topo || !id) return null;

    const rawNodes = topo.nodes;
    const nodesArray = Array.isArray(rawNodes)
      ? rawNodes
      : rawNodes instanceof Map
        ? Array.from(rawNodes.values())
        : [];

    return nodesArray.find((n: any) => String(n.id) === String(id)) ?? null;
  }

  function getLinkById(topo: any, id: string | null): any | null {
    if (!topo || !id) return null;
    const links: any[] = Array.isArray(topo.links) ? topo.links : [];
    return links.find((l) => String(l.id) === String(id)) ?? null;
  }

  function extractRoutingEntries(router: any): RoutingEntryView[] {
    if (!router?.routingTable?.entries) return [];

    const entries = router.routingTable.entries;
    const rawEntries: any[] =
      entries instanceof Map ? Array.from(entries.values()) : Object.values(entries);

    const mapped = rawEntries.map((e: any): RoutingEntryView => ({
      destinationId: String(e.destinationId ?? ''),
      nextHopId: String(e.nextHopId ?? ''),
      cost: Number(e.cost ?? 0)
    }));

    mapped.sort((a, b) => a.destinationId.localeCompare(b.destinationId));
    return mapped;
  }

  function getNeighbors(topo: any, routerId: string): NeighborView[] {
    if (!topo || !routerId) return [];
    const links: any[] = Array.isArray(topo.links) ? topo.links : [];
    const out: NeighborView[] = [];

    for (const l of links) {
      const sid = String(l?.source?.id ?? '');
      const tid = String(l?.target?.id ?? '');
      if (sid !== routerId && tid !== routerId) continue;

      const other = sid === routerId ? tid : sid;
      out.push({
        linkId: String(l.id ?? ''),
        otherId: other,
        weight: Number(l.weight ?? 0)
      });
    }

    out.sort((a, b) => a.otherId.localeCompare(b.otherId));
    return out;
  }

  function getAllRouterIds(topo: any): string[] {
    if (!topo?.nodes) return [];
    const rawNodes = topo.nodes;
    const arr = rawNodes instanceof Map ? Array.from(rawNodes.values()) : Array.isArray(rawNodes) ? rawNodes : [];
    const ids: string[] = [];
    for (const n of arr) {
      const isRouter = n?.constructor?.name === 'Router';
      if (isRouter && n?.id) ids.push(String(n.id));
    }
    ids.sort((a, b) => a.localeCompare(b));
    return ids;
  }

  $: selectedRouter = getRouterById(topology, selectedId);
  $: routingEntries = selectedRouter ? extractRoutingEntries(selectedRouter) : [];
  $: neighbors = selectedRouter ? getNeighbors(topology, String(selectedRouter.id)) : [];

  $: allRouterIds = getAllRouterIds(topology);
  $: selfId = selectedRouter ? String(selectedRouter.id) : '';
  $: destinationOptions = allRouterIds.filter((id) => id !== selfId);

  // For "next hop" pick only neighbor routers
  $: neighborRouterIds = neighbors
    .map((n) => n.otherId)
    .filter((id) => allRouterIds.includes(id));

  $: selectedLink = getLinkById(topology, edgeId);
  $: linkSourceId = selectedLink?.source?.id ?? '';
  $: linkTargetId = selectedLink?.target?.id ?? '';
  $: linkWeightValue = Number(selectedLink?.weight ?? 1);

  // Router editor local state
  let routerNameDraft = '';
  let nameDirty = false;

  $: if (selectedRouter && !nameDirty) {
    routerNameDraft = String(selectedRouter.name ?? selectedRouter.id ?? '');
  }

  function handleNameInput(event: Event) {
    const el = event.currentTarget as HTMLInputElement;
    routerNameDraft = el.value;
    nameDirty = true;
  }

  function commitRouterName() {
    if (!selectedRouter) return;
    const trimmed = routerNameDraft.trim();
    if (trimmed.length === 0) return;

    updateNodeName(String(selectedRouter.id), trimmed);
    nameDirty = false;
  }

  function handleNameKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') commitRouterName();
    if (event.key === 'Escape') {
      nameDirty = false;
      routerNameDraft = String(selectedRouter?.name ?? selectedRouter?.id ?? '');
    }
  }

  // Routing table: add (NO overwrite)
  let showAddRoute = false;
  let addError: string | null = null;

  let newDest = '';
  let newNextHop = '';
  let newCost = 1;

  $: if (selectedRouter && !showAddRoute) {
    addError = null;
    newDest = '';
    newNextHop = '';
    newCost = 1;
  }

  function toggleAddRoute() {
    showAddRoute = !showAddRoute;
    addError = null;

    if (showAddRoute) {
      newDest = destinationOptions[0] ?? '';
      newNextHop = neighborRouterIds[0] ?? '';
      newCost = 1;
    }
  }

  function addEntryNoOverwrite() {
    if (!selectedRouter) return;

    const dest = newDest.trim();
    const hop = newNextHop.trim();
    const cost = Number(newCost);

    addError = null;

    if (dest.length === 0) {
      addError = 'Destination is required.';
      return;
    }
    if (dest === selfId) {
      addError = 'Destination cannot be the same router.';
      return;
    }
    if (!destinationOptions.includes(dest)) {
      addError = 'Destination must be an existing router.';
      return;
    }
    if (hop.length === 0) {
      addError = 'Next hop is required.';
      return;
    }
    if (!neighborRouterIds.includes(hop)) {
      addError = 'Next hop must be a direct neighbor router.';
      return;
    }
    if (!Number.isFinite(cost) || cost < 0) {
      addError = 'Cost must be a number ≥ 0.';
      return;
    }

    // Check: only one route per destination (no overwrite via add form)
    const exists = routingEntries.some((e) => e.destinationId === dest);
    if (exists) {
      addError = `Route to ${dest} already exists. Edit the existing entry instead.`;
      return;
    }

    upsertRoutingEntry(String(selectedRouter.id), dest, hop, cost);

    showAddRoute = false;
    addError = null;
    newDest = '';
    newNextHop = '';
    newCost = 1;
  }

  function handleExistingHopChange(destinationId: string, event: Event) {
    if (!selectedRouter) return;
    const el = event.currentTarget as HTMLInputElement;
    const hop = el.value.trim();
    if (hop.length === 0) return;

    const existing = routingEntries.find((e) => e.destinationId === destinationId);
    const cost = existing ? existing.cost : 0;

    upsertRoutingEntry(String(selectedRouter.id), destinationId, hop, cost);
  }

  function handleExistingCostChange(destinationId: string, event: Event) {
    if (!selectedRouter) return;
    const el = event.currentTarget as HTMLInputElement;
    const cost = Number(el.value);
    if (!Number.isFinite(cost) || cost < 0) return;

    const existing = routingEntries.find((e) => e.destinationId === destinationId);
    const hop = existing ? existing.nextHopId : '';
    if (hop.trim().length === 0) return;

    upsertRoutingEntry(String(selectedRouter.id), destinationId, hop, cost);
  }

  function removeEntry(destinationId: string) {
    if (!selectedRouter) return;
    deleteRoutingEntry(String(selectedRouter.id), destinationId);
  }

  function handleLinkWeightChange(event: Event) {
    if (!selectedLink) return;
    const el = event.currentTarget as HTMLInputElement;
    const w = Number(el.value);
    if (!Number.isFinite(w) || w <= 0) return;
    updateLinkWeight(String(selectedLink.id), w);
  }

  function closeEdgePanel() {
    setSelectedEdge(null);
  }

  function closeRouterPanel() {
    setSelectedRouter(null);
    nameDirty = false;
    showAddRoute = false;
    addError = null;
  }
</script>

<div
  class="router-table-panel"
  style="transform: scale(var(--uiScale, 1)); transform-origin: top right;"
>
  <!-- Router panel has priority over link panel -->
  {#if selectedRouter}
    <h3>Router: {selectedRouter.id}</h3>

    <div class="section">
      <label class="field-label">Name</label>
      <div class="row">
        <input
          class="field-input"
          type="text"
          value={routerNameDraft}
          disabled={isRunning}
          on:input={handleNameInput}
          on:change={commitRouterName}
          on:keydown={handleNameKeydown}
        />
        <button
          class="btn-small-primary"
          disabled={isRunning || routerNameDraft.trim().length === 0}
          on:click={commitRouterName}
        >
          Save
        </button>
      </div>

      <div class="meta">
        <div><b>Position:</b> {Number(selectedRouter.xPos ?? 0).toFixed(1)} / {Number(selectedRouter.yPos ?? 0).toFixed(1)}</div>
        <div style="margin-top: 4px;">
          <b>Neighbors:</b>
          {#if neighbors.length === 0}
            none
          {:else}
            <ul class="neighbor-list">
              {#each neighbors as n (n.linkId)}
                <li class="mono">
                  {n.otherId} (w={n.weight}) — {n.linkId}
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      </div>

      {#if isRunning}
        <p class="hint">Pause simulation to edit router properties.</p>
      {/if}
    </div>

    <div class="section">
      <div class="section-title">Routing table</div>
      <p class="hint" style="margin-top: 4px;">
        Manual edits may be overwritten when you step/run the algorithm.
      </p>

      {#if routingEntries.length === 0}
        <p class="subtle">No entries.</p>
      {:else}
        <table class="rt-table">
          <thead>
            <tr>
              <th>Destination</th>
              <th>Next hop</th>
              <th>Cost</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {#each routingEntries as entry (entry.destinationId)}
              <tr>
                <td class="mono">{entry.destinationId}</td>
                <td>
                  <input
                    class="table-input mono"
                    type="text"
                    value={entry.nextHopId}
                    disabled={isRunning}
                    on:change={(e) => handleExistingHopChange(entry.destinationId, e)}
                  />
                </td>
                <td>
                  <input
                    class="table-input"
                    type="number"
                    min="0"
                    step="1"
                    value={entry.cost}
                    disabled={isRunning}
                    on:change={(e) => handleExistingCostChange(entry.destinationId, e)}
                  />
                </td>
                <td>
                  <button
                    class="btn-icon"
                    title="Delete entry"
                    disabled={isRunning}
                    on:click={() => removeEntry(entry.destinationId)}
                  >
                    🗑
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}

      <div style="margin-top: 10px;">
        <button
          class="btn-small-primary"
          disabled={isRunning || destinationOptions.length === 0 || neighborRouterIds.length === 0}
          on:click={toggleAddRoute}
        >
          {showAddRoute ? 'Cancel' : 'Add route'}
        </button>

        {#if showAddRoute}
          <div class="add-inline">
            {#if addError}
              <div class="error">{addError}</div>
            {/if}

            <label class="field-label">Destination</label>
            <select class="field-input" bind:value={newDest} disabled={isRunning}>
              {#each destinationOptions as rid (rid)}
                <option value={rid}>{rid}</option>
              {/each}
            </select>

            <label class="field-label" style="margin-top: 8px;">Next hop (neighbor)</label>
            <select class="field-input" bind:value={newNextHop} disabled={isRunning}>
              {#each neighborRouterIds as rid (rid)}
                <option value={rid}>{rid}</option>
              {/each}
            </select>

            <label class="field-label" style="margin-top: 8px;">Cost</label>
            <input
              class="field-input"
              type="number"
              min="0"
              step="1"
              bind:value={newCost}
              disabled={isRunning}
            />

            <button
              class="btn-small-primary"
              style="margin-top: 10px; width: 100%;"
              disabled={isRunning}
              on:click={addEntryNoOverwrite}
            >
              Add
            </button>
          </div>
        {/if}
      </div>
    </div>

    <button class="btn-small-primary" style="margin-top: 10px;" on:click={closeRouterPanel}>
      Close
    </button>

  {:else if selectedLink}
    <h3>Link: {selectedLink.id}</h3>
    <p class="subtle">{linkSourceId} ↔ {linkTargetId}</p>

    <label class="field-label">Weight</label>
    <input
      class="field-input"
      type="number"
      min="1"
      step="1"
      value={linkWeightValue}
      disabled={isRunning}
      on:change={handleLinkWeightChange}
    />

    {#if isRunning}
      <p class="hint">Pause simulation to edit weight.</p>
    {/if}

    <button class="btn-small-primary" style="margin-top: 10px;" on:click={closeEdgePanel}>
      Close
    </button>

  {:else}
    <p>Select a router to edit its name/table, or click a link to edit its weight.</p>
  {/if}
</div>

<style>
  .router-table-panel {
    position: absolute;
    top: 80px;
    right: 24px;
    bottom: 120px;
    padding: 10px 12px;
    border-radius: 12px;
    background: rgba(223, 243, 255, 0.96);
    box-shadow: 0 8px 16px rgba(15, 23, 42, 0.15);
    font-size: 11px;
    min-width: 280px;
    overflow: auto;
    z-index: 10;
  }

  h3 {
    font-size: 12px;
    margin: 0 0 6px 0;
  }

  .section {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid rgba(186, 230, 253, 0.9);
  }

  .section-title {
    font-size: 11px;
    font-weight: 700;
    color: #0f172a;
  }

  .subtle {
    margin: 0 0 8px 0;
    opacity: 0.8;
  }

  .hint {
    margin: 8px 0 0 0;
    font-size: 11px;
    opacity: 0.75;
  }

  .field-label {
    display: block;
    font-size: 11px;
    opacity: 0.85;
    margin-bottom: 4px;
  }

  .field-input {
    width: 100%;
    padding: 6px 8px;
    border-radius: 10px;
    border: 1px solid rgba(15, 23, 42, 0.25);
    background: rgba(255, 255, 255, 0.95);
  }

  .row {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .row .field-input {
    flex: 1;
  }

  .mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
      'Liberation Mono', 'Courier New', monospace;
  }

  .meta {
    margin-top: 8px;
    padding: 8px 10px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.7);
    border: 1px solid rgba(15, 23, 42, 0.08);
    font-size: 11px;
    color: #0f172a;
  }

  .neighbor-list {
    margin: 4px 0 0 16px;
    padding: 0;
  }

  .rt-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
    margin-top: 6px;
  }

  .rt-table th,
  .rt-table td {
    padding: 4px 4px;
    text-align: left;
    vertical-align: middle;
  }

  .rt-table thead {
    border-bottom: 1px solid #bae6fd;
  }

  .rt-table tbody tr:nth-child(even) {
    background: rgba(224, 242, 254, 0.75);
  }

  .table-input {
    width: 100%;
    padding: 4px 6px;
    border-radius: 8px;
    border: 1px solid rgba(15, 23, 42, 0.18);
    background: rgba(255, 255, 255, 0.95);
    font-size: 11px;
  }

  .add-inline {
    margin-top: 10px;
    padding: 10px;
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.75);
    border: 1px solid rgba(15, 23, 42, 0.08);
  }

  .error {
    margin-bottom: 8px;
    padding: 8px 10px;
    border-radius: 12px;
    background: rgba(239, 68, 68, 0.12);
    border: 1px solid rgba(239, 68, 68, 0.25);
    color: #7f1d1d;
    font-size: 11px;
  }
</style>

