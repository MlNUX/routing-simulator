<script lang="ts">
  import { SvelteFlow, Background, type NodeTypes } from '@xyflow/svelte';
  import RouterNode from '$lib/components/RouterNode.svelte';
  import { simulation, setSelectedRouter } from '$lib/stores/simulation';

  const proOptions = { hideAttribution: true };

  const nodeTypes: NodeTypes = {
    router: RouterNode
  };

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
</script>

<SvelteFlow
  {nodes}
  {edges}
  {nodeTypes}
  {proOptions}
  fitView
>
  <Background />
</SvelteFlow>

