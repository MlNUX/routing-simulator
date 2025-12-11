<script lang="ts">
  import { notify } from '$lib/notify';
  import { setAlgorithm } from '$lib/stores/simulation';
  import { RoutingStrategieType } from '$lib/stores/RoutingStrategieType';

  type AlgorithmSelection = 'link' | 'distance' | 'distancePoisoned';

  // purely UI state – backend is driven via setAlgorithm(...)
  let selected: AlgorithmSelection = 'link';

  async function selectLinkState() {
    selected = 'link';
    setAlgorithm(RoutingStrategieType.LINK_STATE);
    await notify('Link-State algorithm selected');
  }

  async function selectDistanceVector() {
    selected = 'distance';
    setAlgorithm(RoutingStrategieType.DISTANCE_VECTOR);
    await notify('Distance-Vector algorithm selected');
  }

  async function selectDistanceVectorPoisoned() {
    selected = 'distancePoisoned';
    // NOTE: enum name matches your RoutingStrategieType
    setAlgorithm(RoutingStrategieType.DISTANCE_VECTOR_POISONED);
    await notify('Distance-Vector (poisoned reverse) algorithm selected');
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
      class={`btn-pill ${
        selected === 'distancePoisoned' ? 'btn-pill--primary' : 'btn-pill--ghost'
      }`}
      on:click={selectDistanceVectorPoisoned}
    >
      DISTANCE VECTOR (PR)
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

