# Supercar Dash Sim

A browser dashboard and engine simulator for Lamborghini and Ferrari supercars. Pick a car, start the engine, then drive it with a keyboard, a DualSense, a DualShock 4 or a steering wheel such as the PXN V9 Gen 2.

## Run it

The app is a static site with no build step. It needs to be served over `http://localhost`, not opened as a file: recorded engine sounds and some controllers don't work from `file://`. Use Chrome or Edge.

### Windows: double-click `START.bat` (easiest)

1. Double-click `START.bat`. It starts a small local server using PowerShell, which ships with Windows, so nothing needs installing.
2. The browser opens at `http://localhost:8000` (or 8001 and up if 8000 is busy).
3. Keep the black window open while you play. Close it to stop the server.

If Windows SmartScreen warns about the file, click **More info → Run anyway**.

### XAMPP

1. Copy the whole `car-simulation` folder into `C:\xampp\htdocs\`.
2. Open the XAMPP Control Panel and click **Start** next to **Apache**.
3. Open `http://localhost/car-simulation/`.

### macOS / Linux

Double-click `start.command` (macOS), or run `./start.command`. It uses the Python that ships with macOS.

## Cars

| Car | Engine | Gearbox | 0-100 | 0-200 | Vmax | 100-0 |
|---|---|---|---|---|---|---|
| Lamborghini Huracán EVO | 5.2 V10 NA, 640 CV | 7-spd LDF DCT | 2.9 s | 9.0 s | 325 | 31.9 m |
| Lamborghini Huracán STO | 5.2 V10 NA, 640 CV, RWD | 7-spd LDF DCT | 3.0 s | 9.0 s | 310 | 30 m |
| Lamborghini Aventador SVJ | 6.5 V12 NA, 770 CV | 7-spd ISR | 2.8 s | 8.6 s | 350 | 30 m |
| Lamborghini Revuelto | 6.5 V12 + 3 e-motors, 1015 CV | 8-spd DCT | 2.5 s | 7.0 s | 350 | 30 m |
| Ferrari F8 Tributo | 3.9 V8 TT, 720 CV | 7-spd F1 DCT | 2.9 s | 7.8 s | 340 | 29.5 m |
| Ferrari 812 Superfast | 6.5 V12 NA, 800 CV | 7-spd F1 DCT | 2.9 s | 7.9 s | 340 | 32 m |
| Ferrari SF90 Stradale | 4.0 V8 TT + 3 e-motors, 1000 CV | 8-spd F1 DCT | 2.5 s | 6.7 s | 340 | 29.5 m |
| Ferrari 296 GTB | 3.0 V6 TT + e-motor, 830 CV | 8-spd F1 DCT | 2.9 s | 7.3 s | 330 | 30 m |
| BMW M5 Competition | 4.4 V8 TT, 625 PS, AWD | 8-spd M Steptronic | 3.3 s | 10.8 s | 305 (limited) | 33.5 m |

To add a car, add an entry to `js/cars.js`. The sim calibrates itself to the figures in that entry.

## How the numbers stay accurate

The physics are in `js/physics.js`. The model is:

1. The engine torque curve, rescaled so peak power matches the official figure.
2. Turbo spool for the TT cars, and extra e-motor force for the hybrids.
3. A dual-clutch gearbox with launch slip, a torque cut on upshifts and rev-matched downshifts.
4. A traction limit.
5. Aero drag, rolling resistance and the brakes.

When you pick a car, `calibrate()` solves for traction, drivetrain efficiency, CdA and brake deceleration. After that the simulated car matches the official 0-100, 0-200, top speed and 100-0 braking figures. The drive screen shows the official value next to the simulated (`sim`) value.

The live 0-100 and 0-200 timers on the dashboard measure your own runs. Launch control uses the same steps as the real cars: hold the brake, floor the throttle, then release the brake.

## Engine sound

The sound is in `js/audio.js` and is synthesized in real time. No recordings are used. Each cylinder firing is generated at the correct crank angle, so pitch and harmonics follow the real engine layout:

- A V10 at 8000 rpm fires at 667 Hz.
- A V12 at 8500 rpm fires at 850 Hz.

Each firing pulse excites exhaust resonators tuned per car. On top of that the synth adds:

- intake roar
- overrun crackle and limiter bangs
- upshift cracks and downshift blips
- turbo whistle and blow-off
- starter motor whine
- hybrid e-motor whine

### Using your own recordings

You can replace the synth with recorded audio. Put MP3, WAV or OGG loops in `sounds/<car-id>/`, and the app pitch-shifts and crossfades them by rpm and throttle. See [`sounds/README.md`](sounds/README.md) for the file names and how to prepare the recordings. The **SOUND** tile on the drive screen shows whether a car is using the synth or your recordings.

## Controls

| Action | Keyboard | DualSense / DS4 |
|---|---|---|
| Engine start / stop | `I` or `Enter` | Options |
| Throttle | `W` or `↑` | R2 (analog) |
| Brake | `S` or `↓` | L2 (analog) |
| Shift up / down | `E` / `Q` | R1 / L1 |
| Auto / Manual | `M` | △ |
| Drive mode (ANIMA / Manettino) | `N` | □ |
| Reset trip | `T` | Create / Share |

Pulling a shift paddle while in Auto switches to Manual, as in the real cars. In Manual the gearbox protects against over-rev and drops gears for you as you roll to a stop.

### PXN V9 Gen 2 and other wheels

1. Put the wheel in PC mode and connect it by USB.
2. Press any button. Browsers hide a controller until it has sent an input.
3. Open **🎮 Controls** and select the wheel from the device list.
4. Click **Bind** next to Throttle, then press the gas pedal all the way down and hold it for about 1.5 s. Do the same for Brake.
5. Bind the shift paddles and any buttons you want to use.

Pedals that report as one combined axis also work: bind throttle and brake to the same axis, one in each direction. The **Live raw input** panel shows every axis and button, which helps when you are unsure which input is which. Bindings are saved per device in the browser.

## Files

```
index.html          UI shell
css/style.css       styles
js/cars.js          car database (specs, torque curves, gear ratios, sound + dash config)
js/physics.js       vehicle model + auto-calibration
js/audio.js         AudioWorklet engine synth
js/input.js         keyboard + Gamepad API + remapping
js/dashboards.js    canvas instrument clusters (Lambo / Ferrari classic / Ferrari digital)
js/dash-pro.js      car-specific clusters: Ferrari HMI (296 GTB / SF90), Ferrari analogue (F8 / 812), Huracán STO
js/dash-lambo.js    car-specific clusters: Aventador SVJ, Huracán EVO (Strada/Sport + Corsa views), Revuelto
js/dash-bmw.js      BMW M5 Competition Live Cockpit (M view, variable redline)
js/main.js          app wiring, game loop, controls UI
```

## Accuracy notes

- **Performance figures** match the manufacturers' published 0-100, 0-200, top speed and braking numbers, because the sim is calibrated to them.
- **Gear ratios:** the spacing follows the real gearboxes. The final drives are derived values.
- **Dashboards** are recreations inspired by the real clusters. They are not copies of the manufacturers' software.
- **Engine sound** is modelled from each engine's real architecture: cylinder count, firing frequency, redline, induction and hybrid system. It is still a synthesis, not a recording, so it will not sound exactly like the real car.
