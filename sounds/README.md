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
| `loopStart` / `loopEnd` | Loop points in seconds. They are optional: by default the silence at each end is trimmed automatically. |

At the top level, `"synthFx": false` turns off the synth extras that are otherwise layered on top of your recordings: overrun pops, upshift cracks, turbo whistle and hybrid e-motor whine. Use it if your recordings already contain those sounds.

Only use recordings you made yourself or have permission to use.
