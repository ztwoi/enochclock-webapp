// Remotion serves film/public. The fonts and the star catalogue the film draws are the app's own, so they are copied
// in from ../public rather than kept twice.
import { cpSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const film = resolve(import.meta.dirname, '..'), app = join(film, '../public');
cpSync(join(app, 'fonts'), join(film, 'public/fonts'), { recursive: true });
mkdirSync(join(film, 'public/sky'), { recursive: true });
for (const f of ['stars-le6.json', 'stars-6to8.json']) cpSync(join(app, 'sky', f), join(film, 'public/sky', f));
console.log('staged fonts and stars → film/public');
