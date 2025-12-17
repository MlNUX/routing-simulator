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
    updateNodePositions,
    deleteLinkById,
    selectedEdgeId,
    setSelectedEdge
  } from '$lib/stores/simulation';

  const { screenToFlowPosition } = useSvelteFlow();

  const proOptions = { hideAttribution: true };

  const nodeTypes: NodeTypes = {
    router: RouterNode
  };

  $: controller = $simulation as any;
  $: isRunning = !!controller?.running;

  $: topology =
    typeof controller.getTopology === 'function'
      ? controller.getTopology()
      : controller.topology;

  let flowNodes: any[] = [];
  let flowEdges: any[] = [];

  const lastFlowPositions = new Map<string, { x: number; y: number }>();
  const prevDragging = new Map<string, boolean>();

  let lastTopologyRef: any = null;
  $: if (topology && topology !== lastTopologyRef) {
    lastFlowPositions.clear();
    prevDragging.clear();
    lastTopologyRef = topology;
  }

  function topologyNodesArray(topo: any): any[] {
    if (!topo || !topo.nodes) return [];
    const rawNodes = topo.nodes;

    if (Array.isArray(rawNodes)) return rawNodes;
    if (rawNodes instanceof Map) return Array.from(rawNodes.values());

    return [];
  }

  function buildFlowNodesFromTopology(topo: any): any[] {
    const arr = topologyNodesArray(topo);

    const ids = new Set<string>();
    for (const n of arr) ids.add(String(n.id));
    for (const k of lastFlowPositions.keys()) {
      if (!ids.has(k)) lastFlowPositions.delete(k);
    }

    return arr.map((node: any) => {
      const id = String(node.id);

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

    return topo.links.map((link: any) => {
      const id = String(link.id);
      const isSelected = $selectedEdgeId === id;

      return {
        id,
        source: link.source?.id,
        target: link.target?.id,
        label: String(link.weight ?? ''),
        class: isSelected ? 'edge-selected' : ''
      };
    });
  }

  $: if (topology) {
    flowEdges = buildFlowEdgesFromTopology(topology);
    flowNodes = buildFlowNodesFromTopology(topology);
  }

  $: {
    for (const n of flowNodes) {
      if (!n || !n.id || !n.position) continue;
      lastFlowPositions.set(String(n.id), {
        x: Number(n.position.x ?? 0),
        y: Number(n.position.y ?? 0)
      });
    }
  }

  $: {
    if (isRunning) {
      prevDragging.clear();
    } else {
      const updates: { id: string; xPos: number; yPos: number }[] = [];

      for (const n of flowNodes) {
        if (!n || !n.id) continue;

        const id = String(n.id);
        const nowDragging = !!n.dragging;
        const wasDragging = prevDragging.get(id) ?? false;

        if (wasDragging && !nowDragging) {
          updates.push({
            id,
            xPos: Number(n.position?.x ?? 0),
            yPos: Number(n.position?.y ?? 0)
          });
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
  }

  function handleNodeDragStop(event: CustomEvent) {
    if (isRunning) return;

    const detail: any = event.detail;
    const node: any = detail?.node;
    if (!node) return;

    updateNodePosition(
      String(node.id),
      Number(node.position?.x ?? 0),
      Number(node.position?.y ?? 0)
    );
  }

  function handleSelectionDragStop(event: CustomEvent) {
    if (isRunning) return;

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

  $: mode = $placementMode;

  function handlePaneClick() {
    setSelectedEdge(null);
  }

  function handleEdgeClick(payload: any) {
    const edge =
      payload?.detail?.edge ??
      payload?.edge ??
      payload?.detail ??
      payload;

    const edgeId = edge?.id ? String(edge.id) : '';
    if (!edgeId) return;

    if (mode === 'delete') {
      if (isRunning) return;
      deleteLinkById(edgeId);
      if ($selectedEdgeId === edgeId) {
        setSelectedEdge(null);
      }
      return;
    }

    setSelectedEdge(edgeId);
  }

  // Router placement
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
    if (isRunning) return;
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
    nodesDraggable={!isRunning}
    defaultEdgeOptions={{ selectable: true, interactionWidth: 32 }}
    on:nodedragstop={handleNodeDragStop}
    on:selectiondragstop={handleSelectionDragStop}
    on:edgeclick={handleEdgeClick}
    onedgeclick={handleEdgeClick}
    on:paneClick={handlePaneClick}
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

  {#if mode === 'delete'}
    <div class="tool-hint">
      Delete tool: click a router or a link to delete it.
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

  :global(.edge-selected path) {
    stroke-width: 4px;
  }

  :global(.edge-selected text) {
    font-weight: 700;
  }
</style>

