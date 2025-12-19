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
  $: status = String(data?.status ?? 'pre'); // "pre" | "optimal" | "nonoptimal"
</script>

<div
  class={`router-node ${selected ? 'router-node--selected' : ''} ${
    status === 'optimal'
      ? 'router-node--optimal'
      : status === 'nonoptimal'
        ? 'router-node--nonoptimal'
        : 'router-node--pre'
  }`}
  on:click={handleClick}
>
  <span class="router-node__label">{label}</span>


  <Handle id={`${id}-top`} type="target" position={Position.Top} />
  <Handle id={`${id}-right`} type="target" position={Position.Right} />
  <Handle id={`${id}-bottom`} type="target" position={Position.Bottom} />
  <Handle id={`${id}-left`} type="target" position={Position.Left} />
  
  <Handle id={`${id}-top`} type="source" position={Position.Top} />
  <Handle id={`${id}-right`} type="source" position={Position.Right} />
  <Handle id={`${id}-bottom`} type="source" position={Position.Bottom} />
  <Handle id={`${id}-left`} type="source" position={Position.Left} />

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

    border: 3px solid rgba(148, 163, 184, 0.9); /* default grey (pre) */
  }

  .router-node--pre {
    border-color: rgba(148, 163, 184, 0.9);
  }

  .router-node--nonoptimal {
    border-color: #ef4444;
  }

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

