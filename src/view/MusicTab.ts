import { Notice, setIcon } from 'obsidian';
import {
	CHANNEL_THEMES,
	MAIN_CHANNELS,
	NUM_CHANNELS,
	NUM_PADS,
	QUICK_CHANNEL,
	SoundRef,
} from '../model';
import { StagedSound } from '../audio/AudioEngine';
import { MeterController } from '../audio/Meter';
import { createVerticalFader } from './VerticalFader';
import { HelpModal, SceneSettingsModal } from './modals';
import { MUSIC_HELP } from './help';
import { PluginHost } from './host';

/**
 * The Music tab (§3.1): loadout row, 12-pad palette, and the mixer console
 * (4 channel strips + an icon side-rail). Holds all the runtime UI state for the
 * soundboard (selected channel, modes, staged scene). Re-renders wholesale on
 * discrete user actions; meters update independently via the MeterController.
 */
export class MusicTab {
	private container: HTMLElement | null = null;
	private padNameObserver: ResizeObserver | null = null;

	private selectedChannel = 0; // 0..QUICK_CHANNEL; the quick channel == fire mode
	private prepareMode = false;
	private flipPads = false; // play the pad flip animation on the next render
	private staged = new Map<number, SoundRef>();
	private transition: 'smooth' | 'sudden';
	private unselected: 'keep' | 'stop';

	constructor(private host: PluginHost, private meters: MeterController) {
		this.transition = host.data.scene.transition;
		this.unselected = host.data.scene.unselected;
	}

	mount(container: HTMLElement): void {
		this.container = container;
		this.render();
	}

	unmount(): void {
		this.padNameObserver?.disconnect();
		this.padNameObserver = null;
		this.container = null;
	}

	private requestRender(): void {
		if (this.container) this.render();
	}

	/** Fire mode is simply "the quick channel is the selected channel". */
	private get quickFire(): boolean {
		return this.selectedChannel === QUICK_CHANNEL;
	}

	/** Select a channel strip. Crossing the bed/quick boundary flips the pad
	 *  bank; selecting the quick channel leaves scene-prepare mode (one-shots
	 *  and staging are incompatible). */
	private selectChannel(c: number): void {
		if (c === this.selectedChannel) return;
		const wasQuick = this.quickFire;
		this.selectedChannel = c;
		if (wasQuick !== this.quickFire) this.flipPads = true;
		if (this.quickFire && this.prepareMode) {
			this.prepareMode = false;
			this.staged.clear();
		}
		this.requestRender();
	}

	// -- render ---------------------------------------------------------------

	private render(): void {
		const root = this.container;
		if (!root) return;
		root.empty();
		root.addClass('dndjay-music');

		this.renderLoadoutRow(root);
		this.renderPads(root);
		this.renderMixer(root);
	}

	private renderLoadoutRow(root: HTMLElement): void {
		const row = root.createDiv({ cls: 'dndjay-loadout-row' });
		row.createSpan({ cls: 'dndjay-loadout-label', text: 'Loadout' });
		const select = row.createEl('select', { cls: 'dropdown dndjay-loadout-select' });
		for (const lo of this.host.data.loadouts) {
			const opt = select.createEl('option', { text: lo.name, value: lo.id });
			if (lo.id === this.host.data.activeLoadoutId) opt.selected = true;
		}
		select.addEventListener('change', () => {
			this.host.setActiveLoadout(select.value);
			this.requestRender();
		});
		row.createSpan({
			cls: 'dndjay-hint',
			text: 'Pads are mapped in settings.',
		});

		// Help, pinned to the top-right of the tab.
		const help = this.iconButton(row, 'help-circle', 'Help — Music tab', () => {
			new HelpModal(this.host.app, 'Music tab — help', MUSIC_HELP).open();
		});
		help.addClass('dndjay-help-btn');
	}

	private renderPads(root: HTMLElement): void {
		const grid = root.createDiv({ cls: 'dndjay-pad-grid' });
		if (this.quickFire) grid.addClass('is-quick');
		// A flip animation plays once whenever the bank was just swapped.
		if (this.flipPads) {
			grid.addClass('is-flipping');
			this.flipPads = false;
		}
		const pads = this.activePads();
		const nameEls: HTMLElement[] = [];
		for (let i = 0; i < NUM_PADS; i++) {
			const pad = pads[i] ?? null;
			const el = grid.createDiv({ cls: 'dndjay-pad' });
			const name = el.createSpan({ cls: 'dndjay-pad-name' });
			name.createSpan({ cls: 'dndjay-pad-name-text', text: pad ? pad.name : 'Empty' });
			if (!pad) {
				el.addClass('is-empty');
			} else {
				nameEls.push(name);
				const tint = this.padTint(pad);
				if (tint) {
					el.addClass('is-tinted');
					el.style.setProperty('--pad-tint', tint.color);
					if (tint.incoming) el.addClass('is-incoming');
				}
			}
			el.addEventListener('click', () => void this.onPadTap(i));
		}
		this.observePadNames(grid, nameEls);
	}

