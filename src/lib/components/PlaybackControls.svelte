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

<div class="flex justify-center">
  <div class="flex rounded-xl bg-primary p-1">

    <!-- stop -->
    <button
      class="w-9 h-9 bg-primary text-white cursor-pointer text-base border-none rounded-xl
      flex items-center justify-center hover:brightness-110"
      on:click={handleStop}
    >
      <img src="/icons/stop.svg" alt="Stop">
    </button>

    <!-- one step backward -->
    <button
      class="w-9 h-9 bg-primary text-white cursor-pointer text-base border-none rounded-xl
      flex items-center justify-center hover:brightness-110"
      on:click={stepBackward}
    >
      <img src="/icons/step-back.svg" alt="Step backward">
    </button>

    <!-- play -->
    <button
      class="w-9 h-9 bg-primary text-white cursor-pointer text-base border-none rounded-xl
      flex items-center justify-center hover:brightness-110"
      on:click={handlePlay}
      disabled={isPlaying}
    >
      <img src="/icons/play.svg" alt="Play">
    </button>

    <!--TO DO: make this active during playing-->
    <!-- pause -->
    <button
      class="w-9 h-9 bg-primary text-white cursor-pointer text-base border-none rounded-xl
      flex items-center justify-center hover:brightness-110"
      on:click={handlePause}
      disabled={!isPlaying}
    >
      <img src="/icons/pause.svg" alt="Pause">
    </button>

    <!-- one step forward -->
    <button
      class="w-9 h-9 bg-primary text-white cursor-pointer text-base border-none rounded-xl
      flex items-center justify-center hover:brightness-110"
      on:click={stepForward}
    >
      <img src="/icons/step-front.svg" alt="Step forward">
    </button>

    <!-- reset -->
    <button
      class="w-9 h-9 bg-primary text-white cursor-pointer text-base border-none rounded-xl
      flex items-center justify-center hover:brightness-110"
      on:click={handleReset}
    >
      <img src="/icons/reload.svg" alt="Reset">
    </button>
  </div>
</div>

