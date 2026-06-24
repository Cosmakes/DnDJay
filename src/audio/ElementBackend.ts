import { Notice } from 'obsidian';
import { MAIN_CHANNELS, NUM_CHANNELS, QUICK_CHANNEL, SMOOTH_FADE_SECONDS, SoundRef } from '../model';
import { VaultMedia } from '../media/VaultMedia';
import { PlaybackBackend, SceneTransition, SceneUnselected, StagedSound } from './types';

interface ElChannel {
	userVolume: number;
	isMuted: boolean;
	bedRef: SoundRef | null; // what's loaded on a main channel (null on the quick channel)
	el: HTMLAudioElement | null; // the streaming bed element
	playing: boolean;
	cancelRamp: (() => void) | null; // cancels an in-flight crossfade ramp
	fadingOut: Set<HTMLAudioElement>; // outgoing elements still fading during a scene switch
}

/**
 * The mobile playback engine. Every sound is streamed through a bare
 * `HTMLAudioElement` pointed at the vault resource path (`app://…`) and played
 * **directly** — never decoded and never routed through Web Audio. This keeps
 * memory flat for arbitrarily long beds (the OOM that crashes the buffer engine
 * on a tablet), at the cost of the VU meters (a directly-played element isn't in
 * an analyser graph), so the UI hides meters on mobile.
 *
 * No `AudioContext` is created at all here. Volume/mute live on `el.volume`;
 * Stop/Resume use native pause/play (which retain `currentTime`); scene switches
 * crossfade `el.volume` with a `requestAnimationFrame` ramp.
 */
export class ElementBackend implements PlaybackBackend {
	private channels: ElChannel[] = [];
	/** Currently-sounding one-shots, so Stop can halt them. */
	private quickEls = new Set<HTMLAudioElement>();

	constructor(private media: VaultMedia) {
		for (let i = 0; i < NUM_CHANNELS; i++) {
			this.channels.push({
				userVolume: 0.8,
				isMuted: false,
				bedRef: null,
				el: null,
				playing: false,
				cancelRamp: null,
				fadingOut: new Set(),
			});
		}
	}

	// -- lifecycle ------------------------------------------------------------

	// No AudioContext on mobile — nothing to resume.
	async ensureRunning(): Promise<void> {
		/* no-op */
	}

	get contextState(): AudioContextState {
		return 'running';
	}

	// Streamed elements aren't in an analyser graph, so there is no meter signal.
	getAnalyser(): AnalyserNode | null {
		return null;
	}

	// -- per-channel volume / mute -------------------------------------------

	getVolume(channel: number): number {
		return this.channels[channel]?.userVolume ?? 0;
	}

	setVolume(channel: number, value: number): void {
		const ch = this.channels[channel];
		if (!ch) return;
		ch.userVolume = clamp01(value);
		this.applyElVolume(channel);
	}

	isMuted(channel: number): boolean {
		return this.channels[channel]?.isMuted ?? false;
	}

	setMuted(channel: number, muted: boolean): void {
		const ch = this.channels[channel];
		if (!ch) return;
		ch.isMuted = muted;
		this.applyElVolume(channel);
	}

	toggleMute(channel: number): boolean {
		const ch = this.channels[channel];
		if (!ch) return false;
		this.setMuted(channel, !ch.isMuted);
		return ch.isMuted;
	}

	anyUnmuted(): boolean {
		return this.channels.some((c) => !c.isMuted);
	}

	silenceAll(): void {
		for (let c = 0; c < NUM_CHANNELS; c++) this.setMuted(c, true);
	}

	unsilenceAll(): void {
		for (let c = 0; c < NUM_CHANNELS; c++) this.setMuted(c, false);
	}

	private channelVolume(ch: ElChannel): number {
		return ch.isMuted ? 0 : ch.userVolume;
	}

	private applyElVolume(channel: number): void {
		const ch = this.channels[channel];
		if (!ch) return;
		// A live crossfade owns el.volume; let it finish rather than fight it.
		if (ch.cancelRamp) return;
		const vol = this.channelVolume(ch);
		if (channel === QUICK_CHANNEL) {
			for (const el of this.quickEls) el.volume = vol;
		} else if (ch.el) {
			ch.el.volume = vol;
		}
	}

	// -- main beds ------------------------------------------------------------

	getBed(channel: number): { ref: SoundRef; playing: boolean } | null {
		const ch = this.channels[channel];
		if (!ch || !ch.bedRef) return null;
		return { ref: ch.bedRef, playing: ch.playing };
	}

	async loadBed(channel: number, ref: SoundRef, autoplay: boolean): Promise<void> {
		if (channel >= MAIN_CHANNELS) return;
		const ch = this.channels[channel];
		if (!ch) return;

		const el = this.makeElement(ref, true);
		if (!el) return;

		// Replace whatever was there (and abort any in-flight crossfade).
		this.endTransition(ch);
		if (ch.el) this.disposeEl(ch.el);
		ch.el = el;
		ch.bedRef = ref;
		ch.playing = false;
		el.volume = this.channelVolume(ch);

		if (autoplay) this.startEl(ch, el);
	}

	playChannel(channel: number): void {
		const ch = this.channels[channel];
		if (!ch || !ch.el) return;
		this.startEl(ch, ch.el);
	}

	stopChannel(channel: number): void {
		if (channel === QUICK_CHANNEL) {
			this.stopQuick();
			return;
		}
		const ch = this.channels[channel];
		if (!ch || !ch.el) return;
		ch.el.pause(); // native pause retains currentTime for Resume
		ch.playing = false;
	}

	isChannelPlaying(channel: number): boolean {
		if (channel === QUICK_CHANNEL) return this.quickEls.size > 0;
		return this.channels[channel]?.playing ?? false;
	}

