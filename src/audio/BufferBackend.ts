import { Notice } from 'obsidian';
import {
	MAIN_CHANNELS,
	NUM_CHANNELS,
	QUICK_CHANNEL,
	SMOOTH_FADE_SECONDS,
	SoundRef,
} from '../model';
import { VaultMedia } from '../media/VaultMedia';
import { PlaybackBackend, SceneTransition, SceneUnselected, StagedSound } from './types';

/** One playing (or armed) looping bed on a main channel. A channel may briefly
 *  hold two voices during a scene crossfade.
 *
 *  Beds play through a looping `AudioBufferSourceNode` (same decode path as the
 *  one-shots). A buffer source is single-use, so `node` is recreated on every
 *  play; `offset`/`startedAt` track the play position across Stop/Resume. */
interface BedVoice {
	ref: SoundRef;
	buffer: AudioBuffer;
	node: AudioBufferSourceNode | null; // recreated on each play; null when paused/armed
	gain: GainNode; // per-voice crossfade gain (0..1), independent of the fader
	startedAt: number; // ctx.currentTime when the current node started
	offset: number; // resume position within the buffer (s)
	playing: boolean;
}

interface Channel {
	gain: GainNode; // the fader: effective volume = isMuted ? 0 : userVolume
	analyser: AnalyserNode; // post-fader tap for the meter
	userVolume: number;
	isMuted: boolean;
	voices: BedVoice[]; // main channels only; quick channel stays empty
}

const GAIN_RAMP = 0.02; // setTargetAtTime time-constant for click-free fader moves

/**
 * The desktop Web Audio graph and playback logic (§4).
 *
 * Graph: per channel `channelGain[c] -> masterGain -> destination`, with an
 * `AnalyserNode` tapped post-fader for the meter. Both main beds and quick
 * one-shots are decoded once to an `AudioBuffer` (cached by path) and played
 * through fresh `AudioBufferSourceNode`s — this avoids the autoplay gating and
 * CORS taint that silence a `MediaElementAudioSourceNode` (see README), at the
 * cost of holding decoded PCM in memory for long beds. On mobile that cost is
 * prohibitive, so {@link ElementBackend} is used there instead.
 */
export class BufferBackend implements PlaybackBackend {
	private ctx: AudioContext;
	private master: GainNode;
	private channels: Channel[] = [];
	/** Decoded one-shot buffers, cached by vault path. */
	private bufferCache = new Map<string, AudioBuffer>();
	private bufferLoading = new Map<string, Promise<AudioBuffer>>();
	/** Currently-sounding one-shots on the quick channel, so Stop can halt them. */
	private quickSources = new Set<AudioBufferSourceNode>();

	constructor(private media: VaultMedia) {
		// Creating the context is harmless; it stays suspended until resume() is
		// called from a user gesture (see ensureRunning()).
		const Ctor: typeof AudioContext =
			window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
		this.ctx = new Ctor();
		this.master = this.ctx.createGain();
		this.master.gain.value = 1;
		this.master.connect(this.ctx.destination);

		for (let i = 0; i < NUM_CHANNELS; i++) {
			const gain = this.ctx.createGain();
			gain.gain.value = 0.8;
			gain.connect(this.master);
			const analyser = this.ctx.createAnalyser();
			analyser.fftSize = 1024;
			analyser.smoothingTimeConstant = 0.6;
			// Tap post-fader so the meter reflects fader + mute.
			gain.connect(analyser);
			this.channels.push({ gain, analyser, userVolume: 0.8, isMuted: false, voices: [] });
		}
	}

	// -- lifecycle ------------------------------------------------------------

	/** Resume the context; call from the first user gesture. */
	async ensureRunning(): Promise<void> {
		if (this.ctx.state === 'suspended') {
			try {
				await this.ctx.resume();
			} catch {
				/* ignore — will retry on next gesture */
			}
		}
	}

	get contextState(): AudioContextState {
		return this.ctx.state;
	}

	getAnalyser(channel: number): AnalyserNode | null {
		return this.channels[channel]?.analyser ?? null;
	}

	// -- per-channel volume / mute -------------------------------------------

	getVolume(channel: number): number {
		return this.channels[channel]?.userVolume ?? 0;
	}

	setVolume(channel: number, value: number): void {
		const ch = this.channels[channel];
		if (!ch) return;
		ch.userVolume = clamp(value, 0, 1);
		this.applyChannelGain(channel);
	}

	isMuted(channel: number): boolean {
		return this.channels[channel]?.isMuted ?? false;
	}

	setMuted(channel: number, muted: boolean): void {
		const ch = this.channels[channel];
		if (!ch) return;
		ch.isMuted = muted;
		this.applyChannelGain(channel);
	}

	toggleMute(channel: number): boolean {
		const ch = this.channels[channel];
		if (!ch) return false;
		this.setMuted(channel, !ch.isMuted);
		return ch.isMuted;
	}

	/** True when at least one channel is currently audible (unmuted). */
	anyUnmuted(): boolean {
		return this.channels.some((c) => !c.isMuted);
	}

