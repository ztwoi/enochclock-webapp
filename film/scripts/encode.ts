// The web encode, in one place (used by build-clips.ts).
// H.264 High, yuv420p, faststart: plays everywhere, including every phone's hardware decoder. Quality-targeted (CRF) with a
// bitrate cap rather than a fixed bitrate: a fixed 2 Mbps starved the twinkling starfield and smeared the thin lines; CRF
// spends bits where the picture needs them, and the cap keeps a busy scene streamable. -tune animation favours flat colour
// and hairlines. (HEVC/AV1 save ~10-35% at equal quality but not every device decodes them; revisit if size matters.)
export const FPS = 30;
export const MASTER = new URL('../out/sun-film.mp4', import.meta.url).pathname;
export const OUT_DIR = new URL('../../public/film/story/', import.meta.url);

export interface Tier { name: string; width: number; height: number; crf: number; maxrate: number; settings: string }
const tier = (name: string, width: number, height: number, crf: number, maxrate: number): Tier =>
  ({ name, width, height, crf, maxrate, settings: `h264 slow animation ${width}x${height} crf${crf} max${maxrate}k` });

export const TIERS: Tier[] = [
  tier('1080', 1920, 1080, 20, 6000),   // tablets and desktops (a retina laptop shows the page at ~900 css px = ~1800 device px)
  tier('720', 1280, 720, 21, 3000),     // phones (a ~400 css px column at 3x is ~1200 device px)
];

export const encodeArgs = (t: Tier) => [
  '-an', '-vf', `scale=${t.width}:${t.height}:flags=lanczos`,
  '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow', '-tune', 'animation',
  '-crf', String(t.crf), '-maxrate', `${t.maxrate}k`, '-bufsize', `${t.maxrate * 2}k`,
  '-pix_fmt', 'yuv420p', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
  '-movflags', '+faststart',
];
