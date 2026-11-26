import { DEG, R_EARTH } from './constants';
import type { ArrayConfig, TaperType } from './array';
import { gmstRad, type OrbitElements } from './orbit';
import type { RegionId } from './regions';

export interface PresetPayload {
  mode: 'global' | 'spot' | 'cellular' | 'shaped';
  region: RegionId;
  freqGHz: number;
  n: number;
  dx: number;
  q: number;
  taper: TaperType;
  ptxW: number;
  reuse: number;
  shapedRadiusKm: number;
  summary: string;
}

export interface OrbitPreset {
  id: string;
  name: string;
  group?: string;
  noradId?: number;
  altKm: number;
  incDeg: number;
  ecc: number;
  /** Desfase a lo largo de la traza respecto al punto de interés [deg]. */
  alongDeg: number;
  /** Longitud ecuatorial fija para ranuras GEO [deg]. */
  geoLonDeg?: number;
  /** Perfil de carga útil realista por defecto (usado en flota Amazonas GEO). */
  payload?: PresetPayload;
  note: string;
}

export const ORBIT_PRESETS: OrbitPreset[] = [
  // 1. Generación V1.0
  {
    id: 'starlink-1007',
    name: 'STARLINK-1007 (V1.0)',
    group: 'Starlink · Generación V1.0',
    noradId: 44713,
    altKm: 550,
    incDeg: 53.0,
    ecc: 0.0001,
    alongDeg: 2.5,
    note: 'Gen V1.0 · NORAD 44713 · Primer lote operativo comercial (nov 2019), 550 km, 53.0°.',
  },
  {
    id: 'starlink-2150',
    name: 'STARLINK-2150 (V1.0)',
    group: 'Starlink · Generación V1.0',
    noradId: 47751,
    altKm: 540,
    incDeg: 53.2,
    ecc: 0.0001,
    alongDeg: 1.8,
    note: 'Gen V1.0 · NORAD 47751 · Últimos lotes V1.0 (mar 2021), 540 km, 53.2°.',
  },

  // 2. Generación V1.5 (Con enlaces láser)
  {
    id: 'starlink-3005',
    name: 'STARLINK-3005 (V1.5)',
    group: 'Starlink · Generación V1.5 (enlaces láser)',
    noradId: 49131,
    altKm: 570,
    incDeg: 97.6,
    ecc: 0.0002,
    alongDeg: 1.5,
    note: 'Gen V1.5 (enlaces láser) · NORAD 49131 · Órbita polar (sep 2021), 570 km, 97.6°.',
  },
  {
    id: 'starlink-5241',
    name: 'STARLINK-5241 (V1.5)',
    group: 'Starlink · Generación V1.5 (enlaces láser)',
    noradId: 55623,
    altKm: 530,
    incDeg: 43.0,
    ecc: 0.0001,
    alongDeg: 2.0,
    note: 'Gen V1.5 (enlaces láser) · NORAD 55623 · Grupo 5 (feb 2023), 530 km, 43.0°.',
  },

  // 3. Generación V2 Mini
  {
    id: 'starlink-30001',
    name: 'STARLINK-30001 (V2 Mini)',
    group: 'Starlink · Generación V2 Mini',
    noradId: 55693,
    altKm: 530,
    incDeg: 43.0,
    ecc: 0.0001,
    alongDeg: 2.2,
    note: 'Gen V2 Mini · NORAD 55693 · Primera unidad de la serie V2 Mini (feb 2023), 530 km, 43.0°.',
  },
  {
    id: 'starlink-31005',
    name: 'STARLINK-31005 (V2 Mini DTC)',
    group: 'Starlink · Generación V2 Mini',
    noradId: 58695,
    altKm: 360,
    incDeg: 43.0,
    ecc: 0.0002,
    alongDeg: 1.2,
    note: 'Gen V2 Mini Direct-to-Cell · NORAD 58695 · Antena celular DTC (ene 2024), 360 km, 43.0°.',
  },

  // 4. Generación V2 Completo (Full-Size)
  {
    id: 'starlink-v2-sim',
    name: 'STARLINK-V2-SIM-01 / 02',
    group: 'Starlink · Generación V2 Completo (Full-Size)',
    altKm: 340,
    incDeg: 43.0,
    ecc: 0.0005,
    alongDeg: 1.0,
    note: 'Gen V2 Completo · Simuladores estructurales masa/tamaño (Starship IFT-3/IFT-4; serie operativa cancelada para saltar directo a V3), 340 km.',
  },

  // 5. Generación V3
  {
    id: 'starlink-40001',
    name: 'STARLINK-40001 (V3)',
    group: 'Starlink · Generación V3',
    altKm: 480,
    incDeg: 53.2,
    ecc: 0.0001,
    alongDeg: 2.0,
    note: 'Gen V3 · Primer satélite operativo de producción V3 desplegado por Starship (sep 2026), 480 km, 53.2°.',
  },
  {
    id: 'starlink-40012',
    name: 'STARLINK-40012 (V3 VLEO)',
    group: 'Starlink · Generación V3',
    altKm: 350,
    incDeg: 53.2,
    ecc: 0.0001,
    alongDeg: 1.0,
    note: 'Gen V3 · Unidad operativa en órbita ultrabaja VLEO (~350 km), 53.2°.',
  },

  // Flota GEO Amazonas (Hispasat)
  {
    id: 'amazonas-2',
    name: 'Amazonas 2 (GEO 72°O)',
    group: 'GEO · Flota Amazonas (Hispasat)',
    noradId: 35942,
    altKm: 35786,
    incDeg: 3.5,
    ecc: 0.0003,
    alongDeg: 0,
    geoLonDeg: -72,
    payload: {
      mode: 'cellular',
      region: 'americas',
      freqGHz: 12,
      n: 16,
      dx: 2.2,
      q: 36,
      taper: 'kaiser30',
      ptxW: 50,
      reuse: 4,
      shapedRadiusKm: 1400,
      summary: 'Amazonas 2 (72°O): perfil realista Ku · Américas.',
    },
    note: 'Hispasat GEO · NORAD 35942 · 72°O (órbita inclinada), 35 786 km, cobertura Américas (Ku/C).',
  },
  {
    id: 'amazonas-3',
    name: 'Amazonas 3 (GEO 61°O)',
    group: 'GEO · Flota Amazonas (Hispasat)',
    noradId: 39078,
    altKm: 35786,
    incDeg: 0.05,
    ecc: 0.0002,
    alongDeg: 0,
    geoLonDeg: -61,
    payload: {
      mode: 'cellular',
      region: 'latam',
      freqGHz: 20,
      n: 16,
      dx: 1.9,
      q: 36,
      taper: 'kaiser30',
      ptxW: 80,
      reuse: 4,
      shapedRadiusKm: 1100,
      summary: 'Amazonas 3 (61°O): perfil realista Ka HTS · Latinoamérica.',
    },
    note: 'Hispasat GEO · NORAD 39078 · 61°O sobre Sudamérica, 35 786 km, bandas Ku/Ka HTS y C.',
  },
  {
    id: 'amazonas-5',
    name: 'Amazonas 5 (GEO 61°O)',
    group: 'GEO · Flota Amazonas (Hispasat)',
    noradId: 42934,
    altKm: 35786,
    incDeg: 0.05,
    ecc: 0.0002,
    alongDeg: 0,
    geoLonDeg: -61,
    payload: {
      mode: 'cellular',
      region: 'latam',
      freqGHz: 20,
      n: 16,
      dx: 2.9,
      q: 48,
      taper: 'kaiser30',
      ptxW: 60,
      reuse: 4,
      shapedRadiusKm: 900,
      summary: 'Amazonas 5 (61°O): perfil realista Ka HTS · ~34 haces en Latinoamérica.',
    },
    note: 'Hispasat GEO · NORAD 42934 · 61°O, 35 786 km, haces Ka HTS sobre Latinoamérica y banda Ku.',
  },
  {
    id: 'amazonas-nexus',
    name: 'Amazonas Nexus (GEO 61°O)',
    group: 'GEO · Flota Amazonas (Hispasat)',
    noradId: 55508,
    altKm: 35786,
    incDeg: 0.04,
    ecc: 0.0001,
    alongDeg: 0,
    geoLonDeg: -61,
    payload: {
      mode: 'cellular',
      region: 'atlantic',
      freqGHz: 12,
      n: 16,
      dx: 2.6,
      q: 44,
      taper: 'kaiser30',
      ptxW: 60,
      reuse: 4,
      shapedRadiusKm: 1500,
      summary: 'Amazonas Nexus (61°O): perfil realista Ku HTS + DTP · Américas y Atlántico/Groenlandia.',
    },
    note: 'Hispasat GEO HTS · NORAD 55508 · 61°O (relevo de Amazonas 2), 35 786 km, carga útil digital Ku/Ka.',
  },

  // Referencia y personalizada
  {
    id: 'starlink',
    name: 'Starlink · Referencia (LEO)',
    group: 'Referencia y personalizada',
    altKm: 550,
    incDeg: 53,
    ecc: 0.0001,
    alongDeg: 2.5,
    note: 'Constelación de banda ancha, 550 km, 53°.',
  },
  {
    id: 'iss',
    name: 'ISS (LEO)',
    group: 'Referencia y personalizada',
    noradId: 25544,
    altKm: 420,
    incDeg: 51.64,
    ecc: 0.0004,
    alongDeg: -2.2,
    note: 'Estación Espacial Internacional · NORAD 25544 · Órbita baja tripulada.',
  },
  {
    id: 'oneweb',
    name: 'OneWeb (LEO)',
    group: 'Referencia y personalizada',
    altKm: 1200,
    incDeg: 87.9,
    ecc: 0.001,
    alongDeg: 3,
    note: 'Constelación polar, 1200 km, cobertura global.',
  },
  {
    id: 'sso',
    name: 'Heliosíncrona (SSO)',
    group: 'Referencia y personalizada',
    altKm: 600,
    incDeg: 97.8,
    ecc: 0.001,
    alongDeg: 0,
    note: 'Órbita polar heliosíncrona para observación.',
  },
  {
    id: 'custom',
    name: 'Personalizada',
    group: 'Referencia y personalizada',
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
  const lonEci = Math.atan2(y, x);
  const target = lonDeg * DEG + gmstRad(epoch);
  let raan = target - lonEci;
  raan = ((raan % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const e = Math.max(0, Math.min(0.99, ecc));
  const nu = ((u % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const E = 2 * Math.atan2(
    Math.sqrt(1 - e) * Math.sin(nu / 2),
    Math.sqrt(1 + e) * Math.cos(nu / 2),
  );
  const M0 = (((E - e * Math.sin(E)) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return {
    a: R_EARTH + altKm,
    e,
    i: inc,
    raan,
    argp: 0,
    M0,
    epoch,
  };
}

/** Construye los elementos orbitales iniciales correspondientes a un preset (LEO sobre Lima o ranura GEO). */
export function orbitForPreset(preset: OrbitPreset, epoch: number): OrbitElements {
  const latDeg = preset.geoLonDeg !== undefined ? 0 : -12.05;
  const lonDeg = preset.geoLonDeg ?? -77.04;
  return elementsOverPoint(preset.altKm, preset.incDeg, latDeg, lonDeg, epoch, preset.alongDeg, preset.ecc);
}

/** Ranura geoestacionaria ecuatorial centrada en `lonDeg` [-180..180]. */
export function geoOrbitAtLongitude(
  lonDeg: number,
  epoch: number,
  altKm = 35786,
  incDeg = 0.05,
  ecc = 0.0002,
): OrbitElements {
  const lonNorm = ((((lonDeg + 180) % 360) + 360) % 360) - 180;
  return elementsOverPoint(altKm, incDeg, 0, lonNorm, epoch, 0, ecc);
}

export const isGeoPreset = (preset: OrbitPreset): boolean => preset.geoLonDeg !== undefined;

export function defaultLeoAntenna(): Partial<ArrayConfig> {
  return { n: 16, dx: 0.5, dy: 0.5, freqGHz: 12, taper: 'kaiser30', q: 1, efficiency: 0.65 };
}
