import { DEG, R_EARTH } from './constants';

export type RegionId = 'peru' | 'southamerica' | 'europe' | 'lima' | 'visible';

export interface RegionPreset {
  id: RegionId;
  name: string;
  short: string;
  /** Polígono [lat, lon] en grados. null = disco visible completo. */
  polygon: [number, number][] | null;
  center: [number, number];
}

export const REGIONS: RegionPreset[] = [
  {
    id: 'peru',
    name: 'Perú',
    short: 'Perú',
    center: [-9.2, -75.0],
    polygon: [
      [-4.7, -81.3], [-3.0, -80.0], [-2.0, -78.0], [-0.2, -75.5], [-1.0, -73.5],
      [-2.5, -72.0], [-2.7, -70.0], [-6.0, -69.4], [-10.9, -69.5], [-17.5, -69.5],
      [-17.3, -71.4], [-16.5, -73.5], [-15.4, -75.1], [-13.5, -76.3], [-11.0, -77.0],
      [-9.0, -78.5], [-7.5, -79.5], [-6.0, -80.5], [-4.7, -81.3],
    ],
  },
  {
    id: 'southamerica',
    name: 'Sudamérica',
    short: 'Sudam.',
    center: [-15.0, -60.0],
    polygon: [
      [12, -81], [12, -70], [10, -60], [5, -50], [-5, -35], [-15, -38], [-25, -48],
      [-35, -58], [-40, -62], [-55, -65], [-52, -72], [-45, -75], [-35, -72],
      [-20, -71], [-10, -75], [-5, -79], [0, -81], [12, -81],
    ],
  },
  {
    id: 'europe',
    name: 'Europa',
    short: 'Europa',
    center: [50.0, 15.0],
    polygon: [
      [36, -10], [44, 0], [44, 10], [40, 20], [37, 30], [40, 40], [50, 30],
      [60, 25], [60, 10], [58, 0], [48, -5], [36, -10],
    ],
  },
  {
    id: 'lima',
    name: 'Lima (ciudad)',
    short: 'Lima',
    center: [-12.05, -77.04],
    polygon: null,
  },
  { id: 'visible', name: 'Disco visible', short: 'Visible', center: [0, 0], polygon: null },
];

export const regionById = (id: RegionId): RegionPreset => REGIONS.find((r) => r.id === id) ?? REGIONS[0];

/** Polígono circular para Lima (~110 km de radio). */
export function limaPolygon(radiusDeg = 1.0, segments = 28): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < segments; i++) {
    const a = (2 * Math.PI * i) / segments;
    out.push([-12.05 + radiusDeg * Math.sin(a), -77.04 + radiusDeg * Math.cos(a) / Math.cos(-12.05 * DEG)]);
  }
  out.push(out[0]);
  return out;
}

/** Área aproximada de un polígono lat/lon sobre la esfera [km²]. */
export function regionAreaKm2(poly: [number, number][]): number {
  if (poly.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < poly.length; i++) {
    const [lat1, lon1] = poly[i];
    const [lat2, lon2] = poly[(i + 1) % poly.length];
    sum += (lon2 - lon1) * DEG * (2 + Math.sin(lat1 * DEG) + Math.sin(lat2 * DEG));
  }
  return Math.abs(sum) * R_EARTH * R_EARTH * 0.5;
}

export function regionPolygon(id: RegionId): [number, number][] | null {
  if (id === 'lima') return limaPolygon();
  return regionById(id).polygon;
}

/** Punto dentro de polígono (ray casting) en coordenadas lat/lon. */
export function pointInPolygon(lat: number, lon: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [latI, lonI] = poly[i];
    const [latJ, lonJ] = poly[j];
    const intersect =
      lonI > lon !== lonJ > lon &&
      lat < ((latJ - latI) * (lon - lonI)) / (lonJ - lonI + 1e-12) + latI;
    if (intersect) inside = !inside;
  }
  return inside;
}

export interface GroundCell {
  lat: number;
  lon: number;
  row: number;
  col: number;
  color: number;
}

