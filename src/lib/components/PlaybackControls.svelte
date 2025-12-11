<script lang="ts">
  import {
    simulation,
    play,
    pause,
    stepForward,
    stepBackward,
    stop,
    reset
  } from '$lib/stores/simulation';

  // SimulationController instance
  $: controller = $simulation as any;

  // try to determine playing state from either controller or inner simulation
  $: isPlaying =
    !!controller.running ||
    !!controller.simulation?.running ||
    false;

  function handlePlay() {
    play();
  }

  function handlePause() {
    pause();
  }

  function handleStop() {
    stop();
  }

  function handleReset() {
    reset();
  }
</script>

<div class="controls-row">
  <!-- stop -->
  <button
    class="control-btn"
    title="Stop (go to start)"
    on:click={handleStop}
  >
    ⏹
  </button>

  <!-- step backward -->
  <button
    class="control-btn"
    title="Step back"
    on:click={stepBackward}
  >
    ⏮
  </button>

  <!-- play -->
  <button
    class="control-btn"
    title="Play"
    on:click={handlePlay}
    disabled={isPlaying}
  >
    ▶
  </button>

  <!-- pause -->
  <button
    class="control-btn"
    title="Pause"
    on:click={handlePause}
    disabled={!isPlaying}
  >
    ⏸
  </button>

  <!-- step forward -->
  <button
    class="control-btn"
    title="Step forward"
    on:click={stepForward}
  >
    ⏭
  </button>

  <!-- reset -->
  <button
    class="control-btn"
    title="Reset simulation"
    on:click={handleReset}
  >
    ↻
  </button>
</div>

