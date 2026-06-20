import { HelpSection } from './modals';

/** Help shown by the Music tab's "?" button. */
export const MUSIC_HELP: HelpSection[] = [
	{
		heading: 'Loadout & pads',
		items: [
			['Loadout', 'Pick the active pad set. Each loadout has two pad banks — beds and one-shots — both mapped in Settings.'],
			['Pads (4 × 3)', 'Tap a pad to play the sound mapped to it. What it does depends on which channel is selected (below).'],
			['Pad label', 'Shows the mapped sound. Long names scroll; nothing escapes the button.'],
		],
	},
	{
		heading: 'Channels',
		items: [
			['Select a channel', 'Click a strip to make it the pad target. Rename channels in Settings.'],
			['Channels 1–3 (beds)', 'Selected → tapping a pad loads it as a looping bed on that channel.'],
			['Effect channel', 'Select it to enter fire mode: the pads flip to the one-shot bank and a tap fires the sound once.'],
			['Fader', 'Drag up/down to set that channel’s volume.'],
			['Meter', 'Live post-fader level for the channel.'],
		],
	},
	{
		heading: 'Strip buttons',
		items: [
			['Stop', 'Beds: pause and keep position. Effect channel: stop every sounding one-shot.'],
			['Play', 'Resume a paused bed from where it stopped.'],
			['Mute', 'Silence just this channel (toggle).'],
		],
	},
	{
		heading: 'Side rail (left)',
		items: [
			['Silence all', 'Mute every channel at once; tap again to unsilence.'],
			['Prepare scene', 'Stage incoming beds: select a channel, tap a pad to stage it. Staged pads tint with the channel colour.'],
			['Trigger switch', 'Cross-fade to the staged scene (smooth or sudden per Scene settings).'],
			['Scene settings', 'Choose the switch Transition (Smooth / Sudden) and what happens to Unselected channels (Keep / Stop).'],
		],
	},
];

/** Help shown by the Battlemap tab's "?" button. */
export const BATTLEMAP_HELP: HelpSection[] = [
	{
		heading: 'Library',
		items: [
			['Search', 'Filter the vault’s images and videos by name.'],
			['Pick a map', 'Click a row to load it onto the stage (and push it live if connected).'],
		],
	},
	{
		heading: 'Framing stage',
		items: [
			['Pan', 'Drag the image to reposition it.'],
			['Zoom', 'Use the zoom slider, the mouse wheel, or a two-finger pinch.'],
			['Rotate / Reset', 'Rotate the map 90°, or reset framing to default.'],
			['Blank', 'Black out the display without losing the loaded map.'],
			['Push to screen', 'Send the current map and framing to the Raspberry Pi display.'],
		],
	},
	{
		heading: 'Status bar',
		items: [
			['Connection dot', 'Green = connected, amber = connecting, red = disconnected.'],
			['Pi connection', 'Set the host/IP and port in Settings → Pi connection.'],
		],
	},
];
