import { TFile, setIcon } from 'obsidian';
import { DEFAULT_FRAMING, Framing } from '../projector/ProjectorClient';
import { MediaKind } from '../media/VaultMedia';
import { HelpModal } from './modals';
import { BATTLEMAP_HELP } from './help';
import { PluginHost } from './host';

/**
 * The Battlemap tab (§3.2): a vault map library beside a framing stage. Selecting
 * a map loads it into the stage and (when connected) pushes it to the Pi; drag to
 * pan, scroll/pinch to zoom, with rotate / reset / blank / push-to-screen and a
 * live status bar. Framing changes stream to the Pi live (throttled).
 */
export class BattlemapTab {
	private container: HTMLElement | null = null;

	private query = '';
	private selectedPath: string | null = null;
	private onAirPath: string | null = null;
	private framing: Framing = { ...DEFAULT_FRAMING };

	// live elements updated without a full re-render
	private previewMedia: HTMLElement | null = null;
	private zoomSlider: HTMLInputElement | null = null;
	private zoomReadout: HTMLElement | null = null;
	private statusEl: HTMLElement | null = null;

	// pinch/pan pointer tracking
	private pointers = new Map<number, { x: number; y: number }>();
	private pinchStartDist = 0;
	private pinchStartScale = 1;

	constructor(private host: PluginHost) {}

	mount(container: HTMLElement): void {
		this.container = container;
		this.host.projector.onChange = () => this.updateStatus();
		this.render();
	}

	unmount(): void {
		this.container = null;
		if (this.host.projector.onChange) this.host.projector.onChange = null;
	}

	private requestRender(): void {
		if (this.container) this.render();
	}

	// -- render ---------------------------------------------------------------

	private render(): void {
		const root = this.container;
		if (!root) return;
		root.empty();
		root.addClass('dndjay-battlemap');

		// Top bar: just a help button, pinned to the right.
		const topbar = root.createDiv({ cls: 'dndjay-bm-topbar' });
		const help = topbar.createEl('button', { cls: 'dndjay-icon-btn clickable-icon dndjay-help-btn' });
		help.setAttribute('aria-label', 'Help — Battlemap tab');
		setIcon(help, 'help-circle');
		help.addEventListener('click', () => {
			new HelpModal(this.host.app, 'Battlemap tab — help', BATTLEMAP_HELP).open();
		});

		const cols = root.createDiv({ cls: 'dndjay-bm-cols' });
		this.renderLibrary(cols);
		this.renderStage(cols);
	}

	private renderLibrary(cols: HTMLElement): void {
		const lib = cols.createDiv({ cls: 'dndjay-bm-library' });
		const search = lib.createEl('input', {
			cls: 'dndjay-bm-search',
			attr: { type: 'text', placeholder: 'Search maps…' },
		});
		search.value = this.query;
		search.addEventListener('input', () => {
			this.query = search.value;
			this.renderList(list);
		});
		const list = lib.createDiv({ cls: 'dndjay-bm-list' });
		this.renderList(list);
	}

	private renderList(list: HTMLElement): void {
		list.empty();
		const q = this.query.trim().toLowerCase();
		const files = this.host.media
			.listMaps()
			.filter((f) => !q || f.path.toLowerCase().includes(q));
		if (files.length === 0) {
			list.createDiv({ cls: 'dndjay-hint', text: 'No image/video files in this vault.' });
			return;
		}
		for (const file of files) {
			const kind = this.host.media.mediaKind(file);
			if (!kind) continue;
			const row = list.createDiv({ cls: 'dndjay-bm-row' });
			if (file.path === this.selectedPath) row.addClass('is-selected');

			const thumb = row.createDiv({ cls: 'dndjay-bm-thumb' });
			if (kind === 'image') {
				thumb.createEl('img', { attr: { src: this.host.media.resourcePath(file) } });
			} else {
				setIcon(thumb, 'film');
			}

			const meta = row.createDiv({ cls: 'dndjay-bm-meta' });
			meta.createDiv({ cls: 'dndjay-bm-filename', text: file.basename });
			const badges = meta.createDiv({ cls: 'dndjay-bm-badges' });
			badges.createSpan({ cls: `dndjay-badge is-${kind}`, text: kind });
			if (file.path === this.onAirPath) {
				badges.createSpan({ cls: 'dndjay-badge is-onair', text: 'on air' });
			}

			row.addEventListener('click', () => void this.selectMap(file, kind));
		}
	}