export function polygonBBox(poly: [number, number][]): {
  latMin: number; latMax: number; lonMin: number; lonMax: number;
} {
  let latMin = 90, latMax = -90, lonMin = 180, lonMax = -180;
  for (const [la, lo] of poly) {
    latMin = Math.min(latMin, la);
    latMax = Math.max(latMax, la);
    lonMin = Math.min(lonMin, lo);
    lonMax = Math.max(lonMax, lo);
  }
  return { latMin, latMax, lonMin, lonMax };
}

/** Celdas hexagonales aproximadas (en lat/lon) dentro de un polígono. */
export function buildGroundCells(
  poly: [number, number][],
  spacingKm: number,
  maxCells = 320,
): GroundCell[] {
  let spacing = Math.max(12, spacingKm);
  let cells: GroundCell[] = [];
  for (let attempt = 0; attempt < 6; attempt++) {
    cells = [];
    const bb = polygonBBox(poly);
    const dLat = (spacing / R_EARTH) / DEG;
    const midLat = ((bb.latMin + bb.latMax) / 2) * DEG;
    const dLon = dLat / Math.max(0.15, Math.cos(midLat));
    let row = 0;
    for (let lat = bb.latMin; lat <= bb.latMax + dLat * 0.5; lat += dLat) {
      const offset = (row % 2) * dLon * 0.5;
      let col = 0;
      for (let lon = bb.lonMin - offset; lon <= bb.lonMax + dLon; lon += dLon) {
        if (pointInPolygon(lat, lon, poly)) {
          cells.push({ lat, lon, row, col, color: ((col - row) % 3 + 3) % 3 });
        }
        col++;
      }
      row++;
    }
    if (cells.length <= maxCells) break;
    spacing *= 1.18;
  }
  return cells;
}

/** Muestras de direcciones para la síntesis: dentro y alrededor de la región. */
export interface DirectionSample {
  u: number;
  v: number;
  desired: number;
  inside: boolean;
  lat: number;
  lon: number;
  weight: number;
}

export function sampleRegionDirections(
  poly: [number, number][],
  toAngles: (lat: number, lon: number) => { u: number; v: number; w: number } | null,
  targetInside = 220,
  targetOutside = 220,
): { inside: DirectionSample[]; outside: DirectionSample[] } {
  const bb = polygonBBox(poly);
  const diagDeg = Math.hypot(bb.latMax - bb.latMin, bb.lonMax - bb.lonMin) || 1;
  const step = Math.max(0.25, diagDeg / 22);
  const inside: DirectionSample[] = [];
  const outside: DirectionSample[] = [];

  for (let lat = bb.latMin - step; lat <= bb.latMax + step; lat += step) {
    for (let lon = bb.lonMin - step; lon <= bb.lonMax + step; lon += step) {
      const isIn = pointInPolygon(lat, lon, poly);
      const margin = Math.min(
        Math.abs(lat - bb.latMin), Math.abs(lat - bb.latMax),
        Math.abs(lon - bb.lonMin), Math.abs(lon - bb.lonMax),
      );
      if (!isIn && margin > step * 2.5) continue;
      const ang = toAngles(lat, lon);
      if (!ang || ang.w <= 0.08) continue;
      const s: DirectionSample = {
        u: ang.u,
        v: ang.v,
        desired: isIn ? 1 : 0,
        inside: isIn,
        lat,
        lon,
        weight: 1,
      };
      (isIn ? inside : outside).push(s);
    }
  }

  const thin = (arr: DirectionSample[], target: number): DirectionSample[] => {
    if (arr.length <= target) return arr;
    const stride = arr.length / target;
    const out: DirectionSample[] = [];
    for (let i = 0; i < target; i++) out.push(arr[Math.floor(i * stride)]);
    return out;
  };
  return { inside: thin(inside, targetInside), outside: thin(outside, targetOutside) };
}

/** Centroide aproximado (promedio) de la región. */
export function regionCenter(id: RegionId): [number, number] {
  if (id === 'lima') return [-12.05, -77.04];
  return regionById(id).center;
}
