<!-- lib/components/Editor.svelte -->
<script lang="ts">
	import { browser } from '$app/environment';
	import { onMount, tick } from 'svelte';
	import { simulation, ui, uiState, type PlacementMode } from '$lib/viewmodels';
	import { RoutingAlgorithmType } from '$lib/model/RoutingAlgorithmType';
	import {
		SvelteFlow,
		type NodeTypes,
		type EdgeTypes,
		type IsValidConnection,
		useSvelteFlow
	} from '@xyflow/svelte';

	import RouterNode from '$lib/components/RouterNode.svelte';
	import WeightedEdge from '$lib/components/WeightedEdge.svelte';

	const proOptions = { hideAttribution: true };

	const { flowToScreenPosition, getNode, getViewport, screenToFlowPosition, setCenter } = useSvelteFlow();

	const nodeTypes: NodeTypes = {
		router: RouterNode
	};
	const edgeTypes: EdgeTypes = {
		weighted: WeightedEdge
	};

	$: controller = $simulation as any;
	$: algo = String(controller?.algorithm ?? controller?.algorithmType ?? '');
	$: isRunning = !!controller?.running;

	$: mode = ($uiState?.placementMode ?? 'none') as PlacementMode;
	$: toolLinkWeight = Number($uiState?.linkWeight ?? 1);
	$: linkSourceRouterId = $uiState?.linkDraftSourceId ?? null;

	$: history = Array.isArray(controller?.history) ? controller.history : [];
	$: stepIndex = Math.max(0, Math.floor(Number(controller?.currentStepIndex ?? 0)));
	$: stateAtStep = history?.[stepIndex] ?? null;
	$: topology = stateAtStep?.topologyState ?? stateAtStep?.topologyState ?? null;

	let flowNodes: any[] = [];
	let flowEdges: any[] = [];
	let viewportZoom = 1;
	let hoverNodeId: string | null = null;
	let hoverTooltip = {
		visible: false,
		x: 0,
		y: 0,
		label: '',
		id: '',
		optimal: false
	};
	let hoverLinkTooltip = {
		visible: false,
		x: 0,
		y: 0,
		sourceId: '',
		targetId: '',
		weight: '',
		disabled: false
	};

	const lastFlowPositions = new Map<string, { x: number; y: number }>();

	let uiHighlightedLinkIdSet = new Set<string>();
	let actualRouteLinkIdSet = new Set<string>();
	let sendStepLinkIdSet = new Set<string>();
	let highlightedLinkIdSet = new Set<string>();
	let hoverSourceNodeId: string | null = null;
	let hoverTargetNodeId: string | null = null;
	let selectedRouterId: string | null = null;
	let draggingNodeIdSet = new Set<string>();

	$: {
		uiHighlightedLinkIdSet = new Set<string>(($uiState?.highlightedLinkIds ?? []) as string[]);
		actualRouteLinkIdSet = new Set<string>(($uiState?.actualRouteLinkIds ?? []) as string[]);
		hoverSourceNodeId = $uiState?.routingHover?.sourceId ?? null;
		hoverTargetNodeId = $uiState?.routingHover?.targetId ?? null;
		selectedRouterId = $uiState?.selectedRouterId ?? null;
	}

	/**
	 * Bestimmt den Typ eines Simulationssteps.
	 *
	 * @param stepIdx Index eines Steps
	 * @param st Zustand im gegebenen Step
	 * @returns Steptyp
	 */
	function sequenceIndexForStep(stepIdx: number, hist: any[]): number {
		const max = Math.max(0, Math.min(stepIdx, (hist?.length ?? 0) - 1));
		let seq = -1;
		for (let i = 0; i <= max; i++) {
			const stepType = String(hist?.[i]?.stepType ?? '');
			if (stepType === 'update') continue;
			seq += 1;
		}
		return Math.max(0, seq);
	}

	function inferStepType(
		stepIdx: number,
		st: any
	): 'send' | 'recompute' | 'update' | 'init' | 'unknown' {
		const explicit = String(st?.stepType ?? '');
		if (explicit === 'send' || explicit === 'recompute' || explicit === 'update')
			return explicit as any;
		if (stepIdx === 0) return 'init';
		const seqIdx = sequenceIndexForStep(stepIdx, history);
		if (algo === RoutingAlgorithmType.LINK_STATE) {
			return seqIdx % 2 === 0 ? 'send' : 'recompute';
		}
		if (
			algo === RoutingAlgorithmType.DISTANCE_VECTOR ||
			algo === RoutingAlgorithmType.DISTANCE_VECTOR_POISONED
		) {
			return seqIdx % 2 === 0 ? 'recompute' : 'send';
		}
		return 'unknown';
	}

	function findPrevNonUpdateIndex(startIdx: number, hist: any[]): number {
		for (let i = startIdx; i >= 0; i--) {
			const t = inferStepType(i, hist?.[i]);
			if (t !== 'update') return i;
		}
		return -1;
	}

	function findPrevRecomputeIndex(startIdx: number, hist: any[]): number {
		for (let i = startIdx; i >= 0; i--) {
			const t = inferStepType(i, hist?.[i]);
			if (t === 'recompute') return i;
		}
		return -1;
	}

	function topologyNodesMap(topo: any): Map<string, any> {
		if (!topo) return new Map();
		const raw = topo?.nodes ?? topo?.nodes;
		if (raw instanceof Map) return raw;
		if (Array.isArray(raw)) {
			const m = new Map<string, any>();
			for (const n of raw) {
				const id = String((n as any)?.id ?? '');
				if (id) m.set(id, n);
			}
			return m;
		}
		return new Map();
	}

	function normalizeRoutingCost(value: unknown): number {
		const num = Number(value);
		return Number.isFinite(num) ? num : Infinity;
	}

	function normalizeNextHop(value: unknown): string {
		const raw = String(value ?? '').trim();
		return raw.length > 0 ? raw : '-';
	}

	function readRoutingEntries(node: any): Map<string, { cost: number; nextHop: string }> {
		const out = new Map<string, { cost: number; nextHop: string }>();
		const entries = node?.routingTable?.entries;
		const map = entries instanceof Map ? entries : new Map();
		for (const [destId, entry] of map.entries()) {
			out.set(String(destId), {
				cost: normalizeRoutingCost(entry?.cost),
				nextHop: normalizeNextHop(entry?.nextHopId)
			});
		}
		return out;
	}

	function routingTableChanged(prevNode: any, nextNode: any): boolean {
		const prevMap = readRoutingEntries(prevNode);
		const nextMap = readRoutingEntries(nextNode);
		const keys = new Set<string>();
		for (const k of prevMap.keys()) keys.add(k);
		for (const k of nextMap.keys()) keys.add(k);
		for (const k of keys) {
			const prevHas = prevMap.has(k);
			const nextHas = nextMap.has(k);
			if (prevHas !== nextHas) return true;
			const prev = prevMap.get(k) ?? { cost: Infinity, nextHop: '-' };
			const next = nextMap.get(k) ?? { cost: Infinity, nextHop: '-' };
			if (prev.cost !== next.cost || prev.nextHop !== next.nextHop) return true;
		}
		return false;
	}

	function computeDvSendersFromHistory(
		stepIdx: number,
		hist: any[]
	): { senders: Set<string>; reliable: boolean } {
		const prevRecomputeIdx = findPrevRecomputeIndex(stepIdx - 1, hist);
		if (prevRecomputeIdx < 0) return { senders: new Set(), reliable: false };
		const prevPhaseIdx = findPrevNonUpdateIndex(prevRecomputeIdx - 1, hist);
		if (prevPhaseIdx < 0) return { senders: new Set(), reliable: false };

		const prevTopo = hist?.[prevPhaseIdx]?.topologyState ?? null;
		const nextTopo = hist?.[prevRecomputeIdx]?.topologyState ?? null;
		if (!prevTopo || !nextTopo) return { senders: new Set(), reliable: false };

		const prevNodes = topologyNodesMap(prevTopo);
		const nextNodes = topologyNodesMap(nextTopo);
		const senders = new Set<string>();
		for (const [id, node] of nextNodes.entries()) {
			const rid = String(id ?? '');
			if (!rid) continue;
			if ((node as any)?.disabled) continue;
			const prevNode = prevNodes.get(rid);
			if (routingTableChanged(prevNode, node)) senders.add(rid);
		}

		return { senders, reliable: true };
	}

	$: {
		const stepType = inferStepType(stepIndex, stateAtStep);
		const isDV =
			algo === RoutingAlgorithmType.DISTANCE_VECTOR ||
			algo === RoutingAlgorithmType.DISTANCE_VECTOR_POISONED;
		if (isDV && stepType === 'send') {
			const sentRaw = Array.isArray((topology as any)?.sentLinkIds)
				? ((topology as any).sentLinkIds as any[])
				: null;
			if (sentRaw) {
				sendStepLinkIdSet = new Set<string>(
					sentRaw.map((id: any) => String(id ?? '').trim()).filter((id: string) => id.length > 0)
				);
			} else {
				const links = topologyLinksArray(topology);
				const nodes = topologyNodesArray(topology);
				const disabled = new Set<string>();
				let senders = new Set<string>();
				for (const n of nodes) {
					const id = String((n as any)?.id ?? '');
					if (!id) continue;
					if ((n as any)?.disabled) {
						disabled.add(id);
						continue;
					}
				}

				const diffRes = computeDvSendersFromHistory(stepIndex, history);
				if (diffRes.reliable) {
					senders = diffRes.senders;
				} else {
					const fallbackSenders = new Set<string>();
					for (const n of nodes) {
						const id = String((n as any)?.id ?? '');
						if (!id || disabled.has(id)) continue;
						const isRouter =
							(n as any)?.constructor?.name === 'Router' || typeof (n as any)?.dvState === 'object';
						if (isRouter && (n as any)?.dvState?.updated) {
							fallbackSenders.add(id);
						}
					}
					if (fallbackSenders.size > 0) {
						senders = fallbackSenders;
					} else {
						for (const n of nodes) {
							const id = String((n as any)?.id ?? '');
							if (!id || disabled.has(id)) continue;
							senders.add(id);
						}
					}
				}

				sendStepLinkIdSet = new Set<string>(
					links
						.map((l: any) => ({
							id: String(l?.id ?? ''),
							sourceId: String(l?.source?.id ?? l?.sourceId ?? ''),
							targetId: String(l?.target?.id ?? l?.targetId ?? '')
						}))
						.filter(
							(l: any) =>
								l.id &&
								!(disabled.has(l.sourceId) || disabled.has(l.targetId)) &&
								(senders.has(l.sourceId) || senders.has(l.targetId))
						)
						.map((l: any) => l.id)
				);
			}
		} else {
			sendStepLinkIdSet = new Set<string>();
		}
		highlightedLinkIdSet = new Set<string>([...uiHighlightedLinkIdSet, ...sendStepLinkIdSet]);
	}

	let lastTopologyRef: any = null;
	$: if (topology && topology !== lastTopologyRef) {
		lastFlowPositions.clear();
		lastTopologyRef = topology;
	}

	// Hilfsfunktion: Router aus Topologie extrahieren
	function topologyNodesArray(topo: any): any[] {
		if (!topo) return [];
		const raw = topo?.nodes ?? topo?.nodes;
		if (raw instanceof Map) return Array.from(raw.values());
		if (Array.isArray(raw)) return raw;
		return [];
	}

	// Hilfsfunktion: Links aus Topologie extrahieren
	function isTypingTarget(target: EventTarget | null): boolean {
		const el = target as HTMLElement | null;
		if (!el) return false;

		const tag = (el.tagName ?? '').toLowerCase();
		if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
		if ((el as any).isContentEditable) return true;

		return false;
	}

	/**
	 * Prüft, ob ein Element gerade für Texteingabe genutzt wird
	 */
	function clearSelectionAndLinkDraft() {
		ui.setLinkDraftSourceId(null);
		ui.setSelectedRouter(null);
	}

	/**
	 * Löscht die aktuelle Link-Draft und Auswahl
	 *
	 * @param topo Gegebene Topologie
	 * @returns Link-Array
	 */
	function topologyLinksArray(topo: any): any[] {
		if (!topo) return [];
		const raw = topo?.links ?? topo?.links;
		if (Array.isArray(raw)) return raw;
		return [];
	}

	/**
	 * Baut die Flow-Knoten (Router) für SvelteFlow aus der Topologie.
	 */
	function buildFlowNodesFromTopology(
		topo: any,
		zoom: number,
		hoverSourceId: string | null,
		hoverTargetId: string | null
	): any[] {
		const arr = topologyNodesArray(topo);

		const ids = new Set<string>();
		for (const n of arr) ids.add(String(n?.id ?? ''));
		for (const k of lastFlowPositions.keys()) {
			if (!ids.has(k)) lastFlowPositions.delete(k);
		}

		const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;

		return arr.map((node: any) => {
			const id = String(node?.id ?? '');
			const label = String(node?.name ?? id);

			const cached = lastFlowPositions.get(id);
			const xRaw = cached ? cached.x : Number(node?.xPos ?? 0);
			const yRaw = cached ? cached.y : Number(node?.yPos ?? 0);

			const x = Number.isFinite(xRaw) ? xRaw : 0;
			const y = Number.isFinite(yRaw) ? yRaw : 0;

			const optimal = !!node?.optimal;
			const disabled = !!(node as any)?.disabled;
			const status = disabled ? 'disabled' : optimal ? 'optimal' : 'nonoptimal';

			const isSource = hoverSourceId === id;
			const isTarget = hoverTargetId === id;
			const highlightRole =
				isSource && isTarget ? 'both' : isSource ? 'source' : isTarget ? 'target' : null;

			return {
				id,
				type: 'router',
				position: { x, y },
				origin: [0.5, 0.5],
				selected: selectedRouterId === id || draggingNodeIdSet.has(id),

				connectable: !isRunning && mode === 'link' && !disabled,

				data: {
					label,
					status,
					disabled,
					highlightRole,
					zoom: safeZoom,
					canEdit: !isRunning,
					onSelect: (rid: string) => handleRouterClick(rid),
					onRename: (rid: string, nextName: string) => handleRouterRename(rid, nextName)
				}
			};
		});
	}

	function updateHoverTooltip(node: any) {
		if (!node) return;
		const width = Number(node?.width ?? node?.measured?.width ?? 140);
		const height = Number(node?.height ?? node?.measured?.height ?? 60);
		const cx = Number(node?.position?.x ?? 0);
		const cy = Number(node?.position?.y ?? 0);
		const topY = cy - height / 2;
		const screen =
			typeof flowToScreenPosition === 'function'
				? flowToScreenPosition({ x: cx, y: topY })
				: { x: cx, y: topY };

		const label = String(node?.data?.label ?? node?.id ?? '');
		const status = String(node?.data?.status ?? 'nonoptimal');

		hoverTooltip = {
			visible: true,
			x: Number(screen.x ?? 0),
			y: Number(screen.y ?? 0),
			label,
			id: String(node?.id ?? ''),
			optimal: status === 'optimal'
		};
	}

	function updateHoverLinkTooltip(edge: any) {
		if (!edge) return;
		const sourceId = String(edge?.source ?? '');
		const targetId = String(edge?.target ?? '');
		const weight = String(edge?.data?.weight ?? edge?.label ?? '');
		if (!sourceId || !targetId) return;

		const posMap = posMapFromFlowNodes(flowNodes);
		const sp = posMap.get(sourceId) ?? topoPosById(topology, sourceId);
		const tp = posMap.get(targetId) ?? topoPosById(topology, targetId);
		const mid = { x: (sp.x + tp.x) / 2, y: (sp.y + tp.y) / 2 };
		const screen = typeof flowToScreenPosition === 'function' ? flowToScreenPosition(mid) : mid;

		hoverLinkTooltip = {
			visible: true,
			x: Number(screen.x ?? 0),
			y: Number(screen.y ?? 0),
			sourceId,
			targetId,
			weight,
			disabled: !!edge?.data?.disabled
		};
	}

	const HANDLE_COUNT = 48;

	function handleIndexBetween(a: { x: number; y: number }, b: { x: number; y: number }): number {
		const dx = b.x - a.x;
		const dy = b.y - a.y;
		const angle = Math.atan2(dy, dx);
		const step = (Math.PI * 2) / HANDLE_COUNT;
		let idx = Math.round(angle / step);
		if (idx < 0) idx += HANDLE_COUNT;
		return idx % HANDLE_COUNT;
	}

	function posMapFromFlowNodes(nodes: any[]): Map<string, { x: number; y: number }> {
		const m = new Map<string, { x: number; y: number }>();
		for (const n of nodes ?? []) {
			const id = String(n?.id ?? '');
			if (!id) continue;
			const x = Number(n?.position?.x ?? 0);
			const y = Number(n?.position?.y ?? 0);
			m.set(id, { x: Number.isFinite(x) ? x : 0, y: Number.isFinite(y) ? y : 0 });
		}
		return m;
	}

	function topoPosById(topo: any, id: string): { x: number; y: number } {
		const n = topo?.nodes?.get?.(id) ?? topo?.nodes?.get?.(id);
		const x = Number(n?.xPos ?? n?.xPos ?? 0);
		const y = Number(n?.yPos ?? n?.yPos ?? 0);
		return { x: Number.isFinite(x) ? x : 0, y: Number.isFinite(y) ? y : 0 };
	}

	/**
	 * Baut die Flow-Edges aus der Topologie.
	 *
	 * @param topo Gegebene Topologie
	 * @param currentFlowNodes Router, die verbunden werden müssen
	 * @returns visuelle Darstellung der Links
	 */
	function buildFlowEdgesFromTopology(topo: any, currentFlowNodes: any[]): any[] {
		const links = topologyLinksArray(topo);
		const disabledMap = new Map<string, boolean>();
		for (const n of topologyNodesArray(topo)) {
			const id = String((n as any)?.id ?? '');
			if (id) disabledMap.set(id, !!(n as any)?.disabled);
		}

		const prevEdgeSelected = new Map<string, boolean>();
		for (const e of flowEdges) prevEdgeSelected.set(String(e?.id ?? ''), !!e?.selected);

		const posMap = posMapFromFlowNodes(currentFlowNodes);

		return links.map((link: any) => {
			const id = String(link?.id ?? '');
			const source = String(link?.source?.id ?? link?.source?.id ?? '');
			const target = String(link?.target?.id ?? link?.target?.id ?? '');
			const wRaw = Number(link?.weight ?? link?.weight ?? 1);
			const weight = Number.isFinite(wRaw) && wRaw > 0 ? wRaw : 1;

			const sp = posMap.get(source) ?? topoPosById(topo, source);
			const tp = posMap.get(target) ?? topoPosById(topo, target);

			const sSide = handleIndexBetween(sp, tp);
			const tSide = handleIndexBetween(tp, sp);

			const disabled = !!disabledMap.get(source) || !!disabledMap.get(target);
			const isSendStep = !disabled && sendStepLinkIdSet.has(id);
			const isHighlighted = !disabled && uiHighlightedLinkIdSet.has(id);
			const isActualRoute = !disabled && actualRouteLinkIdSet.has(id);

			const isGreen = isHighlighted;
			const isDashed = !isGreen && (isSendStep || isActualRoute);

			return {
				id,
				source,
				target,

				sourceHandle: `${source}-s-${sSide}`,
				targetHandle: `${target}-t-${tSide}`,

				label: String(weight),
				data: {
					weight,
					sourceId: source,
					targetId: target,
					disabled,
					canEdit: !isRunning,
					onEditWeight: (next: number) => handleEdgeWeightChange(source, target, next),
					onHover: (payload: any) => {
						hoverTooltip.visible = false;
						const screen =
							typeof flowToScreenPosition === 'function'
								? flowToScreenPosition({ x: payload?.x ?? 0, y: payload?.y ?? 0 })
								: { x: payload?.x ?? 0, y: payload?.y ?? 0 };
						hoverLinkTooltip = {
							visible: true,
							x: Number(screen.x ?? 0),
							y: Number(screen.y ?? 0),
							sourceId: String(payload?.sourceId ?? source),
							targetId: String(payload?.targetId ?? target),
							weight: String(payload?.weight ?? weight),
							disabled
						};
					},
					onHoverEnd: () => {
						hoverLinkTooltip.visible = false;
					}
				},
				selectable: true,
				selected: prevEdgeSelected.get(id) ?? false,

				animated: isDashed,
				style: disabled
					? 'stroke-width: 4; stroke: #94a3b8;'
					: isGreen
						? 'stroke-width: 4; stroke: #22c55e;'
						: isSendStep
							? 'stroke-width: 4; stroke: #37bce1; stroke-dasharray: 6 6;'
							: 'stroke-width: 4; stroke: #37bce1;',

				labelStyle: isGreen
					? {
							background: '#22c55e',
							border: '1px solid #15803d',
							boxShadow: '0 4px 10px rgba(21, 128, 61, 0.25)',
							color: '#ffffff'
						}
					: isDashed
						? {
								background: '#37bce1',
								border: '1px solid #031416',
								boxShadow: '0 4px 10px rgba(55, 188, 225, 0.25)',
								color: '#ffffff'
							}
						: undefined
			};
		});
	}

	$: if (topology) {
		flowNodes = buildFlowNodesFromTopology(
			topology,
			viewportZoom,
			hoverSourceNodeId,
			hoverTargetNodeId
		);
	}

	$: if ($uiState?.fitViewRequested) {
		tick().then(() => {
			if (flowNodes.length > 0) {
				const cx = flowNodes.reduce((sum, n) => sum + n.position.x, 0) / flowNodes.length;
				const cy = flowNodes.reduce((sum, n) => sum + n.position.y, 0) / flowNodes.length;
				setCenter(cx, cy, { zoom: getViewport().zoom });
			}
			ui.uiState.update((s) => ({ ...s, fitViewRequested: false }));
		});
	}

	$: if (topology || highlightedLinkIdSet) {
		// Force to re-render the edges, when hightlightedLinkIdSet changes
		flowEdges = buildFlowEdgesFromTopology(topology, flowNodes);
	}

	$: {
		for (const n of flowNodes) {
			if (!n || !n.id || !n.position) continue;
			lastFlowPositions.set(String(n.id), {
				x: Number(n.position.x ?? 0),
				y: Number(n.position.y ?? 0)
			});
		}
	}

	const SNAP = 20;
	function snapValue(v: number): number {
		return Math.round(v / SNAP) * SNAP;
	}

	const onBeforeConnect = async (c: any) => {
		if (isRunning) return false;
		if (mode !== 'link') return false;

		const s = String(c?.source ?? '');
		const t = String(c?.target ?? '');
		if (!s || !t || s === t) return false;

		ui.addLink(s, t, toolLinkWeight);
		return false;
	};

	/**
	 * Prüft, ob eine Verbindung erstellt werden darf.
	 */
	const isValidConnection: IsValidConnection = (c: any) => {
		if (isRunning) return false;
		if (mode !== 'link') return false;

		const s = String(c?.source ?? '');
		const t = String(c?.target ?? '');
		if (!s || !t || s === t) return false;

		return true;
	};

	const onBeforeDelete = async ({ nodes, edges }: any) => {
		if (isRunning) return false;
		if (mode !== 'delete') return false;

		const nodeIds: string[] = Array.from(
			new Set(
				(nodes ?? [])
					.map((n: any) => String(n?.id ?? '').trim())
					.filter((id: string) => id.length > 0)
			)
		);
		for (const id of nodeIds) ui.deleteNode(id);

		for (const ed of edges ?? []) {
			const s = String(ed?.source ?? '');
			const t = String(ed?.target ?? '');
			if (s && t) ui.deleteLink(s, t);
		}

		ui.setSelectedRouter(null);
		ui.setLinkDraftSourceId(null);

		return false;
	};

	function handleNodeDragStart(payload: any) {
		const target = payload?.targetNode ?? payload?.node ?? null;
		const moved = Array.isArray(payload?.nodes) ? payload.nodes : target ? [target] : [];
		draggingNodeIdSet = new Set(
			moved.map((n: any) => String(n?.id ?? '').trim()).filter((id: string) => id.length > 0)
		);
	}

	function handleNodeDragStop(payload: any) {
		// xyflow: payload.targetNode (new) / payload.node (old)
		const target = payload?.targetNode ?? payload?.node ?? null;

		// if selection drag, xyflow provides payload.nodes (array)
		const moved = Array.isArray(payload?.nodes) ? payload.nodes : target ? [target] : [];

		if (moved.length === 0) return;

		const updates = moved
			.filter((n: any) => n?.id)
			.map((n: any) => ({
				id: String(n.id),
				xPos: snapValue(Number(n.position?.x ?? 0)),
				yPos: snapValue(Number(n.position?.y ?? 0))
			}));

		if (updates.length === 1) {
			const u = updates[0];
			ui.updateNodePosition(u.id, u.xPos, u.yPos);
		} else {
			ui.updateNodePositions(updates);
		}

		draggingNodeIdSet = new Set<string>();
	}

	function handleRouterClick(routerId: string) {
		if (mode === 'sendpacket') {
			ui.selectPacketRouter(routerId);
			return;
		}

		if (mode === 'link') {
			if (!linkSourceRouterId) {
				ui.setLinkDraftSourceId(routerId);
				return;
			}

			ui.addLink(linkSourceRouterId, routerId, toolLinkWeight);
			ui.setLinkDraftSourceId(null);
			return;
		}

		if (mode === 'delete') {
			ui.deleteNode(routerId);
			ui.setLinkDraftSourceId(null);
			ui.setSelectedRouter(null);
			return;
		}

		ui.setSelectedRouter(routerId);
	}

	function handleRouterRename(routerId: string, nextName: string) {
		if (isRunning) return;
		const rid = String(routerId ?? '').trim();
		const name = String(nextName ?? '').trim();
		if (!rid || !name) return;
		ui.renameRouter(rid, name);
	}

	function handleEdgeClick({ edge, event }: any) {
		if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
		if (!edge) return;

		if (mode === 'delete') {
			const s = String(edge?.source ?? '');
			const t = String(edge?.target ?? '');
			if (s && t) ui.deleteLink(s, t);

			ui.setLinkDraftSourceId(null);
			ui.setSelectedRouter(null);
		}
	}

	function handleEdgeWeightChange(sourceId: string, targetId: string, nextWeight: number) {
		if (isRunning) return;
		const s = String(sourceId ?? '').trim();
		const t = String(targetId ?? '').trim();
		if (!s || !t) return;
		const w = Math.max(1, Math.floor(Number(nextWeight)));
		ui.changeLinkWeight(s, t, w);
	}

	function handlePaneClick() {
		ui.setLinkDraftSourceId(null);
		ui.setSelectedRouter(null);
	}

	let isPlacing = false;
	let previewX = 0;
	let previewY = 0;

	function updatePreview(event: PointerEvent) {
		const wrapper = event.currentTarget as HTMLDivElement;
		const rect = wrapper.getBoundingClientRect();
		previewX = event.clientX - rect.left;
		previewY = event.clientY - rect.top;
	}

	// --- Pointer Events für Node-Platzierung ---

	function handlePointerDown(event: PointerEvent) {
		if (!browser) return;
		if (isRunning) return;
		if (mode !== 'router') return;

		const target = event.target as HTMLElement;
		if (!target.classList.contains('svelte-flow__pane')) return;

		isPlacing = true;
		updatePreview(event);
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
	}

	function handlePointerMove(event: PointerEvent) {
		if (!browser) return;
		if (!isPlacing) return;
		updatePreview(event);
	}

	function handlePointerUp(event: PointerEvent) {
		if (!browser) return;
		if (!isPlacing) return;

		const wrapper = event.currentTarget as HTMLDivElement;

		const projected = screenToFlowPosition
			? screenToFlowPosition({ x: event.clientX, y: event.clientY })
			: { x: 0, y: 0 }; // Fallback

		const x = snapValue(projected.x);
		const y = snapValue(projected.y);

		ui.addNode(x, y);

		isPlacing = false;

		try {
			wrapper.releasePointerCapture(event.pointerId);
		} catch {}
	}

	$: isDragOver = !!$uiState?.isDragOver;

	function isJsonFile(file: File): boolean {
		const name = String(file?.name ?? '').toLowerCase();
		const type = String(file?.type ?? '').toLowerCase();
		return name.endsWith('.json') || type.includes('application/json');
	}

	// --- Drag & Drop JSON-Import ---

	function handleDragOver(event: DragEvent) {
		if (!browser) return;
		event.preventDefault();
		ui.setIsDragOver(true);
	}

	function handleDragLeave(event: DragEvent) {
		if (!browser) return;
		event.preventDefault();
		ui.setIsDragOver(false);
	}

	async function handleDrop(event: DragEvent) {
		if (!browser) return;
		event.preventDefault();
		ui.setIsDragOver(false);

		const dt = event.dataTransfer;
		const files = dt?.files;
		if (!files || files.length === 0) return;

		const file = files[0];
		if (!isJsonFile(file)) return;

		const text = await file.text();
		ui.importJson(text);
	}

	let kbdFileInput: HTMLInputElement | null = null;

	// Wird beim Mounten der Komponente ausgeführt.
	onMount(() => {
		if (!browser) return;

		const onKey = (e: KeyboardEvent) => {
			const isTyping = isTypingTarget(e.target);

			if (e.key === 'Escape') {
				e.preventDefault();
				ui.clearPlacementMode();
				clearSelectionAndLinkDraft();
				return;
			}

			const mod = e.ctrlKey || e.metaKey;
			const isAlt = e.altKey;

			// Global combos (work even when running unless noted)
			if (mod && !isAlt) {
				const k = (e.key ?? '').toLowerCase();

				if (k === 'z') {
					e.preventDefault();
					if (!!controller?.running) return;
					if (e.shiftKey) ui.redo();
					else ui.undo();
					return;
				}

				if (k === 'y') {
					e.preventDefault();
					if (!!controller?.running) return;
					ui.redo();
					return;
				}

				if (k === 'e') {
					e.preventDefault();
					if (!$uiState?.debugUnlocked) return;
					ui.setShowDebugModal(true);
					return;
				}

				if (k === ',') {
					e.preventDefault();
					if (!!controller?.running) return;
					ui.setShowScenarioModal(!$uiState?.showScenarioModal);
					return;
				}

				if (k === 'o') {
					e.preventDefault();
					if (!!controller?.running) return;
					if (kbdFileInput) {
						kbdFileInput.value = '';
						kbdFileInput.click();
					}
					return;
				}

				if (k === 's') {
					e.preventDefault();
					if (!!controller?.running) return;
					const json = ui.exportJson();
					if (!json || !json.trim()) return;
					const blob = new Blob([json], { type: 'application/json' });
					const url = URL.createObjectURL(blob);
					const a = document.createElement('a');
					a.href = url;
					a.download = 'topology.json';
					document.body.appendChild(a);
					a.click();
					a.remove();
					URL.revokeObjectURL(url);
					return;
				}
			}

			if (!!controller?.running) {
				if (mod) return;
				// allow play/pause toggle while running via Space
				if (!isTyping && e.code === 'Space') {
					e.preventDefault();
					ui.pause();
				}
				return;
			}

			if (isTyping) return;

			const k = (e.key ?? '').toLowerCase();

			if (e.code === 'Space') {
				e.preventDefault();
				if (!!controller?.running) ui.pause();
				else ui.play();
				return;
			}

			if (k === 'n') {
				e.preventDefault();
				ui.stepForward();
				return;
			}

			if (k === 'b') {
				e.preventDefault();
				ui.stepBackward();
				return;
			}

			if (k === 'r') {
				e.preventDefault();
				clearSelectionAndLinkDraft();
				ui.togglePlacementMode('router');
				return;
			}

			if (k === 'l') {
				e.preventDefault();
				clearSelectionAndLinkDraft();
				ui.togglePlacementMode('link');
				return;
			}

			if (k === 'p') {
				e.preventDefault();
				clearSelectionAndLinkDraft();
				ui.togglePlacementMode('sendpacket');
				return;
			}

			if (k === 'd') {
				e.preventDefault();
				clearSelectionAndLinkDraft();
				ui.togglePlacementMode('delete');
				return;
			}
		};

		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});

	async function handleKbdFileChosen(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const files = input.files;
		if (!files || files.length === 0) return;

		const file = files[0];
		const text = await file.text();
		ui.importJson(text);
	}