	/** play() the element from its retained position; reconcile state if it rejects. */
	private startEl(ch: ElChannel, el: HTMLAudioElement): void {
		ch.playing = true;
		void el.play().catch(() => {
			if (ch.el === el) ch.playing = false;
		});
	}

	/** Build a streaming element for `ref`, or Notice + null if the file is gone. */
	private makeElement(ref: SoundRef, loop: boolean): HTMLAudioElement | null {
		const file = this.media.getFile(ref.path);
		if (!file) {
			new Notice(`DnDJay: could not play "${ref.name}"`);
			return null;
		}
		const el = activeDocument.createElement('audio');
		el.loop = loop;
		el.preload = 'auto';
		el.src = this.media.resourcePath(file);
		return el;
	}

	private disposeEl(el: HTMLAudioElement): void {
		try {
			el.pause();
			el.removeAttribute('src');
			el.load(); // release the stream handle
		} catch {
			/* ignore */
		}
	}

	// -- quick one-shots ------------------------------------------------------

	async fireQuick(ref: SoundRef): Promise<void> {
		const el = this.makeElement(ref, false);
		if (!el) return;
		const quick = this.channels[QUICK_CHANNEL];
		el.volume = quick ? this.channelVolume(quick) : 1;
		this.quickEls.add(el);
		const cleanup = () => {
			this.quickEls.delete(el);
			this.disposeEl(el);
		};
		el.addEventListener('ended', cleanup);
		el.addEventListener('error', cleanup);
		void el.play().catch(cleanup);
	}

	stopQuick(): void {
		for (const el of this.quickEls) this.disposeEl(el);
		this.quickEls.clear();
	}

	// -- scene prepare / switch ----------------------------------------------

	async triggerScene(
		staged: Map<number, StagedSound>,
		transition: SceneTransition,
		unselected: SceneUnselected,
	): Promise<void> {
		const fadeMs = transition === 'smooth' ? SMOOTH_FADE_SECONDS * 1000 : 0;

		for (let c = 0; c < MAIN_CHANNELS; c++) {
			const ch = this.channels[c];
			if (!ch) continue;
			const incoming = staged.get(c);

			if (incoming) {
				const newEl = this.makeElement(incoming.ref, true);
				if (!newEl) continue; // missing file → leave the channel as-is
				this.endTransition(ch);
				const oldEl = ch.el;
				const target = this.channelVolume(ch);
				newEl.volume = fadeMs > 0 ? 0 : target;
				ch.el = newEl;
				ch.bedRef = incoming.ref;
				this.startEl(ch, newEl);

				if (fadeMs > 0) {
					this.crossfade(ch, newEl, target, oldEl, fadeMs);
				} else if (oldEl) {
					this.disposeEl(oldEl);
				}
			} else if (unselected === 'stop') {
				this.stopBed(ch, fadeMs);
			}
			// unselected === 'keep' → leave as-is.
		}
	}

	/** Ramp the incoming element up and the outgoing one down, disposing it after. */
	private crossfade(
		ch: ElChannel,
		incoming: HTMLAudioElement,
		target: number,
		outgoing: HTMLAudioElement | null,
		ms: number,
	): void {
		const cancels: Array<() => void> = [];
		cancels.push(this.rampVolume(incoming, 0, target, ms));
		if (outgoing) {
			ch.fadingOut.add(outgoing);
			cancels.push(
				this.rampVolume(outgoing, outgoing.volume, 0, ms, () => {
					ch.fadingOut.delete(outgoing);
					this.disposeEl(outgoing);
				}),
			);
		}
		ch.cancelRamp = () => {
			for (const cancel of cancels) cancel();
			ch.cancelRamp = null;
		};
	}

	/** Fade the channel's bed out (or cut it) and clear the channel. */
	private stopBed(ch: ElChannel, fadeMs: number): void {
		this.endTransition(ch);
		const el = ch.el;
		if (!el) return;
		ch.el = null;
		ch.bedRef = null;
		ch.playing = false;
		if (fadeMs > 0) {
			ch.fadingOut.add(el);
			const cancel = this.rampVolume(el, el.volume, 0, fadeMs, () => {
				ch.fadingOut.delete(el);
				this.disposeEl(el);
			});
			ch.cancelRamp = () => {
				cancel();
				ch.cancelRamp = null;
			};
		} else {
			this.disposeEl(el);
		}
	}

	/** Abort an in-flight crossfade on a channel and dispose any lingering fade-out. */
	private endTransition(ch: ElChannel): void {
		ch.cancelRamp?.();
		ch.cancelRamp = null;
		for (const el of ch.fadingOut) this.disposeEl(el);
		ch.fadingOut.clear();
	}

	/** Linearly ramp `el.volume` over `ms`; returns a cancel function. */
	private rampVolume(
		el: HTMLAudioElement,
		from: number,
		to: number,
		ms: number,
		onDone?: () => void,
	): () => void {
		el.volume = clamp01(from);
		let start = 0;
		let raf = 0;
		const step = (now: number) => {
			if (!start) start = now;
			const t = Math.min(1, (now - start) / ms);
			el.volume = clamp01(from + (to - from) * t);
			if (t < 1) {
				raf = window.requestAnimationFrame(step);
			} else {
				onDone?.();
			}
		};
		raf = window.requestAnimationFrame(step);
		return () => window.cancelAnimationFrame(raf);
	}

	// -- teardown -------------------------------------------------------------

	dispose(): void {
		this.stopQuick();
		for (const ch of this.channels) {
			this.endTransition(ch);
			if (ch.el) this.disposeEl(ch.el);
			ch.el = null;
			ch.bedRef = null;
			ch.playing = false;
		}
	}
}

function clamp01(v: number): number {
	return Math.min(1, Math.max(0, v));
}
