// The Sun film's timeline, in frames at 30 per second: one place, shared by the scenes and by the verse cues (cues.ts),
// so the cues the app lays over the film can never drift from the film itself. No imports: plain numbers.

/** The film runs this many times faster than it is written: every frame number in this file, in cues.ts and in
 *  story/chapters.ts is a "story frame" (the authoring clock, 30 per second at 1x); the render plays SPEED story frames per
 *  output frame. Retime a scene in story frames and it follows; change SPEED and the whole film, its cues, its chapter
 *  clips and its posters follow. Everything in the scenes is a function of the frame (nothing counts whole frames), so SPEED need
 *  not be a whole number: at 1.5 every other output frame falls half way between two story frames. */
export const SPEED = 1.5;
/** A story frame as an output frame (what the encoded video's frame numbers and seconds are made of). */
export const outFrame = (f: number) => Math.round(f / SPEED);

/** The machine scene (local frames): the reveal and the one day. */
export const MT = { end: 720, reveal: [0, 70] as const, orbit: [190, 600] as const };
/** Where the machine begins (after the ascent, the house and the descent), and where the Dial scenes begin. */
export const OFF = 660, D0 = OFF + MT.end;
/** The Dial scenes (frames from D0), each a length: retime a scene by changing its length and every later scene, cue and
 *  chapter moves with it. */
const LEN = { parts: 630, light: 660, grid: 360, months: 480, seasons: 960, priests: 1040, year: 300 };
const span = (from: number, len: number) => [from, from + len] as const;
const _parts = span(0, LEN.parts), _light = span(_parts[1], LEN.light), _grid = span(_light[1], LEN.grid), _months = span(_grid[1], LEN.months);
const _seasons = span(_months[1], LEN.seasons), _priests = span(_seasons[1], LEN.priests), _year = span(_priests[1], LEN.year);
export const DS = { parts: _parts, light: _light, grid: _grid, months: _months, seasons: _seasons, priests: _priests, year: _year } as const;
/** The parts scene's beats (frames from its start), at the tempo of the other scenes (camera moves of 60–80 frames, content
 *  starting 20–60 frames in, a short tail): the camera settles low over the Sun's circle, the Sun at its rising portal, while the
 *  date glides to the morning of ten parts (72:9–10); the Sun runs its day at a steady pace, the wheel counting the eighteen parts
 *  as it crosses them (15 frames a part) while the camera lifts over the wheel; a hold on ten and eight; the date glides on to
 *  the longest day of twelve parts (72:14); the scene hands the Dial, the Sun and the camera to the light scene as they stand. */
export const PT = { cam: [0, 70], toTen: [10, 90], lift: [110, 200], run: [120, 390], toPeak: [480, 590] } as const;
/** The months scene: the year's glide starts here, this many frames a month. */
export const MO = { start: 60, per: 34 };
export const MONTH_OFF = [0, 30, 60, 91, 121, 151, 182, 212, 242, 273, 303, 333];
/** The morning the machine shows: every gliding scene starts from it, so nothing jumps. */
export const DAY0 = 9;
/** The seasons scene (frames from its start). */
export const SA = { lay: [60, 300], turns: [300, 600], split: [600, 820], gather: [820, 960] } as const;
/** The courses scene (frames from its start). */
export const PB = { week: [0, 220], ring: [200, 560], year: [560, 740], helix: [740, 1040] } as const;
/** The ending: the fourth portal's windows (72:7), the gaze rising away, the title. */
export const E0 = D0 + DS.year[1], END = 520;
export const VISION_END = E0 + END;
