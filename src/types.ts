// Shapes of the calculator's year documents (src/calculator). The app never
// recomputes these values; it maps them to the screen.
export interface Row {
  daycount: number; civil_date: string; enoch_date: string; month: number; day: number; corrected_doy: number;
  sunrise_jd_ut: number; sunrise_local: string; azimuth_deg: number; north_of_east_deg: number;
  center_true_altitude_deg: number; declination_deg: number; returned_flags: number; closing_boundary: boolean;
}
interface Extended {
  daycount: number; sunset_jd_ut: number; sunset_local: string; sunset_azimuth_deg: number;
  day_hours: number; day_parts: number; text_day_parts: number; portal: number; verse: string; hold: boolean;
  moon_illuminated_fraction_at_sunset: number; local_date_differs: boolean;
  corrections_since_epoch: number; span_cycle: number; cycle: number; cycle_year: number; cycle_year_364: number;
  course: number; course_name: string; course_chronicles: number; course_kjv: string | null; course_cycle: number;
  course_week_start: string; course_week_end: string; course_week_of_cycle: number; course_rotation: number;
  six_year_cycle: number; six_year_year: number; six_year_week: number;
  weekday: number; weekday_name: string; correction_day: number; correction_42: number; correction_6: number; correction_day_of_6: number;
  days_to_next_hold: number; holds_done_in_cycle: number; holds_remaining_in_cycle: number;
  uncorrected_doy: number; uncorrected_month: number; uncorrected_day: number;
}
interface Pass { month: number; verse: string; az_start: number; az_end: number; az_range: [number, number]; start_date: string; end_date: string }
export interface Portal { portal: number; passes: Pass[]; union: [number, number]; common: [number, number]; seam_deg: [number, number] }
interface Course {
  month: number; portal: number; day_parts_end: number; verse: string;
}
interface Month {
  month: number; calendar_positions: number; elapsed_sunrises: number; start_date: string; start_local: string;
  start_azimuth_deg: number; next_boundary_date: string; next_azimuth_deg: number;
}
export interface YearDoc {
  schema_version: number; kind: 'enoch.year';
  provenance: Record<string, unknown> & { layers: Record<string, string> };
  calculation: {
    year_beginning_gregorian: number; enoch_year: number; latitude: number; longitude_east: number; elevation_m: number;
    timezone: string; pressure_hpa: number; temperature_c: number; sunrise_definition: string; swiss_version: string; annual_samples: number; start_date: string;
    closing_boundary_date: string; months: Month[]; northernmost_daily_sample: Row; southernmost_daily_sample: Row;
    equinox_local: string;
  };
  rows: Row[]; extended: Extended[]; portals: Portal[]; portals_west: Portal[];
  /** How far to trust this year; absent in documents saved before it existed. */
  accuracy?: Accuracy;
  cycle: { definition: Record<string, string>; cycles: Cycle[] };
  priests: { rule: string; source: string; structure: string; courses: { n: number; name: string; chronicles: number; kjv: string | null }[] };
  text: { edition: string; parts_per_day: number; course: Course[]; quotes: Record<string, string>;
    names: { sun: { name: string; verse: string; note?: string }[]; moon: { name: string; verse: string }[] } };
}
export interface Site { lat: number; lon: number; elev: number; tz: string; name: string; source: 'preset' | 'device' | 'manual' }
interface DeepRow { year: number; enoch_year: number; daycount: number; day1_date: string; jd_tt: number; equinox_jd_tt: number; enoch: number; greg: number }
interface SeriesStats { mean: number; std: number; min: number; max: number; within_1_day_pct: number; within_half_day_pct: number }
export interface DeepDoc {
  kind: 'enoch.deep'; provenance: Record<string, string>; bin_years: number; cycle_years: number[];
  stats: { n: number; first_year: number; last_year: number; enoch: SeriesStats; greg: SeriesStats };
  bins: { year: number; n: number; enoch: [number, number, number]; greg: [number, number, number] }[];
  window?: { start: number; end: number; rows: DeepRow[] };
}
export interface Hold { n: number; daycount: number; civil_date: string; enoch_date: string; position: number; cycle_year: number }
export interface Cycle {
  ordinal: number; index: number; start_daycount: number; end_daycount: number; start_date: string; end_date: string;
  next_cycle_first_hold: { daycount: number; civil_date: string }; years: number; first_enoch_year: number; last_enoch_year: number;
  first_day1_date: string; holds: Hold[];
}

export interface Accuracy {
  within_bounds: boolean;
  bounds: { alignment_days: number; delta_t_sigma_s: number; best_span: { years: number; first_year: number; last_year: number } };
  day1_offset_days: number; day1_year: number; day1_sunrise_minus_equinox_ut_days: number;
  calendar_mean_year_days: number; equinox_year_days: number | null; mean_equinox_year_days: number; mean_equinox_year_span: [number, number];
  drift_days_per_millennium: number; calendar_year_days: number;
  delta_t_s: number; delta_t_sigma_s: number;
  reasons: { key: string; title: string; detail: string }[];
  source: string;
}
