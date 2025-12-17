<script lang="ts">
  import { Handle, Position } from '@xyflow/svelte';

  export let id: string;
  export let data: any = {};
  export let selected: boolean;

  function handleClick() {
    const fn = data?.onSelect;
    if (typeof fn === 'function') {
      fn(id);
    }
  }

  $: label = String(data?.label ?? id);
  $: isOptimal = !!data?.optimal;
</script>

<div
  class={`router-node ${selected ? 'router-node--selected' : ''} ${
    isOptimal ? 'router-node--optimal' : ''
  }`}
  on:click={handleClick}
>
  <span class="router-node__label">{label}</span>

  <Handle type="target" position={Position.Left} />
  <Handle type="source" position={Position.Right} />
</div>

<style>
  .router-node {
    position: relative;
    width: 140px;
    height: 60px;
    border-radius: 18px;
    background: #0284c7;
    color: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 600;
    box-shadow: 0 4px 10px rgba(15, 23, 42, 0.25);
    cursor: pointer;
    transition:
      background 0.15s ease,
      border-color 0.15s ease,
      box-shadow 0.15s ease;

    /* default: red border */
    border: 3px solid #ef4444;
  }

  /* turns green when router is marked optimal */
  .router-node--optimal {
    border-color: #22c55e;
  }

  .router-node--selected {
    background: #0b3b63;
    box-shadow: 0 0 0 3px rgba(15, 23, 42, 0.35);
  }

  .router-node__label {
    pointer-events: none;
  }
</style>

