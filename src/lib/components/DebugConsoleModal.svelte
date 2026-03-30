<script lang="ts">
	import { onMount } from 'svelte';
	import { debugHelpPayload, debugRunCommand } from '$lib/viewmodels/debugConsole';
	import { uiState, selectedRouterId } from '$lib/viewmodels';

	export let open: boolean = false;
	export let onClose: () => void;

	let input = 'help';
	let logEntries: { cmd: string; out: string }[] = [];
	let logEl: HTMLDivElement | null = null;
	let helpOpen = false;

	const HELP_MIN_W = 280;
	const HELP_MIN_H = 200;
	let helpPos = { x: 0, y: 0, w: 360, h: 320 };
	let helpDragging = false;
	let helpResizing = false;
	let helpDragOffset = { x: 0, y: 0 };
	let helpResizeStart = { x: 0, y: 0, w: 0, h: 0 };

	const STORAGE_KEY = 'debug-console-window';
	const MIN_W = 420;
	const MIN_H = 240;

	let pos = { x: 0, y: 0, w: 720, h: 380 };
	let dragging = false;
	let resizing = false;
	let dragOffset = { x: 0, y: 0 };
	let resizeStart = { x: 0, y: 0, w: 0, h: 0 };
	$: boundsKey = `${$uiState?.menuOpen ? '1' : '0'}-${$selectedRouterId ? '1' : '0'}`;

	/**
	 * Modal schließen
	 */
	function close() {
		if (typeof onClose === 'function') onClose();
	}

	/**
	 * Help-Fenster schließen.
	 */
	function closeHelp() {
		helpOpen = false;
	}

	/**
	 * Terminal-Log löschen.
	 */
	function clearLog() {
		logEntries = [];
	}

	// Scrollback kopieren
	async function copyScrollback() {
		const parts: string[] = [];
		for (const entry of logEntries) {
			parts.push(`> ${entry.cmd}`);
			if (entry.out) parts.push(entry.out);
			parts.push('');
		}
		const text = parts.join('\n').trimEnd();
		if (!text) return;
		try {
			if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
				await navigator.clipboard.writeText(text);
				return;
			}
		} catch {}

		if (typeof document === 'undefined') return;
		const ta = document.createElement('textarea');
		ta.value = text;
		ta.setAttribute('readonly', 'true');
		ta.style.position = 'fixed';
		ta.style.left = '-9999px';
		document.body.appendChild(ta);
		ta.select();
		try {
			document.execCommand('copy');
		} catch {}
		document.body.removeChild(ta);
	}

	// --- Viewport-Bounds ---

	function getBounds() {
		const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
		const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
		const top = 80;
		const bottom = 140;
		const left = ($uiState?.menuOpen ?? false) ? 240 : 24;
		const right = $selectedRouterId ? 380 : 24;
		return { vw, vh, top, bottom, left, right };
	}

	function clampToBounds(next: { x: number; y: number; w: number; h: number }) {
		const b = getBounds();
		const maxW = Math.max(MIN_W, b.vw - b.left - b.right);
		const maxH = Math.max(MIN_H, b.vh - b.top - b.bottom);
		const w = Math.max(MIN_W, Math.min(next.w, maxW));
		const h = Math.max(MIN_H, Math.min(next.h, maxH));
		const x = Math.min(b.vw - b.right - w, Math.max(b.left, next.x));
		const y = Math.min(b.vh - b.bottom - h, Math.max(b.top, next.y));
		return { x, y, w, h };
	}

	function clampHelpToBounds(next: { x: number; y: number; w: number; h: number }) {
		const b = getBounds();
		const maxW = Math.max(HELP_MIN_W, b.vw - b.left - b.right);
		const maxH = Math.max(HELP_MIN_H, b.vh - b.top - b.bottom);
		const w = Math.max(HELP_MIN_W, Math.min(next.w, maxW));
		const h = Math.max(HELP_MIN_H, Math.min(next.h, maxH));
		const x = Math.min(b.vw - b.right - w, Math.max(b.left, next.x));
		const y = Math.min(b.vh - b.bottom - h, Math.max(b.top, next.y));
		return { x, y, w, h };
	}

	function defaultRect() {
		const b = getBounds();
		const maxW = Math.max(MIN_W, b.vw - b.left - b.right);
		const maxH = Math.max(MIN_H, b.vh - b.top - b.bottom);
		const w = Math.min(1440, maxW);
		const h = Math.min(760, maxH);
		const x = b.left + Math.max(0, (maxW - w) / 2);
		const y = b.top + Math.max(0, (maxH - h) / 2);
		return clampToBounds({ x, y, w, h });
	}

	function defaultHelpRect() {
		const b = getBounds();
		const w = Math.min(420, Math.max(HELP_MIN_W, b.vw * 0.32));
		const h = Math.min(520, Math.max(HELP_MIN_H, b.vh * 0.45));
		const x = Math.min(b.vw - b.right - w, pos.x + pos.w + 12);
		const y = Math.max(b.top, pos.y);
		return clampHelpToBounds({ x, y, w, h });
	}

	function loadRect() {
		if (typeof localStorage === 'undefined') return;
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			if (!raw) return;
			const parsed = JSON.parse(raw);
			if (!parsed) return;
			pos = clampToBounds({
				x: Number(parsed.x ?? pos.x),
				y: Number(parsed.y ?? pos.y),
				w: Number(parsed.w ?? pos.w),
				h: Number(parsed.h ?? pos.h)
			});
		} catch {}
	}

	function saveRect() {
		if (typeof localStorage === 'undefined') return;
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(pos));
		} catch {}
	}

	function resetRect() {
		pos = defaultRect();
		saveRect();
	}

	// Formatiert den Output
	function formatOutput(res: any): string {
		if (!res || res.ok === false) {
			const msg = res?.error ?? 'Unknown error';
			return `error:\n${msg}`;
		}

		if (typeof res.result === 'string') return res.result;
		return `result:\n${JSON.stringify(res.result, null, 2)}`;
	}

	type HelpItem = { syntax: string; desc: string };
	type HelpSection = { title: string; items: HelpItem[] };

	// Parsing der Command 'help'
	function parseHelp(text: string): HelpSection[] {
		const lines = String(text ?? '').split('\n');
		const sections: HelpSection[] = [];
		let current: HelpSection | null = null;
		for (let i = 0; i < lines.length; i += 1) {
			const raw = lines[i];
			if (!raw) continue;
			if (raw.startsWith('Debug Console')) continue;
			if (/^[\u2500-]+$/.test(raw)) continue;
			if (!raw.startsWith(' ')) {
				current = { title: raw.trim(), items: [] };
				sections.push(current);
				continue;
			}
			if (raw.startsWith('  ')) {
				const syntax = raw.trim();
				let desc = '';
				const next = lines[i + 1];
				if (next && next.startsWith('    ')) {
					desc = next.trim();
					i += 1;
				}
				if (!current) {
					current = { title: 'Commands', items: [] };
					sections.push(current);
				}
				current.items.push({ syntax, desc });
			}
		}
		return sections;
	}

	$: helpSections = parseHelp(debugHelpPayload());

	// Command Execution in der Debug-Konsole durch 'run'
	function run() {
		const line = String(input ?? '').trim();
		if (!line) return;

		const normalized = line.toLowerCase();
		if (normalized === 'help') {
			helpOpen = true;
			input = '';
			return;
		}
		if (normalized === 'help close') {
			helpOpen = false;
			input = '';
			return;
		}
		if (normalized === 'close') {
			close();
			input = '';
			return;
		}

		const res = debugRunCommand(line);
		const out = formatOutput(res).trimEnd();
		if (!out) return;
		logEntries = [...logEntries, { cmd: line, out }];
		const MAX = 200;
		if (logEntries.length > MAX) logEntries = logEntries.slice(logEntries.length - MAX);
		input = '';
		queueMicrotask(() => {
			if (logEl) logEl.scrollTop = logEl.scrollHeight;
		});
	}

	// Keyboard Shortcuts
	function handleKeydown(e: KeyboardEvent) {
		const isMac =
			typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
		const mod = isMac ? e.metaKey : e.ctrlKey;

		if (mod && e.key === 'Enter') {
			e.preventDefault();
			run();
			return;
		}

		if (mod && e.shiftKey && e.key.toLowerCase() === 'c') {
			e.preventDefault();
			copyScrollback();
			return;
		}

		if (e.key === 'Enter' && !e.shiftKey) {
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

	// --- Drag & Resize Handlers ---

	function startDrag(e: PointerEvent) {
		if ((e.target as HTMLElement)?.closest('.modal-actions')) return;
		if (e.button !== 0) return;
		e.preventDefault();
		dragging = true;
		dragOffset = { x: e.clientX - pos.x, y: e.clientY - pos.y };
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}

	function startResize(e: PointerEvent) {
		if (e.button !== 0) return;
		e.preventDefault();
		resizing = true;
		resizeStart = { x: e.clientX, y: e.clientY, w: pos.w, h: pos.h };
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}

	function startHelpDrag(e: PointerEvent) {
		if ((e.target as HTMLElement)?.closest('.help-actions')) return;
		if (e.button !== 0) return;
		e.preventDefault();
		helpDragging = true;
		helpDragOffset = { x: e.clientX - helpPos.x, y: e.clientY - helpPos.y };
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}

	function startHelpResize(e: PointerEvent) {
		if (e.button !== 0) return;
		e.preventDefault();
		helpResizing = true;
		helpResizeStart = { x: e.clientX, y: e.clientY, w: helpPos.w, h: helpPos.h };
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}

	function onPointerMove(e: PointerEvent) {
		if (dragging) {
			pos = clampToBounds({
				x: e.clientX - dragOffset.x,
				y: e.clientY - dragOffset.y,
				w: pos.w,
				h: pos.h
			});
			return;
		}
		if (resizing) {
			const next = {
				x: pos.x,
				y: pos.y,
				w: resizeStart.w + (e.clientX - resizeStart.x),
				h: resizeStart.h + (e.clientY - resizeStart.y)
			};
			pos = clampToBounds(next);
		}

		if (helpDragging) {
			helpPos = clampHelpToBounds({
				x: e.clientX - helpDragOffset.x,
				y: e.clientY - helpDragOffset.y,
				w: helpPos.w,
				h: helpPos.h
			});
			return;
		}
		if (helpResizing) {
			const next = {
				x: helpPos.x,
				y: helpPos.y,
				w: helpResizeStart.w + (e.clientX - helpResizeStart.x),
				h: helpResizeStart.h + (e.clientY - helpResizeStart.y)
			};
			helpPos = clampHelpToBounds(next);
		}
	}

	function onPointerUp() {
		if (dragging || resizing) saveRect();
		dragging = false;
		resizing = false;
		helpDragging = false;
		helpResizing = false;
	}

	let wasOpen = false;
	$: if (open && !wasOpen) {
		pos = defaultRect();
		loadRect();
		helpPos = defaultHelpRect();
		wasOpen = true;
	} else if (!open && wasOpen) {
		wasOpen = false;
	}

	$: if (open && boundsKey) {
		pos = clampToBounds(pos);
		helpPos = clampHelpToBounds(helpPos);
	}

	$: if (!open) {
		helpOpen = false;
	}

	$: if (open && $uiState?.showHistoryModal) {
		helpOpen = false;
	}

	// Wird beim Mounten der Komponente ausgeführt.
	onMount(() => {
		if (typeof window === 'undefined') return;
		const onResize = () => {
			pos = clampToBounds(pos);
		};
		window.addEventListener('pointermove', onPointerMove);
		window.addEventListener('pointerup', onPointerUp);
		window.addEventListener('resize', onResize);
		return () => {
			window.removeEventListener('pointermove', onPointerMove);
			window.removeEventListener('pointerup', onPointerUp);
			window.removeEventListener('resize', onResize);
		};
	});
</script>

{#if open}
	<div
		class="modal"
		role="dialog"
		aria-modal="true"
		aria-label="Debug console"
		on:keydown={handleKeydown}
		tabindex="0"
		style={`left:${pos.x}px; top:${pos.y}px; width:${pos.w}px; height:${pos.h}px;`}
	>
		<div class="modal-header" on:pointerdown={startDrag}>
			<div class="modal-title">Debug console</div>

			<div class="modal-actions">
				<button class="btn" on:click={run} title="Run (Enter)">Run</button>
				<button class="btn" on:click={() => (helpOpen = !helpOpen)} title="Show help">
					Help
				</button>
				<button
					class="btn"
					on:click={copyScrollback}
					title="Copy scrollback (Ctrl/Cmd + Shift + C)"
				>
					Copy
				</button>
				<button class="btn" on:click={clearLog} title="Clear output">Clear</button>
				<button class="btn" on:click={resetRect} title="Reset size and position">Reset</button>
				<button class="btn btn--close" on:click={close} title="Close (Esc)">✖</button>
			</div>
		</div>

		<div class="modal-body">
			<div class="terminal" bind:this={logEl}>
				{#each logEntries as entry (entry)}
					<div class="terminal-line">
						<span class="prompt">&gt;</span>
						<span class="cmd">{entry.cmd}</span>
					</div>
					{#if entry.out}
						<pre class="terminal-out">{entry.out}</pre>
					{/if}
				{/each}
			</div>
		</div>

		<div class="terminal-input">
			<span class="prompt">&gt;</span>
			<input
				class="input"
				type="text"
				bind:value={input}
				spellcheck="false"
				on:keydown={handleKeydown}
				placeholder="Type a command…"
			/>
		</div>

		<div class="resize-handle" on:pointerdown={startResize} aria-hidden="true"></div>
	</div>

	{#if helpOpen}
		<div
			class="help-modal"
			role="dialog"
			aria-modal="false"
			aria-label="Debug console help"
			on:pointerdown|stopPropagation
			style={`left:${helpPos.x}px; top:${helpPos.y}px; width:${helpPos.w}px; height:${helpPos.h}px;`}
		>
			<div class="help-header" on:pointerdown={startHelpDrag}>
				<div class="help-title">Commands</div>
				<div class="help-actions">
					<button class="btn btn--close" on:click={closeHelp} title="Close">✖</button>
				</div>
			</div>
			<div class="help-body">
				{#each helpSections as section (section.title)}
					<div class="help-section">
						<div class="help-section-title">{section.title}</div>
						<div class="help-section-grid">
							{#each section.items as item (item.syntax)}
								<div class="help-item">
									<div class="help-syntax mono">{item.syntax}</div>
									{#if item.desc}
										<div class="help-desc">{item.desc}</div>
									{/if}
								</div>
							{/each}
						</div>
					</div>
				{/each}
			</div>
			<div class="resize-handle" on:pointerdown={startHelpResize} aria-hidden="true"></div>
		</div>
	{/if}
{/if}

<style>
	.modal {
		position: fixed;
		left: 0;
		top: 0;
		overflow: hidden;
		border-radius: 16px;
		background: rgba(255, 255, 255, 0.98);
		box-shadow: 0 14px 28px rgba(15, 23, 42, 0.15);
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
		cursor: grab;
	}

	.modal-title {
		font-size: 14px;
		font-weight: 900;
		color: #0f172a;
		letter-spacing: 0.08em;
		text-transform: uppercase;
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
		color: #0f172a;
	}

	.btn:hover {
		background: rgba(15, 23, 42, 0.06);
	}

	.btn--close {
		font-weight: 900;
	}

	.modal-body {
		padding: 12px 14px;
		min-height: 0;
		flex: 1;
		overflow: hidden;
	}

	.terminal {
		min-height: 0;
		height: 100%;
		overflow: auto;
		padding: 10px 10px;
		border-radius: 12px;
		border: 1px solid rgba(15, 23, 42, 0.1);
		background: rgba(248, 250, 252, 0.9);
		color: #0f172a;
		font-size: 12px;
		line-height: 1.45;
	}

	.terminal-line {
		display: flex;
		gap: 8px;
		align-items: baseline;
	}

	.terminal-out {
		margin: 4px 0 10px 18px;
		white-space: pre-wrap;
		word-break: break-word;
	}

	.terminal-input {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 14px 12px;
		border-top: 1px solid rgba(15, 23, 42, 0.12);
	}

	.prompt {
		color: #0ea5e9;
		font-weight: 700;
		font-family:
			ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',
			monospace;
	}

	.cmd,
	.terminal-out,
	.input {
		font-family:
			ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',
			monospace;
	}

	.input {
		flex: 1;
		background: transparent;
		border: none;
		outline: none;
		color: #0f172a;
		font-size: 12px;
	}

	.resize-handle {
		position: absolute;
		right: 8px;
		bottom: 8px;
		width: 14px;
		height: 14px;
		cursor: nwse-resize;
		opacity: 0.6;
		background:
			linear-gradient(135deg, transparent 50%, rgba(100, 116, 139, 0.5) 50%),
			linear-gradient(135deg, transparent 65%, rgba(100, 116, 139, 0.5) 65%);
		background-size: 8px 8px;
	}

	.help-modal {
		position: fixed;
		overflow: hidden;
		border-radius: 12px;
		background: rgba(255, 255, 255, 0.98);
		box-shadow: 0 12px 22px rgba(15, 23, 42, 0.18);
		z-index: 240;
		display: flex;
		flex-direction: column;
		outline: none;
	}

	.help-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 10px 12px;
		border-bottom: 1px solid rgba(15, 23, 42, 0.12);
		cursor: grab;
	}

	.help-title {
		font-size: 12px;
		font-weight: 900;
		color: #0f172a;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.help-body {
		padding: 10px 12px;
		min-height: 0;
		flex: 1;
		overflow: auto;
	}

	.help-section {
		margin-bottom: 12px;
	}

	.help-section-title {
		font-size: 11px;
		font-weight: 900;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #0f172a;
		margin-bottom: 6px;
	}

	.help-section-grid {
		display: grid;
		gap: 6px;
	}

	.help-item {
		padding: 6px 8px;
		border-radius: 10px;
		background: rgba(15, 23, 42, 0.04);
		border: 1px solid rgba(15, 23, 42, 0.08);
	}

	.help-syntax {
		font-size: 11px;
		font-weight: 700;
		color: #0f172a;
	}

	.help-desc {
		margin-top: 2px;
		font-size: 10px;
		color: rgba(15, 23, 42, 0.7);
	}

	:global(.dark) .modal {
		background: rgba(15, 23, 42, 0.98);
		box-shadow: 0 14px 28px rgba(15, 23, 42, 0.25);
	}

	:global(.dark) .modal-header {
		border-bottom: 1px solid rgba(148, 163, 184, 0.2);
	}

	:global(.dark) .modal-title {
		color: #e2e8f0;
	}

	:global(.dark) .btn {
		border: 1px solid rgba(148, 163, 184, 0.2);
		background: rgba(15, 23, 42, 0.35);
		color: #e2e8f0;
	}

	:global(.dark) .btn:hover {
		background: rgba(15, 23, 42, 0.55);
	}

	:global(.dark) .terminal {
		border: 1px solid rgba(148, 163, 184, 0.18);
		background: rgba(2, 6, 23, 0.6);
		color: #e2e8f0;
	}

	:global(.dark) .terminal-input {
		border-top: 1px solid rgba(148, 163, 184, 0.2);
	}

	:global(.dark) .prompt {
		color: #38bdf8;
	}

	:global(.dark) .input {
		color: #e2e8f0;
	}

	:global(.dark) .resize-handle {
		background:
			linear-gradient(135deg, transparent 50%, rgba(148, 163, 184, 0.5) 50%),
			linear-gradient(135deg, transparent 65%, rgba(148, 163, 184, 0.5) 65%);
	}

	:global(.dark) .help-modal {
		background: rgba(15, 23, 42, 0.98);
		box-shadow: 0 12px 22px rgba(2, 6, 23, 0.5);
	}

	:global(.dark) .help-header {
		border-bottom: 1px solid rgba(148, 163, 184, 0.2);
	}

	:global(.dark) .help-title {
		color: #e2e8f0;
	}

	:global(.dark) .help-section-title {
		color: #e2e8f0;
	}

	:global(.dark) .help-item {
		background: rgba(15, 23, 42, 0.6);
		border: 1px solid rgba(148, 163, 184, 0.2);
	}

	:global(.dark) .help-syntax {
		color: #e2e8f0;
	}

	:global(.dark) .help-desc {
		color: rgba(226, 232, 240, 0.7);
	}
</style>
