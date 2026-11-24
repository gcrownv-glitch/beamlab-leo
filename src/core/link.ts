import { C_LIGHT, DEG } from './constants';

export const GROUND_ANTENNA_TEMP_K = 50;
export const SAT_ANTENNA_TEMP_K = 290;
export const SAT_NOISE_FIGURE_DB = 2.5;

export interface LinkParams {
  slantKm: number;
  freqGHz: number;
  txPowerW: number;
  txGainDbi: number;
  rxGainDbi: number;
  noiseFigureDb: number;
  bandwidthMHz: number;
  antennaTempK?: number;
  elevationDeg?: number;
  rainMarginDb?: number;
  atmosphericLossDb?: number;
  implementationMarginDb?: number;
  usersPerBeam?: number;
  coChannelCiDb?: number | null;
}

/**
 * Umbrales aproximados de C/N para DVB-S2X (AWGN, BER 1e-5) y eficiencia
 * espectral típica. Son valores de referencia docente, no una tabla de
 * certificación de un módem concreto.
 */
export const MODCODS = [
  { name: 'QPSK 1/4', minCnDb: -2.4, spectralEfficiency: 0.49 },
  { name: 'QPSK 1/2', minCnDb: 1.0, spectralEfficiency: 0.99 },
  { name: 'QPSK 3/4', minCnDb: 3.8, spectralEfficiency: 1.49 },
  { name: '8PSK 2/3', minCnDb: 5.5, spectralEfficiency: 1.98 },
  { name: '8PSK 3/4', minCnDb: 6.8, spectralEfficiency: 2.22 },
  { name: '16APSK 2/3', minCnDb: 8.5, spectralEfficiency: 2.64 },
  { name: '16APSK 3/4', minCnDb: 10.5, spectralEfficiency: 3.03 },
  { name: '32APSK 3/4', minCnDb: 12.8, spectralEfficiency: 3.50 },
  { name: '32APSK 4/5', minCnDb: 14.5, spectralEfficiency: 4.00 },
  { name: '64APSK 5/6', minCnDb: 19.5, spectralEfficiency: 5.00 },
] as const;

/**
 * Frecuencia de subida emparejada para el modelo docente. En Ku se usa
 * 14 GHz para subir y 12 GHz para bajar; en banda K/Ka, 30/20 GHz. Las bandas
 * L y S se mantienen iguales. No modela duplexores ni planes de frecuencia
 * de un operador concreto.
 */
export function uplinkFrequencyGHz(downlinkGHz: number): number {
  if (downlinkGHz >= 11.5 && downlinkGHz <= 12.5) return 14;
  if (downlinkGHz >= 19 && downlinkGHz <= 21) return 30;
  return downlinkGHz;
}

export interface LinkResult {
  fsplDb: number;
  freqGHz: number;
  eirpDbW: number;
  pfdDbWm2: number;
  rxPowerDbm: number;
  noiseDbm: number;
  cn0DbHz: number;
  cnDb: number;
  ciDb: number | null;
  sinrDb: number;
  gtDbK: number;
  tsysK: number;
  extraLossDb: number;
  elevationDeg: number;
  modcod: string;
  spectralEfficiency: number;
  throughputMbps: number;
  userThroughputMbps: number;
  outage: boolean;
  marginDb: number;
  slantKm: number;
}

const ZENITH_ATM_TABLE: readonly [number, number][] = [
  [1.6, 0.04],
  [2.2, 0.04],
  [12, 0.12],
  [14, 0.16],
  [20, 0.50],
  [30, 0.45],
];

/** Atenuación gaseosa atmosférica en cielo despejado (ITU-R P.676 aprox.) [dB]. */
export function atmosphericLossDb(freqGHz: number, elevationDeg: number): number {
  const table = ZENITH_ATM_TABLE;
  let zenithDb: number;
  if (freqGHz <= table[0][0]) {
    zenithDb = table[0][1];
  } else if (freqGHz >= table[table.length - 1][0]) {
    zenithDb = table[table.length - 1][1];
  } else {
    zenithDb = table[0][1];
    for (let i = 0; i < table.length - 1; i++) {
      const [f0, l0] = table[i];
      const [f1, l1] = table[i + 1];
      if (freqGHz >= f0 && freqGHz <= f1) {
        const t = (freqGHz - f0) / (f1 - f0);
        zenithDb = l0 + t * (l1 - l0);
        break;
      }
    }
  }
  const elev = Math.max(5, Math.min(90, elevationDeg));
  return zenithDb / Math.sin(elev * DEG);
}

