import { SoundRef } from '../model';

export type SceneTransition = 'smooth' | 'sudden';
export type SceneUnselected = 'keep' | 'stop';

/** A staged incoming sound for a channel during prepare mode. */
export interface StagedSound {
	ref: SoundRef;
}

/**
 * The playback surface the views depend on. Two implementations exist:
 * {@link BufferBackend} (desktop — Web Audio + decoded `AudioBuffer`s, real
 * meters) and {@link ElementBackend} (mobile — streamed `HTMLAudioElement`s, no
 * decode so memory stays flat for long beds). {@link AudioEngine} is a thin
 * facade that picks one per platform.
 */
export interface PlaybackBackend {
	ensureRunning(): Promise<void>;
	readonly contextState: AudioContextState;
	getAnalyser(channel: number): AnalyserNode | null;

	getVolume(channel: number): number;
	setVolume(channel: number, value: number): void;
	isMuted(channel: number): boolean;
	setMuted(channel: number, muted: boolean): void;
	toggleMute(channel: number): boolean;
	anyUnmuted(): boolean;
	silenceAll(): void;
	unsilenceAll(): void;

	getBed(channel: number): { ref: SoundRef; playing: boolean } | null;
	loadBed(channel: number, ref: SoundRef, autoplay: boolean): Promise<void>;
	playChannel(channel: number): void;
	stopChannel(channel: number): void;
	isChannelPlaying(channel: number): boolean;

	fireQuick(ref: SoundRef): Promise<void>;
	stopQuick(): void;

	triggerScene(
		staged: Map<number, StagedSound>,
		transition: SceneTransition,
		unselected: SceneUnselected,
	): Promise<void>;

	dispose(): void;
}