	private renderStage(cols: HTMLElement): void {
		const stageCol = cols.createDiv({ cls: 'dndjay-bm-stage-col' });
		const stage = stageCol.createDiv({ cls: 'dndjay-bm-stage' });
		const frame = stage.createDiv({ cls: 'dndjay-bm-frame' });

		const file = this.selectedPath ? this.host.media.getFile(this.selectedPath) : null;
		if (!file) {
			frame.createDiv({ cls: 'dndjay-hint dndjay-bm-empty', text: 'Select a map from the library.' });
			this.previewMedia = null;
		} else {
			const kind = this.host.media.mediaKind(file);
			const media = frame.createDiv({ cls: 'dndjay-bm-media' });
			if (kind === 'video') {
				const v = media.createEl('video', {
					attr: { src: this.host.media.resourcePath(file) },
				});
				v.muted = true;
				v.loop = true;
				v.autoplay = true;
				void v.play().catch(() => {});
			} else {
				media.createEl('img', { attr: { src: this.host.media.resourcePath(file) } });
			}
			this.previewMedia = media;
			frame.createDiv({ cls: 'dndjay-bm-cropframe' }); // crop/edge overlay
			this.attachPointer(frame);
			this.applyFraming(false);
		}

		this.renderControls(stageCol);
		this.renderStatus(stageCol);
	}

	private renderControls(stageCol: HTMLElement): void {
		const bar = stageCol.createDiv({ cls: 'dndjay-bm-controls' });

		const zoomWrap = bar.createDiv({ cls: 'dndjay-bm-zoom' });
		setIcon(zoomWrap.createSpan({ cls: 'dndjay-btn-icon' }), 'zoom-in');
		const slider = zoomWrap.createEl('input', {
			attr: { type: 'range', min: '0.1', max: '5', step: '0.05' },
		});
		slider.value = String(this.framing.scale);
		slider.addEventListener('input', () => {
			this.framing.scale = clamp(Number(slider.value), 0.1, 5);
			this.applyFraming(true);
		});
		this.zoomSlider = slider;
		this.zoomReadout = zoomWrap.createSpan({ cls: 'dndjay-bm-zoom-readout' });

		this.ctrlBtn(bar, 'rotate-ccw', 'Rotate left', () => this.rotateBy(-90));
		this.ctrlBtn(bar, 'rotate-cw', 'Rotate right', () => this.rotateBy(90));
		this.ctrlBtn(bar, 'maximize', 'Reset framing', () => this.resetFraming());
		this.ctrlBtn(bar, 'square', 'Blank screen', () => this.blank());

		const push = bar.createEl('button', { cls: 'dndjay-text-btn dndjay-bm-push' });
		setIcon(push.createSpan({ cls: 'dndjay-btn-icon' }), 'monitor-up');
		push.createSpan({ text: 'Push to screen' });
		push.addEventListener('click', () => void this.pushCurrent());
	}

	private renderStatus(stageCol: HTMLElement): void {
		this.statusEl = stageCol.createDiv({ cls: 'dndjay-bm-status' });
		this.updateStatus();
	}

	private updateStatus(): void {
		const el = this.statusEl;
		if (!el) return;
		el.empty();
		const state = this.host.projector.getState();
		const dot = el.createSpan({ cls: `dndjay-status-dot is-${state}` });
		dot.setAttribute('aria-label', state);
		el.createSpan({ cls: 'dndjay-status-text', text: stateLabel(state) });
		el.createSpan({ cls: 'dndjay-status-sep', text: '·' });
		el.createSpan({ text: this.host.projector.getAddress() });
		el.createSpan({ cls: 'dndjay-status-sep', text: '·' });
		const onAir = this.onAirPath ? basename(this.onAirPath) : 'nothing on screen';
		el.createSpan({ text: onAir });
		el.createSpan({ cls: 'dndjay-status-sep', text: '·' });
		el.createSpan({ text: `${Math.round(this.framing.scale * 100)}%` });
	}

	// -- selection & framing --------------------------------------------------

	private async selectMap(file: TFile, kind: MediaKind): Promise<void> {
		this.selectedPath = file.path;
		this.framing = { ...DEFAULT_FRAMING };
		this.render();
		if (this.host.projector.getState() === 'connected') {
			await this.host.projector.showMap(file, kind, this.framing);
			this.onAirPath = file.path;
			this.requestRender();
		}
	}