	/** Mute every channel (resumable). Returns the new "all muted" state. */
	silenceAll(): void {
		for (let c = 0; c < NUM_CHANNELS; c++) this.setMuted(c, true);
	}

	unsilenceAll(): void {
		for (let c = 0; c < NUM_CHANNELS; c++) this.setMuted(c, false);
	}

	private applyChannelGain(channel: number): void {
		const ch = this.channels[channel];
		if (!ch) return;
		const target = ch.isMuted ? 0 : ch.userVolume;
		ch.gain.gain.setTargetAtTime(target, this.ctx.currentTime, GAIN_RAMP);
	}

	// -- main beds (channels 0..3) -------------------------------------------

	/** What's loaded on a main channel (the primary/incoming voice), if any. */
	getBed(channel: number): { ref: SoundRef; playing: boolean } | null {
		const ch = this.channels[channel];
		if (!ch || ch.voices.length === 0) return null;
		const voice = ch.voices[ch.voices.length - 1]!; // newest = incoming/primary
		return { ref: voice.ref, playing: voice.playing };
	}

	/** Assign a looping bed to a channel, replacing whatever was there.
	 *  When `autoplay` is false the bed is loaded but left paused (armed). */
	async loadBed(channel: number, ref: SoundRef, autoplay: boolean): Promise<void> {
		if (channel >= MAIN_CHANNELS) return;
		await this.ensureRunning();
		const ch = this.channels[channel];
		if (!ch) return;

		// Tear down existing voices (normal assignment is an immediate replace).
		this.teardownVoices(ch);

		const voice = await this.createBedVoice(ref, ch.gain);
		if (!voice) return;
		voice.gain.gain.value = 1;
		ch.voices.push(voice);

		if (autoplay) this.startVoice(voice);
	}

	/** Resume (play) every voice on a channel. */
	playChannel(channel: number): void {
		void this.ensureRunning();
		const ch = this.channels[channel];
		if (!ch) return;
		for (const v of ch.voices) this.startVoice(v);
	}

	/** Stop a channel: pause beds (keeping position) or, on the quick channel,
	 *  silence every currently-sounding one-shot. */
	stopChannel(channel: number): void {
		if (channel === QUICK_CHANNEL) {
			this.stopQuick();
			return;
		}
		const ch = this.channels[channel];
		if (!ch) return;
		for (const v of ch.voices) this.pauseVoice(v);
	}

	isChannelPlaying(channel: number): boolean {
		if (channel === QUICK_CHANNEL) return this.quickSources.size > 0;
		const ch = this.channels[channel];
		if (!ch) return false;
		return ch.voices.some((v) => v.playing);
	}

	/** Build an armed (not-yet-started) bed voice routed
	 *  `node -> per-voice gain -> dest` (the channel gain). */
	private async createBedVoice(ref: SoundRef, dest: AudioNode): Promise<BedVoice | null> {
		let buffer: AudioBuffer;
		try {
			buffer = await this.getBuffer(ref);
		} catch {
			new Notice(`DnDJay: could not play "${ref.name}"`);
			return null;
		}
		const gain = this.ctx.createGain();
		gain.connect(dest);
		return { ref, buffer, node: null, gain, startedAt: 0, offset: 0, playing: false };
	}

	/** Start (or resume) a voice from its tracked offset with a fresh node. */
	private startVoice(v: BedVoice): void {
		if (v.playing) return;
		const node = this.ctx.createBufferSource();
		node.buffer = v.buffer;
		node.loop = true;
		node.connect(v.gain);
		node.start(0, v.offset % v.buffer.duration);
		v.node = node;
		v.startedAt = this.ctx.currentTime;
		v.playing = true;
	}

	/** Pause a voice, recording where it stopped so the next start resumes there. */
	private pauseVoice(v: BedVoice): void {
		if (!v.playing) return;
		v.offset = (v.offset + this.ctx.currentTime - v.startedAt) % v.buffer.duration;
		if (v.node) {
			try {
				v.node.stop();
				v.node.disconnect();
			} catch {
				/* ignore */
			}
			v.node = null;
		}
		v.playing = false;
	}

	private teardownVoices(ch: Channel): void {
		for (const v of ch.voices) this.disposeVoice(v);
		ch.voices = [];
	}

	private disposeVoice(v: BedVoice): void {
		try {
			if (v.node) {
				v.node.stop();
				v.node.disconnect();
				v.node = null;
			}
			v.gain.disconnect();
			v.playing = false;
		} catch {
			/* ignore */
		}
	}

	// -- quick one-shots (channel 4) -----------------------------------------

	/** Fire a sound once through the quick channel (overlapping is fine). */
	async fireQuick(ref: SoundRef): Promise<void> {
		await this.ensureRunning();
		const ch = this.channels[QUICK_CHANNEL];
		if (!ch) return;
		let buffer: AudioBuffer;
		try {
			buffer = await this.getBuffer(ref);
		} catch {
			new Notice(`DnDJay: could not play "${ref.name}"`);
			return;
		}
		const src = this.ctx.createBufferSource();
		src.buffer = buffer;
		src.connect(ch.gain);
		this.quickSources.add(src);
		src.addEventListener('ended', () => {
			this.quickSources.delete(src);
			try {
				src.disconnect();
			} catch {
				/* ignore */
			}
		});
		src.start();
	}