/**
 * Presupuesto de enlace (bajada o subida).
 *
 * Modelo: espacio libre + pérdida atmosférica dependiente de frecuencia y
 * elevación + margen de lluvia, antena receptora con ganancia y temperatura de
 * sistema, y selección del MODCOD DVB-S2X más alto cuyo umbral de C/N se
 * cumple descontando el margen de implementación.
 */
export function linkBudget(p: LinkParams): LinkResult {
  const dM = Math.max(p.slantKm, 1) * 1000;
  const lambda = C_LIGHT / (p.freqGHz * 1e9);
  const fsplDb = 20 * Math.log10((4 * Math.PI * dM) / lambda);
  const eirpDbW = 10 * Math.log10(Math.max(p.txPowerW, 1e-6)) + p.txGainDbi;
  const pfdDbWm2 = eirpDbW - 10 * Math.log10(4 * Math.PI * dM * dM);

  const elevationDeg = Math.max(0, Math.min(90, p.elevationDeg ?? 90));
  const rainDb = Math.max(0, p.rainMarginDb ?? 0);
  const atmDb = Math.max(0, p.atmosphericLossDb ?? atmosphericLossDb(p.freqGHz, elevationDeg));
  const extraLossDb = atmDb + rainDb;

  const rxPowerDbm = eirpDbW - fsplDb - extraLossDb + p.rxGainDbi + 30;

  // Temperatura de sistema: antena (50 K en tierra, 290 K en satélite) + receptor.
  const tantK = Math.max(1, p.antennaTempK ?? GROUND_ANTENNA_TEMP_K);
  const tsysK = tantK + (Math.pow(10, p.noiseFigureDb / 10) - 1) * 290;
  const n0DbmHz = -174 + 10 * Math.log10(tsysK / 290);
  const bandwidthHz = Math.max(1, p.bandwidthMHz) * 1e6;
  const noiseDbm = n0DbmHz + 10 * Math.log10(bandwidthHz);
  const cn0DbHz = rxPowerDbm - n0DbmHz;
  const cnDb = rxPowerDbm - noiseDbm;
  const gtDbK = p.rxGainDbi - 10 * Math.log10(tsysK);

  const ciDb = p.coChannelCiDb != null && Number.isFinite(p.coChannelCiDb) ? p.coChannelCiDb : null;
  const sinrDb = ciDb != null
    ? -10 * Math.log10(Math.pow(10, -cnDb / 10) + Math.pow(10, -ciDb / 10))
    : cnDb;
  const implementationMarginDb = Math.max(0, p.implementationMarginDb ?? 1);
  const effectiveCnDb = sinrDb - implementationMarginDb;
  let selected: (typeof MODCODS)[number] | null = null;
  for (const m of MODCODS) {
    if (effectiveCnDb >= m.minCnDb) selected = m;
  }

  const bandwidth = Math.max(1, p.bandwidthMHz);
  const throughputMbps = selected ? bandwidth * selected.spectralEfficiency : 0;
  const users = Math.max(1, p.usersPerBeam ?? 20);
  const userThroughputMbps = throughputMbps / users;
  const lowest = MODCODS[0];
  const marginDb = selected ? effectiveCnDb - selected.minCnDb : effectiveCnDb - lowest.minCnDb;

  return {
    fsplDb,
    freqGHz: p.freqGHz,
    eirpDbW,
    pfdDbWm2,
    rxPowerDbm,
    noiseDbm,
    cn0DbHz,
    cnDb,
    ciDb,
    sinrDb,
    gtDbK,
    tsysK,
    extraLossDb,
    elevationDeg,
    modcod: selected?.name ?? 'sin enlace',
    spectralEfficiency: selected?.spectralEfficiency ?? 0,
    throughputMbps,
    userThroughputMbps,
    outage: !selected,
    marginDb,
    slantKm: p.slantKm,
  };
}
