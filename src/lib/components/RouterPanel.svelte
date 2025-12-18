<script lang="ts">
  import { notify } from '$lib/notify';
  import {
    simulation,
    placementMode,
    toggleRouterPlacement,
    toggleLinkPlacement,
    toggleDeletePlacement,
    linkWeight,
    setLinkWeight,
    clearNetwork,
    canUndo,
    canRedo,
    undo,
    redo,
    sendPacket
  } from '$lib/stores/simulation';

  $: controller = $simulation as any;
  $: isRunning = !!controller?.running;

  $: currentMode = $placementMode;
  $: weightValue = $linkWeight;

  $: canUndoNow = $canUndo;
  $: canRedoNow = $canRedo;

  let showShortcuts = false;

  // ------------------- Send packet modal -------------------
  let showSendPacket = false;
  let packetSource = '';
  let packetTarget = '';

  function routerIdsFromTopology(): string[] {
    const topo = typeof controller?.getTopology === 'function' ? controller.getTopology() : controller?.topology;
    const nodes = topo?.nodes instanceof Map ? Array.from(topo.nodes.values()) : [];
    const ids = nodes.map((n: any) => String(n?.id ?? '')).filter((x: string) => x.length > 0);
    ids.sort((a: string, b: string) => a.localeCompare(b));
    return ids;
  }

  $: routerIds = routerIdsFromTopology();

  function openSendPacketModal() {
    if (isRunning) return;
    showSendPacket = true;

    const first = routerIds[0] ?? '';
    const second = routerIds.length > 1 ? routerIds[1] : first;

    packetSource = packetSource && routerIds.includes(packetSource) ? packetSource : first;
    packetTarget = packetTarget && routerIds.includes(packetTarget) ? packetTarget : second;
  }

  function closeSendPacketModal() {
    showSendPacket = false;
  }

  function commitSendPacket() {
    if (!packetSource || !packetTarget) return;
    sendPacket(packetSource, packetTarget);
    showSendPacket = false;
  }

  async function handleClearNetwork() {
    if (isRunning) {
      await notify('Pause simulation before clearing the network');
      return;
    }
    clearNetwork();
    await notify('Network cleared');
  }

  async function handleRouterClick() {
    if (isRunning) {
      await notify('Pause simulation before editing the topology');
      return;
    }
    toggleRouterPlacement();
  }

  async function handleLinkClick() {
    if (isRunning) {
      await notify('Pause simulation before editing the topology');
      return;
    }
    toggleLinkPlacement();
  }

  async function handleDeleteClick() {
    if (isRunning) {
      await notify('Pause simulation before editing the topology');
      return;
    }
    toggleDeletePlacement();
  }

  function handleWeightInput(event: Event) {
    const el = event.currentTarget as HTMLInputElement;
    const parsed = Number(el.value);
    setLinkWeight(parsed);
  }

  function toggleShortcuts() {
    showShortcuts = !showShortcuts;
  }

  function closeShortcuts() {
    showShortcuts = false;
  }

  async function handleUndo() {
    if (isRunning) {
      await notify('Pause simulation before using undo/redo');
      return;
    }
    undo();
  }

  async function handleRedo() {
    if (isRunning) {
      await notify('Pause simulation before using undo/redo');
      return;
    }
    redo();
  }
</script>

