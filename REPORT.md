# Light Within — chapter 1 "Receive"

Completion report. Everything in this report was measured on this machine.

---

## 1. What was built, per milestone

### M0 Setup

Vite, TypeScript in strict mode, Three.js, `three-mesh-bvh`, ESLint, Prettier,
Vitest and Playwright. `CLAUDE.md` in the project root holds the content rules,
the stack, the performance budget and the art rules, so later chapters follow
the same rules. Debug URL parameters work: `?debug=1`, `?scene=N`,
`?autobreathe=1`, plus two I added (see section 5).

All player-facing text lives in `src/content/strings.en.ts` behind a
`GameStrings` interface and a `LOCALES` map. A German file is one new file plus
one line in that map. All tunable numbers live in `src/content/chapter1.ts`.
The six logic systems (breath, calm, light, transform, manifest, checks) import
no Three.js at all, so they run in plain Vitest.

### M1 World

One valley, all made in code. A heightfield with a wandering path, a wide field
at scene 3, a narrow pinch at scene 4 and a side path at scene 5. Soft borders:
the hills rise and the mist thickens, and the player is turned back gently.
There are no invisible walls.

The gap at scene 5 is a real hole in the terrain mesh. The ground raycast finds
nothing there, so the player cannot cross until the bridge exists. The bridge
deck becomes a collider once it has risen.

`three-mesh-bvh` drives the ground height, the slope limit and prop collision.
Walking into a rock slides along it instead of stopping dead.

Props, all procedural: rounded rocks, stylised trees (a trunk plus clustered
soft blobs), stone spring basins, the carved sign stone, the arched bridge.
Grass and flowers are camera-facing cards with a brush-stroke alpha made in the
shader; they lean, sway, and bend away from the fog. The player is a soft,
faceless figure with a cloak, a calm glow, a blob shadow and orbiting light
motes. The camera follows gently and never jumps.

### M2 Look

A Kuwahara-style painting filter (a 5 by 5 window, four sectors, lowest
variance wins), then a pass with procedural paper grain and a soft vignette.
The same pass also does the screen darkening used inside the fog.

The grey-to-colour system is one shader chunk shared by every world material,
injected with `onBeforeCompile`. A `vec4` uniform array holds up to eight
restored zones as centre, radius and strength. Inside a zone the material shows
full colour; outside it is desaturated and pulled toward blue-grey. Zones grow
over 2 to 4 seconds. A global value lifts the whole valley at the end.

Three quality tiers, picked automatically from a short frame-time probe at
start and changeable in settings.

### M3 Breath

The breath circle sits in the lower centre: a dashed ring showing the target
rhythm and a filled disc following what the player is actually holding. One
breath is one hold plus one release. A breath is calm when both durations are
inside the preset tolerance. Breathing counts only while standing still;
walking resets the breath in progress and nothing bad happens.

Three rhythm presets. The hidden calm value rises with calm breaths and falls
slowly otherwise, and is never shown. The player's glow follows it, and a soft
bell sounds on every calm breath, so the cue is visual **and** audio.
`circleStrength` is kept as a parameter, 1.0 in chapter 1.

All sound is generated with the Web Audio API: an evolving pad that warms as
colour returns, filtered noise that rises on the in-breath and falls on the
out-breath, a calm bell, a water shimmer and a chime per mote, a low fog drone
with a muffle filter over the whole mix, a dull thud for the push, rising tones
for the seed and a warm chord for the finished bridge. Audio starts only after
the first user interaction.

### M4 Receive

Springs give one light per calm breath inside 3 m, up to their own limit. Light
rises from the spring and flows into the player as motes. Hidden springs stay
invisible until two calm breaths have been taken within 6 m. An empty spring
keeps a gentle glow and leaves a colour zone. Walking stops the flow and
nothing else. Scenes 1 to 3 and the bird hint work.

### M5 Transform

One soft fog on the narrow path, in three steps that cannot be skipped.
**See it:** inside 8 m the thought appears inside the fog in a handwritten
style over four seconds. **Feel it:** inside 5 m a soft wind bends the grass,
the breath circle trembles, a low drone plays, and two calm breaths are needed.
**Become one:** in the middle the screen darkens softly and the sound is
muffled; after three calm breaths the fog dissolves into motes that flow into
the player, the path opens and a colour zone appears.

Running away grows the fog by 10 percent, up to 30 percent, drifts it one metre
toward the player and resets the current step. Push is offered near the fog, it
plays a thud, makes the fog denser and adds a calm breath to the last step, up
to two. Push never works.

### M6 Manifest

