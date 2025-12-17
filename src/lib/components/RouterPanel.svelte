<script lang="ts">
  import { notify } from '$lib/notify';
  import {
    placementMode,
    toggleRouterPlacement,
    toggleLinkPlacement,
    toggleDeletePlacement,
    linkWeight,
    setLinkWeight,
    clearNetwork,
    zoomInUI,
    zoomOutUI
  } from '$lib/stores/simulation';

  $: currentMode = $placementMode;
  $: weightValue = $linkWeight;

  async function handleClearNetwork() {
    clearNetwork();
    await notify('Network cleared');
  }

  async function handleSendPacket() {
    console.log('Send packet (dummy)');
    await notify('Send packet (dummy)');
  }

  function handleZoomIn() {
    zoomInUI();
  }

  function handleZoomOut() {
    zoomOutUI();
  }

  function handleRouterClick() {
    toggleRouterPlacement();
  }

  function handleLinkClick() {
    toggleLinkPlacement();
  }

  function handleDeleteClick() {
    toggleDeletePlacement();
  }

  function handleWeightInput(event: Event) {
    const el = event.currentTarget as HTMLInputElement;
    const parsed = Number(el.value);
    setLinkWeight(parsed);
  }
</script>

<aside
  class="left-panel"
  style="transform: scale(var(--uiScale, 1)); transform-origin: top left;"
>
  <button class="btn-small-primary" on:click={handleClearNetwork}>
    Clear network
  </button>

  <button
    class="btn-small-primary"
    style="margin-top: 8px;"
    on:click={handleSendPacket}
  >
    Send packet
  </button>

  <div style="margin-top: 16px;">
    <div class="palette-title">Tools</div>

    <div class="palette-list">
      <div
        class={`palette-item ${
          currentMode === 'router' ? 'palette-item--active' : ''
        }`}
        on:click={handleRouterClick}
      >
        <div class="palette-icon palette-icon--router"></div>
        <div class="palette-label">
          {currentMode === 'router' ? 'Placing routers…' : 'Router'}
        </div>
      </div>

      <div
        class={`palette-item ${
          currentMode === 'link' ? 'palette-item--active' : ''
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
            on:input={handleWeightInput}
            style="width: 100%; padding: 6px 8px; border-radius: 10px; border: 1px solid rgba(15,23,42,0.25);"
          />
          <div style="margin-top: 6px; opacity: 0.75;">
            Click two routers in the canvas to create a link.
          </div>
        </div>
      {/if}

      <div
        class={`palette-item ${
          currentMode === 'delete' ? 'palette-item--active' : ''
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
          Click a router or a link to delete it.
        </div>
      {/if}
    </div>
  </div>

  <div class="left-panel-footer">
    <div class="zoom-row">
      <button class="zoom-btn" title="Zoom out" on:click={handleZoomOut}>
        🔍-
      </button>
      <button class="zoom-btn" title="Zoom in" on:click={handleZoomIn}>
        🔍+
      </button>
    </div>
  </div>
</aside>

