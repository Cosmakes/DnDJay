import { Notice, TFile } from 'obsidian';
import { MediaKind, VaultMedia } from '../media/VaultMedia';

export type ConnState = 'disconnected' | 'connecting' | 'connected';

export interface Framing {
	scale: number; // 0.1..5.0, 1 = fit
	x: number; // -1..1 pan fraction
	y: number; // -1..1
	rotate: number; // 0/90/180/270
}

export const DEFAULT_FRAMING: Framing = { scale: 1, x: 0, y: 0, rotate: 0 };

interface ServerState {
	current: string | null;
	scale: number;
	x: number;
	y: number;
	rotate: number;
}

function textField(v: unknown, fallback: string): string {
	return typeof v === 'string' ? v : fallback;
}

const PING_INTERVAL = 5000;
const TRANSFORM_MIN_INTERVAL = 1000 / 30; // ≤30 transforms/sec while dragging
const BACKOFF_MIN = 800;
const BACKOFF_MAX = 10000;

/**
 * WebSocket client for the Raspberry Pi display agent (§6). Handles connection
 * state, auto-reconnect with backoff, a ping keepalive, content-hash dedup of
 * uploads, and throttled live `transform` streaming.
 */
export class ProjectorClient {
	private ws: WebSocket | null = null;
	private state: ConnState = 'disconnected';
	private host = '';
	private port = 0;
	private wantConnected = false;
	private backoff = BACKOFF_MIN;
	private reconnectTimer: number | null = null;
	private pingTimer: number | null = null;

	/** Asset ids the Pi has confirmed it holds (from the `cached` message). */
	private cachedIds = new Set<string>();
	private serverState: ServerState | null = null;

	// throttled transform
	private pendingTransform: Partial<Framing> | null = null;
	private lastTransformSent = 0;
	private transformTimer: number | null = null;

	/** Fired whenever connection state / server state changes (for the UI). */
	onChange: (() => void) | null = null;

	constructor(private media: VaultMedia) {}

	getState(): ConnState {
		return this.state;
	}

	getAddress(): string {
		return this.host ? `${this.host}:${this.port}` : '(not set)';
	}

	getServerState(): ServerState | null {
		return this.serverState;
	}

	/** Point at a host/port and (re)connect. */
	setTarget(host: string, port: number, autoConnect = true): void {
		const changed = host !== this.host || port !== this.port;
		this.host = host;
		this.port = port;
		if (changed && this.ws) this.close(false);
		if (autoConnect) this.connect();
	}

	connect(): void {
		this.wantConnected = true;
		if (this.ws || !this.host) return;
		this.open();
	}

	disconnect(): void {
		this.wantConnected = false;
		this.clearTimers();
		this.close(false);
		this.setConnState('disconnected');
	}

	private open(): void {
		this.setConnState('connecting');
		let ws: WebSocket;
		try {
			ws = new WebSocket(`ws://${this.host}:${this.port}`);
		} catch {
			this.scheduleReconnect();
			return;
		}
		ws.binaryType = 'arraybuffer';
		this.ws = ws;

		ws.addEventListener('open', () => {
			this.backoff = BACKOFF_MIN;
			this.setConnState('connected');
			this.startPing();
		});
		ws.addEventListener('message', (ev) => this.onMessage(ev));
		ws.addEventListener('close', () => {
			this.ws = null;
			this.stopPing();
			if (this.wantConnected) {
				this.setConnState('connecting');
				this.scheduleReconnect();
			} else {
				this.setConnState('disconnected');
			}
		});
		ws.addEventListener('error', () => {
			// 'close' will follow; let it drive reconnect.
		});
	}

