// Helpers shared by the film's three-dimensional scenes: a bearing and altitude as a direction, the shape of a star in the
// scene, and a soft radial glow for sprites.
import * as THREE from 'three';

const D = Math.PI / 180;

/** Unit direction for a bearing (° from north, clockwise) and altitude (°): north = −z, east = +x, up = +y. */
export const dir = (az: number, alt = 0) => new THREE.Vector3(Math.sin(az * D) * Math.cos(alt * D), Math.sin(alt * D), -Math.cos(az * D) * Math.cos(alt * D));

export interface StarIn { az: number; alt: number; mag: number; rgb: [number, number, number] }

export function glowTexture(stops: [number, string][]) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d')!, r = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  for (const [o, col] of stops) r.addColorStop(o, col);
  g.fillStyle = r; g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
