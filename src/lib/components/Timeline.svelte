<script lang="ts">
  import { simulation, setCurrentStep } from '$lib/stores/simulation';

  $: steps = $simulation.engine.steps;
  $: currentStep = $simulation.engine.currentStep;

  $: knobLeft = steps > 1 ? (currentStep / (steps - 1)) * 100 : 0;

  function handleClick(event: MouseEvent) {
    if (steps <= 1) return;

    const rect = (event.currentTarget as HTMLDivElement).getBoundingClientRect();
    const x = event.clientX - rect.left;
    const ratio = Math.min(Math.max(x / rect.width, 0), 1);
    const step = Math.round(ratio * (steps - 1));
    setCurrentStep(step);
  }
</script>

<div class="timeline" on:click={handleClick}>
  <div class="timeline-line"></div>
  <div class="timeline-ticks">
    {#each Array(steps) as _, i}
      <div class="timeline-tick"></div>
    {/each}
  </div>

  <div
    class="timeline-knob"
    style={`left: ${knobLeft}%;`}
  ></div>
</div>