</script>

<div
	class="relative h-full w-full"
	on:pointerdown={handlePointerDown}
	on:pointermove={handlePointerMove}
	on:pointerup={handlePointerUp}
	on:dragover={handleDragOver}
	on:dragleave={handleDragLeave}
	on:drop={handleDrop}
>
	<input
		bind:this={kbdFileInput}
		type="file"
		accept=".json,application/json"
		style="display: none;"
		on:change={handleKbdFileChosen}
	/>
	{#if browser}
		<SvelteFlow
			bind:nodes={flowNodes}
			bind:edges={flowEdges}
			onmove={() => {
				const z = Number(getViewport?.().zoom ?? 1);
				if (Number.isFinite(z) && z > 0) viewportZoom = z;
				if (hoverNodeId) {
					const node = typeof getNode === 'function' ? getNode(hoverNodeId) : null;
					if (node) updateHoverTooltip(node);
				}
			}}
			oninit={() => {
				const z = Number(getViewport?.().zoom ?? 1);
				if (Number.isFinite(z) && z > 0) viewportZoom = z;
			}}
			onnodepointerenter={({ node }) => {
				hoverNodeId = String(node?.id ?? '');
				updateHoverTooltip(node);
			}}
			onnodepointermove={({ node }) => {
				if (!node) return;
				updateHoverTooltip(node);
			}}
			onnodepointerleave={() => {
				hoverNodeId = null;
				hoverTooltip.visible = false;
			}}
			onedgepointerenter={({ edge }) => {
				hoverTooltip.visible = false;
				updateHoverLinkTooltip(edge);
			}}
			onedgepointerleave={() => {
				hoverLinkTooltip.visible = false;
			}}
			{nodeTypes}
			{edgeTypes}
			{proOptions}
			nodeOrigin={[0.5, 0.5]}
			nodesDraggable={!isRunning}
			nodesConnectable={!isRunning && mode === 'link'}
			snapGrid={[20, 20]}
			selectionOnDrag={mode === 'delete'}
			defaultEdgeOptions={{ selectable: true, interactionWidth: 32, type: 'weighted' }}
			{isValidConnection}
			onbeforeconnect={onBeforeConnect}
			onnodedragstart={handleNodeDragStart}
			onnodedragstop={handleNodeDragStop}
			deleteKey={mode === 'delete' && !isRunning ? ['Backspace', 'Delete'] : null}
			onbeforedelete={onBeforeDelete}
			onedgeclick={handleEdgeClick}
			onpaneclick={handlePaneClick}
		></SvelteFlow>
	{:else}
		<div class="ssr-placeholder"></div>
	{/if}

	{#if hoverTooltip.visible}
		<div
			class="router-hover-tooltip"
			style={`left: ${hoverTooltip.x}px; top: ${hoverTooltip.y}px;`}
		>
			<div>Name: {hoverTooltip.label}</div>
			<div>Id: {hoverTooltip.id}</div>
			<div>Optimal: {hoverTooltip.optimal ? 'Yes' : 'No'}</div>
		</div>
	{/if}

	{#if hoverLinkTooltip.visible}
		<div
			class="router-hover-tooltip link-hover-tooltip"
			style={`left: ${hoverLinkTooltip.x}px; top: ${hoverLinkTooltip.y}px;`}
		>
			<div>Link: {hoverLinkTooltip.sourceId} → {hoverLinkTooltip.targetId}</div>
			<div>Weight: {hoverLinkTooltip.weight}</div>
		</div>
	{/if}

	{#if isDragOver}
		<div class="drop-overlay">
			<div class="drop-card">Drop JSON to import topology</div>
		</div>
	{/if}

	{#if mode === 'link'}
		<div class="tool-hint">
			{#if linkSourceRouterId}
				Link tool: select target router to connect with <b>{linkSourceRouterId}</b>.
			{:else}
				Link tool: select the first router.
			{/if}
		</div>
	{/if}

	{#if mode === 'delete'}
		<div class="tool-hint">
			Delete tool: click a router/link to delete, or drag-select multiple and press Delete.
		</div>
	{/if}

	{#if isPlacing && mode === 'router'}
		<div
			class="pointer-events-none absolute z-20 flex h-[90px] w-[90px]
      -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-dashed border-white/75 bg-sky-600/60
      text-[13px] font-semibold text-white"
			style={`left: ${previewX}px; top: ${previewY}px;`}
		>
			Router
		</div>
	{/if}
</div>

<style>
	.ssr-placeholder {
		position: absolute;
		inset: 0;
	}

	.drop-overlay {
		position: absolute;
		inset: 0;
		background: rgba(15, 23, 42, 0.25);
		z-index: 60;
		display: flex;
		align-items: center;
		justify-content: center;
		pointer-events: none;
	}

	.drop-card {
		padding: 14px 16px;
		border-radius: 16px;
		background: rgba(255, 255, 255, 0.96);
		border: 1px solid rgba(15, 23, 42, 0.12);
		box-shadow: 0 14px 28px rgba(15, 23, 42, 0.18);
		font-size: 13px;
		font-weight: 700;
		color: #0f172a;
	}

	.tool-hint {
		position: absolute;
		left: 24px;
		bottom: 130px;
		padding: 8px 10px;
		border-radius: 12px;
		background: rgba(15, 23, 42, 0.9);
		color: #e5e7eb;
		font-size: 11px;
		box-shadow: 0 4px 8px rgba(15, 23, 42, 0.25);
		z-index: 20;
		pointer-events: none;
	}

	.router-hover-tooltip {
		position: fixed;
		transform: translate(-50%, -100%) translateY(-8px);
		padding: 12px 14px;
		border-radius: 10px;
		background: rgba(15, 23, 42, 0.95);
		color: #e5e7eb;
		font-size: 17px;
		font-weight: 600;
		white-space: nowrap;
		box-shadow: 0 8px 16px rgba(15, 23, 42, 0.25);
		z-index: 200;
		pointer-events: none;
	}

	.link-hover-tooltip {
		font-size: 12px;
		font-weight: 600;
		padding: 8px 10px;
	}
</style>
