import { C_LIGHT } from './constants';

export interface LinkParams {
  slantKm: number;
  freqGHz: number;
  txPowerW: number;
  txGainDbi: number;
  rxGainDbi: number;
  noiseFigureDb: number;
  bandwidthMHz: number;
  elevationDeg?: number;
  rainMarginDb?: number;
  atmosphericLossDb?: number;
  implementationMarginDb?: number;
  usersPerBeam?: number;
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

export interface LinkResult {
  fsplDb: number;
  eirpDbW: number;
  pfdDbWm2: number;
  rxPowerDbm: number;
  noiseDbm: number;
  cn0DbHz: number;
  cnDb: number;
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

/**
 * Presupuesto de enlace de bajada.
 *
 * Modelo: espacio libre + pérdida atmosférica + margen de lluvia, antena
 * receptora con ganancia y temperatura de sistema, y selección del MODCOD
 * DVB-S2X más alto cuyo umbral de C/N se cumple. Si ningún MODCOD cumple,
 * el enlace se declara en outage y la capacidad es cero.
 */
export function linkBudget(p: LinkParams): LinkResult {
  const dM = Math.max(p.slantKm, 1) * 1000;
  const lambda = C_LIGHT / (p.freqGHz * 1e9);
  const fsplDb = 20 * Math.log10((4 * Math.PI * dM) / lambda);
  const eirpDbW = 10 * Math.log10(Math.max(p.txPowerW, 1e-6)) + p.txGainDbi;
  const pfdDbWm2 = eirpDbW - 10 * Math.log10(4 * Math.PI * dM * dM);

  const elevationDeg = Math.max(0, Math.min(90, p.elevationDeg ?? 90));
  const rainDb = Math.max(0, p.rainMarginDb ?? 0);
  const atmDb = Math.max(0, p.atmosphericLossDb ?? 0.25);
  const extraLossDb = atmDb + rainDb;

  const rxPowerDbm = eirpDbW - fsplDb - extraLossDb + p.rxGainDbi + 30;

  // Temperatura de sistema: antena (50 K) + contribución del receptor.
  const tantK = 50;
  const tsysK = tantK + (Math.pow(10, p.noiseFigureDb / 10) - 1) * 290;
  const n0DbmHz = -174 + 10 * Math.log10(tsysK / 290);
  const bandwidthHz = Math.max(1, p.bandwidthMHz) * 1e6;
  const noiseDbm = n0DbmHz + 10 * Math.log10(bandwidthHz);
  const cn0DbHz = rxPowerDbm - n0DbmHz;
  const cnDb = rxPowerDbm - noiseDbm;
  const gtDbK = p.rxGainDbi - 10 * Math.log10(tsysK);

  const implementationMarginDb = Math.max(0, p.implementationMarginDb ?? 1);
  const effectiveCnDb = cnDb - implementationMarginDb;
  let selected: (typeof MODCODS)[number] | null = null;
  for (const m of MODCODS) {
    if (effectiveCnDb >= m.minCnDb) selected = m;
  }

  const bandwidth = Math.max(1, p.bandwidthMHz);
  const throughputMbps = selected ? bandwidth * selected.spectralEfficiency : 0;
  const users = Math.max(1, p.usersPerBeam ?? 20);
  const userThroughputMbps = throughputMbps / users;
  const lowest = MODCODS[0];
  const marginDb = selected ? cnDb - selected.minCnDb : cnDb - lowest.minCnDb;

  return {
    fsplDb,
    eirpDbW,
    pfdDbWm2,
    rxPowerDbm,
    noiseDbm,
    cn0DbHz,
    cnDb,
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
