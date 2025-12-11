<script lang="ts">
  import { notify } from '$lib/notify';
  import { placementMode, toggleRouterPlacement } from '$lib/stores/simulation';

  $: currentMode = $placementMode;

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
    <div class="palette-title">Router placement tool</div>

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

