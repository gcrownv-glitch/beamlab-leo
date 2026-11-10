import { DEG, R_EARTH } from './constants';
import { gmstRad, type OrbitElements } from './orbit';

export interface OrbitPreset {
  id: string;
  name: string;
  altKm: number;
  incDeg: number;
  ecc: number;
  /** Desfase a lo largo de la traza respecto al punto de interés [deg]. */
  alongDeg: number;
  note: string;
}

export const ORBIT_PRESETS: OrbitPreset[] = [
  {
    id: 'starlink',
    name: 'Starlink (LEO)',
    altKm: 550,
    incDeg: 53,
    ecc: 0.0001,
    alongDeg: 2.5,
    note: 'Constelación de banda ancha, 550 km, 53°.',
  },
  {
    id: 'iss',
    name: 'ISS (LEO)',
    altKm: 420,
    incDeg: 51.64,
    ecc: 0.0004,
    alongDeg: -2.2,
    note: 'Estación Espacial Internacional, órbita baja tripulada.',
  },
  {
    id: 'oneweb',
    name: 'OneWeb (LEO)',
    altKm: 1200,
    incDeg: 87.9,
    ecc: 0.001,
    alongDeg: 3,
    note: 'Constelación polar, 1200 km, cobertura global.',
  },
  {
    id: 'sso',
    name: 'Heliosíncrona (SSO)',
    altKm: 600,
    incDeg: 97.8,
    ecc: 0.001,
    alongDeg: 0,
    note: 'Órbita polar heliosíncrona para observación.',
  },
  {
    id: 'custom',
    name: 'Personalizada',
    altKm: 550,
    incDeg: 53,
    ecc: 0,
    alongDeg: 0,
    note: 'Ajusta los parámetros con los controles.',
  },
];

export const presetById = (id: string): OrbitPreset => ORBIT_PRESETS.find((p) => p.id === id) ?? ORBIT_PRESETS[0];

/**
 * Construye elementos keplerianos para que el satélite pase cerca de un punto
 * (lat, lon) en la época indicada. Se usa para que la demo empiece sobre Perú.
 */
export function elementsOverPoint(
  altKm: number,
  incDeg: number,
  latDeg: number,
  lonDeg: number,
  epoch: number,
  alongDeg = 0,
  ecc = 0,
): OrbitElements {
  const inc = incDeg * DEG;
  const lat = latDeg * DEG;
  const sinInc = Math.sin(inc);
  let ratio = sinInc !== 0 ? Math.sin(lat) / sinInc : 0;
  ratio = Math.max(-1, Math.min(1, ratio));
  let u = Math.asin(ratio) + alongDeg * DEG;
  const x = Math.cos(u);
  const y = Math.sin(u) * Math.cos(inc);
  const z = Math.sin(u) * Math.sin(inc);
  const lonEci = Math.atan2(y, x);
  const target = lonDeg * DEG + gmstRad(epoch);
  let raan = target - lonEci;
  raan = ((raan % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const M0 = ((u % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return {
    a: R_EARTH + altKm,
    e: ecc,
    i: inc,
    raan,
    argp: 0,
    M0,
    epoch,
  };
}
