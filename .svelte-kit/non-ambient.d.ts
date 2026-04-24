
// this file is generated — do not edit it


declare module "svelte/elements" {
	export interface HTMLAttributes<T> {
		'data-sveltekit-keepfocus'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-noscroll'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-preload-code'?:
			| true
			| ''
			| 'eager'
			| 'viewport'
			| 'hover'
			| 'tap'
			| 'off'
			| undefined
			| null;
		'data-sveltekit-preload-data'?: true | '' | 'hover' | 'tap' | 'off' | undefined | null;
		'data-sveltekit-reload'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-replacestate'?: true | '' | 'off' | undefined | null;
	}
}

export {};


declare module "$app/types" {
	type MatcherParam<M> = M extends (param : string) => param is (infer U extends string) ? U : string;

	export interface AppTypes {
		RouteId(): "/";
		RouteParams(): {
			
		};
		LayoutParams(): {
			"/": Record<string, never>
		};
		Pathname(): "/";
		ResolvedPathname(): `${"" | `/${string}`}${ReturnType<AppTypes['Pathname']>}`;
		Asset(): "/STAR_logo.png" | "/icons/edit.svg" | "/icons/help.svg" | "/icons/info.svg" | "/icons/link.svg" | "/icons/moon.svg" | "/icons/packet.svg" | "/icons/pause.svg" | "/icons/play.svg" | "/icons/redo.svg" | "/icons/reload.svg" | "/icons/router.svg" | "/icons/router_node.svg" | "/icons/save.svg" | "/icons/step-back.svg" | "/icons/step-front.svg" | "/icons/stop.svg" | "/icons/sun.svg" | "/icons/trash.svg" | "/icons/undo.svg" | "/icons/upload.svg" | "/robots.txt" | "/sim_icon.svg" | string & {};
	}
}