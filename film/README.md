# The film

The source of the film behind the app's **Watch** button and the **Primer** page, "The courses of the luminaries".
It is a [Remotion](https://www.remotion.dev) project that draws the film frame by frame with the app's own Dial and sky
modules (`../src`), so the picture and the app always agree.

The rendered videos are not kept in the repository. Without them the site works, but Watch and the Primer's clips have
nothing to play. Render them with the steps below.

## Render

You need Node 22.6 or later and [ffmpeg](https://ffmpeg.org) on your `PATH`. The full render takes a while.

```sh
npm ci                  # in the repository root: the film imports the app's source
cd film
npm ci
npm run render
```

`npm run render` renders the film, then writes everything the app serves from it:

| Output | Used by |
|---|---|
| `public/film/sun-1080.mp4`, `sun-720.mp4` | the Watch player (the 720p file on phones) |
| `public/film/story/<chapter>-1080.mp4`, `-720.mp4` | the Primer's clips, one per chapter |
| `public/film/sun-poster.jpg` | the Watch invitation and the player's poster |
| `public/film/sun-cues.json` | the verses shown over the film as live text |
| `public/primer/index.html` and `public/primer/story/*.jpg` | the Primer page and its chapter posters |

The cues, the posters and the Primer page are committed; the videos are ignored by git.

To preview or edit the film, run `npm run studio`.

## How it is laid out

| Path | Contents |
|---|---|
| `src/sun/` | the scenes: `Vision.tsx` is the film, `Revealed.tsx` and `machine.ts` its central model, `heaven.ts` the ascent, `timeline.ts` the timing, `cues.ts` the verses |
| `src/story/chapters.ts` | the Primer's chapters: which stretch of the film each shows, and its passages |
| `public/data/sun.json` | the year of sunrises the film draws, saved from the calculator |
| `scripts/` | `web.sh` runs the pipeline; `export-cues.ts`, `build-clips.ts`, `build-story.ts` and `encode.ts` are its steps |

The fonts and the star catalogue come from the app's `public/` folder; `npm run stage` (run by the other commands) copies
them into `film/public/`.

## Licence

The film's code is under the repository's licence (AGPL-3.0-or-later). Remotion is free for individuals and companies of up
to three people; larger organisations need a [company licence](https://www.remotion.dev/license). The star data is CC BY-SA
4.0 (see `../THIRD-PARTY-NOTICES.md`) and the fonts are under the SIL Open Font License.
