// ============================================================================
// Data model (§5) and shared constants for the DnDJay plugin.
// ============================================================================

/** A reference to a vault audio file: its relative path + a display name. */
export interface SoundRef {
	path: string;
	name: string;
}

/** A named pad mapping. Each loadout carries two parallel 12-pad sets: `pads`
 *  for looping beds (the default view) and `quickPads` for one-shot sounds
 *  (shown when fire mode is on). `…[i] === null` means that pad is empty. */
export interface Loadout {
	id: string;
	name: string;
	pads: (SoundRef | null)[]; // bed pads, always length NUM_PADS
	quickPads: (SoundRef | null)[]; // one-shot pads, always length NUM_PADS
}

/** The two pad banks a loadout exposes. */
export type PadBank = 'pads' | 'quickPads';

/** Defaults for a scene switch; adjustable live in the Music tab. */
export interface SceneDefaults {
	transition: 'smooth' | 'sudden';
	unselected: 'keep' | 'stop';
}

/** Where the Raspberry Pi projector agent lives. */
export interface ProjectorSettings {
	host: string;
	port: number;
}

/** The full persisted blob (data.json). */
export interface PluginData {
	loadouts: Loadout[];
	activeLoadoutId: string;
	autoplay: boolean;
	scene: SceneDefaults;
	projector: ProjectorSettings;
	channelNames?: string[]; // optional renames, length NUM_CHANNELS
}

// ----------------------------------------------------------------------------
// Constants
// ----------------------------------------------------------------------------

export const NUM_PADS = 12;
/** Total channels: 3 looping beds + 1 quick-sounds channel. */
export const NUM_CHANNELS = 4;
/** Indices 0..2 are the main looping beds. */
export const MAIN_CHANNELS = 3;
/** Index 3 is the quick / one-shot channel. */
export const QUICK_CHANNEL = 3;

/** Crossfade length for a "smooth" scene transition, in seconds. */
export const SMOOTH_FADE_SECONDS = 2.0;

/** A channel's colour ramp. Accents/fader use `accent`; "playing" pad tint uses
 *  `mid`; "staged/incoming" pad tint uses `light` (a lighter stop of the SAME
 *  ramp, so it always reads as that channel's next sound). */
export interface ChannelTheme {
	name: string;
	accent: string;
	mid: string;
	light: string;
}

export const CHANNEL_THEMES: ChannelTheme[] = [
	{ name: 'Channel 1', accent: '#3b82f6', mid: '#2563eb', light: '#93c5fd' }, // blue
	{ name: 'Channel 2', accent: '#14b8a6', mid: '#0d9488', light: '#5eead4' }, // teal
	{ name: 'Channel 3', accent: '#8b5cf6', mid: '#7c3aed', light: '#c4b5fd' }, // purple
	{ name: 'Effect', accent: '#ef4444', mid: '#dc2626', light: '#fca5a5' }, // crimson
];

// ----------------------------------------------------------------------------
// Defaults & helpers
// ----------------------------------------------------------------------------

export function emptyPads(): (SoundRef | null)[] {
	return new Array<SoundRef | null>(NUM_PADS).fill(null);
}

/** Coerce a (possibly missing/wrong-length) pad bank to exactly NUM_PADS slots. */
function fitPads(pads: unknown): (SoundRef | null)[] {
	if (!Array.isArray(pads)) return emptyPads();
	const out = pads.slice(0, NUM_PADS) as (SoundRef | null)[];
	while (out.length < NUM_PADS) out.push(null);
	return out;
}

export function newLoadout(name: string): Loadout {
	return { id: genId(), name, pads: emptyPads(), quickPads: emptyPads() };
}

export function genId(): string {
	return 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export const DEFAULT_DATA: PluginData = {
	loadouts: [{ id: 'default', name: 'Default', pads: emptyPads(), quickPads: emptyPads() }],
	activeLoadoutId: 'default',
	autoplay: true,
	scene: { transition: 'smooth', unselected: 'keep' },
	projector: { host: 'raspberrypi.local', port: 8765 },
	channelNames: CHANNEL_THEMES.map((t) => t.name),
};

/** Merge persisted data over defaults, repairing any missing / malformed bits
 *  so the rest of the plugin can assume a well-formed structure. */
export function normalizeData(raw: Partial<PluginData> | null | undefined): PluginData {
	const data: PluginData = {
		...DEFAULT_DATA,
		...(raw ?? {}),
		scene: { ...DEFAULT_DATA.scene, ...(raw?.scene ?? {}) },
		projector: { ...DEFAULT_DATA.projector, ...(raw?.projector ?? {}) },
	};

	if (!Array.isArray(data.loadouts) || data.loadouts.length === 0) {
		data.loadouts = [{ id: 'default', name: 'Default', pads: emptyPads(), quickPads: emptyPads() }];
	}
	// Guarantee every loadout has exactly NUM_PADS slots in both banks.
	for (const lo of data.loadouts) {
		lo.pads = fitPads(lo.pads);
		lo.quickPads = fitPads(lo.quickPads);
	}
	if (!data.loadouts.some((l) => l.id === data.activeLoadoutId)) {
		data.activeLoadoutId = data.loadouts[0]!.id;
	}
	if (!Array.isArray(data.channelNames) || data.channelNames.length !== NUM_CHANNELS) {
		data.channelNames = CHANNEL_THEMES.map((t) => t.name);
	} else if (LEGACY_CHANNEL_NAMES.every((n, i) => data.channelNames![i] === n)) {
		// Replace the old themed auto-names with the current generic defaults.
		data.channelNames = CHANNEL_THEMES.map((t) => t.name);
	}
	return data;
}

/** Former default channel names; reset to the current defaults if seen verbatim. */
const LEGACY_CHANNEL_NAMES = ['Music', 'Ambience', 'Tension', 'Quick'];
