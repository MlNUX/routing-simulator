<script lang="ts">
  import { browser } from '$app/environment';
  import { SvelteFlow, Background, type NodeTypes } from '@xyflow/svelte';

  import RouterNode from '$lib/components/RouterNode.svelte';
  import { notify } from '$lib/notify';

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
    setSelectedEdge,
    setMultiSelection,
    importJson as importSimulationJson
  } from '$lib/stores/simulation';

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
          label: node?.name ?? id,
          optimal: !!node?.optimal,
          onSelect: (rid: string) => setSelectedRouter(rid)
        }
      };
    });
  }

  function buildFlowEdgesFromTopology(topo: any, selectedId: string | null): any[] {
    if (!topo || !topo.links) return [];

    return topo.links.map((link: any) => {
      const id = String(link.id);
      const isSelected = selectedId === id;

      return {
        id,
        source: link.source?.id,
        target: link.target?.id,
        label: String(link.weight ?? ''),
        selectable: true,
        selected: isSelected,
        style: isSelected ? { stroke: '#f97316', strokeWidth: 4 } : undefined,
        labelStyle: isSelected ? { fill: '#f97316', fontWeight: 700 } : undefined
      };
    });
  }

  $: if (topology) {
    flowNodes = buildFlowNodesFromTopology(topology);
    flowEdges = buildFlowEdgesFromTopology(topology, $selectedEdgeId);
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

  $: mode = $placementMode;

  // Multi-select only in delete mode
  $: {
    if (mode === 'delete') {
      const selectedNodeIds = flowNodes
        .filter((n) => !!n?.selected)
        .map((n) => String(n.id));

      const selectedEdgeIds = flowEdges
        .filter((e) => !!e?.selected)
        .map((e) => String(e.id));

      setMultiSelection(selectedNodeIds, selectedEdgeIds);
    } else {
      setMultiSelection([], []);
    }
  }

  // Persist node positions after drag end
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

  // ------------------- Snap-to-grid -------------------
  const SNAP = 20;

  function snapValue(v: number): number {
    return Math.round(v / SNAP) * SNAP;
  }

  // ------------------- Router placement -------------------

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
    if (!browser) return;
    if (isRunning) return;
    if (mode !== 'router') return;

    const target = event.target as HTMLElement;
    if (!target.classList.contains('svelte-flow__pane')) return;

    isPlacing = true;
    updatePreview(event);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent) {
    if (!browser) return;
    if (!isPlacing) return;
    updatePreview(event);
  }

  function handlePointerUp(event: PointerEvent) {
    if (!browser) return;
    if (!isPlacing) return;

    const wrapper = event.currentTarget as HTMLDivElement;
    const rect = wrapper.getBoundingClientRect();
    const rawX = event.clientX - rect.left;
    const rawY = event.clientY - rect.top;

    const x = snapValue(rawX);
    const y = snapValue(rawY);

    addNode(x, y);

    isPlacing = false;
    clearPlacementMode();

    try {
      wrapper.releasePointerCapture(event.pointerId);
    } catch {
      // ignore
    }
  }

  // ------------------- Drag & Drop JSON import -------------------

  let isDragOver = false;

  function isJsonFile(file: File): boolean {
    const name = String(file?.name ?? '').toLowerCase();
    const type = String(file?.type ?? '').toLowerCase();
    return name.endsWith('.json') || type.includes('application/json');
  }

  function handleDragOver(event: DragEvent) {
    if (!browser) return;
    event.preventDefault();
    isDragOver = true;
  }

  function handleDragLeave(event: DragEvent) {
    if (!browser) return;
    event.preventDefault();
    isDragOver = false;
  }

  async function handleDrop(event: DragEvent) {
    if (!browser) return;
    event.preventDefault();
    isDragOver = false;

    const dt = event.dataTransfer;
    const files = dt?.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    if (!isJsonFile(file)) {
      await notify('Drop a .json file to import a topology.');
      return;
    }

    const ok = window.confirm(`Import "${file.name}" and overwrite the current topology?`);
    if (!ok) return;

    try {
      const text = await file.text();
      importSimulationJson(text);
      await notify(`Imported JSON: ${file.name}`);
    } catch (e) {
      console.error(e);
      await notify('Import failed (invalid JSON?)');
    }
  }

  // ------------------- Canvas UI: grid toggle + fit view -------------------

  let showGrid = true;
  let fitViewNonce = 0;

  function toggleGrid(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    showGrid = !showGrid;
  }

  function fitViewNow(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    fitViewNonce = fitViewNonce + 1;
  }
