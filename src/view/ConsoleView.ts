import { ItemView, WorkspaceLeaf, setIcon } from 'obsidian';
import { MeterController } from '../audio/Meter';
import { MusicTab } from './MusicTab';
import { BattlemapTab } from './BattlemapTab';
import { PluginHost } from './host';

export const VIEW_TYPE_CONSOLE = 'dndjay-console';

/**
 * Feature flag: the Battlemap tab is hidden for the initial release while it's
 * still being built out. Flip to `true` to bring it back — all of its code
 * (BattlemapTab, ProjectorClient, the pi-agent) is intact and untouched.
 */
const BATTLEMAP_ENABLED = false;

type TabId = 'music' | 'battlemap';

/**
 * The plugin pane (an `ItemView`). Renders the tab bar (Music | Battlemap) and
 * hosts the two tab bodies, re-rendering the active one on demand.
 */
export class ConsoleView extends ItemView {
	private activeTab: TabId = 'music';
	private bodyEl!: HTMLElement;
	private tabButtons: Record<TabId, HTMLElement> = {} as Record<TabId, HTMLElement>;

	private meters: MeterController;
	private musicTab: MusicTab;
	private battlemapTab: BattlemapTab;

	constructor(leaf: WorkspaceLeaf, private host: PluginHost) {
		super(leaf);
		this.meters = new MeterController(host.engine, this.containerEl.ownerDocument.defaultView ?? window);
		this.musicTab = new MusicTab(host, this.meters);
		this.battlemapTab = new BattlemapTab(host);
	}

	getViewType(): string {
		return VIEW_TYPE_CONSOLE;
	}

	getDisplayText(): string {
		return 'DnDJay';
	}

	getIcon(): string {
		return 'audio-lines';
	}

	async onOpen(): Promise<void> {
		void this.host.engine.ensureRunning();
		const root = this.contentEl;
		root.empty();
		root.addClass('dndjay-root');

		// With Battlemap hidden there's only one tab, so the tab bar is omitted
		// entirely; it returns automatically when BATTLEMAP_ENABLED is true.
		if (BATTLEMAP_ENABLED) {
			const tabbar = root.createDiv({ cls: 'dndjay-tabbar' });
			this.tabButtons.music = this.makeTab(tabbar, 'music', 'Music', 'music');
			this.tabButtons.battlemap = this.makeTab(tabbar, 'battlemap', 'Battlemap', 'map');
		} else {
			this.activeTab = 'music';
		}

		this.bodyEl = root.createDiv({ cls: 'dndjay-body' });
		this.meters.start();
		this.showTab(this.activeTab);
	}

	async onClose(): Promise<void> {
		this.meters.stop();
		this.meters.bind([]);
		this.musicTab.unmount();
		this.battlemapTab.unmount();
	}

	/** Re-render whichever tab is showing (after settings/loadout changes). */
	refresh(): void {
		this.showTab(this.activeTab);
	}

	private makeTab(bar: HTMLElement, id: TabId, label: string, icon: string): HTMLElement {
		const btn = bar.createDiv({ cls: 'dndjay-tab' });
		setIcon(btn.createSpan({ cls: 'dndjay-tab-icon' }), icon);
		btn.createSpan({ text: label });
		btn.addEventListener('click', () => this.showTab(id));
		return btn;
	}

	private showTab(id: TabId): void {
		if (id === 'battlemap' && !BATTLEMAP_ENABLED) id = 'music';
		this.activeTab = id;
		for (const key of Object.keys(this.tabButtons) as TabId[]) {
			this.tabButtons[key].toggleClass('is-active', key === id);
		}
		// Tear down the inactive tab's bindings before swapping bodies.
		this.musicTab.unmount();
		this.battlemapTab.unmount();
		this.bodyEl.empty();

		if (id === 'music') {
			this.musicTab.mount(this.bodyEl);
		} else {
			this.meters.bind([]); // music meters are gone while battlemap shows
			this.battlemapTab.mount(this.bodyEl);
		}
	}
}
