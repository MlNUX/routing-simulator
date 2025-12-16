<script lang="ts">
  import { SvelteFlow, Background, type NodeTypes, useSvelteFlow } from '@xyflow/svelte';
  import RouterNode from '$lib/components/RouterNode.svelte';
  import {
    simulation,
    setSelectedRouter,
    addNode,
    placementMode,
    clearPlacementMode,
    linkSourceRouterId
  } from '$lib/stores/simulation';

  const { screenToFlowPosition } = useSvelteFlow();

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
  // Tools
  // ---------------------------------------------------------------------------

  $: mode = $placementMode;

  // Router placement: click-and-drag to see a preview, release to place router
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

    // Convert screen/client coords to flow coords (fixes fixed offset due to viewport/pan/zoom)
    const flowPos = screenToFlowPosition({ x: event.clientX, y: event.clientY });

    addNode(flowPos.x, flowPos.y);

    isPlacing = false;
    clearPlacementMode();

    const wrapper = event.currentTarget as HTMLDivElement;
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
    nodeOrigin={[0.5, 0.5]}
    fitView
  >
    <Background />
  </SvelteFlow>

  {#if mode === 'link'}
    <div class="tool-hint">
      {#if $linkSourceRouterId}
        Link tool: select target router to connect with <b>{$linkSourceRouterId}</b>.
      {:else}
        Link tool: select the first router.
      {/if}
    </div>
  {/if}

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

<style>
  .tool-hint {
    position: absolute;
    left: 24px;
    bottom: 130px;
    padding: 8px 10px;
    border-radius: 12px;
    background: rgba(15, 23, 42, 0.9);
    color: #e5e7eb;
    font-size: 11px;
    box-shadow: 0 4px 8px rgba(15, 23, 42, 0.25);
    z-index: 20;
    pointer-events: none;
  }

  .router-preview {
    position: absolute;
    transform: translate(-50%, -50%);
    width: 140px;
    height: 60px;
    border-radius: 18px;
    background: rgba(2, 132, 199, 0.6);
    color: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 600;
    border: 2px dashed rgba(255, 255, 255, 0.75);
    z-index: 20;
    pointer-events: none;
  }
</style>

