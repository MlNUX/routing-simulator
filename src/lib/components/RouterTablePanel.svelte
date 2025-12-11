<script lang="ts">
  import { simulation, selectedRouterId } from '$lib/stores/simulation';

  type RoutingEntryView = {
    destination: string;
    cost: number;
    nextHop: string;
  };

  $: controller = $simulation as any;

  $: topology =
    typeof controller.getTopology === 'function'
      ? controller.getTopology()
      : controller.topology;

  $: selectedId = $selectedRouterId;

  function getRouterById(topology: any, id: string | null) {
    if (!topology || !id) return null;

    const rawNodes = topology.nodes;
    const nodesArray = Array.isArray(rawNodes)
      ? rawNodes
      : rawNodes instanceof Map
        ? Array.from(rawNodes.values())
        : [];

    return nodesArray.find((n: any) => n.id === id) ?? null;
  }

  function extractRoutingEntries(router: any): RoutingEntryView[] {
    if (!router?.routingTable?.entries) return [];

    const entries = router.routingTable.entries;

    const rawEntries: any[] =
      entries instanceof Map ? Array.from(entries.values()) : Object.values(entries);

    return rawEntries.map((e: any): RoutingEntryView => ({
      destination: e.destinationId ?? e.destination ?? '',
      cost: e.cost ?? 0,
      nextHop: e.nextHopId ?? e.nextHop ?? ''
    }));
  }

  $: selectedRouter = getRouterById(topology, selectedId);
  $: routingEntries = selectedRouter ? extractRoutingEntries(selectedRouter) : [];
</script>

<div class="router-table-panel">
  {#if selectedId}
    <h3>Routing table: {selectedId}</h3>
    {#if routingEntries.length === 0}
      <p>No entries.</p>
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
    top: 80px;
    right: 24px;
    bottom: 120px; /* leave space for bottom bar */
    padding: 10px 12px;
    border-radius: 12px;
    background: rgba(223, 243, 255, 0.96);
    box-shadow: 0 8px 16px rgba(15, 23, 42, 0.15);
    font-size: 11px;
    min-width: 260px;
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

