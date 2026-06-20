import { App, Modal } from 'obsidian';

/** One titled block of help: a heading and a list of `term — explanation` rows. */
export interface HelpSection {
	heading: string;
	items: [string, string][];
}

/** A simple read-only popup explaining a tab's controls. */
export class HelpModal extends Modal {
	constructor(
		app: App,
		private titleText: string,
		private sections: HelpSection[],
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('dndjay-help');
		contentEl.createEl('h2', { text: this.titleText });
		for (const section of this.sections) {
			contentEl.createEl('h3', { cls: 'dndjay-help-heading', text: section.heading });
			const list = contentEl.createEl('dl', { cls: 'dndjay-help-list' });
			for (const [term, desc] of section.items) {
				list.createEl('dt', { text: term });
				list.createEl('dd', { text: desc });
			}
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

export type SceneTransition = 'smooth' | 'sudden';
export type SceneUnselected = 'keep' | 'stop';

/** Popup holding the two scene toggles, opened from the side-rail settings icon. */
export class SceneSettingsModal extends Modal {
	constructor(
		app: App,
		private state: { transition: SceneTransition; unselected: SceneUnselected },
		private onChange: (transition: SceneTransition, unselected: SceneUnselected) => void,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: 'Scene settings' });

		this.segmented(
			contentEl,
			'Transition',
			'How a staged scene switch plays.',
			[
				['smooth', 'Smooth'],
				['sudden', 'Sudden'],
			],
			() => this.state.transition,
			(v) => {
				this.state.transition = v as SceneTransition;
				this.emit();
			},
		);
		this.segmented(
			contentEl,
			'Unselected channels',
			'What happens to channels with nothing staged.',
			[
				['keep', 'Keep'],
				['stop', 'Stop'],
			],
			() => this.state.unselected,
			(v) => {
				this.state.unselected = v as SceneUnselected;
				this.emit();
			},
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private emit(): void {
		this.onChange(this.state.transition, this.state.unselected);
	}

	private segmented(
		parent: HTMLElement,
		label: string,
		desc: string,
		options: [string, string][],
		current: () => string,
		onPick: (v: string) => void,
	): void {
		const wrap = parent.createDiv({ cls: 'dndjay-segmented' });
		wrap.createSpan({ cls: 'dndjay-segmented-label', text: label });
		const group = wrap.createDiv({ cls: 'dndjay-segmented-group' });
		const buttons: HTMLButtonElement[] = [];
		for (const [val, text] of options) {
			const btn = group.createEl('button', { cls: 'dndjay-seg-btn', text });
			btn.toggleClass('is-active', val === current());
			btn.addEventListener('click', () => {
				onPick(val);
				for (const b of buttons) b.toggleClass('is-active', b === btn);
			});
			buttons.push(btn);
		}
		parent.createDiv({ cls: 'dndjay-help', text: desc }).addClass('setting-item-description');
	}
}
