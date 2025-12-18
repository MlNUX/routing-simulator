<script lang="ts">
  import { simulation, jumpToStep } from '$lib/stores/simulation';

  $: controller = $simulation as any;
  $: sim = controller.simulation ?? controller;

  $: steps = sim.history ? sim.history.length : 1;
  $: currentStep = sim.currentStepIndex ?? 0;

  $: knobLeft = steps > 1 ? (currentStep / (steps - 1)) * 100 : 0;

  function handleClick(event: MouseEvent) {
    if (steps <= 1) return;

    const rect = (event.currentTarget as HTMLDivElement).getBoundingClientRect();
    const x = event.clientX - rect.left;
    const ratio = Math.min(Math.max(x / rect.width, 0), 1);
    const step = Math.round(ratio * (steps - 1));

    jumpToStep(step);
  }
</script>

<div class="relative h-6 mb-1.5" on:click={handleClick}>
  <div class="absolute left-0 right-0 top-1/2 h-0.5 -translate-y-1/2 bg-secondary"></div>
  <div class="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-between">
    {#each Array(steps) as _, i}
      <div class="w-0.5 h-2.5 bg-secondary"></div>
    {/each}
  </div>

  <div
    class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[14px] h-[14px] 
    rounded-full bg-secondary border-2 border-white shadow-sm shadow-slate-900/40"
    style={`left: ${knobLeft}%;`}
  ></div>
</div>

