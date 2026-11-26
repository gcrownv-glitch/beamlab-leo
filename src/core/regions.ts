import { DEG, R_EARTH } from './constants';
import { elevationAngle } from './orbit';
import type { Vec3 } from './vec';

export type RegionId =
  | 'peru'
  | 'southamerica'
  | 'latam'
  | 'americas'
  | 'atlantic'
  | 'europe'
  | 'lima'
  | 'visible';

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
    id: 'latam',
    name: 'Latinoamérica y Caribe',
    short: 'LatAm',
    center: [-10.0, -68.0],
    polygon: [
      [32, -117], [32, -97], [26, -97], [24, -82], [22, -74], [18, -66], [11, -61],
      [5, -52], [-5, -35], [-15, -38], [-25, -47], [-35, -55], [-43, -64], [-55, -67],
      [-53, -74], [-42, -74], [-20, -71], [-12, -78], [-5, -81], [6, -78], [10, -86],
      [16, -95], [22, -106], [32, -117],
    ],
  },
  {
    id: 'americas',
    name: 'Américas (Norte, Centro y Sur)',
    short: 'Américas',
    center: [5.0, -76.0],
    polygon: [
      [68, -162], [70, -135], [64, -90], [60, -64], [48, -53], [40, -70], [26, -80],
      [21, -74], [18, -65], [10, -61], [5, -52], [-5, -35], [-20, -40], [-36, -56],
      [-55, -67], [-52, -74], [-22, -71], [-5, -81], [8, -79], [16, -95], [23, -106],
      [33, -118], [48, -125], [60, -148], [68, -162],
    ],
  },
  {
    id: 'atlantic',
    name: 'Américas + Atlántico / Groenlandia',
    short: 'Atlántico',
    center: [12.0, -56.0],
    polygon: [
      [78, -55], [80, -25], [72, -18], [62, -20], [50, -12], [36, -10], [20, -18],
      [0, -20], [-25, -24], [-45, -35], [-55, -58], [-55, -67], [-52, -74], [-22, -71],
      [-5, -81], [8, -79], [16, -95], [23, -106], [33, -118], [48, -125], [60, -148],
      [68, -155], [71, -110], [74, -80], [78, -55],
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

/** Distancia mínima aproximada [km] desde (latDeg, lonDeg) hasta el contorno del polígono. */
export function distanceToPolygonKm(latDeg: number, lonDeg: number, poly: [number, number][]): number {
  if (poly.length === 0) return Infinity;
  const kmPerLat = DEG * R_EARTH;
  const kmPerLon = kmPerLat * Math.max(0.1, Math.cos(latDeg * DEG));
  let minDist2 = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [latA, lonA] = poly[j];
    const [latB, lonB] = poly[i];
    const xA = (lonA - lonDeg) * kmPerLon;
    const yA = (latA - latDeg) * kmPerLat;
    const dx = (lonB - lonDeg) * kmPerLon - xA;
    const dy = (latB - latDeg) * kmPerLat - yA;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, (-xA * dx - yA * dy) / len2)) : 0;
    const px = xA + t * dx;
    const py = yA + t * dy;
    const d2 = px * px + py * py;
    if (d2 < minDist2) minDist2 = d2;
  }
  return Math.sqrt(minDist2);
}

