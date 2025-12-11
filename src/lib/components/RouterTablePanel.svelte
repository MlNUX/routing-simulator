<script lang="ts">
  import { simulation } from '$lib/stores/simulation';

  type RoutingEntry = {
    destination: string;
    cost: number;
    nextHop: string;
  };

  $: selectedId = $simulation.ui.selectedRouterId;
  $: nodes = $simulation.engine.nodes;

  // very simple dummy routing table: every other node as a destination
  $: routingEntries =
    selectedId
      ? (nodes
          .filter((n: any) => n.id !== selectedId)
          .map((n: any, index: number): RoutingEntry => ({
            destination: n.id,
            cost: index + 1,
            nextHop: n.id
          })) as RoutingEntry[])
      : [];
</script>

<div class="router-table-panel">
  {#if selectedId}
    <h3>Routing table: {selectedId}</h3>
    {#if routingEntries.length === 0}
      <p>No entries (dummy).</p>
    {:else}
      <table>
        <thead>
          <tr>
            <th>Destination</th>
            <th>Cost</th>
            <th>Next hop</th>
          </tr>
        </thead>
        <tbody>
          {#each routingEntries as entry}
            <tr>
              <td>{entry.destination}</td>
              <td>{entry.cost}</td>
              <td>{entry.nextHop}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  {:else}
    <p>Select a router to see its routing table.</p>
  {/if}
</div>

<style>
  .router-table-panel {
    position: absolute;
    left: 24px;
    bottom: 120px; /* above the bottom bar */
    padding: 10px 12px;
    border-radius: 12px;
    background: rgba(223, 243, 255, 0.96);
    box-shadow: 0 8px 16px rgba(15, 23, 42, 0.15);
    font-size: 11px;
    min-width: 220px;
    max-height: 220px;
    overflow: auto;
    z-index: 10;
  }

  .router-table-panel h3 {
    font-size: 12px;
    margin-bottom: 6px;
  }

  .router-table-panel table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
  }

  .router-table-panel th,
  .router-table-panel td {
    padding: 2px 4px;
    text-align: left;
  }

  .router-table-panel thead {
    border-bottom: 1px solid #bae6fd;
  }

  .router-table-panel tbody tr:nth-child(even) {
    background: #e0f2fe;
  }
</style>

