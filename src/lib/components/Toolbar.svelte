<script lang="ts">
  import { notify } from '$lib/notify';
  import {
    setAlgorithm,
    resetToInitialAndSetAlgorithm,
    exportJson as exportSimulationJson,
    importJson as importSimulationJson,
    simulation,
    warningMessage,
    openRouterHistoryFromToolbar
  } from '$lib/stores/simulation';
  import { RoutingStrategieType } from '$lib/stores/RoutingStrategieType';

  import DebugConsoleModal from '$lib/components/DebugConsoleModal.svelte';

  type AlgorithmSelection = 'link' | 'distance' | 'distancePoisoned';

  let selected: AlgorithmSelection = 'link';
  let fileInput: HTMLInputElement | null = null;

  // Scenario modal
  let showScenarioModal = false;
  let showDebugModal = false;

  type ScenarioEntry = {
    name: string;
    path: string;
    load: () => Promise<string>;
  };

  let scenarios: ScenarioEntry[] = [];

  const scenarioModules = import.meta.glob('$lib/scenarios/*.json', { as: 'raw' }) as Record<
    string,
    () => Promise<string>
  >;

  function buildScenarioList(): ScenarioEntry[] {
    const entries: ScenarioEntry[] = [];

    for (const [path, loader] of Object.entries(scenarioModules)) {
      const base = path.split('/').pop() ?? path;
      const name = base.replace(/\.json$/i, '').replace(/[_-]/g, ' ');
      entries.push({ name, path, load: loader });
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));
    return entries;
  }

  function algoToSelection(algo: string): AlgorithmSelection {
    if (algo === RoutingStrategieType.DISTANCE_VECTOR) return 'distance';
    if (algo === RoutingStrategieType.DISTANCE_VECTOR_POISONED) return 'distancePoisoned';
    return 'link';
  }

  function selectedToAlgo(sel: AlgorithmSelection): RoutingStrategieType {
    if (sel === 'distance') return RoutingStrategieType.DISTANCE_VECTOR;
    if (sel === 'distancePoisoned') return RoutingStrategieType.DISTANCE_VECTOR_POISONED;
    return RoutingStrategieType.LINK_STATE;
  }

  function readAlgoFromController(): string {
    const ctrl = $simulation as any;
    if (ctrl && typeof ctrl.getAlgorithm === 'function') {
      return String(ctrl.getAlgorithm());
    }
    return String(ctrl?.algorithm ?? RoutingStrategieType.LINK_STATE);
  }

  function syncSelectedToImportedAlgorithm(): void {
    selected = algoToSelection(readAlgoFromController());
  }

  function totalStepsNow(): number {
    const ctrl = $simulation as any;
    if (ctrl && typeof ctrl.getTotalSteps === 'function') {
      return Number(ctrl.getTotalSteps());
    }
    return Number(ctrl?.totalSteps ?? 1);
  }

  async function applyAlgorithm(
    nextSelected: AlgorithmSelection,
    algo: RoutingStrategieType,
    label: string
  ) {
    const steps = totalStepsNow();

    if (typeof window !== 'undefined' && steps > 1) {
      const ok = window.confirm(
        'Changing the routing algorithm will reset the simulation to the original topology and delete all steps and edits. Continue?'
      );
      if (!ok) {
        return;
      }

      resetToInitialAndSetAlgorithm(algo);
    } else {
      setAlgorithm(algo);
    }

    selected = nextSelected;
    await notify(`${label} algorithm selected`);
  }

  async function selectLinkState() {
    await applyAlgorithm('link', RoutingStrategieType.LINK_STATE, 'Link-State');
  }

  async function selectDistanceVector() {
    await applyAlgorithm('distance', RoutingStrategieType.DISTANCE_VECTOR, 'Distance-Vector');
  }

  async function selectDistanceVectorPoisoned() {
    await applyAlgorithm(
      'distancePoisoned',
      RoutingStrategieType.DISTANCE_VECTOR_POISONED,
      'Distance-Vector (poisoned reverse)'
    );
  }

  async function handleChoosePreset() {
    scenarios = buildScenarioList();
    showScenarioModal = true;

    if (scenarios.length === 0) {
      await notify('No scenarios found in src/lib/scenarios/*.json');
    }
  }

  function topologyHasContent(): boolean {
    const ctrl = $simulation as any;
    const nodeCount = ctrl?.topology?.nodes?.size ?? 0;
    const linkCount = ctrl?.topology?.links?.length ?? 0;
    return nodeCount > 0 || linkCount > 0;
  }

  async function loadScenario(entry: ScenarioEntry) {
    if (typeof window === 'undefined') {
      return;
    }

    if (topologyHasContent()) {
      const ok = window.confirm(`Load scenario "${entry.name}" and overwrite current topology?`);
      if (!ok) {
        return;
      }
    }

    try {
      const text = await entry.load();
      importSimulationJson(text);
      syncSelectedToImportedAlgorithm();
      setAlgorithm(selectedToAlgo(selected));

      showScenarioModal = false;
      await notify(`Loaded scenario: ${entry.name}`);
    } catch (e) {
      console.error(e);
      await notify('Failed to load scenario');
    }
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
      syncSelectedToImportedAlgorithm();
      setAlgorithm(selectedToAlgo(selected));

      await notify(`Imported JSON: ${file.name}`);
    } catch (e) {
      console.error(e);
      await notify('Import failed (invalid JSON?)');
    }
  }
