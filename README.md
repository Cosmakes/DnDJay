# DnDJay — Soundboard & Battlemap console for Obsidian

A tabletop control console that lives in an Obsidian pane. Two tabs:

- **Music** — a 4-channel Web Audio mixer with live meters, a 12-pad sound
  palette with named loadouts (a separate bank for looping beds and one-shots),
  a quick-fire one-shot channel, and a scene prepare/switch system with smooth or
  sudden transitions.
- **Battlemap** — a media library beside a framing stage. Pick a vault image or
  video, frame it (pan / zoom / rotate), and stream it live to a Raspberry Pi
  driving an HDMI display.

All sounds and maps live in your **vault**. Settings persist via `data.json`.

---

## Install (development)

This plugin folder is already a working dev checkout.

```bash
npm install        # if node_modules is missing
npm run dev        # watch build → main.js
# or a one-off production build:
npm run build
```

Then enable **DnDJay Soundboard & Battlemap** in Obsidian → Settings → Community
plugins, and open the console from the ribbon (the waveform icon) or the command
palette → **DnDJay: Open console**.

---

## Music tab

**Loadout row** — pick the active loadout. Each loadout has two 12-pad banks —
one for looping beds, one for one-shots — both mapped in settings.

**Pads (12)** — laid out 4 × 3. Behaviour depends on the active mode:

| Mode | Tap a pad… |
|---|---|
| A bed channel (1–3) selected | loads the **bed bank** sound onto that channel as a looping bed. |
| The Quick channel (4) selected | the pads **flip** to the **one-shot bank**; a tap fires that sound **once** through channel 4. |
| Prepare scene | **stages** the bed-bank sound as the selected bed channel's incoming sound. |

Whether a normally-loaded pad starts immediately or just *arms* (waiting for the
channel's Resume) is the **Autoplay** setting.

**Mixer** — a left **icon rail** beside four channel strips. Click a strip to
select it as the pad target. Channels are named **Channel 1–3** and **Effect** by
default; rename them in settings.

- Channels **1–3** are looping beds. Each strip has a colour accent, a live
  post-fader **meter**, a vertical **fader**, a **mute** toggle, and **Stop**
  (pause, keeps position) + **Play** (resume) buttons.
- The **Effect** channel: **selecting it is fire mode** — the pads flip to the
  one-shot bank and a tap fires a one-shot. Its **Stop** halts every sounding
  one-shot.
- Icon rail (left, hover for labels): **Silence all** (mute everything,
  resumable), **Prepare scene** (enter staging mode), **Trigger switch** (execute
  the staged scene), and **Scene settings** — a popup for **Transition**
  (Smooth | Sudden) and **Unselected channels** (Keep | Stop).

A **?** button at the top-right of each tab opens a help popup listing every
control.

**Scenes & colour.** In prepare mode, pads currently playing are tinted with
their channel's colour; a pad you stage shows a lighter "incoming" shade of the
target channel's colour. **Trigger switch** crossfades each staged channel
(≈2 s for *smooth*, instant for *sudden*); channels you didn't stage are kept or
stopped per the setting.

---


## Known limitation — mobile background audio

On Android/iOS, Obsidian runs the plugin in a webview tied to the host app's
lifecycle. When Obsidian is backgrounded, the webview (and its `AudioContext`)
is likely throttled or suspended, so **audio may pause when you switch apps**.
On desktop this does not happen. This is a platform constraint and is not worked
around; the battlemap/Pi half is unaffected.

---

## Note — beds are decoded to memory

Both looping beds and one-shots are decoded to `AudioBuffer`s (cached by path)
and played through `AudioBufferSourceNode`s, rather than streamed from an
`<audio>` element. This is deliberate: a media element wrapped in a
`MediaElementAudioSourceNode` is silenced on desktop by Chromium's autoplay
policy and by CORS taint, whereas decoded buffers always play and feed the real
meters. The trade-off is **memory**: a very long bed holds its full decoded PCM
in RAM (a few-minute loop ≈ tens of MB). Buffers are cached and reused, so
re-triggering the same sound is instant. Prefer reasonably short, looping beds.

---

## Architecture

```
src/
  main.ts                 Plugin: singletons (AudioEngine, ProjectorClient,
                          VaultMedia), view/command/ribbon/settings registration
  model.ts                Data interfaces, channel themes, defaults, normalisation
  media/VaultMedia.ts     Vault file listing + raw audio bytes / resource paths
  audio/AudioEngine.ts    Web Audio graph, beds, one-shots, scene crossfades
  audio/Meter.ts          One rAF loop → per-channel meter levels
  projector/ProjectorClient.ts  WebSocket client (§6), reconnect, upload, throttle
  view/ConsoleView.ts     ItemView: tab bar + bodies
  view/MusicTab.ts        Loadout row, pads, mixer, left icon rail
  view/BattlemapTab.ts    Library + framing stage + status bar
  view/VerticalFader.ts   Custom coloured vertical fader
  view/modals.ts          Help + scene-settings popups
  view/help.ts            Per-tab help content
  settings/SettingsTab.ts Channel names, pad banks, loadouts, scene defaults, Pi
```
