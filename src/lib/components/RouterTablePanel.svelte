<script lang="ts">
  import {
    simulation,
    selectedRouterId,
    selectedEdgeId,
    setSelectedEdge,
    setSelectedRouter,
    updateLinkWeight,
    updateNodeName,
    addLink,
    deleteLinkById
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

  function topologyNodesArray(topo: any): any[] {
    if (!topo || !topo.nodes) return [];
    const rawNodes = topo.nodes;
    if (Array.isArray(rawNodes)) return rawNodes;
    if (rawNodes instanceof Map) return Array.from(rawNodes.values());
    return [];
  }

  function getRouterById(topo: any, id: string | null): any | null {
    if (!topo || !id) return null;
    const arr = topologyNodesArray(topo);
    return arr.find((n: any) => String(n.id) === String(id)) ?? null;
  }

  function getLinkById(topo: any, id: string | null): any | null {
    if (!topo || !id) return null;
    const links: any[] = Array.isArray(topo.links) ? topo.links : [];
    return links.find((l) => String(l.id) === String(id)) ?? null;
  }

  function getAllRouterIds(topo: any): string[] {
    const arr = topologyNodesArray(topo);
    const ids: string[] = [];

    for (const n of arr) {
      const isRouter = n?.constructor?.name === 'Router';
      if (isRouter && n?.id) ids.push(String(n.id));
    }

    ids.sort((a, b) => a.localeCompare(b));
    return ids;
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

  $: selectedRouter = getRouterById(topology, selectedId);

  $: allRouterIds = getAllRouterIds(topology);
  $: selfId = selectedRouter ? String(selectedRouter.id) : '';

  // Direct links (neighbors), but only to other routers
  $: neighborsAll = selectedRouter ? getNeighbors(topology, selfId) : [];
  $: neighborRouterLinks = neighborsAll.filter((n) => allRouterIds.includes(n.otherId));

  // Routing table (read-only), hide self-entry
  $: routingEntriesAll = selectedRouter ? extractRoutingEntries(selectedRouter) : [];
  $: routingEntries = routingEntriesAll.filter((e) => e.destinationId !== selfId);

  // Edge panel (when a link is selected instead of a router)
  $: selectedLink = getLinkById(topology, edgeId);
  $: linkSourceId = selectedLink?.source?.id ?? '';
  $: linkTargetId = selectedLink?.target?.id ?? '';
  $: linkWeightValue = Number(selectedLink?.weight ?? 1);

  // ------------------- Name section -------------------
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

  // ------------------- Connections section (editable) -------------------
  let showAddConnection = false;
  let connError: string | null = null;

  let newConnTarget = '';
  let newConnWeight = 1;

  $: connectedRouterIds = neighborRouterLinks.map((n) => n.otherId);
  $: availableTargets =
    selfId.length === 0
      ? []
      : allRouterIds.filter((id) => id !== selfId && !connectedRouterIds.includes(id));

  function toggleAddConnection() {
    showAddConnection = !showAddConnection;
    connError = null;

    if (showAddConnection) {
      newConnTarget = availableTargets[0] ?? '';
      newConnWeight = 1;
    }
  }

  function commitAddConnection() {
    if (!selectedRouter) return;

    connError = null;

    const target = String(newConnTarget ?? '').trim();
    const weight = Number(newConnWeight);

    if (target.length === 0) {
      connError = 'Target router is required.';
      return;
    }
    if (!availableTargets.includes(target)) {
      connError = 'Target must be a router that is not already connected.';
      return;
    }
    if (!Number.isFinite(weight) || weight <= 0) {
      connError = 'Weight must be a number > 0.';
      return;
    }

    addLink(selfId, target, weight);

    showAddConnection = false;
    connError = null;
    newConnTarget = '';
    newConnWeight = 1;
  }

  function handleNeighborWeightChange(linkId: string, event: Event) {
    if (isRunning) return;
    const el = event.currentTarget as HTMLInputElement;
    const w = Number(el.value);
    if (!Number.isFinite(w) || w <= 0) return;
    updateLinkWeight(linkId, w);
  }

  function removeConnection(linkId: string) {
    if (isRunning) return;
    deleteLinkById(linkId);
    if ($selectedEdgeId === linkId) {
      setSelectedEdge(null);
    }
  }

  // ------------------- Link panel helpers -------------------
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
    showAddConnection = false;
    connError = null;
  }
</script>

<div
  class="router-table-panel"
  style="transform: scale(var(--uiScale, 1)); transform-origin: top right;"
>
  <!-- Router panel has priority over link panel -->
  {#if selectedRouter}
    <h3>Router: {selectedRouter.id}</h3>

    <!-- 1) Name -->
    <div class="section">
      <div class="section-title">Name</div>

      <div class="row" style="margin-top: 6px;">
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
        <div>
          <b>Position:</b>
          {Number(selectedRouter.xPos ?? 0).toFixed(1)} / {Number(selectedRouter.yPos ?? 0).toFixed(1)}
        </div>

        {#if isRunning}
          <p class="hint">Pause simulation to edit router properties.</p>
        {/if}
      </div>
    </div>

    <!-- 2) Connections (editable) -->
    <div class="section">
      <div class="section-title">Connections</div>
      <p class="hint" style="margin-top: 4px;">
        Direct links from this router to other routers (weights are editable).
      </p>

      {#if neighborRouterLinks.length === 0}
        <p class="subtle">No router connections.</p>
      {:else}
        <table class="rt-table">
          <thead>
            <tr>
              <th>To</th>
              <th>Weight</th>
              <th>Link</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {#each neighborRouterLinks as n (n.linkId)}
              <tr>
                <td class="mono">{n.otherId}</td>
                <td>
                  <input
                    class="table-input"
                    type="number"
                    min="1"
                    step="1"
                    value={n.weight}
                    disabled={isRunning}
                    on:change={(e) => handleNeighborWeightChange(n.linkId, e)}
                  />
                </td>
                <td class="mono">{n.linkId}</td>
                <td>
                  <button
                    class="btn-icon"
                    title="Delete connection"
                    disabled={isRunning}
                    on:click={() => removeConnection(n.linkId)}
                  >
                    🗑
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}

      <div style="margin-top: 10px; display:flex; align-items:center; gap: 8px;">
        <button
          class="btn-small-primary"
          disabled={isRunning || availableTargets.length === 0}
          on:click={toggleAddConnection}
          title="Add connection"
        >
          +
        </button>

        <div class="subtle" style="margin: 0;">
          {#if availableTargets.length === 0}
            No available routers to connect.
          {:else}
            Add a new direct link from {selfId}.
          {/if}
        </div>
      </div>

      {#if showAddConnection}
        <div class="add-inline">
          {#if connError}
            <div class="error">{connError}</div>
          {/if}

          <label class="field-label">Target router</label>
          <select class="field-input" bind:value={newConnTarget} disabled={isRunning}>
            {#each availableTargets as rid (rid)}
              <option value={rid}>{rid}</option>
            {/each}
          </select>

          <label class="field-label" style="margin-top: 8px;">Weight</label>
          <input
            class="field-input"
            type="number"
            min="1"
            step="1"
            bind:value={newConnWeight}
            disabled={isRunning}
          />

          <div style="margin-top: 10px; display:flex; gap: 8px;">
            <button
              class="btn-small-primary"
              style="flex: 1;"
              disabled={isRunning}
              on:click={commitAddConnection}
            >
              Create link
            </button>
            <button
              class="btn-small-primary"
              style="flex: 1;"
              disabled={isRunning}
              on:click={toggleAddConnection}
            >
              Cancel
            </button>
          </div>
        </div>
      {/if}
    </div>

    <!-- 3) Routing table (read-only) -->
    <div class="section">
      <div class="section-title">Routing table</div>
      <p class="hint" style="margin-top: 4px;">
        Read-only (computed by the algorithm).
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
            </tr>
          </thead>
          <tbody>
            {#each routingEntries as entry (entry.destinationId)}
              <tr>
                <td class="mono">{entry.destinationId}</td>
                <td class="mono">{entry.nextHopId}</td>
                <td>{entry.cost}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
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
    <p>Select a router to view/edit its name and connections, or click a link to edit its weight.</p>
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

