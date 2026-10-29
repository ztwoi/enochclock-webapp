// The 100 preset places (places.json): chosen for what makes each one different. Used for names, zones and elevations.
import PLACES from './places.json';

export interface Place { name: string; region: string; lat: number; lon: number; elev: number; tz: string; tags: string[]; note: string }
export const places = (PLACES as { places: Place[] }).places;
