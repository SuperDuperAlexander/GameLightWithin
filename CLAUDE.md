# Light Within — project rules

A calm 3D browser game that teaches Dr. Rulin Xiu's teaching on how to manifest.
Chapter 1 is "Receive". These rules hold for every later chapter too.

## Content rules (must follow)

- No medical or healing claims anywhere. Breathing is never described as healing.
- Manifestation is always framed as personal reflection, never as a promise.
- Dr. Rulin Xiu is named in third person only, and only on the "Understand" card.
- Blockages look soft and melancholic, never scary or horror-like.
- No enemies, no points, no score, no "game over", no timers.
- No companion or helper character.
- The action teaches the idea. Text comes only after the player has experienced something.
- All player-facing text lives in `src/content/strings.en.ts`. A translation is a
  second file that satisfies `GameStrings` plus one entry in `LOCALES`.
- Player-facing text: short sentences, sentence case, no all caps, no filler.
- The working title lives in one constant, `GAME_TITLE` in `src/content/strings.en.ts`.

## Stack (fixed)

- TypeScript in strict mode. Vite. Three.js plain — no React, no React Three Fiber.
- `three-mesh-bvh` for collision and ground checks.
- `EffectComposer` from `three/addons` for post-processing.
- Custom GLSL for the painted look and the grey-to-colour system.
- Web Audio API for all sound. Sounds are generated in code; there are no audio files.
- UI overlays in plain HTML and CSS on top of the canvas.
- Saving: `localStorage` only.
- Tests: Vitest for logic, Playwright for browser runs and screenshots.
- ESLint and Prettier.
- Deploy target: static hosting. No server.

## Hard limits

- **No network requests of any kind.** No analytics. No external fonts or CDNs.
  The font is self-hosted in `public/fonts`. A Playwright test fails the build
  if any request leaves the origin.
- No model or texture files from outside. All art is made in code. The only
  outside asset is the self-hosted font.

## Performance budget

- Initial download 6 MB or less. Total 15 MB or less.
- Desktop mid-range laptop: 60 fps. Mid-range Android phone: 30 fps or more.
- Cap device pixel ratio at 1.5 on mobile.
- Three quality tiers: low, medium, high. The tier is picked from a short
  frame-time test at start and can be changed in settings.
- Low tier: painting filter at half resolution, fewer particles, fewer grass cards.
- A watchdog watches the real frame rate during play and steps the tier down
  when a device cannot keep up. It only ever steps **down**, so it cannot
  oscillate. It is off as soon as the player picks a tier by hand.
- Grass is built once at the highest count. A tier only changes how many cards
  are drawn and how close they fade, so a quality change takes effect at once.
  `skyStrokes` and `treeBlobs` are baked into the geometry at world build.

## Art rules

- Procedural geometry only: soft rolling hills, rounded rocks, stylised trees
  (trunk plus clustered soft blobs), a stone spring basin, a sign stone, a bridge.
- Grass and flowers are camera-facing cards with procedural brush-stroke alpha.
- Sky is a large dome with a painted gradient and soft cloud strokes from noise.
- Light is baked into vertex colours or the shader, plus one soft directional
  light. That light casts a real shadow map on the medium and high tiers: the
  map covers a box that follows the player and is snapped to whole texels, so
  it stays sharp and does not crawl. The low tier falls back to the blob shadow
  under the player. Grass never takes part in the shadow pass; 60,000
  alpha-tested cards would cost more than the rest of the valley together.
- Air is never empty. Pollen drifts in a box that repeats around the camera, so
  the player cannot walk out of the weather and nothing moves on the processor.
- The player's walk is made from the movement itself: the body rises and falls
  twice per stride, rolls, and leans into the direction of travel. The phase
  follows distance, not time, so the step matches the speed.
- Painting filter: Kuwahara-style, plus procedural paper grain and a soft vignette.
- Grey-to-colour: every world material shares one shader chunk. A uniform array
  holds restored zones (centre, radius, strength). Inside a zone the material
  shows full colour; outside it is desaturated, slightly blue-grey and held
  below the restored side in brightness. Zones grow over 2 to 4 seconds.
  Chapter end sets the global colour value to 1.
- Palette lives in `src/content/palette.ts`. Do not invent colours elsewhere.
- UI: quiet and minimal, one self-hosted humanist sans, frosted semi-transparent
  panels with a warm tint, no harsh borders, touch targets of at least 48 px.

## Code rules

- All tunable numbers live in `src/content/chapter1.ts`. No magic numbers in systems.
- Systems talk through the typed event bus in `src/core/events.ts`.
- Keep systems testable without Three.js wherever possible. The logic systems
  (`breath`, `calm`, `light`, `transform`, `manifest`, `checks`) import no Three.js.

## Accessibility

- Rhythm presets: normal, slow, easy.
- The player is never held still. They walk from the first second, but inside
  their own mist and with a short stride, and pushing on without stopping
  thickens it. One finished breath clears it for good. The penalty is something
  you can see, which is the only kind worth having in a game with no failure.
- On touch the two halves of the breath are one button per thumb: breathe in on
  the left, breathe out on the right. Both are pressed, neither is sat on.
- One breath uses two keys: hold space to breathe in, hold shift to breathe
  out. Letting go of a key is not an action; the out-breath is half the
  practice and needs its own press. On touch there are two buttons.
- Ask for repetition once, not three times. One calm breath wakes the valley,
  one reveals a hidden spring, one draws a spring dry, one moves each fog step
  except the last. Only the middle of the fog and the thanks ask for two.
- Reduced motion: no camera shake, no trembling circle, slower colour transitions.
- Every important cue is visual **and** audio.
- Colour is never the only cue. A restored area is also **brighter** than a grey
  one, so the grey-to-colour change reads without colour perception. A browser
  test measures this in greyscale.
- All UI works with the keyboard. Visible focus states.
- Text contrast meets WCAG AA (Web Content Accessibility Guidelines, level AA).

## Build stamp

The start screen shows the git commit the build came from. Three times running,
a change was reported as done and the game on the other screen was an older
build. If the stamp does not match what was just shipped, the build is old,
whatever anyone believes.

## Debug

- `?debug=1` debug panel, `?scene=N` jump to a scene, `?autobreathe=1` automatic
  calm breathing for Playwright, `?nopaint=1` turn the painting filter off.

## Commands

- `npm run dev` — dev server
- `npm run check` — typecheck, lint and unit tests
- `npm run build` — typecheck and production build
- `npm run e2e` — Playwright run, writes `screenshots/`
