#!/bin/sh
# Render the Sun film and write what the app serves from it: the video (no verses in the picture), the verse cues, the web
# encodes (the whole film and a clip per chapter), the poster, and the primer page. Needs Node 22.6+, ffmpeg and a root `npm ci`.
#   cd film && npm run render
set -e
cd "$(dirname "$0")/.."
node scripts/stage.mjs
npx remotion render src/index.ts SunFilm out/sun-film.mp4 --gl=angle --codec=h264 --crf=12 --concurrency=4 --log=error
node scripts/export-cues.ts
W=../public/film
# the whole film (the app's Watch player) and one clip per primer chapter, 1080 + 720, only those whose pictures changed
# (settings in scripts/encode.ts; force a full re-encode with: node scripts/build-clips.ts --force)
node scripts/build-clips.ts
# the poster: 47 s of the film as written (1x), wherever that falls at the film's speed
ffmpeg -y -loglevel error -ss $(node -e "import('./src/sun/timeline.ts').then(t=>console.log((47 / t.SPEED).toFixed(2)))") -i out/sun-film.mp4 -frames:v 1 -vf scale=1280:720 -q:v 4 $W/sun-poster.jpg
echo "wrote $W and ../public/primer"
