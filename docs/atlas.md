# Atlas — where and when (plan, agreed 2026-10-28)

A fifth view, **Atlas**: a view of the shared instant from outside the Earth, and the place to choose where and when,
and to keep moments. Today you travel through a form (latitude, longitude, an IANA zone typed by hand, four presets)
and a date box (proleptic Gregorian, astronomical years, no time of day). Atlas replaces both.

Mock-up: [`mockups/atlas/`](../mockups/atlas/README.md), a working sketch at desktop and phone widths.

## Decisions made

- **A view, not an overlay.** Playback works as in the other views: Degree turns the Earth through the day, and Day
  holds the hour so the terminator tilts through the seasons. The site chip and the bar's date open Atlas. The
  Observer dialog retires, and exact coordinates move into Atlas.
- **The globe at the instant.** Today's coastlines (Natural Earth, public domain) and a graticule, with no political
  borders. It shows the terminator, the subsolar and sublunar points, the planets and stars behind, the tropics, and
  the polar zone the calculator refuses, drawn **for the era shown**. That limit is about 65.6° in 2026 at sea level and
  moves with the obliquity: Oulu (65.0° N) is refused around 7500 BCE. North is always up; pinch or wheel zooms.
- **Picking: a fixed crosshair with the globe turned under it.** Up/down moves latitude, left/right longitude.
  Two cameras:
  - **Over the site** (default): the camera turns with the Earth, so the site stays under the crosshair while the
    terminator and stars sweep past.
  - **From the stars:** the Earth turns under a fixed sky and the site's pin rides on it. A drag returns to Over the
    site.
- **Calculate on release.** While dragging, a readout updates instantly from simple geometry: latitude and longitude,
  nearest preset and distance, zone, portal span, longest and shortest day, and tropic/temperate/polar. The year is
  calculated when you let go.
- **When.** Gregorian for now, plus Enoch; Julian later as a layer. The year is a number with **BCE/CE**, not
  astronomical numbering. Month and day; ±1/±10/±100 year steps; jumps to Now, Sunrise, Noon, Sunset, Equinox,
  Solstice and Day 1. The bar's date box stays as the quick typed route. Deep Time is not the year picker.
- **Places:** 100 curated presets in [`src/atlas/places.json`](../src/atlas/places.json), draft 1. They cover latitude
  markers, Enoch and scripture sites, ancient alignments and observatories, and cities across zones and the southern
  hemisphere. Each has tags and a one-line note. All 100 calculate for 2026 (checked against the reference calculator).
- **Moments (bookmarks).** One kind of object: an optional place, an optional instant, a name, description, colour and
  tags. One tag filter covers saved moments, presets and later curated sets. A place-only moment keeps the time on show;
  a full one sets both. **☆ Save** sits in the bar on every view. Moments are stored on the device only; each one is a
  link (`?lat&lon&elev&tz&name&at`), and the list exports and imports as JSON. No accounts, nothing sent.
- **Accuracy.** Every moment and the globe carry the year's Accuracy flag: far from the present, ΔT makes the Earth's
  rotation angle uncertain (about ±34 min, or ±8°, at 3200 BCE).

## What this app already has that Atlas should reuse (review of Sky, the Dial, The Day)

- **The Day's day bar is the best time-of-day control in the app:** sunrise to sunrise, with the risings and settings
  marked, and you drag along it. Atlas's time of day is that bar, with the clock or Enoch part as the typed fallback
  ("Exact"). In the mock-up the bar is ported from `src/day/view.ts` and the events from `src/day/events.ts`; the build
  should share them rather than copy them. A reading above the bar gives the clock, the part, and the time to the next
  event ("2 h 33 min before midnight").
- **The Day's risings-and-settings list is the natural list of jumps.** Under the bar, the day's events are buttons:
  the Sun's four (Sunrise, Midday, Sunset, Midnight) and the Moon's rising and setting by default, with "+ N planet
  risings and settings" opening the rest. Tapping a mark on the bar does the same. The date jumps that remain are Now,
  Equinox, Solstice and Day 1.
- **Follow** (Sky and The Day follow the Sun, the Moon or a planet) is the same idea as Atlas's cameras. Use the same
  words and behaviour where they meet: a hand on the view pauses following, and a tap brings it back.
- **The tutorial** should get an Atlas step.

## Decided since

- **Tab order:** Sky · The Dial · The Day · **Atlas** · Deep Time. Sky, the Dial and The Day are three faces of one
  instant; Atlas and Deep Time are the two ways of travelling (where, and across the years).
- **Five tabs on a phone: the bar scrolls.** It already scrolls sideways (`src/style.css`, phone layout); what it lacks
  is a sign that more tabs exist. Add a fade at the edge that has more tabs and a small ‹ › arrow that scrolls the bar,
  and scroll the current tab into view. The mock-up does this (`mockups/atlas/atlas.js`, "the tab bar on a phone").
  A fade alone was not enough: when the current tab exactly fills the bar, nothing peeks past the edge.

## Measured

- **A year for a new place takes about 0.3 s** in the browser (304–324 ms over five sites, the redraw included). So the
  year is calculated when the hand lets go of the globe; calculating while dragging would stutter.
- **The coast adds 170 KB gzipped** to the offline pack (Natural Earth 1:50m, TopoJSON decoded in the browser); the zone
  lookup about 25 KB more.

## Items

| # | Item | Size | Status |
|---|---|---|---|
| A.1 | Mock-ups at desktop and phone widths (globe, crosshair readout, When, Moments, the save dialog); agree them | M | first draft |
| A.2 | Coastline data and a compact zone-from-coordinates lookup in the offline pack; sizes measured | S | measured: the coast is Natural Earth 1:50m as TopoJSON, 545 KB (170 KB gzipped), in the pack (`public/atlas/`); a zone lookup (`@photostructure/tz-lookup`, 73 KB, ODbL boundaries) comes with A.4 |
| A.3 | The globe view at the instant (Three.js): terminator, subsolar point, bodies, stars, tropics, the era's polar limit; both cameras; playback | L | done (`src/atlas/`, `tests/atlas.test.ts`) |
| A.4 | Crosshair picking with the live readout; calculate on release; the site chip opens Atlas; the Observer dialog retired | M | |
| A.4b | The tab bar for five tabs: Atlas in 04; on phones, the edge fade, ‹ › arrows and the current tab kept in view | S | done |
| A.5 | When: Gregorian/Enoch, BCE/CE, The Day's day bar for the time, steps, jumps from the risings list | M | in the mock-up |
| A.6 | Presets in Atlas with the tag filter; nearest preset to the crosshair | S | |
| A.7 | Moments: save from every view; edit name, description, colour, tags; filter, open, share link, export/import | M | |
| A.8 | Later: Julian dates; Julian Day (JD) entry; curated history sets with sources and certainty; live recalculation while dragging, if a year computes fast enough | — | later |