/** Índice de color sin colisiones entre celdas vecinas para reutilización 3, 4 o 7 en malla hexagonal odd-r. */
export function cellColor(row: number, col: number, reuse: number): number {
  const q = col - Math.floor(row / 2);
  const r = row;
  const mod = (n: number, m: number) => ((n % m) + m) % m;
  if (reuse === 3) return mod(q - r, 3);
  if (reuse === 4) return (q & 1) + 2 * (r & 1);
  if (reuse === 7) return mod(q + 3 * r, 7);
  return mod(q + 3 * r, Math.max(1, reuse));
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
    const dLonBase = (spacing / R_EARTH) / DEG;
    const dLat = dLonBase * (Math.sqrt(3) / 2);
    const midLat = ((bb.latMin + bb.latMax) / 2) * DEG;
    const dLon = dLonBase / Math.max(0.15, Math.cos(midLat));
    let row = 0;
    for (let lat = bb.latMin; lat <= bb.latMax + dLat * 0.5; lat += dLat) {
      const offset = (row & 1) * dLon * 0.5;
      let col = 0;
      for (let lon = bb.lonMin - dLon + offset; lon <= bb.lonMax + dLon; lon += dLon) {
        if (pointInPolygon(lat, lon, poly)) {
          cells.push({ lat, lon, row, col, color: cellColor(row, col, 3) });
        }
        col++;
      }
      row++;
    }
    if (cells.length <= maxCells) break;
    spacing *= 1.18;
  }
  if (cells.length === 0 && poly.length > 0) {
    let latSum = 0;
    let lonSum = 0;
    for (const [la, lo] of poly) {
      latSum += la;
      lonSum += lo;
    }
    cells.push({ lat: latSum / poly.length, lon: lonSum / poly.length, row: 0, col: 0, color: 0 });
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

export interface CityPreset {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

/** Principales ciudades del Perú para apuntado puntual y síntesis conformada. */
export const PERU_CITIES: CityPreset[] = [
  { id: 'lima', name: 'Lima', lat: -12.05, lon: -77.04 },
  { id: 'arequipa', name: 'Arequipa', lat: -16.41, lon: -71.54 },
  { id: 'cusco', name: 'Cusco', lat: -13.53, lon: -71.97 },
  { id: 'trujillo', name: 'Trujillo', lat: -8.11, lon: -79.03 },
  { id: 'chiclayo', name: 'Chiclayo', lat: -6.77, lon: -79.84 },
  { id: 'piura', name: 'Piura', lat: -5.19, lon: -80.63 },
  { id: 'iquitos', name: 'Iquitos', lat: -3.75, lon: -73.25 },
  { id: 'huancayo', name: 'Huancayo', lat: -12.07, lon: -75.21 },
  { id: 'puno', name: 'Puno', lat: -15.84, lon: -70.02 },
  { id: 'tacna', name: 'Tacna', lat: -18.01, lon: -70.25 },
  { id: 'cajamarca', name: 'Cajamarca', lat: -7.16, lon: -78.51 },
  { id: 'pucallpa', name: 'Pucallpa', lat: -8.38, lon: -74.55 },
  { id: 'chimbote', name: 'Chimbote', lat: -9.07, lon: -78.59 },
];

export const cityById = (id: string): CityPreset | undefined => PERU_CITIES.find((c) => c.id === id);

export interface WorldCity {
  name: string;
  country: string;
  lat: number;
  lon: number;
}

/** Ciudades y centros de tráfico distribuidos globalmente para auto-apuntado orbital LEO. */
export const WORLD_CITIES: WorldCity[] = [
  { name: 'Lima', country: 'PE', lat: -12.05, lon: -77.04 },
  { name: 'Arequipa', country: 'PE', lat: -16.41, lon: -71.54 },
  { name: 'Cusco', country: 'PE', lat: -13.53, lon: -71.97 },
  { name: 'Trujillo', country: 'PE', lat: -8.11, lon: -79.03 },
  { name: 'Iquitos', country: 'PE', lat: -3.75, lon: -73.25 },
  { name: 'Piura', country: 'PE', lat: -5.19, lon: -80.63 },
  { name: 'Bogotá', country: 'CO', lat: 4.71, lon: -74.07 },
  { name: 'Quito', country: 'EC', lat: -0.18, lon: -78.47 },
  { name: 'La Paz', country: 'BO', lat: -16.50, lon: -68.15 },
  { name: 'Santiago', country: 'CL', lat: -33.45, lon: -70.67 },
  { name: 'Buenos Aires', country: 'AR', lat: -34.60, lon: -58.38 },
  { name: 'São Paulo', country: 'BR', lat: -23.55, lon: -46.63 },
  { name: 'Manaus', country: 'BR', lat: -3.12, lon: -60.02 },
  { name: 'Caracas', country: 'VE', lat: 10.48, lon: -66.90 },
  { name: 'Panamá', country: 'PA', lat: 8.98, lon: -79.52 },
  { name: 'La Habana', country: 'CU', lat: 23.11, lon: -82.37 },
  { name: 'Ciudad de México', country: 'MX', lat: 19.43, lon: -99.13 },
  { name: 'Miami', country: 'US', lat: 25.76, lon: -80.19 },
  { name: 'Nueva York', country: 'US', lat: 40.71, lon: -74.01 },
  { name: 'Chicago', country: 'US', lat: 41.88, lon: -87.63 },
  { name: 'Los Ángeles', country: 'US', lat: 34.05, lon: -118.24 },
  { name: 'Seattle', country: 'US', lat: 47.61, lon: -122.33 },
  { name: 'Toronto', country: 'CA', lat: 43.65, lon: -79.38 },
  { name: 'Anchorage', country: 'US', lat: 61.22, lon: -149.90 },
  { name: 'Reikiavik', country: 'IS', lat: 64.15, lon: -21.94 },
  { name: 'Londres', country: 'GB', lat: 51.51, lon: -0.13 },
  { name: 'Madrid', country: 'ES', lat: 40.42, lon: -3.70 },
  { name: 'París', country: 'FR', lat: 48.86, lon: 2.35 },
  { name: 'Berlín', country: 'DE', lat: 52.52, lon: 13.40 },
  { name: 'Roma', country: 'IT', lat: 41.90, lon: 12.50 },
  { name: 'Estambul', country: 'TR', lat: 41.01, lon: 28.98 },
  { name: 'El Cairo', country: 'EG', lat: 30.04, lon: 31.24 },
  { name: 'Lagos', country: 'NG', lat: 6.52, lon: 3.38 },
  { name: 'Nairobi', country: 'KE', lat: -1.29, lon: 36.82 },
  { name: 'Johannesburgo', country: 'ZA', lat: -26.20, lon: 28.05 },
  { name: 'Dubái', country: 'AE', lat: 25.20, lon: 55.27 },
  { name: 'Riad', country: 'SA', lat: 24.71, lon: 46.68 },
  { name: 'Mumbai', country: 'IN', lat: 19.08, lon: 72.88 },
  { name: 'Nueva Delhi', country: 'IN', lat: 28.61, lon: 77.21 },
  { name: 'Singapur', country: 'SG', lat: 1.35, lon: 103.82 },
  { name: 'Bangkok', country: 'TH', lat: 13.76, lon: 100.50 },
  { name: 'Yakarta', country: 'ID', lat: -6.21, lon: 106.85 },
  { name: 'Pekín', country: 'CN', lat: 39.90, lon: 116.40 },
  { name: 'Shanghái', country: 'CN', lat: 31.23, lon: 121.47 },
  { name: 'Seúl', country: 'KR', lat: 37.57, lon: 126.98 },
  { name: 'Tokio', country: 'JP', lat: 35.68, lon: 139.65 },
  { name: 'Sídney', country: 'AU', lat: -33.87, lon: 151.21 },
  { name: 'Melbourne', country: 'AU', lat: -37.81, lon: 144.96 },
  { name: 'Auckland', country: 'NZ', lat: -36.85, lon: 174.76 },
  { name: 'Honolulu', country: 'US', lat: 21.31, lon: -157.86 },
];

/** Ciudad visible más cercana (mayor elevación) al satélite en su posición ECEF actual. */
export function nearestVisibleCity(
  satEcef: Vec3,
  minElevDeg = 15,
): { city: WorldCity; elevDeg: number } | null {
  const minRad = minElevDeg * DEG;
  let best: WorldCity | null = null;
  let bestElev = minRad;
  for (const city of WORLD_CITIES) {
    const elev = elevationAngle(satEcef, city.lat * DEG, city.lon * DEG);
    if (elev > bestElev) {
      bestElev = elev;
      best = city;
    }
  }
  return best ? { city: best, elevDeg: bestElev / DEG } : null;
}
