<script lang="ts">
  import { SvelteFlow, Background, type NodeTypes } from '@xyflow/svelte';
  import RouterNode from '$lib/components/RouterNode.svelte';
  import {
    simulation,
    setSelectedRouter,
    addNode,
    placementMode,
    clearPlacementMode
  } from '$lib/stores/simulation';

  const proOptions = { hideAttribution: true };

  const nodeTypes: NodeTypes = {
    router: RouterNode
  };

  // SimulationController instance from store
  $: controller = $simulation as any;

  // Prefer getter if present
  $: topology =
    typeof controller.getTopology === 'function'
      ? controller.getTopology()
      : controller.topology;

  function mapTopologyNodesToFlowNodes(topology: any) {
    if (!topology || !topology.nodes) return [];

    const rawNodes = topology.nodes;
    const nodesArray = Array.isArray(rawNodes)
      ? rawNodes
      : rawNodes instanceof Map
        ? Array.from(rawNodes.values())
        : [];

    return nodesArray.map((node: any) => ({
      id: node.id,
      type: 'router',
      position: {
        x: node.xPos ?? 0,
        y: node.yPos ?? 0
      },
      data: {
        label: node.name ?? node.id,
        onSelect: (id: string) => setSelectedRouter(id)
      }
    }));
  }

  function mapTopologyLinksToFlowEdges(topology: any) {
    if (!topology || !topology.links) return [];

    return topology.links.map((link: any) => ({
      id: link.id,
      source: link.source?.id,
      target: link.target?.id,
      label: String(link.weight ?? '')
    }));
  }

  $: nodes = mapTopologyNodesToFlowNodes(topology);
  $: edges = mapTopologyLinksToFlowEdges(topology);

  // ---------------------------------------------------------------------------
  // Router placement: click-and-drag to see a preview, release to place router
  // ---------------------------------------------------------------------------

  $: mode = $placementMode;

  let isPlacing = false;
  let previewX = 0;
  let previewY = 0;

  function updatePreview(event: PointerEvent) {
    const wrapper = event.currentTarget as HTMLDivElement;
    const rect = wrapper.getBoundingClientRect();
    previewX = event.clientX - rect.left;
    previewY = event.clientY - rect.top;
  }

  function handlePointerDown(event: PointerEvent) {
    if (mode !== 'router') return;

    const target = event.target as HTMLElement;

    // only start placement when clicking on the empty pane (not on a node)
    if (!target.classList.contains('svelte-flow__pane')) return;

    isPlacing = true;
    updatePreview(event);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent) {
    if (!isPlacing) return;
    updatePreview(event);
  }

  function handlePointerUp(event: PointerEvent) {
    if (!isPlacing) return;

    const wrapper = event.currentTarget as HTMLDivElement;
    const rect = wrapper.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    addNode(x, y);

    isPlacing = false;
    clearPlacementMode();

    try {
      wrapper.releasePointerCapture(event.pointerId);
    } catch {
      // ignore
    }
  }
</script>

<div
  class="editor-drop-wrapper"
  on:pointerdown={handlePointerDown}
  on:pointermove={handlePointerMove}
  on:pointerup={handlePointerUp}
>
  <SvelteFlow
    {nodes}
    {edges}
    {nodeTypes}
    {proOptions}
    fitView
  >
    <Background />
  </SvelteFlow>

  {#if isPlacing && mode === 'router'}
    <!-- visual preview of the router under the cursor -->
    <div
      class="router-preview"
      style={`left: ${previewX}px; top: ${previewY}px;`}
    >
      Router
    </div>
  {/if}
</div>

