<script lang="ts">
	import { uiState, chooseConfirmOption, closeConfirmMenu } from '$lib/viewmodels';

	$: menu = $uiState?.confirmMenu;
	$: open = !!menu?.open;
	$: title = String(menu?.title ?? '');
	$: message = String(menu?.message ?? '');
	$: options = Array.isArray(menu?.options) ? menu.options : [];

	/**
	 * Wird aufgerufen, wenn eine Option ausgewählt wird.
	 *
	 * @param id der ausgewählten Option
	 */
	function select(id: string) {
		if (!open) return;
		chooseConfirmOption(id);
	}

	// Schließt den Bestätigungsdialog, z. B. beim Klicken auf den Hintergrund.
	function handleBackdrop() {
		closeConfirmMenu();
	}

	/**
	 * Ermittelt die CSS-Klassen für eine Option basierend auf ihrer Absicht (Intent).
	 *
	 * @param intent Absicht des Benutzers
	 * @returns von der Absicht abhängiger Highlighting
	 */
	function intentClass(intent?: string): string {
		if (intent === 'danger')
			return 'bg-[#fef2f2] text-red-800 border-red-800/65 dark:bg-[#7F1D1D]/55 dark:text-red-100 dark:border-red-100/65';

		if (intent === 'neutral')
			return 'bg-almost-white text-dark-blue border-dark-blue/12 dark:bg-[#0F172A]/55 dark:text-almost-white dark:border-almost-white/12';

		return 'bg-secondary text-dark-blue border-accent  dark:bg-accent dark:text-almost-white dark:border-secondary';
	}
</script>

{#if open}
	<div class="fixed inset-0 z-260 bg-dark-blue/45" on:click={handleBackdrop} />

	<div
		class="fixed top-1/2 left-1/2 z-270 flex w-[min(520px,calc(100vw-40px))]
  -translate-x-1/2 -translate-y-1/2 flex-col gap-2.5 rounded-[18px] border
  border-accent/80 bg-white/98 px-[18px] pt-4 pb-[18px] dark:border-accent/60 dark:bg-dark-blue"
		role="dialog"
		aria-modal="true"
		aria-label={title}
	>
		<div class="flex items-center justify-between gap-2">
			<div class="text-sm font-black text-dark-blue dark:text-almost-white">{title}</div>

			<button
				class="cursor-pointer rounded-[10px] border-none bg-transparent px-1.5 py-1
      text-base text-dark-blue hover:bg-dark-blue/6 dark:text-almost-white
      dark:hover:bg-almost-white/6"
				aria-label="Close"
				on:click={closeConfirmMenu}>✖</button
			>
		</div>

		{#if message}
			<div class="text-xs/[1.45] text-dark-blue dark:text-almost-white">{message}</div>
		{/if}

		<div class="grid gap-2.5">
			{#each options as opt (opt.id)}
				<button
					class={`flex w-full cursor-pointer flex-col gap-1 rounded-xl
        border px-3 py-2.5 text-left transition hover:-translate-y-px 
        hover:shadow-sm hover:shadow-dark-blue/25
        dark:hover:shadow-almost-white/25
        ${intentClass(opt.intent)}`}
					on:click={() => select(opt.id)}
				>
					<div class="text-xs font-bold">{opt.label}</div>
					{#if opt.description}
						<div class="text-xs/[1.35] text-dark-blue/75 dark:text-almost-white/75">
							{opt.description}
						</div>
					{/if}
				</button>
			{/each}
		</div>
	</div>
{/if}
