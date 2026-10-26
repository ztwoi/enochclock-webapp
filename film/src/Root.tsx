import { Composition } from 'remotion';
import { FPS, H, W } from './shared';
import { SunVision, VISION } from './sun/Vision';

export const Root = () => (
  <Composition id="SunFilm" component={SunVision} durationInFrames={VISION.end} fps={FPS} width={W} height={H} />
);
