<script lang="ts">
  import { simulation } from '$lib/stores/simulation';

  $: controller = $simulation as any;
  $: sim = controller.simulation ?? controller;

  $: routingPackets = sim.routingPackets ?? [];
  $: testPackets =
    sim.testPackets ??
    (sim.testPacket ? [sim.testPacket] : []);
</script>

{#if routingPackets.length > 0 || testPackets.length > 0}
  <div
    class="packets-panel"
    style="transform: scale(var(--uiScale, 1)); transform-origin: top left;"
  >
    {#if routingPackets.length > 0}
      <div class="packets-section">
        <h3>Routing packets</h3>
        <ul>
          {#each routingPackets as p}
            <li>
              <span class="packet-kind">R</span>
              <span class="packet-path">{p.sourceId} → {p.targetId}</span>
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    {#if testPackets.length > 0}
      <div class="packets-section">
        <h3>Test packets</h3>
        <ul>
          {#each testPackets as p}
            <li>
              <span class="packet-kind packet-kind--test">T</span>
              <span class="packet-path">{p.sourceId} → {p.targetId}</span>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  </div>
{/if}

<style>
  .packets-panel {
    position: absolute;
    left: 24px;
    top: 88px;
    max-width: 260px;
    padding: 10px 12px;
    border-radius: 12px;
    background: rgba(15, 23, 42, 0.9);
    color: #e5e7eb;
    font-size: 11px;
    box-shadow: 0 4px 8px rgba(15, 23, 42, 0.25);
    z-index: 10;
  }

  .packets-section + .packets-section {
    margin-top: 8px;
  }

  .packets-section h3 {
    font-size: 11px;
    font-weight: 600;
    margin-bottom: 4px;
  }

  .packets-section ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .packets-section li {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 0;
  }

  .packet-kind {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    border-radius: 999px;
    font-size: 9px;
    font-weight: 700;
    background: #38bdf8;
    color: #0f172a;
  }

  .packet-kind--test {
    background: #22c55e;
  }

  .packet-path {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
      'Liberation Mono', 'Courier New', monospace;
  }
</style>