<aside class="left-panel" style="transform-origin: top left;">
  <button class="btn-small-primary" on:click={handleClearNetwork} disabled={isRunning}>
    Clear network
  </button>

  <button class="btn-small-primary" style="margin-top: 8px;" on:click={openSendPacketModal} disabled={isRunning}>
    Send packet
  </button>

  <button class="btn-small-primary" style="margin-top: 8px;" on:click={toggleShortcuts}>
    Shortcuts
  </button>

  <div style="margin-top: 16px;">
    <div class="palette-title">Tools</div>

    <div class="palette-list">
      <div
        class={`palette-item ${currentMode === 'router' ? 'palette-item--active' : ''} ${
          isRunning ? 'palette-item--disabled' : ''
        }`}
        on:click={handleRouterClick}
      >
        <div class="palette-icon palette-icon--router"></div>
        <div class="palette-label">
          {currentMode === 'router' ? 'Placing routers…' : 'Router'}
        </div>
      </div>

      <div
        class={`palette-item ${currentMode === 'link' ? 'palette-item--active' : ''} ${
          isRunning ? 'palette-item--disabled' : ''
        }`}
        style="margin-top: 6px;"
        on:click={handleLinkClick}
      >
        <div class="palette-icon" style="display:flex;align-items:center;justify-content:center;">
          🔗
        </div>
        <div class="palette-label">
          {currentMode === 'link' ? 'Linking routers…' : 'Link routers'}
        </div>
      </div>

      {#if currentMode === 'link'}
        <div style="margin-top: 8px; font-size: 11px;">
          <div style="opacity: 0.8; margin-bottom: 4px;">Link weight</div>
          <input
            type="number"
            min="1"
            step="1"
            value={weightValue}
            disabled={isRunning}
            on:input={handleWeightInput}
            style="width: 100%; padding: 6px 8px; border-radius: 10px; border: 1px solid rgba(15,23,42,0.25);"
          />
          <div style="margin-top: 6px; opacity: 0.75;">
            Click two routers in the canvas to create a link.
          </div>
        </div>
      {/if}

      <div
        class={`palette-item ${currentMode === 'delete' ? 'palette-item--active' : ''} ${
          isRunning ? 'palette-item--disabled' : ''
        }`}
        style="margin-top: 6px;"
        on:click={handleDeleteClick}
      >
        <div class="palette-icon" style="display:flex;align-items:center;justify-content:center;">
          🗑
        </div>
        <div class="palette-label">
          {currentMode === 'delete' ? 'Deleting…' : 'Delete'}
        </div>
      </div>

      {#if currentMode === 'delete'}
        <div style="margin-top: 6px; font-size: 11px; opacity: 0.75;">
          Drag-select multiple items in the canvas, then press Delete.
        </div>
      {/if}

      {#if isRunning}
        <div style="margin-top: 10px; font-size: 11px; opacity: 0.75;">
          Topology editing disabled while playing.
        </div>
      {/if}
    </div>
  </div>

  <div class="left-panel-footer">
    <div class="undo-row">
      <button
        class="zoom-btn"
        title="Undo"
        disabled={isRunning || !canUndoNow}
        on:click={handleUndo}
      >
        ↶
      </button>
      <button
        class="zoom-btn"
        title="Redo"
        disabled={isRunning || !canRedoNow}
        on:click={handleRedo}
      >
        ↷
      </button>
    </div>
  </div>

  {#if showShortcuts}
    <div class="shortcuts-backdrop" on:click={closeShortcuts} />

    <div class="shortcuts-modal">
      <div class="shortcuts-header">
        <div class="shortcuts-title">Keyboard shortcuts</div>
        <button class="btn-icon" title="Close" on:click={closeShortcuts}>✖</button>
      </div>

      <table class="shortcuts-table">
        <thead>
          <tr>
            <th>Key</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>Space</code></td>
            <td>Play / Pause</td>
          </tr>
          <tr>
            <td><code>→</code></td>
            <td>Step forward</td>
          </tr>
          <tr>
            <td><code>←</code></td>
            <td>Step backward</td>
          </tr>
          <tr>
            <td><code>R</code></td>
            <td>Toggle router placement tool</td>
          </tr>
          <tr>
            <td><code>L</code></td>
            <td>Toggle link tool</td>
          </tr>
          <tr>
            <td><code>D</code></td>
            <td>Toggle delete tool (multi-select enabled)</td>
          </tr>
          <tr>
            <td><code>Del</code> / <code>Backspace</code></td>
            <td>Delete selection</td>
          </tr>
          <tr>
            <td><code>Esc</code></td>
            <td>Exit tool mode</td>
          </tr>
          <tr>
            <td><code>Ctrl/Cmd + Z</code></td>
            <td>Undo</td>
          </tr>
          <tr>
            <td><code>Ctrl/Cmd + Y</code></td>
            <td>Redo</td>
          </tr>
          <tr>
            <td><code>Ctrl/Cmd + Shift + Z</code></td>
            <td>Redo</td>
          </tr>
        </tbody>
      </table>

      <div class="shortcuts-footnote">
        Note: editing and undo/redo are blocked while the simulation is playing.
      </div>
    </div>
  {/if}

  {#if showSendPacket}
    <div class="shortcuts-backdrop" on:click={closeSendPacketModal} />

    <div class="shortcuts-modal" style="top: 120px;">
      <div class="shortcuts-header">
        <div class="shortcuts-title">Send packet</div>
        <button class="btn-icon" title="Close" on:click={closeSendPacketModal}>✖</button>
      </div>

      {#if routerIds.length < 2}
        <div style="font-size: 12px; opacity: 0.8;">Need at least 2 routers.</div>
      {:else}
        <div style="display:grid; gap: 8px;">
          <label style="font-size: 12px; font-weight: 700;">Source</label>
          <select class="field-input" bind:value={packetSource}>
            {#each routerIds as rid (rid)}
              <option value={rid}>{rid}</option>
            {/each}
          </select>

          <label style="font-size: 12px; font-weight: 700;">Target</label>
          <select class="field-input" bind:value={packetTarget}>
            {#each routerIds as rid (rid)}
              <option value={rid}>{rid}</option>
            {/each}
          </select>

          <button class="btn-small-primary" on:click={commitSendPacket} style="margin-top: 6px;">
            Send
          </button>
        </div>
      {/if}
    </div>
  {/if}
</aside>

<style>
  .palette-item--disabled {
    opacity: 0.55;
    pointer-events: none;
  }

  .undo-row {
    display: flex;
    gap: 8px;
    margin-bottom: 8px;
  }

  .shortcuts-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.35);
    z-index: 80;
  }

  .shortcuts-modal {
    position: fixed;
    left: 24px;
    top: 160px;
    width: min(360px, calc(100vw - 48px));
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.98);
    box-shadow: 0 14px 28px rgba(15, 23, 42, 0.25);
    z-index: 90;
    padding: 12px;
  }

  .shortcuts-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 8px;
  }

  .shortcuts-title {
    font-size: 14px;
    font-weight: 700;
    color: #0f172a;
  }

  .shortcuts-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }

  .shortcuts-table th,
  .shortcuts-table td {
    padding: 6px 6px;
    text-align: left;
    vertical-align: top;
    border-bottom: 1px solid rgba(15, 23, 42, 0.12);
  }

  .shortcuts-table th {
    font-weight: 700;
  }

  code {
    background: rgba(15, 23, 42, 0.08);
    padding: 2px 6px;
    border-radius: 8px;
  }

  .shortcuts-footnote {
    margin-top: 8px;
    font-size: 11px;
    opacity: 0.75;
    color: #0f172a;
  }

  .field-input {
    width: 100%;
    padding: 6px 8px;
    border-radius: 10px;
    border: 1px solid rgba(15, 23, 42, 0.25);
    background: rgba(255, 255, 255, 0.95);
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

