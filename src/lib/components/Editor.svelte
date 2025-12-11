<script lang="ts">
  import { SvelteFlow, Background, type NodeTypes } from '@xyflow/svelte';
  import RouterNode from '$lib/components/RouterNode.svelte';
  import { simulation, setSelectedRouter, addNode } from '$lib/stores/simulation';

  const proOptions = { hideAttribution: true };

  const nodeTypes: NodeTypes = {
    router: RouterNode
  };

  // Get topology from SimulationController in the store
  $: controller = $simulation as any;
  $: sim = controller.simulation ?? controller;
  $: topology = sim.topology;

  function mapTopologyNodesToFlowNodes(topology: any) {
    if (!topology?.nodes) return [];

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
    if (!topology?.links) return [];

    const rawLinks = topology.links;
    return rawLinks.map((link: any) => ({
      id: link.id,
      source: link.source?.id,
      target: link.target?.id,
      label: String(link.weight ?? '')
    }));
  }

  $: nodes = mapTopologyNodesToFlowNodes(topology);
  $: edges = mapTopologyLinksToFlowEdges(topology);

  function handleDrop(event: DragEvent) {
    event.preventDefault();

    const data = event.dataTransfer?.getData('application/x-routing-node');
    if (!data) return;

    let payload: { kind: string } | null = null;
    try {
      payload = JSON.parse(data);
    } catch {
      return;
    }

    if (!payload || payload.kind !== 'router') {
      return;
    }

    // Map screen coords to editor coords (simple: use wrapper bounds)
    const bounds = (event.currentTarget as HTMLDivElement).getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;

    // This calls SimulationController.addNode(x, y) via the store wrapper
    addNode(x, y);
  }

  function handleDragOver(event: DragEvent) {
    // Required so that drop is allowed
    event.preventDefault();
  }
</script>

<div
  class="editor-flow-wrapper"
  on:dragover={handleDragOver}
  on:drop={handleDrop}
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
</div>

<style>
  .editor-flow-wrapper {
    position: absolute;
    inset: 0;
  }
</style>

