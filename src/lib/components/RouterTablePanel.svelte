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
    deleteLinkById,
    openRouterHistoryForRouter,
    sendPacket
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

  $: topology =
    typeof controller.getTopology === 'function'
      ? controller.getTopology()
      : controller.topology;

  $: selectedId = $selectedRouterId;
  $: edgeId = $selectedEdgeId;

  function fmtCost(cost: number): string {
    return Number.isFinite(cost) ? String(cost) : '∞';
  }

  function fmtHop(hop: string): string {
    const h = String(hop ?? '').trim();
    return h.length === 0 ? '—' : h;
  }

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
      if (n?.id) ids.push(String(n.id));
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
      cost: Number(e.cost)
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

  $: neighborsAll = selectedRouter ? getNeighbors(topology, selfId) : [];
  $: neighborRouterLinks = neighborsAll.filter((n) => allRouterIds.includes(n.otherId));

  $: routingEntriesAll = selectedRouter ? extractRoutingEntries(selectedRouter) : [];
  $: routingEntries = routingEntriesAll.filter((e) => e.destinationId !== selfId);

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
    const el = event.currentTarget as HTMLInputElement;
    const w = Number(el.value);
    if (!Number.isFinite(w) || w <= 0) return;
    updateLinkWeight(linkId, w);
  }

  function removeConnection(linkId: string) {
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

  function openHistory() {
    if (!selectedRouter) return;
    openRouterHistoryForRouter(String(selectedRouter.id));
  }

  // ------------------- Send packet (from selected router) -------------------
  let packetTarget = '';

  $: packetTargets = selfId ? allRouterIds.filter((id) => id !== selfId) : [];
  $: if (selectedRouter && (packetTarget.length === 0 || !packetTargets.includes(packetTarget))) {
    packetTarget = packetTargets[0] ?? '';
  }

  function commitSendPacket() {
    if (!selfId || !packetTarget) return;
    sendPacket(selfId, packetTarget);
  }
</script>

<div class="router-table-panel">
  {#if selectedRouter}
    <div class="panel-head">
      <h3>Router: {selectedRouter.id}</h3>
      <button class="btn-small-primary" on:click={openHistory} title="Show routing table history">
        History
      </button>
    </div>

    <!-- 1) Name -->
    <div class="section">
      <div class="section-title">Name</div>

      <div class="row" style="margin-top: 6px;">
        <input
          class="field-input"
          type="text"
          value={routerNameDraft}
          on:input={handleNameInput}
          on:change={commitRouterName}
          on:keydown={handleNameKeydown}
        />
        <button
          class="btn-small-primary"
          disabled={routerNameDraft.trim().length === 0}
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
                    on:change={(e) => handleNeighborWeightChange(n.linkId, e)}
                  />
                </td>
                <td class="mono">{n.linkId}</td>
                <td>
                  <button
                    class="btn-icon"
                    title="Delete connection"
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
          disabled={availableTargets.length === 0}
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
          <select class="field-input" bind:value={newConnTarget}>
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
          />

          <div style="margin-top: 10px; display:flex; gap: 8px;">
            <button
              class="btn-small-primary"
              style="flex: 1;"
              on:click={commitAddConnection}
            >
              Create link
            </button>
            <button
              class="btn-small-primary"
              style="flex: 1;"
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
        Computed by the algorithm. Unreachable destinations show ∞.
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
                <td class="mono">{fmtHop(entry.nextHopId)}</td>
                <td>{fmtCost(entry.cost)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </div>

    <!-- 4) Send packet -->
    <div class="section">
      <div class="section-title">Send packet</div>
      <p class="hint" style="margin-top: 4px;">
        Highlights: shortest path = green, forwarding path = orange (success) / red (fail).
      </p>

      {#if packetTargets.length === 0}
        <p class="subtle">No other routers available.</p>
      {:else}
        <div class="row" style="margin-top: 6px;">
          <select class="field-input" bind:value={packetTarget}>
            {#each packetTargets as rid (rid)}
              <option value={rid}>{rid}</option>
            {/each}
          </select>

          <button class="btn-small-primary" on:click={commitSendPacket}>
            Send
          </button>
        </div>
      {/if}
    </div>

    <button class="btn-small-primary" style="margin-top: 10px;" on:click={closeRouterPanel}>
      Close
    </button>

  {:else if selectedLink}
    <div class="panel-head">
      <h3>Link: {selectedLink.id}</h3>
      <button class="btn-small-primary" on:click={closeEdgePanel}>Close</button>
    </div>

    <p class="subtle">{linkSourceId} ↔ {linkTargetId}</p>

    <div class="section">
      <div class="section-title">Weight</div>
      <input
        class="field-input"
        type="number"
        min="1"
        step="1"
        value={linkWeightValue}
        on:change={handleLinkWeightChange}
      />
    </div>

  {:else}
    <div class="empty-state">
      <div class="empty-title">CHOOSE A ROUTER</div>
      <div class="empty-sub">
        Click a router in the canvas to view and edit details.
      </div>
    </div>
  {/if}
</div>

<style>
  .router-table-panel {
    position: absolute;
    top: 80px;
    right: 24px;
    bottom: 120px;

    /* uniform sizing */
    width: 340px;
    min-width: 340px;
    max-width: 340px;

    box-sizing: border-box;

    padding: 10px 12px;
    border-radius: 12px;
    background: rgba(223, 243, 255, 0.96);
    box-shadow: 0 8px 16px rgba(15, 23, 42, 0.15);
    font-size: 11px;
    overflow: auto;
    z-index: 10;
  }

  .empty-state {
    height: 100%;
    min-height: 240px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    text-align: center;
    padding: 20px 12px;
  }

  .empty-title {
    font-size: 18px;
    font-weight: 900;
    letter-spacing: 0.3px;
    color: #0f172a;
  }

  .empty-sub {
    font-size: 12px;
    opacity: 0.75;
    color: #0f172a;
    max-width: 260px;
  }

  .panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  h3 {
    font-size: 12px;
    margin: 0;
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
    margin: 6px 0 0 0;
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
    box-sizing: border-box;
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
    word-break: break-word;
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
    box-sizing: border-box;
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

  .btn-small-primary {
    padding: 6px 10px;
    border-radius: 12px;
    border: 1px solid rgba(15, 23, 42, 0.18);
    background: rgba(2, 132, 199, 0.10);
    cursor: pointer;
    font-size: 11px;
    font-weight: 700;
    color: #0f172a;
    white-space: nowrap;
  }

  .btn-small-primary:hover {
    background: rgba(2, 132, 199, 0.16);
  }

  .btn-icon {
    border: none;
    background: transparent;
    cursor: pointer;
    font-size: 14px;
  }
</style>

