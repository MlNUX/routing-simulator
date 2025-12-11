<script lang="ts">
  import { simulation } from '$lib/stores/simulation';

  $: controller = $simulation as any;
  $: sim = controller.simulation ?? controller;
  $: testPacket = sim.testPacket ?? null;
</script>

{#if testPacket}
  <div class="packet-overlay">
    <div class="packet-title">Test Packet</div>
    <div>Hop {testPacket.currentHopIndex + 1} / {testPacket.path.length}</div>
    <div class="packet-path">
      {testPacket.path.join(' → ')}
    </div>
  </div>
{/if}

<style>
  .packet-overlay {
    position: absolute;
    top: 88px;
    left: 24px;
    padding: 8px 12px;
    border-radius: 12px;
    background: rgba(15, 23, 42, 0.9);
    color: #e5e7eb;
    font-size: 11px;
    box-shadow: 0 4px 8px rgba(15, 23, 42, 0.25);
    z-index: 10;
  }

  .packet-title {
    font-size: 11px;
    font-weight: 600;
    margin-bottom: 4px;
  }

  .packet-path {
    margin-top: 2px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
      'Liberation Mono', 'Courier New', monospace;
  }
</style>