</script>

<div class="fixed top-1.5 left-1/2 -translate-x-1/2 z-50 w-[min(1120px,90vw)]">
  <div class="w-full px-6 py-3 flex items-center justify-between">
    
    <!--top bar left side-->
    <div class="w-1/3">
      <div class="text-base font-black text-bg-text tracking-[0.25em]">ROUTING SIMULATOR</div>
    </div>

    <!--top bar center-->
    <div class="w-1/3 flex flex-wrap items-center justify-center gap-3">
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

      <button class="btn-pill btn-pill--ghost" on:click={openRouterHistoryFromToolbar}>
        HISTORY
      </button>

      <button class="btn-pill btn-pill--ghost" on:click={() => (showDebugModal = true)}>
        DEBUG
      </button>

      <button
        class="btn-pill btn-pill--primary"
        on:click={handleChoosePreset}
      >
        CHOOSE PRESET
      </button>
    </div>

    <!--top bar right side-->
    <div class="w-1/3 flex items-center justify-end gap-2">
      <!--Edit button-->
      <!--TO DO: add on-click functionality-->
      <button class="w-9 h-9 bg-primary text-white cursor-pointer text-base border-none rounded-xl
      flex items-center justify-center hover:brightness-110" 
      >
        <img src="/icons/edit.svg" alt="Edit">
      </button>

      <!--Save button-->
      <button class="w-9 h-9 bg-primary text-white cursor-pointer text-base border-none rounded-xl
      flex items-center justify-center hover:brightness-110" 
      on:click={handleSave}>
        <img src="/icons/save.svg" alt="Save">
      </button>

      <!--Import button-->
      <button class="w-9 h-9 bg-primary text-white cursor-pointer text-base border-none rounded-xl
      flex items-center justify-center hover:brightness-110" 
      on:click={handleImport}>
        <img src="/icons/upload.svg" alt="Import">
      </button>

      <input
        bind:this={fileInput}
        type="file"
        accept="application/json,.json"
        style="display:none;"
        on:change={handleFileChosen}
      />
    </div>
  </div>
</div>

{#if $warningMessage}
  <div class="warning-bar">
    {$warningMessage}
  </div>
{/if}

<DebugConsoleModal open={showDebugModal} onClose={() => (showDebugModal = false)} />

{#if showScenarioModal}
  <div class="modal-backdrop" on:click={() => (showScenarioModal = false)} />

  <div class="modal">
    <div class="modal-header">
      <div class="modal-title">Scenarios</div>
      <button class="btn-icon" title="Close" on:click={() => (showScenarioModal = false)}>
        ✖
      </button>
    </div>

    {#if scenarios.length === 0}
      <div class="modal-body">
        No scenario JSON files found.<br />
        Put files into <code>src/lib/scenarios/*.json</code>.
      </div>
    {:else}
      <div class="modal-body">
        <ul class="scenario-list">
          {#each scenarios as s}
            <li>
              <button class="scenario-btn" on:click={() => loadScenario(s)}>
                {s.name}
              </button>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  </div>
{/if}

<style>
  .warning-bar {
    position: absolute;
    top: 62px;
    left: 24px;
    right: 24px;
    padding: 8px 10px;
    border-radius: 12px;
    background: rgba(245, 158, 11, 0.15);
    border: 1px solid rgba(245, 158, 11, 0.35);
    color: #0f172a;
    font-size: 12px;
    z-index: 30;
  }

  .modal-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(15, 23, 42, 0.35);
    z-index: 40;
  }

  .modal {
    position: absolute;
    top: 90px;
    left: 50%;
    transform: translateX(-50%);
    width: min(520px, calc(100vw - 48px));
    max-height: calc(100vh - 150px);
    overflow: auto;
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.98);
    box-shadow: 0 14px 28px rgba(15, 23, 42, 0.25);
    z-index: 50;
    padding: 12px;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 8px;
  }

  .modal-title {
    font-size: 14px;
    font-weight: 700;
    color: #0f172a;
  }

  .modal-body {
    font-size: 12px;
    color: #0f172a;
  }

  .scenario-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 8px;
  }

  .scenario-btn {
    width: 100%;
    text-align: left;
    padding: 10px 12px;
    border-radius: 12px;
    border: 1px solid rgba(15, 23, 42, 0.15);
    background: rgba(2, 132, 199, 0.08);
    cursor: pointer;
    font-size: 12px;
  }

  .scenario-btn:hover {
    background: rgba(2, 132, 199, 0.14);
  }

  code {
    background: rgba(15, 23, 42, 0.08);
    padding: 2px 6px;
    border-radius: 8px;
  }
</style>

