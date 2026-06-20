import { App } from 'obsidian';
import { Loadout, PluginData } from '../model';
import { AudioEngine } from '../audio/AudioEngine';
import { VaultMedia } from '../media/VaultMedia';
import { ProjectorClient } from '../projector/ProjectorClient';

/**
 * The slice of the plugin that views and the settings tab depend on. Keeping
 * this an interface (rather than importing the concrete plugin class) avoids a
 * circular runtime dependency between `main.ts` and the views.
 */
export interface PluginHost {
	app: App;
	engine: AudioEngine;
	media: VaultMedia;
	projector: ProjectorClient;
	data: PluginData;
	persist(): Promise<void>;
	getActiveLoadout(): Loadout;
	setActiveLoadout(id: string): void;
	/** Re-render any open console view (after settings/loadout changes). */
	refreshViews(): void;
}
