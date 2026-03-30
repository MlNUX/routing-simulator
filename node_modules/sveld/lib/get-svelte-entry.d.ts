export type SvelteEntryPoint = string;
/**
 * Get the file path entry point for uncompiled Svelte source code
 * Expects a "svelte" field in the consumer's `package.json`
 */
export declare function getSvelteEntry(entryPoint?: SvelteEntryPoint): SvelteEntryPoint | null;
