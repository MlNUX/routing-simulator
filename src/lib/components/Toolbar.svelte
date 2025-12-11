<script lang="ts">
  import { notify } from '$lib/notify';
  import { simulation, setAlgorithm } from '$lib/stores/simulation';

  // derived from the store
  $: currentAlgorithm = $simulation.engine.algorithm;

  // declare selected with a type, then set it reactively
  let selected: 'link' | 'distance' = 'link';
  $: selected = currentAlgorithm === 'linkState' ? 'link' : 'distance';

  async function selectLinkState() {
    setAlgorithm('linkState');
    await notify('Link State (dummy)');
  }

  async function selectDistanceVector() {
    setAlgorithm('distanceVector');
    await notify('Distance Vector (dummy)');
  }

  async function handleChoosePreset() {
    console.log('CHOOSE PRESET (dummy)');
    await notify('Preset selector not implemented (dummy)');
  }

  async function handleEdit() {
    console.log('Edit (dummy)');
    await notify('Edit mode not implemented (dummy)');
  }

  async function handleSave() {
    console.log('Save (dummy)');
    await notify('Saving topology (dummy)');
  }

  async function handleImport() {
    console.log('Import (dummy)');
    await notify('Import not implemented (dummy)');
  }
</script>

<div class="toolbar">
  <div class="toolbar-title">ROUTING SIMULATOR</div>

  <div class="toolbar-center">
    <button
      class={`btn-pill ${
        selected === 'link' ? 'btn-pill--primary' : 'btn-pill--ghost'
      }`}
      on:click={selectLinkState}
    >
      LINK STATE
    </button>

    <button
      class={`btn-pill ${
        selected === 'distance' ? 'btn-pill--primary' : 'btn-pill--ghost'
      }`}
      on:click={selectDistanceVector}
    >
      DISTANCE VECTOR
    </button>

    <button
      class="btn-pill btn-pill--primary"
      on:click={handleChoosePreset}
    >
      CHOOSE PRESET
    </button>
  </div>

  <div class="toolbar-right">
    <button class="btn-icon" title="Edit" on:click={handleEdit}>✏️</button>
    <button class="btn-icon" title="Save" on:click={handleSave}>💾</button>
    <button class="btn-icon" title="Import" on:click={handleImport}>⬆️</button>
  </div>
</div>

