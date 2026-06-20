import { Plugin, WorkspaceLeaf } from 'obsidian';
import { Loadout, PluginData, normalizeData } from './model';
import { VaultMedia } from './media/VaultMedia';
import { AudioEngine } from './audio/AudioEngine';
import { ProjectorClient } from './projector/ProjectorClient';
import { ConsoleView, VIEW_TYPE_CONSOLE } from './view/ConsoleView';
import { PluginHost } from './view/host';
import { DnDJaySettingTab } from './settings/SettingsTab';

/**
 * DnDJay — a tabletop control console for Obsidian: a 5-channel Web Audio
 * soundboard plus a battlemap controller that streams vault media to a Pi.
 * Owns the long-lived singletons (AudioEngine, ProjectorClient, VaultMedia) and
 * the persisted settings; the views subscribe via the {@link PluginHost} surface.
 */
export default class DnDJayPlugin extends Plugin implements PluginHost {
	data!: PluginData;
	media!: VaultMedia;
	engine!: AudioEngine;
	projector!: ProjectorClient;

	async onload(): Promise<void> {
		this.data = normalizeData((await this.loadData()) as Partial<PluginData> | null);

		this.media = new VaultMedia(this.app);
		this.engine = new AudioEngine(this.media);
		this.projector = new ProjectorClient(this.media);
		this.projector.setTarget(this.data.projector.host, this.data.projector.port);

		this.registerView(VIEW_TYPE_CONSOLE, (leaf) => new ConsoleView(leaf, this));

		this.addRibbonIcon('audio-lines', 'Open DnDJay console', () => void this.activateView());
		this.addCommand({
			id: 'open-console',
			name: 'Open console',
			callback: () => void this.activateView(),
		});

		this.addSettingTab(new DnDJaySettingTab(this.app, this));

		// The async file/decode path means a play() may land after the user's
		// gesture has lapsed, leaving the context suspended (silence). Resume it
		// on the first gesture anywhere; ensureRunning() is a no-op once running.
		const resume = () => void this.engine.ensureRunning();
		this.registerDomEvent(activeDocument, 'pointerdown', resume);
		this.registerDomEvent(activeDocument, 'keydown', resume);
	}

	onunload(): void {
		this.engine?.dispose();
		this.projector?.dispose();
	}

	// -- PluginHost surface ---------------------------------------------------

	async persist(): Promise<void> {
		await this.saveData(this.data);
	}

	getActiveLoadout(): Loadout {
		return (
			this.data.loadouts.find((l) => l.id === this.data.activeLoadoutId) ?? this.data.loadouts[0]!
		);
	}

	setActiveLoadout(id: string): void {
		if (this.data.loadouts.some((l) => l.id === id)) {
			this.data.activeLoadoutId = id;
			void this.persist();
		}
	}

	refreshViews(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_CONSOLE)) {
			const view = leaf.view;
			if (view instanceof ConsoleView) view.refresh();
		}
	}

	reconnectProjector(): void {
		this.projector.setTarget(this.data.projector.host, this.data.projector.port);
	}

	// -- view activation ------------------------------------------------------

	async activateView(): Promise<void> {
		void this.engine.ensureRunning();
		const { workspace } = this.app;
		let leaf: WorkspaceLeaf | undefined = workspace.getLeavesOfType(VIEW_TYPE_CONSOLE)[0];
		if (!leaf) {
			leaf = workspace.getLeaf('tab');
			await leaf.setViewState({ type: VIEW_TYPE_CONSOLE, active: true });
		}
		void workspace.revealLeaf(leaf);
	}
}
