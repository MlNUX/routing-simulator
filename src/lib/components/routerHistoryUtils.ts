export function sequenceIndexForStep(
	step: number,
	steps: number[],
	types: Map<number, string>
): number {
	const sorted = steps.slice().sort((a, b) => a - b);
	let seq = -1;
	for (const s of sorted) {
		if (s > step) break;
		if (types.get(s) === 'update') continue;
		seq += 1;
	}
	return Math.max(0, seq);
}

export function inferHistoryStepType(
	step: number,
	steps: number[],
	types: Map<number, string>,
	isDistanceVector: boolean,
	isLinkState: boolean
): string {
	const explicit = types.get(step) ?? '';
	if (explicit) return explicit;
	if (step === 0) return 'init';
	const seq = sequenceIndexForStep(step, steps, types);
	if (isDistanceVector) return seq % 2 === 0 ? 'recompute' : 'send';
	if (isLinkState) return seq % 2 === 0 ? 'send' : 'recompute';
	return seq % 2 === 0 ? 'recompute' : 'send';
}

export function getLectureTimeLabel(
	step: number,
	steps: number[],
	types: Map<number, string>,
	isDistanceVector: boolean,
	isLinkState: boolean
): string {
	const type = inferHistoryStepType(step, steps, types, isDistanceVector, isLinkState);
	if (type === 'update') return 'Update';
	if (type === 'init') return 'Initial';
	const seq = sequenceIndexForStep(step, steps, types);
	const timeIndex = 1 + Math.floor(seq / 2);
	return `t${timeIndex}`;
}

export function computeBellmanSteps(
	steps: number[],
	types: Map<number, string>,
	isDistanceVector: boolean,
	isLinkState: boolean
): number[] {
	if (!isDistanceVector) return steps;
	return steps.filter(
		(step) => inferHistoryStepType(step, steps, types, isDistanceVector, isLinkState) !== 'send'
	);
}

export function getAccessibleSteps(steps: number[], currentStepNumber: number): number[] {
	const limit = Math.max(0, Math.floor(Number(currentStepNumber)));
	return steps.filter((step) => step <= limit);
}

export function getVisibleHistorySteps(
	steps: number[],
	types: Map<number, string>,
	currentStepNumber: number,
	bellmanView: boolean,
	isDistanceVector: boolean,
	isLinkState: boolean
): number[] {
	const accessible = getAccessibleSteps(steps, currentStepNumber);
	return bellmanView
		? computeBellmanSteps(accessible, types, isDistanceVector, isLinkState)
		: accessible;
}

export function getBellmanStepHeading(
	step: number,
	steps: number[],
	types: Map<number, string>,
	isDistanceVector: boolean,
	isLinkState: boolean
): string {
	const label = getLectureTimeLabel(step, steps, types, isDistanceVector, isLinkState);
	if (label === 'Initial' || label === 'Update') return label;
	return `Time slot ${label}`;
}