	/** Stop every currently-playing one-shot on the quick channel. */
	stopQuick(): void {
		for (const src of this.quickSources) {
			try {
				src.stop();
				src.disconnect();
			} catch {
				/* ignore */
			}
		}
		this.quickSources.clear();
	}

	private async getBuffer(ref: SoundRef): Promise<AudioBuffer> {
		const cached = this.bufferCache.get(ref.path);
		if (cached) return cached;
		const inflight = this.bufferLoading.get(ref.path);
		if (inflight) return inflight;

		const file = this.media.getFile(ref.path);
		if (!file) throw new Error('missing file');
		const promise = (async () => {
			// `decodeAudioData` detaches the buffer it consumes; `bytes` is a fresh
			// `readBinary` result used nowhere else, so handing it over directly
			// (no defensive copy) avoids a transient full-file duplicate.
			const bytes = await this.media.readBytes(file);
			const buffer = await this.ctx.decodeAudioData(bytes);
			this.bufferCache.set(ref.path, buffer);
			this.bufferLoading.delete(ref.path);
			return buffer;
		})();
		this.bufferLoading.set(ref.path, promise);
		return promise;
	}

	// -- scene prepare / switch ----------------------------------------------

	/**
	 * Execute a staged scene switch across the four main channels.
	 *  - staged channel: start the incoming bed at gain ~0 and ramp to 1 while
	 *    the outgoing voices ramp to 0 then tear down (two voices coexist during
	 *    the crossfade).
	 *  - unstaged channel: `keep` leaves it playing; `stop` fades it out.
	 * `smooth` uses a ~2s ramp; `sudden` swaps instantly.
	 */
	async triggerScene(
		staged: Map<number, StagedSound>,
		transition: SceneTransition,
		unselected: SceneUnselected,
	): Promise<void> {
		await this.ensureRunning();
		const fade = transition === 'smooth' ? SMOOTH_FADE_SECONDS : 0;

		for (let c = 0; c < MAIN_CHANNELS; c++) {
			const ch = this.channels[c];
			if (!ch) continue;
			const incoming = staged.get(c);

			if (incoming) {
				const voice = await this.createBedVoice(incoming.ref, ch.gain);
				if (!voice) continue;
				voice.gain.gain.value = fade > 0 ? 0.0001 : 1;
				ch.voices.push(voice);
				this.startVoice(voice);

				// Ramp the outgoing voices down, the incoming up.
				const outgoing = ch.voices.slice(0, -1);
				this.crossfade(outgoing, voice, fade, ch);
			} else if (unselected === 'stop') {
				this.fadeOutAndStop(ch, fade);
			}
			// unselected === 'keep' → leave as-is.
		}
	}

	private crossfade(outgoing: BedVoice[], incoming: BedVoice, fade: number, ch: Channel): void {
		const now = this.ctx.currentTime;
		if (fade > 0) {
			incoming.gain.gain.setValueAtTime(0.0001, now);
			incoming.gain.gain.exponentialRampToValueAtTime(1, now + fade);
			for (const v of outgoing) {
				v.gain.gain.setValueAtTime(Math.max(v.gain.gain.value, 0.0001), now);
				v.gain.gain.exponentialRampToValueAtTime(0.0001, now + fade);
			}
			window.setTimeout(() => {
				for (const v of outgoing) this.disposeVoice(v);
				ch.voices = ch.voices.filter((v) => !outgoing.includes(v));
			}, fade * 1000 + 80);
		} else {
			incoming.gain.gain.value = 1;
			for (const v of outgoing) this.disposeVoice(v);
			ch.voices = ch.voices.filter((v) => v === incoming);
		}
	}

	private fadeOutAndStop(ch: Channel, fade: number): void {
		if (ch.voices.length === 0) return;
		const voices = [...ch.voices];
		const now = this.ctx.currentTime;
		if (fade > 0) {
			for (const v of voices) {
				v.gain.gain.setValueAtTime(Math.max(v.gain.gain.value, 0.0001), now);
				v.gain.gain.exponentialRampToValueAtTime(0.0001, now + fade);
			}
			window.setTimeout(() => {
				for (const v of voices) this.disposeVoice(v);
				ch.voices = ch.voices.filter((v) => !voices.includes(v));
			}, fade * 1000 + 80);
		} else {
			this.teardownVoices(ch);
		}
	}

	// -- teardown -------------------------------------------------------------

	dispose(): void {
		this.stopQuick();
		for (const ch of this.channels) this.teardownVoices(ch);
		this.bufferCache.clear();
		this.bufferLoading.clear();
		try {
			void this.ctx.close();
		} catch {
			/* ignore */
		}
	}
}

function clamp(v: number, lo: number, hi: number): number {
	return Math.min(hi, Math.max(lo, v));
}
