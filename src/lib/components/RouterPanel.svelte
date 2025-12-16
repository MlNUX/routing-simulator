<script lang="ts">
  import { notify } from '$lib/notify';
  import {
    placementMode,
    toggleRouterPlacement,
    toggleLinkPlacement,
    linkWeight,
    setLinkWeight
  } from '$lib/stores/simulation';

  $: currentMode = $placementMode;
  $: weightValue = $linkWeight;

  async function handleClearNetwork() {
    console.log('Clear network (dummy)');
    await notify('Clear network (dummy)');
  }

  async function handleSendPacket() {
    console.log('Send packet (dummy)');
    await notify('Send packet (dummy)');
  }

  function handleZoomIn() {
    console.log('Zoom in (dummy)');
  }

  function handleZoomOut() {
    console.log('Zoom out (dummy)');
  }

  function handleDeleteSelection() {
    console.log('Delete selection (dummy)');
  }

  function handleRouterClick() {
    toggleRouterPlacement();
  }

  function handleLinkClick() {
    toggleLinkPlacement();
  }

  function handleWeightInput(event: Event) {
    const el = event.currentTarget as HTMLInputElement;
    const parsed = Number(el.value);
    setLinkWeight(parsed);
  }
</script>

<aside class="left-panel">
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
      <!-- Router placement -->
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

      <!-- Link creation -->
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
    <button class="trash-btn" title="Delete" on:click={handleDeleteSelection}>
      🗑
    </button>
  </div>
</aside>

