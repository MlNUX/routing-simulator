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
    deleteSelection,
    undo,
    redo
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
    const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform);

    const handler = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) {
        return;
      }

      // Undo/Redo
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (mod && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }

      if (mod && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        redo();
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

      if (e.key === 'd' || e.key === 'D') {
        toggleDeletePlacement();
        return;
      }

      // Delete selection
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelection();
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });
</script>

<div class="relative w-full h-full" 
     style={`--uiScale: ${scale};`}
>
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
    class="absolute left-1/2 bottom-6 z-10 px-4 w-[min(900px,90vw)] justify-center"
    style="transform: translateX(-50%) scale(var(--uiScale, 1)); transform-origin: bottom center;"
  >
    
    <div class="inline-block px-8 py-3 rounded-full bg-primary text-white 
      font-semibold mb-1.5 text-[14px] min-w-[120px] text-center">
      Current state: {currentStep}
    </div>
    

    <Timeline />
    <PlaybackControls />
  </div>
</div>

