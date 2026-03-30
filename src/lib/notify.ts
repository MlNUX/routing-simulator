import { writable } from 'svelte/store';

export type NotificationKind = 'info' | 'success' | 'warning' | 'error';

export type Notification = {
	id: string;
	message: string;
	kind: NotificationKind;
	createdAt: number;
	timeoutMs: number;
};

export const notifications = writable<Notification[]>([]);

function makeId(): string {
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export type NotifyOptions = {
	kind?: NotificationKind;
	timeoutMs?: number;
};

export async function notify(message: string, options: NotifyOptions = {}): Promise<void> {
	const msg = String(message ?? '').trim();
	if (msg.length === 0) return;

	const kind: NotificationKind = options.kind ?? 'info';
	const timeoutMs = Number.isFinite(options.timeoutMs) ? Number(options.timeoutMs) : 2200;

	const n: Notification = {
		id: makeId(),
		message: msg,
		kind,
		createdAt: Date.now(),
		timeoutMs
	};

	notifications.update((xs) => [n, ...xs].slice(0, 5));

	if (timeoutMs > 0) {
		setTimeout(() => {
			notifications.update((xs) => xs.filter((x) => x.id !== n.id));
		}, timeoutMs);
	}

	if (typeof console !== 'undefined') {
		if (kind === 'warning') console.warn(msg);
		if (kind === 'error') console.error(msg);
	}
}

export function dismissNotification(id: string): void {
	const rid = String(id ?? '').trim();
	if (rid.length === 0) return;
	notifications.update((xs) => xs.filter((x) => x.id !== rid));
}

export function clearNotifications(): void {
	notifications.set([]);
}
