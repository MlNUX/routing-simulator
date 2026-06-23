<script lang="ts">
	export let positions: Array<{ x: number; y: number }>;

	const PACKET_COUNT = 3;
	const SEG_DUR = 1.1; // seconds per hop

	$: pathD =
		positions.length >= 2
			? 'M ' + positions.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L ')
			: '';

	$: totalDur = Math.max(0.6, (positions.length - 1) * SEG_DUR);
</script>

{#if pathD}
	<svg
		style="position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:45;overflow:visible"
	>
		<defs>
			<path id="pkt-motion-path" d={pathD} />
			<filter id="pkt-glow" x="-60%" y="-60%" width="220%" height="220%">
				<feGaussianBlur stdDeviation="3" result="blur" />
				<feMerge>
					<feMergeNode in="blur" />
					<feMergeNode in="SourceGraphic" />
				</feMerge>
			</filter>
		</defs>

		{#each Array(PACKET_COUNT) as _, i}
			{@const delay = -(i * (totalDur / PACKET_COUNT))}
			<g filter="url(#pkt-glow)">
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<animateMotion
					dur="{totalDur}s"
					begin="{delay}s"
					repeatCount="indefinite"
					rotate="auto"
				>
					<mpath href="#pkt-motion-path" />
				</animateMotion>
				<!-- Packet body -->
				<rect x="-9" y="-6" width="18" height="12" rx="3" fill="#7c3aed" stroke="#ede9fe" stroke-width="1.5" />
				<!-- Data lines inside packet -->
				<line x1="-5" y1="-2" x2="5" y2="-2" stroke="rgba(255,255,255,0.7)" stroke-width="1.5" stroke-linecap="round" />
				<line x1="-5" y1="2" x2="2" y2="2" stroke="rgba(255,255,255,0.5)" stroke-width="1.5" stroke-linecap="round" />
			</g>
		{/each}
	</svg>
{/if}
