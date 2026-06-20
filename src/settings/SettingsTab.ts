import {
	App,
	FuzzySuggestModal,
	Notice,
	PluginSettingTab,
	Setting,
	TFile,
} from 'obsidian';
import {
	CHANNEL_THEMES,
	NUM_CHANNELS,
	NUM_PADS,
	QUICK_CHANNEL,
	Loadout,
	PadBank,
	newLoadout,
} from '../model';
import type DnDJayPlugin from '../main';

/** Fuzzy picker over the vault's audio files, for assigning a pad. */
class AudioFileSuggestModal extends FuzzySuggestModal<TFile> {
	constructor(
		app: App,
		private files: TFile[],
		private onChoose: (file: TFile) => void,
	) {
		super(app);
		this.setPlaceholder('Pick an audio file…');
	}
	getItems(): TFile[] {
		return this.files;
	}
	getItemText(file: TFile): string {
		return file.path;
	}
	onChooseItem(file: TFile): void {
		this.onChoose(file);
	}
}

/** The settings tab (§3.3). */
export class DnDJaySettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: DnDJayPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		this.renderLoadoutSection(containerEl);
		this.renderChannelNames(containerEl);
		this.renderPadMapout(
			containerEl,
			'pads',
			'Bed pad mapout',
			`Looping music/ambience pads for "${this.activeLoadout().name}" (the default view).`,
		);
		this.renderPadMapout(
			containerEl,
			'quickPads',
			'One-shot pad mapout',
			`One-shot sound pads for "${this.activeLoadout().name}" (shown when Fire mode is on).`,
		);
		this.renderPlayback(containerEl);
		this.renderSceneDefaults(containerEl);
		this.renderProjector(containerEl);
	}

	private get data() {
		return this.plugin.data;
	}

	private activeLoadout(): Loadout {
		return this.plugin.getActiveLoadout();
	}

	// -- loadouts -------------------------------------------------------------

	private renderLoadoutSection(root: HTMLElement): void {
		new Setting(root).setName('Loadouts').setHeading();

		new Setting(root)
			.setName('Active loadout')
			.setDesc('The 12-pad palette shown in the Music tab. Edited below.')
			.addDropdown((dd) => {
				for (const lo of this.data.loadouts) dd.addOption(lo.id, lo.name);
				dd.setValue(this.data.activeLoadoutId);
				dd.onChange((id) => {
					this.plugin.setActiveLoadout(id);
					this.plugin.refreshViews();
					this.display();
				});
			})
			.addExtraButton((b) =>
				b
					.setIcon('plus')
					.setTooltip('New loadout')
					.onClick(async () => {
						const lo = newLoadout(`Loadout ${this.data.loadouts.length + 1}`);
						this.data.loadouts.push(lo);
						this.data.activeLoadoutId = lo.id;
						await this.plugin.persist();
						this.plugin.refreshViews();
						this.display();
					}),
			)
			.addExtraButton((b) =>
				b
					.setIcon('trash')
					.setTooltip('Delete this loadout')
					.onClick(async () => {
						if (this.data.loadouts.length <= 1) {
							new Notice('DnDJay: keep at least one loadout.');
							return;
						}
						this.data.loadouts = this.data.loadouts.filter(
							(l) => l.id !== this.data.activeLoadoutId,
						);
						this.data.activeLoadoutId = this.data.loadouts[0]!.id;
						await this.plugin.persist();
						this.plugin.refreshViews();
						this.display();
					}),
			);

		new Setting(root).setName('Loadout name').addText((t) =>
			t.setValue(this.activeLoadout().name).onChange(async (v) => {
				this.activeLoadout().name = v || 'Untitled';
				await this.plugin.persist();
				this.plugin.refreshViews();
			}),
		);
	}

	// -- channel names --------------------------------------------------------

	private renderChannelNames(root: HTMLElement): void {
		new Setting(root)
			.setName('Channel names')
			.setDesc('Rename the mixer channels. Leave blank to restore the default.')
			.setHeading();

		const names = this.data.channelNames ?? [];
		for (let c = 0; c < NUM_CHANNELS; c++) {
			const fallback = CHANNEL_THEMES[c]!.name;
			const label = c === QUICK_CHANNEL ? 'Effect channel' : `Channel ${c + 1}`;
			new Setting(root).setName(label).addText((t) =>
				t
					.setPlaceholder(fallback)
					.setValue(names[c] ?? fallback)
					.onChange(async (v) => {
						const next = [...(this.data.channelNames ?? [])];
						while (next.length < NUM_CHANNELS) next.push('');
						next[c] = v.trim() || fallback;
						this.data.channelNames = next;
						await this.plugin.persist();
						this.plugin.refreshViews();
					}),
			);
		}
	}

	// -- pad mapout -----------------------------------------------------------

	private renderPadMapout(root: HTMLElement, bank: PadBank, title: string, desc: string): void {
		new Setting(root).setName(title).setDesc(desc).setHeading();

		const audioFiles = this.plugin.media.listAudio();
		const loadout = this.activeLoadout();
		const pads = loadout[bank];

		for (let i = 0; i < NUM_PADS; i++) {
			const pad = pads[i] ?? null;
			const setting = new Setting(root)
				.setName(`Pad ${i + 1}`)
				.setDesc(pad ? pad.path : 'Empty');
			setting.addButton((b) =>
				b.setButtonText(pad ? 'Change' : 'Set').onClick(() => {
					new AudioFileSuggestModal(this.app, audioFiles, (file) => {
						pads[i] = { path: file.path, name: file.basename };
						void this.plugin.persist().then(() => {
							this.plugin.refreshViews();
							this.display();
						});
					}).open();
				}),
			);
			if (pad) {
				setting.addExtraButton((b) =>
					b
						.setIcon('x')
						.setTooltip('Clear pad')
						.onClick(async () => {
							pads[i] = null;
							await this.plugin.persist();
							this.plugin.refreshViews();
							this.display();
						}),
				);
			}
		}
	}

	// -- playback -------------------------------------------------------------

	private renderPlayback(root: HTMLElement): void {
		new Setting(root).setName('Playback').setHeading();
		new Setting(root)
			.setName('Autoplay on pad tap')
			.setDesc('On: tapping a pad starts it immediately. Off: it arms, awaiting the channel’s Resume.')
			.addToggle((t) =>
				t.setValue(this.data.autoplay).onChange(async (v) => {
					this.data.autoplay = v;
					await this.plugin.persist();
				}),
			);
	}

	// -- scene defaults -------------------------------------------------------

	private renderSceneDefaults(root: HTMLElement): void {
		new Setting(root).setName('Scene defaults').setHeading();
		new Setting(root)
			.setName('Transition')
			.setDesc('Default for a scene switch (adjustable live in the Music tab).')
			.addDropdown((dd) =>
				dd
					.addOption('smooth', 'Smooth (crossfade)')
					.addOption('sudden', 'Sudden (instant)')
					.setValue(this.data.scene.transition)
					.onChange(async (v) => {
						this.data.scene.transition = v as 'smooth' | 'sudden';
						await this.plugin.persist();
					}),
			);
		new Setting(root)
			.setName('Unselected channels')
			.setDesc('What happens on a switch to channels that had no sound staged.')
			.addDropdown((dd) =>
				dd
					.addOption('keep', 'Keep playing')
					.addOption('stop', 'Stop')
					.setValue(this.data.scene.unselected)
					.onChange(async (v) => {
						this.data.scene.unselected = v as 'keep' | 'stop';
						await this.plugin.persist();
					}),
			);
	}

	// -- projector ------------------------------------------------------------

	private renderProjector(root: HTMLElement): void {
		new Setting(root).setName('Pi connection').setHeading();
		new Setting(root)
			.setName('Host / IP')
			.setDesc('The Raspberry Pi display agent address.')
			.addText((t) =>
				t.setValue(this.data.projector.host).onChange(async (v) => {
					this.data.projector.host = v.trim();
					await this.plugin.persist();
					this.plugin.reconnectProjector();
				}),
			)
			.addExtraButton((b) =>
				b
					.setIcon('search')
					.setTooltip('Use raspberrypi.local')
					.onClick(async () => {
						this.data.projector.host = 'raspberrypi.local';
						await this.plugin.persist();
						this.plugin.reconnectProjector();
						this.display();
					}),
			);
		new Setting(root).setName('Port').addText((t) =>
			t.setValue(String(this.data.projector.port)).onChange(async (v) => {
				const port = Number(v);
				if (Number.isFinite(port) && port > 0) {
					this.data.projector.port = Math.round(port);
					await this.plugin.persist();
					this.plugin.reconnectProjector();
				}
			}),
		);
		new Setting(root).setName('Test connection').addButton((b) =>
			b.setButtonText('Test').onClick(() => this.testConnection()),
		);
	}

	private testConnection(): void {
		const { host, port } = this.data.projector;
		if (!host) {
			new Notice('DnDJay: set a host first.');
			return;
		}
		new Notice(`DnDJay: contacting ${host}:${port}…`);
		let ws: WebSocket;
		try {
			ws = new WebSocket(`ws://${host}:${port}`);
		} catch {
			new Notice('DnDJay: could not open a socket.');
			return;
		}
		const timer = window.setTimeout(() => {
			new Notice('DnDJay: connection timed out.');
			try {
				ws.close();
			} catch {
				/* ignore */
			}
		}, 4000);
		ws.addEventListener('open', () => {
			window.clearTimeout(timer);
			new Notice(`DnDJay: connected to ${host}:${port}.`);
			ws.close();
		});
		ws.addEventListener('error', () => {
			window.clearTimeout(timer);
			new Notice(`DnDJay: could not reach ${host}:${port}.`);
		});
	}
}