	/** The pad bank currently shown: one-shots in fire mode, beds otherwise. */
	private activePads(): (SoundRef | null)[] {
		const lo = this.host.getActiveLoadout();
		return this.quickFire ? lo.quickPads : lo.pads;
	}

	/** A pad name that doesn't fit the 3-line clamp is switched to a horizontal
	 *  marquee whose scroll distance is the measured overflow. Re-measured on
	 *  pane resize (the grid reflows, so widths change). */
	private observePadNames(grid: HTMLElement, nameEls: HTMLElement[]): void {
		this.padNameObserver?.disconnect();
		const measure = () => {
			for (const name of nameEls) {
				const inner = name.firstElementChild as HTMLElement | null;
				if (!inner) continue;
				name.removeClass('is-marquee');
				name.style.removeProperty('--marquee-shift');
				name.style.removeProperty('--marquee-dur');
				// In clamp mode, vertical overflow means it's too long to show whole.
				if (name.scrollHeight <= name.clientHeight + 1) continue;
				name.addClass('is-marquee');
				const overflow = inner.scrollWidth - name.clientWidth;
				if (overflow <= 0) {
					name.removeClass('is-marquee');
					continue;
				}
				name.style.setProperty('--marquee-shift', `-${overflow}px`);
				// ~25px/s of travel, plus dwell time at each end.
				name.style.setProperty('--marquee-dur', `${(overflow / 25 + 4).toFixed(1)}s`);
			}
		};
		this.padNameObserver = new ResizeObserver(() => measure());
		this.padNameObserver.observe(grid);
		window.requestAnimationFrame(measure);
	}

	/** In prepare mode: staged pads read as the channel's "incoming" (light)
	 *  tint; otherwise currently-playing pads read as the channel's "playing"
	 *  (mid) tint. Outside prepare mode, pads carry no colour. */
	private padTint(pad: SoundRef): { color: string; incoming: boolean } | null {
		if (!this.prepareMode) return null;
		for (const [ch, ref] of this.staged) {
			if (ref.path === pad.path) {
				return { color: CHANNEL_THEMES[ch]!.light, incoming: true };
			}
		}
		for (let c = 0; c < MAIN_CHANNELS; c++) {
			const bed = this.host.engine.getBed(c);
			if (bed && bed.playing && bed.ref.path === pad.path) {
				return { color: CHANNEL_THEMES[c]!.mid, incoming: false };
			}
		}
		return null;
	}

	private async onPadTap(index: number): Promise<void> {
		const pad = this.activePads()[index] ?? null;
		await this.host.engine.ensureRunning();
		if (!pad) {
			if (!this.prepareMode) new Notice('DnDJay: that pad is empty.');
			return;
		}
		if (this.prepareMode) {
			this.staged.set(this.selectedChannel, pad);
			this.requestRender();
		} else if (this.quickFire) {
			void this.host.engine.fireQuick(pad);
		} else {
			await this.host.engine.loadBed(this.selectedChannel, pad, this.host.data.autoplay);
			this.requestRender();
		}
	}

	// -- mixer ----------------------------------------------------------------

	private renderMixer(root: HTMLElement): void {
		const mixer = root.createDiv({ cls: 'dndjay-mixer' });
		// Side rail sits to the *left* of the strips.
		this.renderSideControls(mixer);
		const strips = mixer.createDiv({ cls: 'dndjay-strips' });
		for (let c = 0; c < NUM_CHANNELS; c++) this.renderStrip(strips, c);
		// (Re)point the meter loop at the freshly-built fill elements.
		this.bindMeters(strips);
	}

	private bindMeters(strips: HTMLElement): void {
		const fills = Array.from(strips.querySelectorAll<HTMLElement>('.dndjay-meter-fill'));
		const targets = fills.map((fillEl) => ({
			channel: Number(fillEl.dataset.channel),
			fillEl,
		}));
		this.meters.bind(targets);
	}

