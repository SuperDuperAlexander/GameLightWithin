# Light Within

A calm 3D browser game that teaches Dr. Rulin Xiu's teaching on how to manifest.

Chapter 1 is "Receive": one small grey valley, a breath rhythm, three springs,
one soft fog, one seed and a bridge. No enemies, no score, no timers.

- `CLAUDE.md` — the content, stack, performance and art rules for every chapter
- `REPORT.md` — what was built, test results, measured sizes and frame rates

## Run it

```
npm install
npm run dev          # http://localhost:5173
npm run check        # typecheck, lint, unit tests
npm run build        # production build into dist/
npm run e2e          # browser tests, writes screenshots/
```

Deploy `dist/` to any static host. There is no server and no network call.

## Debug

| Parameter                    | What it does                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------ |
| `?debug=1`                   | Debug panel with calm, light, scene, fps, tier, learning checks and an export button |
| `?scene=N`                   | Start at scene 1 to 6 with the right amount of light                                 |
| `?autobreathe=1`             | Breathe automatically with calm breaths, for the browser tests                       |
| `?nopaint=1`                 | Turn the painting filter off                                                         |
| `?quality=low\|medium\|high` | Pin a quality tier instead of measuring one, and turn the watchdog off               |

## Licences

Code in this repository is the project's own. The three fonts in `public/fonts`
are under the SIL Open Font License; their licence files sit next to them.
