import { App, TFile } from 'obsidian';

export const AUDIO_EXTS = ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', '3gp'];
export const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif'];
export const VIDEO_EXTS = ['mp4', 'webm', 'mkv', 'mov', 'm4v', 'ogv'];

export type MediaKind = 'image' | 'video';

/**
 * Thin wrapper over the vault for the media this plugin cares about: audio for
 * pads, and images/videos for battlemaps.
 *
 * Audio is served as raw bytes ({@link readBytes}) that the {@link AudioEngine}
 * decodes to `AudioBuffer`s — no object URLs or media elements, which sidesteps
 * the autoplay gating and CORS taint that silence Web Audio playback on desktop.
 * Battlemap images/videos still use {@link resourcePath} for `<img>`/`<video>`.
 */
export class VaultMedia {
	constructor(private app: App) {}

	private hasExt(file: TFile, exts: string[]): boolean {
		return exts.includes(file.extension.toLowerCase());
	}

	listAudio(): TFile[] {
		return this.app.vault
			.getFiles()
			.filter((f) => this.hasExt(f, AUDIO_EXTS))
			.sort((a, b) => a.path.localeCompare(b.path));
	}

	listMaps(): TFile[] {
		return this.app.vault
			.getFiles()
			.filter((f) => this.hasExt(f, IMAGE_EXTS) || this.hasExt(f, VIDEO_EXTS))
			.sort((a, b) => a.path.localeCompare(b.path));
	}

	getFile(path: string): TFile | null {
		const f = this.app.vault.getAbstractFileByPath(path);
		return f instanceof TFile ? f : null;
	}

	mediaKind(file: TFile): MediaKind | null {
		if (this.hasExt(file, IMAGE_EXTS)) return 'image';
		if (this.hasExt(file, VIDEO_EXTS)) return 'video';
		return null;
	}

	/** Resource path suitable for `<img>`/`<video>` `src`. Safe to use directly. */
	resourcePath(file: TFile): string {
		return this.app.vault.getResourcePath(file);
	}

	async readBytes(file: TFile): Promise<ArrayBuffer> {
		return this.app.vault.readBinary(file);
	}
}
