# Third-party notices

Enoch Clock is free software under the **GNU Affero General Public License, version 3 or (at your option) any later
version** (see [`LICENSE`](LICENSE)). The app serves this file at `/legal/THIRD-PARTY-NOTICES.txt`.

## Swiss Ephemeris — AGPL-3.0

© Astrodienst AG, Zürich, Switzerland. <https://www.astro.com/swisseph/>

The ephemeris files are downloaded at build time from <https://github.com/aloistr/swisseph>.

`sweph-wasm` — Prashant Tripathi, AGPL-3.0-or-later. <https://github.com/ptprashanttripathi/sweph-wasm>

## Code — MIT

| Package | Version | Licence |
|---|---|---|
| three (Three.js) | 0.180.0 | MIT — `/legal/THREE-LICENSE.txt` |
| astronomy-engine | 2.1.19 | MIT — `/legal/ASTRONOMY-ENGINE-LICENSE.txt` |

## Data

| Data | Source | Licence |
|---|---|---|
| Star catalogue | HYG Database 4.1, David Nash / Astronomy Nexus | **CC BY-SA 4.0** — `/sky/HYG-LICENSE.txt` |
| Constellation figures | Stellarium `modern` sky culture | **CC BY-SA 4.0** — `/sky/STELLARIUM-LICENSE.md` |
| Magnetic declination | NOAA NCEI World Magnetic Model WMM2025 | Public domain |
| Coastlines (Atlas) | Natural Earth 1:50m land, as TopoJSON by `world-atlas` 2 (Mike Bostock) | Public domain (Natural Earth); `world-atlas` ISC |
| Text of 1 Enoch 72–82 | R. H. Charles, *The Book of Enoch* (1912) | Public domain |

The files in `public/sky/` are modified exports of the originals: the HYG rows (without the Sun) reduced to the columns the
app uses and split into files by magnitude, and Stellarium's figures with their endpoints mapped to HYG star identifiers.

## Fonts — SIL Open Font License 1.1 (full text in `public/fonts/OFL-*.txt`)

| Font | Copyright |
|---|---|
| Cormorant Garamond | © 2015 the Cormorant Project Authors |
| IBM Plex Mono, IBM Plex Sans Condensed | © 2017 IBM Corp., Reserved Font Name "Plex" |
| Noto Serif Ethiopic | © 2022 the Noto Project Authors |