	private close(intentionalReconnect: boolean): void {
		if (this.reconnectTimer !== null && !intentionalReconnect) {
			window.clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		if (this.ws) {
			try {
				this.ws.close();
			} catch {
				/* ignore */
			}
			this.ws = null;
		}
		this.stopPing();
	}

	private scheduleReconnect(): void {
		if (!this.wantConnected || this.reconnectTimer !== null) return;
		this.reconnectTimer = window.setTimeout(() => {
			this.reconnectTimer = null;
			if (this.wantConnected && !this.ws) this.open();
		}, this.backoff);
		this.backoff = Math.min(BACKOFF_MAX, Math.round(this.backoff * 1.7));
	}

	private setConnState(s: ConnState): void {
		if (this.state === s) return;
		this.state = s;
		this.onChange?.();
	}

	// -- messaging ------------------------------------------------------------

	private onMessage(ev: MessageEvent): void {
		if (typeof ev.data !== 'string') return; // server only sends JSON
		let msg: Record<string, unknown>;
		try {
			msg = JSON.parse(ev.data) as Record<string, unknown>;
		} catch {
			return;
		}
		switch (msg.type) {
			case 'cached':
				this.cachedIds = new Set((msg.ids as string[]) ?? []);
				this.onChange?.();
				break;
			case 'state':
				this.serverState = {
					current: (msg.current as string | null) ?? null,
					scale: (msg.scale as number) ?? 1,
					x: (msg.x as number) ?? 0,
					y: (msg.y as number) ?? 0,
					rotate: (msg.rotate as number) ?? 0,
				};
				this.onChange?.();
				break;
			case 'ack':
				if (msg.ok === false) {
					new Notice(`DnDJay (Pi): ${textField(msg.message, 'command failed')}`);
				}
				break;
			case 'error':
				new Notice(`DnDJay (Pi): ${textField(msg.message, 'error')}`);
				break;
			case 'pong':
				break;
		}
	}

	private sendJson(obj: Record<string, unknown>): boolean {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
		this.ws.send(JSON.stringify(obj));
		return true;
	}

	private startPing(): void {
		this.stopPing();
		this.pingTimer = window.setInterval(() => this.sendJson({ cmd: 'ping' }), PING_INTERVAL);
	}

	private stopPing(): void {
		if (this.pingTimer !== null) {
			window.clearInterval(this.pingTimer);
			this.pingTimer = null;
		}
	}

	private clearTimers(): void {
		if (this.reconnectTimer !== null) {
			window.clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		if (this.transformTimer !== null) {
			window.clearTimeout(this.transformTimer);
			this.transformTimer = null;
		}
		this.stopPing();
	}

	// -- high-level operations ------------------------------------------------

	/** Content hash (sha-256 hex) used as the stable asset id. */
	private async hashBytes(bytes: ArrayBuffer): Promise<string> {
		const digest = await crypto.subtle.digest('SHA-256', bytes);
		return Array.from(new Uint8Array(digest))
			.map((b) => b.toString(16).padStart(2, '0'))
			.join('');
	}

	/** Upload-if-needed, then show, then send framing (§6 display flow). */
	async showMap(file: TFile, kind: MediaKind, framing: Framing): Promise<void> {
		if (this.state !== 'connected') {
			new Notice('DnDJay: not connected to the Pi.');
			return;
		}
		let bytes: ArrayBuffer;
		try {
			bytes = await this.media.readBytes(file);
		} catch {
			new Notice(`DnDJay: could not read "${file.name}"`);
			return;
		}
		const id = await this.hashBytes(bytes);

		if (!this.cachedIds.has(id)) {
			// JSON header followed by one binary frame of bytes.
			if (!this.sendJson({ cmd: 'upload', id, name: file.name, kind })) return;
			this.ws!.send(bytes);
			this.cachedIds.add(id);
		}
		this.sendJson({ cmd: 'show', id });
		this.sendTransformNow(framing);
	}

	/** Queue a framing update, coalescing to ≤30/sec while dragging. */
	setTransform(partial: Partial<Framing>): void {
		this.pendingTransform = { ...this.pendingTransform, ...partial };
		const now = performance.now();
		const elapsed = now - this.lastTransformSent;
		if (elapsed >= TRANSFORM_MIN_INTERVAL) {
			this.flushTransform();
		} else if (this.transformTimer === null) {
			this.transformTimer = window.setTimeout(
				() => this.flushTransform(),
				TRANSFORM_MIN_INTERVAL - elapsed,
			);
		}
	}

	private flushTransform(): void {
		if (this.transformTimer !== null) {
			window.clearTimeout(this.transformTimer);
			this.transformTimer = null;
		}
		if (!this.pendingTransform) return;
		const t = this.pendingTransform;
		this.pendingTransform = null;
		this.lastTransformSent = performance.now();
		this.sendJson({ cmd: 'transform', ...t });
	}

	private sendTransformNow(f: Framing): void {
		this.lastTransformSent = performance.now();
		this.sendJson({ cmd: 'transform', scale: f.scale, x: f.x, y: f.y, rotate: f.rotate });
	}

	reset(): void {
		this.sendJson({ cmd: 'reset' });
	}

	blank(): void {
		this.sendJson({ cmd: 'blank' });
	}

	dispose(): void {
		this.wantConnected = false;
		this.clearTimers();
		this.close(false);
	}
}
