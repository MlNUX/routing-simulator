<script lang="ts">
  import { SvelteFlow, Background, type NodeTypes } from '@xyflow/svelte';
  import RouterNode from '$lib/components/RouterNode.svelte';
  import { simulation, setSelectedRouter } from '$lib/stores/simulation';

  const proOptions = { hideAttribution: true };

  const nodeTypes: NodeTypes = {
    router: RouterNode
  };

  // nodes from store, with injected onSelect callback
  $: nodes = $simulation.engine.nodes.map((node) => ({
    ...node,
    data: {
      ...node.data,
      onSelect: (id: string) => setSelectedRouter(id)
    }
  }));

  $: edges = $simulation.engine.edges;
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