</script>

<div
  class="editor-drop-wrapper"
  on:pointerdown={handlePointerDown}
  on:pointermove={handlePointerMove}
  on:pointerup={handlePointerUp}
  on:dragover={handleDragOver}
  on:dragleave={handleDragLeave}
  on:drop={handleDrop}
>
  {#if browser}
    {#key fitViewNonce}
      <SvelteFlow
        bind:nodes={flowNodes}
        bind:edges={flowEdges}
        {nodeTypes}
        {proOptions}
        nodeOrigin={[0.5, 0.5]}
        fitView
        nodesDraggable={!isRunning}
        snapToGrid={true}
        snapGrid={[20, 20]}
        selectionOnDrag={mode === 'delete'}
        defaultEdgeOptions={{ selectable: true, interactionWidth: 32 }}
        on:nodedragstop={handleNodeDragStop}
        on:selectiondragstop={handleSelectionDragStop}
        on:edgeclick={handleEdgeClick}
        on:edgeClick={handleEdgeClick}
        on:paneClick={handlePaneClick}
        on:paneclick={handlePaneClick}
      >
        {#if showGrid}
          <!-- Use a visible line grid with explicit color -->
          <Background
            variant="lines"
            gap={20}
            size={1}
            color="rgba(226, 232, 240, 0.14)"
            bgColor="transparent"
          />
        {/if}
      </SvelteFlow>
    {/key}
  {:else}
    <div class="ssr-placeholder"></div>
  {/if}

  {#if browser}
    <div class="canvas-tools" aria-label="Canvas tools">
      <button class="canvas-btn" on:click={fitViewNow} title="Fit view">
        Fit
      </button>
      <button class="canvas-btn" on:click={toggleGrid} title="Toggle grid">
        Grid: {showGrid ? 'On' : 'Off'}
      </button>
    </div>
  {/if}

  {#if isDragOver}
    <div class="drop-overlay">
      <div class="drop-card">
        Drop JSON to import topology
      </div>
    </div>
  {/if}

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
      Delete tool: click a router/link to delete, or drag-select multiple and press Delete.
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
  .ssr-placeholder {
    position: absolute;
    inset: 0;
  }

  .canvas-tools {
    position: absolute;
    right: 16px;
    bottom: 16px;
    display: flex;
    gap: 8px;
    z-index: 25;
    pointer-events: auto;
  }

  .canvas-btn {
    padding: 8px 10px;
    border-radius: 12px;
    border: 1px solid rgba(15, 23, 42, 0.18);
    background: rgba(255, 255, 255, 0.92);
    color: #0f172a;
    font-size: 11px;
    cursor: pointer;
    box-shadow: 0 6px 12px rgba(15, 23, 42, 0.12);
  }

  .canvas-btn:hover {
    background: rgba(255, 255, 255, 0.98);
  }

  .drop-overlay {
    position: absolute;
    inset: 0;
    background: rgba(15, 23, 42, 0.25);
    z-index: 60;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
  }

  .drop-card {
    padding: 14px 16px;
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.96);
    border: 1px solid rgba(15, 23, 42, 0.12);
    box-shadow: 0 14px 28px rgba(15, 23, 42, 0.18);
    font-size: 13px;
    font-weight: 700;
    color: #0f172a;
  }

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

  :global(.svelte-flow__edge.selected path) {
    stroke: #f97316;
    stroke-width: 4px;
  }
</style>

