import { C_LIGHT } from './constants';

export interface LinkParams {
  slantKm: number;
  freqGHz: number;
  txPowerW: number;
  txGainDbi: number;
  rxGainDbi: number;
  noiseFigureDb: number;
  bandwidthMHz: number;
}

export interface LinkResult {
  fsplDb: number;
  eirpDbW: number;
  pfdDbWm2: number;
  rxPowerDbm: number;
  noiseDbm: number;
  cn0DbHz: number;
  cnDb: number;
  throughputMbps: number;
  slantKm: number;
}

/**
 * Presupuesto de enlace simplificado (espacio libre, sin desvanecimiento).
 * Sirve para conectar el patrón de antena con la calidad de enlace percibida.
 */
export function linkBudget(p: LinkParams): LinkResult {
  const dM = Math.max(p.slantKm, 1) * 1000;
  const lambda = C_LIGHT / (p.freqGHz * 1e9);
  const fsplDb = 20 * Math.log10((4 * Math.PI * dM) / lambda);
  const eirpDbW = 10 * Math.log10(Math.max(p.txPowerW, 1e-6)) + p.txGainDbi;
  const pfdDbWm2 = eirpDbW - 10 * Math.log10(4 * Math.PI * dM * dM);
  const rxPowerDbm = eirpDbW - fsplDb + p.rxGainDbi + 30;
  const noiseDbm = -174 + p.noiseFigureDb + 10 * Math.log10(p.bandwidthMHz * 1e6);
  const cn0DbHz = rxPowerDbm - (-174 + p.noiseFigureDb);
  const cnDb = rxPowerDbm - noiseDbm;
  // Capacidad aproximada tipo Shannon con 10 dB de implementación.
  const bw = p.bandwidthMHz * 1e6;
  const snrLin = Math.max(0, Math.pow(10, (cnDb - 10) / 10));
  const throughputMbps = (bw * Math.log2(1 + snrLin)) / 1e6;
  return { fsplDb, eirpDbW, pfdDbWm2, rxPowerDbm, noiseDbm, cn0DbHz, cnDb, throughputMbps, slantKm: p.slantKm };
}
