# Recorded engine sounds

Put audio files in a folder named after the car id. The app then uses your recordings for that car instead of the synthesized engine note. A car with no folder keeps the synth. Supported formats are MP3, WAV and OGG.

| Car | Folder |
|---|---|
| Lamborghini Huracán EVO | `sounds/huracan-evo/` |
| Lamborghini Huracán STO | `sounds/huracan-sto/` |
| Lamborghini Aventador SVJ | `sounds/aventador-svj/` |
| Lamborghini Revuelto | `sounds/revuelto/` |
| Ferrari F8 Tributo | `sounds/f8-tributo/` |
| Ferrari 812 Superfast | `sounds/812-superfast/` |
| Ferrari SF90 Stradale | `sounds/sf90-stradale/` |
| Ferrari 296 GTB | `sounds/296-gtb/` |
| BMW M5 Competition | `sounds/m5-competition/` |

## Included recordings

All nine cars ship with loops extracted from the owner's recordings. The **Recorded up to** column is the highest loop rpm.

| Car | What the recording contains | Recorded up to | Synth above |
|---|---|---|---|
| Aventador SVJ | Cold start, idle, free revs, acceleration | ~5700 rpm | 7400 rpm |
| 296 GTB | Cold start, idle, big free rev | ~5600 rpm | 7300 rpm |
| 812 Superfast | Cold start flare, idle, short acceleration | ~2700 rpm | 3500 rpm |
| F8 Tributo | Cold start, idle, small blips (off-throttle) | ~2200 rpm | 2800 rpm |
| SF90 Stradale | Cold start, high cold idle (~1500 rpm), blips | ~2200 rpm | 2800 rpm |
| Huracán EVO | Cold start, idle (~1200 rpm), pull-away | ~2800 rpm | 3600 rpm |
| Huracán STO | Cold start, idle (~960 rpm), revs | ~2400 rpm | 3100 rpm |
| Revuelto | Cold start, high idle (~1100 rpm), short rev | ~1700 rpm | 2200 rpm |
| M5 Competition | Cold start, cold idle (~1390 rpm), warm idle (~790 rpm), blips | ~3300 rpm | 4200 rpm |

### How the loops were made

1. The engine's firing line was traced through the spectrogram. Each loop's rpm comes from that tracing, using the car's idle rpm as the reference point.
2. Short slices of the free revs were time-warped so their pitch is constant.
3. Each slice was rebuilt into a ~0.8 s seamless loop by stringing together randomly chosen whole engine cycles.

Above the highest recorded rpm, the sound crossfades to the synth (`synthAbove`) instead of pitch-shifting a loop too far.

### Adjusting

- If the pitch sounds off against the dashboard rev counter, change that loop's `rpm` in the car's `sounds.json`.
  - A higher number gives a lower pitch at the same rpm.
- `volume`, `startupVolume` and `synthAbove` can also be tuned.
- The `_src` field records where in the original recording each loop came from.

The app has to be served (`python -m http.server`). Opening `index.html` directly cannot load these files.

## What kind of recording works

The engine is built from **short loops recorded at a steady rpm**. Each loop is pitch-shifted to the live rpm and blended with the loops next to it. Racing games build their engine audio the same way.

**Works:**
- About 2–5 s of the engine held at one rpm, for example idle, a steady 3000 rpm or a steady 6000 rpm.
- An "on" loop (under load, throttle pressed) and an "off" loop (lifting off or coasting) at the same rpm sounds best.
- A startup clip: crank, catch and flare, ending at idle.

**Does not work well:**
- A full rev from idle to redline in one clip, or a drive-by video. The pitch is already changing inside the clip, so it cannot be looped.
  - Fix: cut a short steady piece out of it, for example the part where the car sits at 4000 rpm.

Tips:
- Cut each loop so the start and end join smoothly. In Audacity: select a steady part, then *Effect → Crossfade Clips*, or trim at zero crossings.
- If you cannot tell what rpm a clip was recorded at, guess, then adjust the `rpm` value until the pitch in the app sounds right.
- One loop is enough to start. More loops spread across the rev range sound more realistic.

## Option A: default file names (no config)

```
sounds/huracan-evo/
  startup.mp3     optional: plays once when you start the engine
  idle.mp3        steady idle
  low_on.mp3      ~35% of redline, on throttle
  low_off.mp3     ~35% of redline, off throttle
  mid_on.mp3      ~60% of redline, on throttle
  mid_off.mp3     ~60% of redline, off throttle
  high_on.mp3     ~85% of redline, on throttle
  high_off.mp3    ~85% of redline, off throttle
  engine.mp3      or a single all-purpose loop at ~50% of redline
```

You can leave any of these out. With option A every file must be an `.mp3`, because only these exact names are tried.

## Option B: `sounds.json` (exact control)

Use this when your files have other names, other formats or a known rpm:

```json
{
  "loops": [
    { "file": "idle.mp3",        "rpm": 1000, "load": "both" },
    { "file": "3k_on.mp3",       "rpm": 3000, "load": "on" },
    { "file": "3k_off.mp3",      "rpm": 3000, "load": "off" },
    { "file": "6k_on.wav",       "rpm": 6000, "load": "on", "volume": 0.9 },
    { "file": "8k_on.mp3",       "rpm": 8000, "load": "on" }
  ],
  "startup": "startup.mp3",
  "startupVolume": 1.0,
  "volume": 1.0,
  "synthFx": true
}
```

Each loop takes these fields:

| Field | Meaning |
|---|---|
| `rpm` | The rpm the clip was recorded at. Pitch is scaled from this value. |
| `load` | `"on"` (throttle), `"off"` (lift or coast) or `"both"`. |
| `volume` | Per-loop level. |
| `synthAbove` (top level) | Above this rpm, crossfade to the synth engine note. |
| `loadShaping` (top level) | Fakes the on/off-throttle difference with level and brightness changes. It is on automatically when only one kind of loop exists. |
| `loopStart` / `loopEnd` | Loop points in seconds. They are optional: by default the silence at each end is trimmed automatically. |

At the top level, `"synthFx": false` turns off the synth extras that are otherwise layered on top of your recordings: overrun pops, upshift cracks, turbo whistle and hybrid e-motor whine. Use it if your recordings already contain those sounds.

Only use recordings you made yourself or have permission to use. If this repository is public, check that you are allowed to redistribute the clips.
