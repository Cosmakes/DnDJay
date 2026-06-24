import { Platform } from 'obsidian';
import { SoundRef } from '../model';
import { VaultMedia } from '../media/VaultMedia';
import { PlaybackBackend, SceneTransition, SceneUnselected, StagedSound } from './types';
import { BufferBackend } from './BufferBackend';
import { ElementBackend } from './ElementBackend';

export type { SceneTransition, SceneUnselected, StagedSound } from './types';

/**
 * Playback facade. Picks the right engine for the platform and forwards every
 * call to it: {@link BufferBackend} on desktop (Web Audio + decoded buffers,
 * real meters) and {@link ElementBackend} on mobile (streamed `HTMLAudioElement`s
 * so huge beds don't OOM the WebView). The public surface is identical to the
 * old single-engine class, so views/meters don't change.
 */
export class AudioEngine {
	private backend: PlaybackBackend;

	constructor(media: VaultMedia) {
		this.backend = Platform.isMobile ? new ElementBackend(media) : new BufferBackend(media);
	}

	ensureRunning(): Promise<void> {
		return this.backend.ensureRunning();
	}

	get contextState(): AudioContextState {
		return this.backend.contextState;
	}

	getAnalyser(channel: number): AnalyserNode | null {
		return this.backend.getAnalyser(channel);
	}

	getVolume(channel: number): number {
		return this.backend.getVolume(channel);
	}

	setVolume(channel: number, value: number): void {
		this.backend.setVolume(channel, value);
	}

	isMuted(channel: number): boolean {
		return this.backend.isMuted(channel);
	}

	setMuted(channel: number, muted: boolean): void {
		this.backend.setMuted(channel, muted);
	}

	toggleMute(channel: number): boolean {
		return this.backend.toggleMute(channel);
	}

	anyUnmuted(): boolean {
		return this.backend.anyUnmuted();
	}

	silenceAll(): void {
		this.backend.silenceAll();
	}

	unsilenceAll(): void {
		this.backend.unsilenceAll();
	}

	getBed(channel: number): { ref: SoundRef; playing: boolean } | null {
		return this.backend.getBed(channel);
	}

	loadBed(channel: number, ref: SoundRef, autoplay: boolean): Promise<void> {
		return this.backend.loadBed(channel, ref, autoplay);
	}

	playChannel(channel: number): void {
		this.backend.playChannel(channel);
	}

	stopChannel(channel: number): void {
		this.backend.stopChannel(channel);
	}

	isChannelPlaying(channel: number): boolean {
		return this.backend.isChannelPlaying(channel);
	}

	fireQuick(ref: SoundRef): Promise<void> {
		return this.backend.fireQuick(ref);
	}

	stopQuick(): void {
		this.backend.stopQuick();
	}

	triggerScene(
		staged: Map<number, StagedSound>,
		transition: SceneTransition,
		unselected: SceneUnselected,
	): Promise<void> {
		return this.backend.triggerScene(staged, transition, unselected);
	}

	dispose(): void {
		this.backend.dispose();
	}
}