	private renderStrip(parent: HTMLElement, c: number): void {
		const theme = CHANNEL_THEMES[c]!;
		const isQuick = c === QUICK_CHANNEL;
		const isMain = c < MAIN_CHANNELS;
		const strip = parent.createDiv({ cls: 'dndjay-strip' });
		strip.style.setProperty('--ch-accent', theme.accent);
		if (isQuick) strip.addClass('is-quick');
		if (c === this.selectedChannel) strip.addClass('is-selected');

		strip.addEventListener('click', (e) => {
			// Selecting the channel shouldn't fire when hitting a control.
			if ((e.target as HTMLElement).closest('button, .dndjay-fader')) return;
			this.selectChannel(c);
		});

		// header: accent + (user-editable) name + loaded sound
		const header = strip.createDiv({ cls: 'dndjay-strip-header' });
		header.createDiv({ cls: 'dndjay-strip-accent' });
		const title = header.createDiv({ cls: 'dndjay-strip-title' });
		const name = this.host.data.channelNames?.[c] ?? theme.name;
		title.createSpan({ cls: 'dndjay-strip-name', text: name });
		const bed = isMain ? this.host.engine.getBed(c) : null;
		header.createDiv({
			cls: 'dndjay-strip-loaded',
			text: bed ? bed.ref.name : isQuick ? 'one-shots' : '—',
		});

		// meter + fader row
		const body = strip.createDiv({ cls: 'dndjay-strip-body' });
		const meter = body.createDiv({ cls: 'dndjay-meter' });
		const fill = meter.createDiv({ cls: 'dndjay-meter-fill' });
		fill.dataset.channel = String(c);
		createVerticalFader(body, {
			value: this.host.engine.getVolume(c),
			color: theme.accent,
			onInput: (v) => {
				void this.host.engine.ensureRunning();
				this.host.engine.setVolume(c, v);
			},
		});

		// transport buttons — row 1: Stop + Play; row 2: Mute (full width).
		const controls = strip.createDiv({ cls: 'dndjay-strip-controls' });
		const stopLabel = isQuick ? 'Stop one-shots' : 'Stop (keep position)';
		this.iconButton(controls, 'square', stopLabel, () => {
			this.host.engine.stopChannel(c);
			this.requestRender();
		});
		const playing = this.host.engine.isChannelPlaying(c);
		this.iconButton(controls, 'play', isQuick ? 'Play' : 'Resume', () => {
			void this.host.engine.ensureRunning();
			this.host.engine.playChannel(c);
			this.requestRender();
		}).toggleClass('is-active', playing);

		const muted = this.host.engine.isMuted(c);
		const muteBtn = this.iconButton(
			controls,
			muted ? 'volume-x' : 'volume-2',
			muted ? 'Unmute' : 'Mute',
			() => {
				this.host.engine.toggleMute(c);
				this.requestRender();
			},
		);
		muteBtn.addClass('dndjay-mute-btn');
		muteBtn.toggleClass('is-active', muted);
	}

	/** The left icon-rail: Silence all, Prepare scene, Trigger switch, and a
	 *  Scene-settings button that opens the transition/unselected popup. */
	private renderSideControls(mixer: HTMLElement): void {
		const side = mixer.createDiv({ cls: 'dndjay-side' });

		const allMuted = !this.host.engine.anyUnmuted();
		this.iconRailButton(side, 'bell-off', allMuted ? 'Unsilence all' : 'Silence all', () => {
			if (this.host.engine.anyUnmuted()) this.host.engine.silenceAll();
			else this.host.engine.unsilenceAll();
			this.requestRender();
		}).toggleClass('is-active', allMuted);

		const prepareLabel = this.prepareMode
			? `Prepare scene — ${this.staged.size} staged`
			: 'Prepare scene';
		this.iconRailButton(side, 'layers', prepareLabel, () => {
			this.prepareMode = !this.prepareMode;
			if (this.prepareMode) {
				// Staging targets a bed channel; leave fire mode (and flip back).
				if (this.quickFire) {
					this.selectedChannel = 0;
					this.flipPads = true;
				}
			} else {
				this.staged.clear();
			}
			this.requestRender();
		}).toggleClass('is-active', this.prepareMode);

		this.iconRailButton(side, 'shuffle', 'Trigger switch', () => void this.triggerScene()).addClass(
			'dndjay-trigger-btn',
		);

		this.iconRailButton(side, 'settings', 'Scene settings', () => {
			new SceneSettingsModal(
				this.host.app,
				{ transition: this.transition, unselected: this.unselected },
				(t, u) => {
					this.transition = t;
					this.unselected = u;
				},
			).open();
		});
	}

	private async triggerScene(): Promise<void> {
		if (this.staged.size === 0 && this.unselected === 'keep') {
			new Notice('DnDJay: nothing staged.');
			return;
		}
		const staged = new Map<number, StagedSound>();
		for (const [ch, ref] of this.staged) staged.set(ch, { ref });
		await this.host.engine.triggerScene(staged, this.transition, this.unselected);
		this.staged.clear();
		this.prepareMode = false;
		this.requestRender();
	}

	// -- small DOM helpers ----------------------------------------------------

	private iconButton(
		parent: HTMLElement,
		icon: string,
		label: string,
		onClick: () => void,
	): HTMLButtonElement {
		const btn = parent.createEl('button', { cls: 'dndjay-icon-btn clickable-icon' });
		btn.setAttribute('aria-label', label);
		setIcon(btn, icon);
		btn.addEventListener('click', onClick);
		return btn;
	}

	/** An icon-only button for the left rail; the label lives in its tooltip. */
	private iconRailButton(
		parent: HTMLElement,
		icon: string,
		label: string,
		onClick: () => void,
	): HTMLButtonElement {
		const btn = parent.createEl('button', { cls: 'dndjay-text-btn' });
		btn.setAttribute('aria-label', label);
		btn.setAttribute('title', label);
		setIcon(btn.createSpan({ cls: 'dndjay-btn-icon' }), icon);
		btn.addEventListener('click', onClick);
		return btn;
	}
}
