<script lang="ts">
  import { notify } from '$lib/notify';
  import { setAlgorithm, exportJson as exportSimulationJson, importJson as importSimulationJson } from '$lib/stores/simulation';
  import { RoutingStrategieType } from '$lib/stores/RoutingStrategieType';

  type AlgorithmSelection = 'link' | 'distance' | 'distancePoisoned';

  let selected: AlgorithmSelection = 'link';
  let fileInput: HTMLInputElement | null = null;

  function currentAlgoType(): RoutingStrategieType {
    if (selected === 'distance') {
      return RoutingStrategieType.DISTANCE_VECTOR;
    }
    if (selected === 'distancePoisoned') {
      return RoutingStrategieType.DISTANCE_VECTOR_POISONED;
    }
    return RoutingStrategieType.LINK_STATE;
  }

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
    setAlgorithm(RoutingStrategieType.DISTANCE_VECTOR_POISONED);
    await notify('Distance-Vector (poisoned reverse) algorithm selected');
  }

  async function handleChoosePreset() {
    console.log('CHOOSE PRESET (dummy)');
    await notify('Preset selector not implemented (dummy)');
  }

  async function handleSave() {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const json = exportSimulationJson();

      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = 'routing-simulator.json';
      document.body.appendChild(a);
      a.click();
      a.remove();

      URL.revokeObjectURL(url);

      await notify('Exported topology JSON');
    } catch (e) {
      console.error(e);
      await notify('Export failed');
    }
  }

  async function handleImport() {
    if (typeof window === 'undefined') {
      return;
    }
    if (!fileInput) {
      return;
    }

    fileInput.value = '';
    fileInput.click();
  }

  async function handleFileChosen(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const files = input.files;
    if (!files || files.length === 0) {
      return;
    }

    const file = files[0];

    try {
      const text = await file.text();

      importSimulationJson(text);

      // Re-apply current algorithm to imported routers so routing steps work immediately
      setAlgorithm(currentAlgoType());

      await notify(`Imported JSON: ${file.name}`);
    } catch (e) {
      console.error(e);
      await notify('Import failed (invalid JSON?)');
    }
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
    <button class="btn-icon" title="Save JSON" on:click={handleSave}>💾</button>
    <button class="btn-icon" title="Import JSON" on:click={handleImport}>⬆️</button>

    <input
      bind:this={fileInput}
      type="file"
      accept="application/json,.json"
      style="display:none;"
      on:change={handleFileChosen}
    />
  </div>
</div>

