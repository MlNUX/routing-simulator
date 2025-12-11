<script lang="ts">
  import { Handle, Position } from '@xyflow/svelte';

  export let id: string;
  export let data: {
    label: string;
    onSelect?: (id: string) => void;
  };
  export let selected: boolean;

  function handleClick() {
    if (data?.onSelect) {
      data.onSelect(id);
    }
  }
</script>

<div
  class={`router-node ${selected ? 'router-node--selected' : ''}`}
  on:click={handleClick}
>
  <!-- small red status circle -->
  <div class="router-node__status-dot" />

  <span class="router-node__label">{data.label}</span>

  <Handle type="target" position={Position.Left} />
  <Handle type="source" position={Position.Right} />
</div>

<style>
  .router-node {
    position: relative;
    width: 140px;
    height: 60px;
    border-radius: 18px;
    background: #0284c7; /* light blue (default) */
    color: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 600;
    box-shadow: 0 4px 10px rgba(15, 23, 42, 0.25);
    border: 2px solid transparent;
    cursor: pointer;
    transition:
      background 0.15s ease,
      border-color 0.15s ease,
      box-shadow 0.15s ease;
  }

  /* selected router: dark blue */
  .router-node--selected {
    background: #0b3b63; /* darker blue */
    border-color: #0b3b63;
    box-shadow: 0 0 0 3px rgba(15, 23, 42, 0.35);
  }

  .router-node__label {
    pointer-events: none;
  }

  .router-node__status-dot {
    position: absolute;
    left: -10px;
    top: 50%;
    transform: translateY(-50%);
    width: 10px;
    height: 10px;
    border-radius: 999px;
    background: #ef4444; /* red */
    border: 2px solid #f9fafb;
    box-shadow: 0 0 4px rgba(239, 68, 68, 0.7);
  }
</style>

