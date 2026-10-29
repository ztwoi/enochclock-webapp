# Atlas mock-up

A working sketch of the Atlas view ([`docs/atlas.md`](../../docs/atlas.md)), not the build. You can drag the globe,
zoom, switch cameras, play time, set the date, filter the 100 places, and open and save moments (kept in this browser's
localStorage).

```sh
# from the repository root (the page reads src/, public/fonts and node_modules/astronomy-engine)
python3 -m http.server 4380 --bind 127.0.0.1
open http://127.0.0.1:4380/mockups/atlas/
```

- **Real values:** the Sun, Moon, planets, sidereal time and precession come from astronomy-engine (already an app
  dependency). Coastlines are Natural Earth 1:50m land (public domain), from `world-atlas@2/land-50m.json` converted by
  `build_land.mjs` into `land.json`.
- **Approximate values:** the Enoch date (marked ≈) takes Day 1 as the local date of the March equinox, months 30·30·31,
  and no holds, so it can differ from the app's calculator by a day or two. The polar limit is 90° − obliquity − 0.9°,
  fitted to the calculator's refusals. A dragged site takes its time zone from the nearest preset.