A seed spot at the edge of the gap. The choice panel offers Bridge; Tree, House
and Well are shown and disabled for later chapters. Planting costs 5 light. The
seed grows only while the player is more than 15 m away and needs 25 seconds of
away time; coming back pauses growth, dims the sprout and adds 3 seconds, up to 9. The bridge then rises over 3 seconds. The heart-or-mind decision sits in the
code at a calm value of 0.6; chapter 1 always creates a heart seed. The side
path to the third spring gives more than enough away time. The butterfly hint
works.

### M7 Thanks and ending

Three calm breaths on the finished bridge turn it golden and animate the global
colour to 1 over six seconds. Then the learning cycle: Reflect with three
answers that all get the same reply, the Understand card, the Apply card, the
two closing questions, and the chapter end screen with Chapter 2 shown as
coming soon. Progress is saved per scene in `localStorage`, and the start
screen offers to continue.

### M8 Polish

Sound pass, mobile control pass (joystick, large breath button, small push
button, pause in the corner), accessibility pass, and a performance pass that
cut the painting filter from a 7 by 7 window to a 5 by 5 one with a wider step
and made distant grass collapse to nothing. Together those gave about 60 percent
more frames.

---

## 2. Screenshots

All in `screenshots/`, one set per scene, desktop 1280 x 720 and mobile
390 x 844. The mobile pictures show the touch controls.

| Scene               | Desktop                            | Mobile                            |
| ------------------- | ---------------------------------- | --------------------------------- |
| Start screen        | `start-screen-desktop.png`         | `start-screen-mobile.png`         |
| Settings            | `settings-desktop.png`             | `settings-mobile.png`             |
| Start questions     | `start-questions-desktop.png`      | `start-questions-mobile.png`      |
| 1 Wake up           | `scene1-wake-desktop.png`          | `scene1-wake-mobile.png`          |
| 2 The dry spring    | `scene2-dry-spring-desktop.png`    | `scene2-dry-spring-mobile.png`    |
| 3 The hidden spring | `scene3-hidden-spring-desktop.png` | `scene3-hidden-spring-mobile.png` |
| 4 The first fog     | `scene4-fog-desktop.png`           | `scene4-fog-mobile.png`           |
| 5 The seed spot     | `scene5-seed-spot-desktop.png`     | `scene5-seed-spot-mobile.png`     |
| 5 The planted seed  | `scene5-seed-planted-desktop.png`  | `scene5-seed-planted-mobile.png`  |
| 5 The seed choice   | `seed-choice-desktop.png`          | `seed-choice-mobile.png`          |
| 6 The bridge        | `scene6-bridge-desktop.png`        | `scene6-bridge-mobile.png`        |
| 6 Full colour       | `scene6-full-colour-desktop.png`   | `scene6-full-colour-mobile.png`   |
| Pause               | `pause-desktop.png`                | `pause-mobile.png`                |
| Reflect             | `after1-reflect-desktop.png`       | `after1-reflect-mobile.png`       |
| Reflect reply       | `after1-reflect-reply-desktop.png` | `after1-reflect-reply-mobile.png` |
| Understand          | `after2-understand-desktop.png`    | `after2-understand-mobile.png`    |
| Apply               | `after3-apply-desktop.png`         | `after3-apply-mobile.png`         |
| End questions       | `after4-end-questions-desktop.png` | `after4-end-questions-mobile.png` |
| Chapter end         | `after5-chapter-end-desktop.png`   | `after5-chapter-end-mobile.png`   |

The full play-through writes its own set as well, so there is a picture of every
scene taken during a real, uninterrupted play: `scene0-start`, `scene0-questions`,
`scene1-wake`, `scene2-spring`, `scene3-hidden-spring`, `scene4-fog`,
`scene4-fog-center`, `scene5-seed-spot`, `scene5-seed-choice`,
`scene5-side-path`, `scene6-bridge`, `scene6-full-colour`, and the five
`after` panels, each with a `-desktop` and a `-mobile` suffix. Those are the
low-tier pictures described in section 5.

50 files in total.

---

## 3. Test results

### Unit tests, Vitest

**62 passed, 0 failed**, in 6 files.

| File                | Tests | What it covers                                                                                                                                                                                 |
| ------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `breath.test.ts`    | 10    | Tolerance in and out, both edges of the band, walking resets the breath, no breath starts while walking, a tap that is too short is ignored, each preset uses its own values                   |
| `calm.test.ts`      | 9     | Rises with calm breaths, falls with non-calm ones, falls slowly while walking, stays inside 0 and 1, the 0.6 threshold is reachable                                                            |
| `light.test.ts`     | 8     | Never above 12, never below 0, a seed cannot be planted with 4 light, can be with 5, chapter 1 gives 11 light in total                                                                         |
| `transform.test.ts` | 13    | Step order cannot be skipped, the text cannot be skipped, running away grows the fog and caps at +30 percent, push caps at +2 breaths and never works, breaths outside the middle do not count |
| `manifest.test.ts`  | 12    | No growth within 15 m, completes after 25 s away, the return penalty caps at +9 s, the bridge rise, the 0.6 heart threshold, chapter 1 always plants a heart seed                              |
| `save.test.ts`      | 10    | Restores the right scene and light, survives a broken entry, clamps out-of-range values, settings round-trip, learning checks and their JSON export                                            |

