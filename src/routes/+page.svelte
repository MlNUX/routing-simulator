<script lang="ts">
  import { SvelteFlowProvider } from '@xyflow/svelte';

  import Toolbar from '$lib/components/Toolbar.svelte';
  import Editor from '$lib/components/Editor.svelte';
  import RouterPanel from '$lib/components/RouterPanel.svelte';
  import Timeline from '$lib/components/Timeline.svelte';
  import PlaybackControls from '$lib/components/PlaybackControls.svelte';
  import RouterTablePanel from '$lib/components/RouterTablePanel.svelte';
  import Packets from '$lib/components/Packets.svelte';

  import { simulation } from '$lib/stores/simulation';

  $: controller = $simulation as any;
  $: currentStep = controller.currentStepIndex ?? 0;
</script>

<SvelteFlowProvider>
  <div class="canvas-layout">
    <!-- main editor canvas -->
    <div class="editor-shell">
      <Editor />
    </div>

    <!-- top toolbar -->
    <div class="top-bar">
      <Toolbar />
    </div>

    <!-- left palette bar -->
    <RouterPanel />

    <!-- right routing-table panel & packets overlay -->
    <RouterTablePanel />
    <Packets />

    <!-- bottom bar: current state + timeline + playback controls -->
    <div class="bottom-bar">
      <div class="current-state-pill">
        Current state: {currentStep}
      </div>

      <Timeline />
      <PlaybackControls />
    </div>
  </div>
</SvelteFlowProvider>

