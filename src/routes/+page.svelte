<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';

  import Toolbar from '$lib/components/Toolbar.svelte';
  import Editor from '$lib/components/Editor.svelte';
  import RouterPanel from '$lib/components/RouterPanel.svelte';
  import Timeline from '$lib/components/Timeline.svelte';
  import PlaybackControls from '$lib/components/PlaybackControls.svelte';
  import RouterTablePanel from '$lib/components/RouterTablePanel.svelte';
  import Packets from '$lib/components/Packets.svelte';

  import {
    simulation,
    uiScale,
    play,
    pause,
    stepForward,
    stepBackward,
    toggleDeletePlacement,
    toggleRouterPlacement,
    toggleLinkPlacement,
    clearPlacementMode,
    deleteSelection
  } from '$lib/stores/simulation';

  $: controller = $simulation as any;
  $: currentStep = controller.currentStepIndex ?? 0;
  $: scale = $uiScale;

  function isTypingTarget(el: EventTarget | null): boolean {
    const t = el as HTMLElement | null;
    if (!t) return false;
    const tag = (t.tagName ?? '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || (t as any).isContentEditable === true;
  }

  onMount(() => {
    const handler = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) {
        return;
      }

      if (e.key === 'Escape') {
        clearPlacementMode();
        return;
      }

      // Space: play/pause
      if (e.key === ' ') {
        e.preventDefault();
        const ctrl = get(simulation);
        if (ctrl.running) {
          pause();
        } else {
          play();
        }
        return;
      }

      // Step
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        stepForward();
        return;
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        stepBackward();
        return;
      }

      // Tool toggles
      if (e.key === 'r' || e.key === 'R') {
        toggleRouterPlacement();
        return;
      }

      if (e.key === 'l' || e.key === 'L') {
        toggleLinkPlacement();
        return;
      }

      // Delete key:
      // - if something is selected, delete it
      // - otherwise toggle delete tool
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelection();
        toggleDeletePlacement();
        return;
      }

      if (e.key === 'd' || e.key === 'D') {
        toggleDeletePlacement();
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });
</script>

<div class="canvas-layout" style={`--uiScale: ${scale};`}>
  <div class="editor-shell">
    <Editor />
  </div>

  <div
    class="top-bar"
    style="transform: scale(var(--uiScale, 1)); transform-origin: top left;"
  >
    <Toolbar />
  </div>

  <RouterPanel />
  <RouterTablePanel />
  <Packets />

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

