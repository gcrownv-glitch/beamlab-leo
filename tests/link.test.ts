import { describe, expect, it } from 'vitest';
import { linkBudget } from '../src/core/link';

const base = {
  slantKm: 550,
  freqGHz: 12,
  txPowerW: 20,
  txGainDbi: 26.2,
  rxGainDbi: 34,
  noiseFigureDb: 1.5,
  bandwidthMHz: 100,
  elevationDeg: 60,
  usersPerBeam: 20,
};

describe('presupuesto de enlace', () => {
  it('terminal VSAT 0.6 m cierra con 64APSK y ~500 Mbps por haz', () => {
    const l = linkBudget(base);
    expect(l.outage).toBe(false);
    expect(l.cnDb).toBeGreaterThan(20);
    expect(l.modcod).toBe('64APSK 5/6');
    expect(l.throughputMbps).toBeCloseTo(500, 6);
    expect(l.userThroughputMbps).toBeCloseTo(25, 6);
    expect(l.gtDbK).toBeGreaterThan(10);
  });

  it('una antena isotrópica de 0 dBi queda en outage', () => {
    const l = linkBudget({ ...base, rxGainDbi: 0, noiseFigureDb: 2 });
    expect(l.outage).toBe(true);
    expect(l.modcod).toBe('sin enlace');
    expect(l.throughputMbps).toBe(0);
    expect(l.userThroughputMbps).toBe(0);
  });

  it('la lluvia reduce el C/N y puede bajar el MODCOD', () => {
    const clear = linkBudget(base);
    const rain = linkBudget({ ...base, rainMarginDb: 12 });
    expect(rain.cnDb).toBeLessThan(clear.cnDb - 10);
    expect(rain.modcod).not.toBe(clear.modcod);
  });

  it('el ancho de banda escala la capacidad agregada', () => {
    const l100 = linkBudget(base);
    const l200 = linkBudget({ ...base, bandwidthMHz: 200 });
    expect(l200.throughputMbps).toBeCloseTo(l100.throughputMbps * 2, 6);
    expect(l200.cnDb).toBeLessThan(l100.cnDb);
  });
});
