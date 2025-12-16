<script lang="ts">
  import {
    SvelteFlow,
    Background,
    type NodeTypes,
    useSvelteFlow
  } from '@xyflow/svelte';

  import RouterNode from '$lib/components/RouterNode.svelte';
  import {
    simulation,
    setSelectedRouter,
    addNode,
    placementMode,
    clearPlacementMode,
    linkSourceRouterId,
    updateNodePosition,
    updateNodePositions
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

  // ---------------------------------------------------------------------------
  // IMPORTANT: Use bind:nodes / bind:edges so XYFlow updates flowNodes on drag
  // ---------------------------------------------------------------------------

  let flowNodes: any[] = [];
  let flowEdges: any[] = [];

  // Keep last known flow positions without creating extra reactive dependencies
  const lastFlowPositions = new Map<string, { x: number; y: number }>();
  const prevDragging = new Map<string, boolean>();

  function topologyNodesArray(topo: any): any[] {
    if (!topo || !topo.nodes) return [];

    const rawNodes = topo.nodes;
    if (Array.isArray(rawNodes)) return rawNodes;

    if (rawNodes instanceof Map) {
      return Array.from(rawNodes.values());
    }

    return [];
  }

  function buildFlowNodesFromTopology(topo: any): any[] {
    const arr = topologyNodesArray(topo);

    return arr.map((node: any) => {
      const id = String(node.id);

      // Prefer lastFlowPositions (what the user sees / dragged to),
      // otherwise fall back to topology xPos/yPos
      const pos = lastFlowPositions.get(id);
      const x = pos ? pos.x : (node.xPos ?? 0);
      const y = pos ? pos.y : (node.yPos ?? 0);

      return {
        id,
        type: 'router',
        position: { x, y },
        data: {
          label: node.name ?? id,
          onSelect: (rid: string) => setSelectedRouter(rid)
        }
      };
    });
  }

  function buildFlowEdgesFromTopology(topo: any): any[] {
    if (!topo || !topo.links) return [];

    return topo.links.map((link: any) => ({
      id: link.id,
      source: link.source?.id,
      target: link.target?.id,
      label: String(link.weight ?? '')
    }));
  }

  // Whenever topology changes (due to store updates), rebuild flow nodes/edges.
  // NOTE: we do NOT read flowNodes here (so we don't rerun on every drag tick).
  $: if (topology) {
    flowEdges = buildFlowEdgesFromTopology(topology);
    flowNodes = buildFlowNodesFromTopology(topology);
  }

  // Track live positions as the user drags (this block reruns on drag ticks).
  $: {
    for (const n of flowNodes) {
      if (!n || !n.id || !n.position) continue;
      lastFlowPositions.set(String(n.id), { x: Number(n.position.x ?? 0), y: Number(n.position.y ?? 0) });
    }
  }

  // Persist into SimulationController when a drag ends.
  // This avoids spamming history during dragging.
  $: {
    const updates: { id: string; xPos: number; yPos: number }[] = [];

    for (const n of flowNodes) {
      if (!n || !n.id) continue;

      const id = String(n.id);
      const nowDragging = !!n.dragging;
      const wasDragging = prevDragging.get(id) ?? false;

      // commit only on transition: dragging true -> false
      if (wasDragging && !nowDragging) {
        const x = Number(n.position?.x ?? 0);
        const y = Number(n.position?.y ?? 0);
        updates.push({ id, xPos: x, yPos: y });
      }

      prevDragging.set(id, nowDragging);
    }

    if (updates.length === 1) {
      const u = updates[0];
      updateNodePosition(u.id, u.xPos, u.yPos);
    } else if (updates.length > 1) {
      updateNodePositions(updates);
    }
  }

  // Extra safety: if your version dispatches drag-stop events reliably, persist there too.
  function handleNodeDragStop(event: CustomEvent) {
    const detail: any = event.detail;
    const node: any = detail?.node;
    if (!node) return;

    const id = String(node.id);
    const x = Number(node.position?.x ?? 0);
    const y = Number(node.position?.y ?? 0);

    updateNodePosition(id, x, y);
  }

  function handleSelectionDragStop(event: CustomEvent) {
    const detail: any = event.detail;
    const nodes: any[] = Array.isArray(detail?.nodes) ? detail.nodes : [];

    if (nodes.length === 0) return;

    updateNodePositions(
      nodes.map((n: any) => ({
        id: String(n.id),
        xPos: Number(n.position?.x ?? 0),
        yPos: Number(n.position?.y ?? 0)
      }))
    );
  }

  // ---------------------------------------------------------------------------
  // Tools: router placement
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

    // Convert screen coords to flow coords (fixes offset)
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
    bind:nodes={flowNodes}
    bind:edges={flowEdges}
    {nodeTypes}
    {proOptions}
    nodeOrigin={[0.5, 0.5]}
    fitView
    on:nodedragstop={handleNodeDragStop}
    on:selectiondragstop={handleSelectionDragStop}
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