### Browser tests, Playwright

**42 passed, 0 failed**, run on desktop 1280 x 720 and on a Pixel 7 profile at
390 x 844.

| Spec                    | Per project | What it covers                                                                                                                                                                                                                                       |
| ----------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chapter1.spec.ts`      | 1           | A full run with `?autobreathe=1`, from the start screen to the chapter end screen, through all six scenes and the whole learning cycle. It also checks that push does not dissolve the fog, that Tree is disabled, and that no page error was logged |
| `screenshots.spec.ts`   | 9           | One picture per scene plus every panel                                                                                                                                                                                                               |
| `network.spec.ts`       | 3           | No request leaves the origin, the font is served from `/fonts/`, and a report of what is downloaded                                                                                                                                                  |
| `accessibility.spec.ts` | 3           | The first control is focused when a panel opens, Tab reaches the next control, the focus outline is visible, Enter activates, settings are stored, and every panel button is at least 48 px tall                                                     |
| `perf.spec.ts`          | 5           | Real frames per second per tier                                                                                                                                                                                                                      |

The full run takes about 4 minutes 40 seconds of play with the easy rhythm and
automatic breathing. A person at the normal rhythm, reading and walking at their
own pace, lands inside the 10 to 15 minute target.

---

## 4. Bundle size and frame rate

### Download, measured in the browser

|                                     | Bytes                   |
| ----------------------------------- | ----------------------- |
| `index.html`                        | 575                     |
| JavaScript                          | 709,461                 |
| CSS                                 | 7,096                   |
| Work Sans regular                   | 188,916                 |
| Work Sans bold                      | 191,304                 |
| **Initial download, uncompressed**  | **1,097,352 (1.05 MB)** |
| Handwriting font, loaded at the fog | 32,020                  |
| **Total, uncompressed**             | **1,129,372 (1.08 MB)** |

Gzipped, as a static host would serve it: JavaScript 185 KB, CSS 2.2 KB,
HTML 0.3 KB, the two TrueType fonts about 100 KB each, so roughly **390 KB
initial**.

**Budget: 6 MB initial, 15 MB total. Both are met with a lot of room.**
There are no model or texture files; all art is made in code. The only outside
assets are the three self-hosted fonts, all under the SIL Open Font License,
with their licences shipped next to them.

### Frame rate, measured

**This machine has no GPU.** Chromium falls back to SwiftShader, which runs the
fragment shaders on the CPU. These numbers are a floor, not what a real device
gives, and I could not verify the 60 fps and 30 fps targets here.

Real frames per second over a ten-second window, standing in scene 1:

| Tier                      | Desktop 1280 x 720 | Mobile 390 x 844 at DPR 2 |
| ------------------------- | ------------------ | ------------------------- |
| high                      | 1.2                | 1.2                       |
| medium                    | 1.5                | 2.0                       |
| low                       | 3.3                | 4.3                       |
| low, painting filter off  | 5.5                | 6.3                       |
| high, painting filter off | 1.6                | 2.9                       |

Repeated runs vary by roughly 30 percent, because the machine is shared and the
whole picture is drawn on the CPU. The order of the tiers is stable.

What the numbers show: the painting filter roughly doubles the frame time, and
the grass cards cost about as much again. On a real GPU both are cheap work,
but I am not going to claim a number I did not measure.

The automatic probe does the right thing here: it measures about 1 fps and
picks the low tier.

Device pixel ratio is capped at 1.5 on touch devices and 2 elsewhere.

---

## 5. Where I changed the brief, and why

1. **Two extra debug parameters.** `?nopaint=1` turns the painting filter off
   and `?quality=low|medium|high` pins a tier instead of measuring it. I needed
   both to find out what was slow and to take sharp screenshots on a machine
   that measures 1 fps and therefore always picks the low tier. They are
   documented in `CLAUDE.md`.

2. **The scene screenshots use `?scene=N`, not the full run.** The brief asks
   for a picture per scene and a full run. Both exist, but they are separate
   tests. The full run at one frame per second produces soft pictures because
   the low tier renders at half resolution; the per-scene pictures use the
   documented scene jump at the high tier so each scene is sharp. The full run
   still takes its own pictures.

3. **A fixed simulation step.** The brief does not mention one. I added it after
   finding that the world ran on the raw frame delta: at one frame per second
   the breath rhythm and the 25 second seed timer ran about sixteen times too
   slow. The loop now steps a fixed 1/60 second and catches up to one second of
   real time per frame, so the rhythm is the same on a fast and a slow machine.

4. **The low tier drops the whole post-processing resolution, not only the
   filter.** The brief asks for the painting filter at half resolution. Running
   the filter alone at half resolution would still cost a full-resolution scene
   render, which is where most of the time goes. The low tier renders the scene
   and the filter at half resolution and upscales; the medium tier uses 0.85.
   The brush step widens with the tier as well, so the painted patches stay the
   same size on screen.

5. **The push and plant buttons are shown on desktop too.** The brief puts the
   push button on the mobile layout. On desktop E and Enter do the same thing,
   but a key with nothing on screen is invisible, so the buttons are shown with
   the key printed on them.

6. **A short control label under the breath circle.** "Hold to breathe in" and
   "Release to breathe out" follow the target rhythm. The brief wants no text
   before the player has experienced something; this is a control label, not an
   explanation, and it is the only way to teach the hold-and-release with no
   companion character.

7. **Scene 1 ends after three calm breaths, wherever the player stands.**
   The brief says the glow appears and the player can walk after three calm
   breaths, but does not say what ends the scene. I made the same three breaths
   end scene 1 and start scene 2.

8. **The gap is a hole in the mesh.** The brief does not say how to stop the
   player crossing. Leaving the triangles out means the ground raycast finds
   nothing, so no invisible wall is needed anywhere.

---

## 6. Known problems, worst first

1. **The frame rate targets are unverified.** 60 fps on a mid-range laptop and
   30 fps on a mid-range Android phone could not be measured, because this
   machine renders on the CPU. Section 4 gives the software numbers. This needs
   one run on real hardware before the budget can be called met.

2. **The mobile frame rate is the real risk.** A phone has a real GPU, but the
   grass cards are alpha-tested and overlap heavily, which is the pattern
   phones handle worst. If the low tier misses 30 fps on a real phone, the
   first things to cut are `TIERS.low.grassCards` and the grass fade distance
   in `src/world/grass.ts`.

3. **There is no colour-blind check.** Contrast was checked, but the grey to
   colour change is the main feedback in the game and it is a colour change. It
   is always paired with a sound and with the glow getting brighter, so it is
   not the only cue, but I did not test it with a colour-blindness simulation.

4. **The colour zone array holds eight zones.** Chapter 1 creates four, so it
   never overflows. A later chapter with more springs will start dropping the
   oldest zone. The limit is `COLOR.maxZones`; raising it costs shader time in
   a loop that runs per pixel.

5. **The valley is one mesh with no chunking.** It is about 27,000 triangles,
   which is fine for this chapter, but a larger world will need splitting before
   the bounds tree and the draw call become a problem.

6. **The bridge turns golden by nudging its material colours each frame.**
   It works and it looks right, but it changes shared materials in place rather
   than driving a uniform. If a later chapter has two bridges they would share
   the change.

7. **The learning checks are written on every change.** That is a `localStorage`
   write per event. It is cheap at this scale and it means a player who quits
   mid-scene keeps their data, but a busier chapter should batch it.

8. **Audio does not resume by itself after a long pause on iOS.** It restarts on
   the next panel tap. I could not test this on a real iOS device.

---

## 7. Open questions

1. **The title.** "Light Within" is the working title from the brief and it sits
   in one constant, `GAME_TITLE`. Do you want to keep it, or shall I prepare a
   shortlist?

2. **The closing questions.** They are the same two questions as at the start,
   at the end of chapter 1, as the brief says "for now". Do you want them moved
   to the end of the last chapter later, and the chapter 1 answers kept only as
   a mid-point reading?

3. **German.** The structure is ready: one new file that satisfies
   `GameStrings`, plus one line in `LOCALES`. Do you want me to write the German
   file now, and if so, formal "Sie" or informal "du"?

4. **The reflect answers.** All three get "Thank you for noticing." Should the
   answer still be recorded in the learning checks? Right now it is not stored
   at all, which is the most private reading of the brief, but it is also the
   one thing about the player's inner state that never gets written down.

5. **Chapter 2 and the mind seed.** The mind seed rules are in the code and
   tested at the threshold, but nothing in chapter 1 can create one. Do you want
   a debug way to try a mind seed now, so you can feel whether the
   two-times-faster-then-fades behaviour reads the way you meant it?

---

## How to run it

```
npm install
npm run dev          # http://localhost:5173
npm run check        # typecheck, lint, 62 unit tests
npm run build        # typecheck and production build into dist/
npm run e2e          # Playwright, writes screenshots/
```

Deploy `dist/` to any static host. There is no server and no network call.
