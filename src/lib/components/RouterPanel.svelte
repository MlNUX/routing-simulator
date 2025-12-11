<script lang="ts">
  function clearNetwork() {
    console.log('Clear network (dummy)');
  }

  function sendPacket() {
    // TODO: hook this into SimulationController when you implement packet sending
    console.log('Send packet (dummy)');
  }

  function zoomIn() {
    console.log('Zoom in (dummy)');
  }

  function zoomOut() {
    console.log('Zoom out (dummy)');
  }

  function deleteSelection() {
    console.log('Delete selection (dummy)');
  }

  function handleDragStartRouter(event: DragEvent) {
    // mark this drag as a "router" node for the editor
    event.dataTransfer?.setData(
      'application/x-routing-node',
      JSON.stringify({ kind: 'router' })
    );
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'copy';
    }
  }
</script>

<aside class="left-panel">
  <button class="btn-small-primary" on:click={clearNetwork}>
    Clear network
  </button>

  <button
    class="btn-small-primary"
    style="margin-top: 8px;"
    on:click={sendPacket}
  >
    Send packet
  </button>

  <div style="margin-top: 10px;">
    <div class="palette-title">Drag and drop to edit network</div>

    <div class="palette-list">
      <!-- Router: draggable, used to create new routers in the canvas -->
      <div
        class="palette-item"
        draggable="true"
        on:dragstart={handleDragStartRouter}
      >
        <div class="palette-icon palette-icon--router"></div>
        <div class="palette-label">Router</div>
      </div>

      <!-- The others are just visual for now, you can wire them later -->
      <div class="palette-item">
        <div class="palette-icon palette-icon--switch"></div>
        <div class="palette-label">Switch</div>
      </div>

      <div class="palette-item">
        <div class="palette-icon palette-icon--end"></div>
        <div class="palette-label">End user</div>
      </div>

      <div class="palette-item">
        <div class="palette-icon palette-icon--edge"></div>
        <div class="palette-label">Edge</div>
      </div>
    </div>
  </div>

  <div class="right-panel-footer">
    <div class="zoom-row">
      <button class="zoom-btn" title="Zoom out" on:click={zoomOut}>🔍-</button>
      <button class="zoom-btn" title="Zoom in" on:click={zoomIn}>🔍+</button>
    </div>
    <button class="trash-btn" title="Delete" on:click={deleteSelection}>🗑</button>
  </div>
</aside>

