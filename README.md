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

## Battlemap tab

> **Hidden in the current release.** The Battlemap tab is feature-complete in code
> but still being refined, so it's hidden from the view for now (set
> `BATTLEMAP_ENABLED = true` in `src/view/ConsoleView.ts` to bring it back). The
> rest of this section describes it for when it returns.

- **Left** — a searchable library of every image/video in the vault, each with a
  thumbnail, an `image`/`video` badge, and an `on air` marker on the one showing.
- **Right** — the framing stage. **Drag** to pan, **scroll / pinch** to zoom;
  use the zoom slider, **rotate left/right**, **Reset**, **Blank**, and **Push to
  screen**. Selecting a map loads it and (when connected) pushes it to the Pi.
  Framing changes stream **live** to the Pi (throttled). The status bar shows the
  connection state, the Pi address, what's on screen, and the current zoom.

Configure the Pi **host/IP** and **port** in settings, and use **Test
connection** to check reachability.

---

## Raspberry Pi display node

The plugin is the remote; a small agent on the Pi caches and renders what it's
sent. A reference agent lives in [`pi-agent/`](pi-agent/) and implements the
protocol in the plan's §6 (assets identified by content hash, so a map is never
re-uploaded once cached).

Quick start on a Pi (Raspberry Pi OS Lite, KMS enabled via
`dtoverlay=vc4-kms-v3d`):

```bash
sudo apt install mpv python3-pip
pip install -r pi-agent/requirements.txt

# 1) fullscreen mpv with an IPC socket (headless DRM)
mpv --idle=yes --force-window=yes --fullscreen --keep-open=yes \
    --image-display-duration=inf --vo=gpu --gpu-context=drm \
    --input-ipc-server=/tmp/mpv-dndjay.sock &

# 2) the agent
python3 pi-agent/agent.py --host 0.0.0.0 --port 8765
```

For boot-to-ready operation, install the two bundled systemd units
(`pi-agent/mpv-dndjay.service`, `pi-agent/dndjay-agent.service`) and
`avahi-daemon` so the Pi answers to `raspberrypi.local`.

The agent converts the plugin's intuitive wire units to mpv:
`video-zoom = log2(scale)`, `video-pan-x/y = x/y`, `video-rotate = rotate`.

---

## Known limitation — mobile background audio

On Android/iOS, Obsidian runs the plugin in a webview tied to the host app's
lifecycle. When Obsidian is backgrounded, the webview (and its `AudioContext`)
is likely throttled or suspended, so **audio may pause when you switch apps**.
On desktop this does not happen. This is a platform constraint and is not worked
around; the battlemap/Pi half is unaffected.

---

## Note — desktop decodes, mobile streams

The audio engine is platform-split (`AudioEngine` is a thin facade over two
backends):

- **Desktop** (`BufferBackend`) decodes every sound to an `AudioBuffer` (cached
  by path) and plays it through `AudioBufferSourceNode`s. This is deliberate: a
  media element wrapped in a `MediaElementAudioSourceNode` is silenced on desktop
  by Chromium's autoplay policy and by CORS taint, whereas decoded buffers always
  play and feed the real **VU meters**. The trade-off is memory — a decoded buffer
  is uncompressed PCM (~2× the file size), so a long bed costs tens to hundreds of
  MB. Desktop has the headroom; buffers are cached so re-triggering is instant.

- **Mobile** (`ElementBackend`) streams every sound from the vault resource path
  through a bare `<audio>` element, played directly (not through Web Audio).
  Decoding a multi-minute uncompressed bed would allocate hundreds of MB at once
  and **crash** the tablet WebView, so mobile never decodes — memory stays flat
  regardless of track length. Because streamed audio isn't in an analyser graph,
  **VU meters are inactive on mobile** (and hidden in the UI); faders, mute,
  stop/resume and scene crossfades all still work. One-shots stream too.

Note: decoded size scales with **duration**, not codec — re-encoding a long bed
to MP3 shrinks the file but not the decoded buffer, so on desktop very long beds
are still memory-heavy. Prefer reasonably short, looping beds where you can.

---

## Architecture

```
src/
  main.ts                 Plugin: singletons (AudioEngine, ProjectorClient,
                          VaultMedia), view/command/ribbon/settings registration
  model.ts                Data interfaces, channel themes, defaults, normalisation
  media/VaultMedia.ts     Vault file listing + raw audio bytes / resource paths
  audio/AudioEngine.ts    Facade: picks a backend per platform; delegates calls
  audio/types.ts          PlaybackBackend interface + scene types
  audio/BufferBackend.ts  Desktop: Web Audio graph, decoded beds/one-shots, meters
  audio/ElementBackend.ts Mobile: streamed <audio> playback (no decode, no meters)
  audio/Meter.ts          One rAF loop → per-channel meter levels (desktop)
  projector/ProjectorClient.ts  WebSocket client (§6), reconnect, upload, throttle
  view/ConsoleView.ts     ItemView: tab bar + bodies
  view/MusicTab.ts        Loadout row, pads, mixer, left icon rail
  view/BattlemapTab.ts    Library + framing stage + status bar
  view/VerticalFader.ts   Custom coloured vertical fader
  view/modals.ts          Help + scene-settings popups
  view/help.ts            Per-tab help content
  settings/SettingsTab.ts Channel names, pad banks, loadouts, scene defaults, Pi
pi-agent/                 Reference Python display agent + systemd units
```