	private async pushCurrent(): Promise<void> {
		const file = this.selectedPath ? this.host.media.getFile(this.selectedPath) : null;
		if (!file) return;
		const kind = this.host.media.mediaKind(file);
		if (!kind) return;
		await this.host.projector.showMap(file, kind, this.framing);
		this.onAirPath = file.path;
		this.requestRender();
	}

	private rotateBy(delta: number): void {
		this.framing.rotate = (((this.framing.rotate + delta) % 360) + 360) % 360;
		this.applyFraming(true);
	}

	private resetFraming(): void {
		this.framing = { ...DEFAULT_FRAMING };
		this.applyFraming(false);
		if (this.zoomSlider) this.zoomSlider.value = String(this.framing.scale);
		this.host.projector.reset();
		this.updateStatus();
	}

	private blank(): void {
		this.host.projector.blank();
		this.onAirPath = null;
		this.requestRender();
	}

	/** Push the framing to the preview (CSS) and stream it to the Pi (throttled). */
	private applyFraming(stream: boolean): void {
		const f = this.framing;
		if (this.previewMedia) {
			this.previewMedia.style.transform = `translate(${f.x * 50}%, ${f.y * 50}%) rotate(${f.rotate}deg) scale(${f.scale})`;
		}
		if (this.zoomReadout) this.zoomReadout.setText(`${Math.round(f.scale * 100)}%`);
		if (this.zoomSlider && activeDocument.activeElement !== this.zoomSlider) {
			this.zoomSlider.value = String(f.scale);
		}
		this.updateStatus();
		if (stream && this.host.projector.getState() === 'connected') {
			this.host.projector.setTransform({ scale: f.scale, x: f.x, y: f.y, rotate: f.rotate });
		}
	}

	// -- pointer pan / pinch --------------------------------------------------

	private attachPointer(frame: HTMLElement): void {
		frame.addEventListener('pointerdown', (e: PointerEvent) => {
			frame.setPointerCapture(e.pointerId);
			this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
			if (this.pointers.size === 2) {
				this.pinchStartDist = this.pointerDistance();
				this.pinchStartScale = this.framing.scale;
			}
		});
		frame.addEventListener('pointermove', (e: PointerEvent) => {
			const prev = this.pointers.get(e.pointerId);
			if (!prev) return;
			if (this.pointers.size >= 2) {
				this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
				const dist = this.pointerDistance();
				if (this.pinchStartDist > 0) {
					this.framing.scale = clamp(
						(this.pinchStartScale * dist) / this.pinchStartDist,
						0.1,
						5,
					);
					this.applyFraming(true);
				}
				return;
			}
			// single-pointer pan
			const rect = frame.getBoundingClientRect();
			const dx = (e.clientX - prev.x) / rect.width;
			const dy = (e.clientY - prev.y) / rect.height;
			this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
			this.framing.x = clamp(this.framing.x + dx, -1, 1);
			this.framing.y = clamp(this.framing.y + dy, -1, 1);
			this.applyFraming(true);
		});
		const release = (e: PointerEvent) => {
			this.pointers.delete(e.pointerId);
			try {
				frame.releasePointerCapture(e.pointerId);
			} catch {
				/* ignore */
			}
		};
		frame.addEventListener('pointerup', release);
		frame.addEventListener('pointercancel', release);
		frame.addEventListener('wheel', (e: WheelEvent) => {
			this.framing.scale = clamp(this.framing.scale * (1 - Math.sign(e.deltaY) * 0.08), 0.1, 5);
			this.applyFraming(true);
			e.preventDefault();
		});
	}

	private pointerDistance(): number {
		const pts = Array.from(this.pointers.values());
		if (pts.length < 2) return 0;
		const a = pts[0]!;
		const b = pts[1]!;
		return Math.hypot(a.x - b.x, a.y - b.y);
	}

	// -- small helpers --------------------------------------------------------

	private ctrlBtn(parent: HTMLElement, icon: string, label: string, onClick: () => void): void {
		const btn = parent.createEl('button', { cls: 'dndjay-icon-btn clickable-icon' });
		btn.setAttribute('aria-label', label);
		setIcon(btn, icon);
		btn.addEventListener('click', onClick);
	}
}

function clamp(v: number, lo: number, hi: number): number {
	return Math.min(hi, Math.max(lo, v));
}

function basename(path: string): string {
	const file = path.split('/').pop() ?? path;
	return file;
}

function stateLabel(s: string): string {
	if (s === 'connected') return 'Connected';
	if (s === 'connecting') return 'Connecting…';
	return 'Disconnected';
}
