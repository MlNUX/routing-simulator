<script lang="ts">
  import { debugRunCommand, debugFormatLogEntry } from '$lib/stores/debugConsole';

  export let open: boolean = false;
  export let onClose: () => void;

  let input = '{ "cmd": "help" }';
  let log = '';

  function close() {
    if (typeof onClose === 'function') onClose();
  }

  function clearLog() {
    log = '';
  }

  function run() {
    const res = debugRunCommand(input);
    log = (log.length > 0 ? `${log}\n---\n` : '') + debugFormatLogEntry(input, res);
  }

  function handleKeydown(e: KeyboardEvent) {
    // Ctrl/Cmd+Enter runs
    const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
    const mod = isMac ? e.metaKey : e.ctrlKey;

    if (mod && e.key === 'Enter') {
      e.preventDefault();
      run();
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
  }
</script>

{#if open}
  <div class="modal-backdrop" on:click={close} />

  <div
    class="modal"
    role="dialog"
    aria-modal="true"
    aria-label="Debug console"
    on:keydown={handleKeydown}
    tabindex="0"
  >
    <div class="modal-header">
      <div class="modal-title">Debug console</div>

      <div class="modal-actions">
        <button class="btn" on:click={run} title="Run (Ctrl/Cmd+Enter)">Run</button>
        <button class="btn" on:click={clearLog} title="Clear output">Clear</button>
        <button class="btn btn--close" on:click={close} title="Close (Esc)">✖</button>
      </div>
    </div>

    <div class="modal-body">
      <div class="pane">
        <div class="pane-title">Command (JSON)</div>
        <textarea class="textarea" bind:value={input} spellcheck="false" />
        <div class="hint">
          Run one command at a time. Use <span class="mono">{`{ "cmd": "help" }`}</span>.
        </div>
      </div>

      <div class="pane">
        <div class="pane-title">Output</div>
        <pre class="output">{log}</pre>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.45);
    z-index: 220;
  }

  .modal {
    position: fixed;
    left: 50%;
    top: 70px;
    transform: translateX(-50%);
    width: min(980px, calc(100vw - 48px));
    max-height: calc(100vh - 120px);
    overflow: hidden;
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.98);
    box-shadow: 0 14px 28px rgba(15, 23, 42, 0.25);
    z-index: 230;
    display: flex;
    flex-direction: column;
    outline: none;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 14px;
    border-bottom: 1px solid rgba(15, 23, 42, 0.12);
  }

  .modal-title {
    font-size: 14px;
    font-weight: 900;
    color: #0f172a;
  }

  .modal-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .btn {
    padding: 6px 10px;
    border-radius: 12px;
    border: 1px solid rgba(15, 23, 42, 0.18);
    background: rgba(255, 255, 255, 0.92);
    cursor: pointer;
    font-size: 12px;
    white-space: nowrap;
  }

  .btn:hover {
    background: rgba(255, 255, 255, 0.98);
  }

  .btn--close {
    font-weight: 900;
  }

  .modal-body {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    padding: 12px 14px;
    min-height: 0;
    flex: 1;
    overflow: hidden;
  }

  .pane {
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .pane-title {
    font-size: 12px;
    font-weight: 900;
    color: #0f172a;
  }

  .textarea {
    flex: 1;
    min-height: 220px;
    resize: vertical;
    padding: 10px 10px;
    border-radius: 14px;
    border: 1px solid rgba(15, 23, 42, 0.18);
    background: rgba(15, 23, 42, 0.03);
    font-size: 12px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
      'Liberation Mono', 'Courier New', monospace;
    color: #0f172a;
    outline: none;
  }

  .output {
    flex: 1;
    min-height: 220px;
    overflow: auto;
    padding: 10px 10px;
    border-radius: 14px;
    border: 1px solid rgba(15, 23, 42, 0.18);
    background: rgba(15, 23, 42, 0.92);
    color: #e5e7eb;
    font-size: 11px;
    white-space: pre-wrap;
    word-break: break-word;
    margin: 0;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
      'Liberation Mono', 'Courier New', monospace;
  }

  .hint {
    font-size: 11px;
    color: rgba(15, 23, 42, 0.75);
  }

  .mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
      'Liberation Mono', 'Courier New', monospace;
  }

  @media (max-width: 860px) {
    .modal-body {
      grid-template-columns: 1fr;
    }
  }
</style>

