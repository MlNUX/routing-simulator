<script lang="ts">
	import '../../app.css';

	let showShortcuts = false;

	/**
	 * Schaltet die Anzeige des Keyboard-Shortcut-Hilfefensters um.
	 */
	function toggleShortcuts() {
		showShortcuts = !showShortcuts;
	}

	/**
	 * Schließt das Keyboard-Shortcut-Hilfefenster.
	 */
	function closeShortcuts() {
		showShortcuts = false;
	}
</script>

<button
	class="fixed top-2.5 left-2.5 hidden h-10 w-10 items-center justify-center
      rounded-xl p-2 transition-colors duration-200 sm:flex
      hover:bg-light-hover-white dark:hover:bg-blue-950"
	on:click={toggleShortcuts}
	data-help="Show the keyboard shortcuts."
	data-help-pos="bottom"
	data-help-fixed
>
	<img src="/icons/info.svg" alt="Shortcuts" />
</button>

<aside>
	{#if showShortcuts}
		<div class="fixed inset-0 z-80 bg-transparent" on:click={closeShortcuts} />

		<div
			class="fixed top-14 left-6 z-90 max-w-[calc(100vw-48px)]
    min-w-[360px] rounded-2xl bg-white/98 p-3 shadow-xl dark:bg-dark-theme-blue/95 dark:shadow-[0_14px_26px_rgba(2,6,23,0.55)]"
		>
			<div class="mb-2 flex items-center justify-between gap-3">
				<div class="text-sm font-bold text-dark-blue dark:text-almost-white">
					Keyboard shortcuts
				</div>
				<button
					class="cursor-pointer border-none bg-transparent text-sm text-dark-blue dark:text-almost-white"
					title="Close"
					on:click={closeShortcuts}>✖</button
				>
			</div>

			<table class="shortcuts-table">
				<thead>
					<tr>
						<th>Key</th>
						<th>Action</th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<td><code>R</code></td>
						<td>Toggle router placement tool</td>
					</tr>
					<tr>
						<td><code>L</code></td>
						<td>Toggle link tool</td>
					</tr>
					<tr>
						<td><code>P</code></td>
						<td>Toggle send packet tool</td>
					</tr>
					<tr>
						<td><code>D</code></td>
						<td>Toggle delete tool (multi-select enabled)</td>
					</tr>
					<tr>
						<td><code>Del</code> / <code>Backspace</code></td>
						<td>Delete selection</td>
					</tr>
					<tr>
						<td><code>Esc</code></td>
						<td>Exit tool mode</td>
					</tr>
					<tr>
						<td><code>Ctrl/Cmd + Z</code></td>
						<td>Undo (current step only)</td>
					</tr>
					<tr>
						<td><code>Ctrl/Cmd + Shift + Z</code></td>
						<td>Redo (current step only)</td>
					</tr>
					<tr>
						<td><code>Ctrl/Cmd + E</code></td>
						<td>Open Debug Console (after unlock)</td>
					</tr>
					<tr>
						<td><code>Ctrl/Cmd + Shift + C</code></td>
						<td>Copy debug console scrollback (when open)</td>
					</tr>
					<tr>
						<td><code>Ctrl/Cmd + ,</code></td>
						<td>Toggle scenario/preset modal</td>
					</tr>
					<tr>
						<td>Double-click title</td>
						<td>Unlock Debug menu</td>
					</tr>
					<tr>
						<td><code>Ctrl/Cmd + O</code></td>
						<td>Import JSON</td>
					</tr>
					<tr>
						<td><code>Ctrl/Cmd + S</code></td>
						<td>Export JSON</td>
					</tr>
					<tr>
						<td><code>Space</code></td>
						<td>Play/Pause</td>
					</tr>
					<tr>
						<td><code>N</code></td>
						<td>Next step</td>
					</tr>
					<tr>
						<td><code>B</code></td>
						<td>Previous step</td>
					</tr>
				</tbody>
			</table>

			<div class="mt-2 text-[11px] text-dark-blue/75 dark:text-almost-white/70">
				Note: editing and undo/redo are blocked while the simulation is playing.
			</div>
		</div>
	{/if}
</aside>

<style>
	:global(.dark) .shortcuts-table th,
	:global(.dark) .shortcuts-table td {
		border-bottom-color: rgba(148, 163, 184, 0.18);
		color: #e2e8f0;
	}

	:global(.dark) .shortcuts-table th {
		color: #e2e8f0;
	}

	:global(.dark) code {
		background: rgba(15, 23, 42, 0.6);
		color: #e2e8f0;
	}
</style>
