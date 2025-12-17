<script lang="ts">
  import Toolbar from '$lib/components/Toolbar.svelte';
  import Editor from '$lib/components/Editor.svelte';
  import RouterPanel from '$lib/components/RouterPanel.svelte';
  import Timeline from '$lib/components/Timeline.svelte';
  import PlaybackControls from '$lib/components/PlaybackControls.svelte';
  import RouterTablePanel from '$lib/components/RouterTablePanel.svelte';
  import Packets from '$lib/components/Packets.svelte';

  import { simulation, uiScale } from '$lib/stores/simulation';

  $: controller = $simulation as any;
  $: currentStep = controller.currentStepIndex ?? 0;
  $: scale = $uiScale;
</script>

<div class="canvas-layout" style={`--uiScale: ${scale};`}>
  <!-- main editor canvas (NOT scaled) -->
  <div class="editor-shell">
    <Editor />
  </div>

  <!-- top toolbar (scaled) -->
  <div
    class="top-bar"
    style="transform: scale(var(--uiScale, 1)); transform-origin: top left;"
  >
    <Toolbar />
  </div>

  <!-- left palette bar -->
  <RouterPanel />

  <!-- right routing-table panel & packets overlay -->
  <RouterTablePanel />
  <Packets />

  <!-- bottom bar (scaled) -->
  <div
    class="bottom-bar"
    style="transform: scale(var(--uiScale, 1)); transform-origin: bottom left;"
  >
    <div class="current-state-pill">
      Current state: {currentStep}
    </div>

    <Timeline />
    <PlaybackControls />
  </div>
</div>

