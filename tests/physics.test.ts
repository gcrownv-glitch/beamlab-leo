import { describe, expect, it } from 'vitest';
import {
  computeBasePattern,
  computeMetrics,
  gridDirectivity,
  patternFromWeights,
  type ArrayConfig,
  type Beam,
} from '../src/core/array';
import { DEG, R_EARTH } from '../src/core/constants';
import {
  atmosphericLossDb,
  linkBudget,
  SAT_ANTENNA_TEMP_K,
  SAT_NOISE_FIGURE_DB,
} from '../src/core/link';
import { ecefToGeodetic, propagate } from '../src/core/orbit';
import { elementsOverPoint } from '../src/core/presets';
import { quantizedBeamWeights } from '../src/core/quantization';
import { Engine } from '../src/engine';
import { defaultState } from '../src/state';

const cfg: ArrayConfig = {
  n: 16,
  dx: 0.5,
  dy: 0.5,
  freqGHz: 12,
  taper: 'kaiser30',
  q: 1,
  efficiency: 0.65,
};

describe('rigor físico de RF y enlace (Tramo 2)', () => {
  it('gridDirectivity incluye scan loss y la directividad cuantizada no supera a la ideal', () => {
    const base = computeBasePattern(cfg);
    for (const [u, v] of [[0.38, 0.0], [0.5, 0.5]] as const) {
      const beam: Beam = { id: 0, u, v, amp: 1, color: 0 };
      const idealM = computeMetrics(cfg, base, beam);
      const qwIdeal = quantizedBeamWeights(cfg, beam, {
        phaseBits: 0,
        ampBits: 0,
        phaseRmsDeg: 0,
        ampRmsDb: 0,
        seed: 0,
      });
      const gridIdeal = patternFromWeights(cfg, qwIdeal.re, qwIdeal.im, 129, 1.05);
      const dIdeal = gridDirectivity(gridIdeal, cfg.q);
      expect(Math.abs(dIdeal - idealM.directivityDb)).toBeLessThan(0.35);

      const qwReal = quantizedBeamWeights(cfg, beam, {
        phaseBits: 5,
        ampBits: 4,
        phaseRmsDeg: 2,
        ampRmsDb: 0.2,
        seed: 12345,
      });
      const gridReal = patternFromWeights(cfg, qwReal.re, qwReal.im, 129, 1.05);
      const dReal = gridDirectivity(gridReal, cfg.q);
      expect(dReal).toBeLessThanOrEqual(dIdeal + 0.05);
    }
  });

  it('patternFromWeights normaliza respecto al pico del disco visible aunque existan grating lobes fuera', () => {
    const gCfg: ArrayConfig = { ...cfg, n: 8, dx: 0.9, dy: 0.9 };
    const beam: Beam = { id: 0, u: 0.65, v: 0, amp: 1, color: 0 };
    const qw = quantizedBeamWeights(gCfg, beam, {
      phaseBits: 0,
      ampBits: 0,
      phaseRmsDeg: 0,
      ampRmsDb: 0,
      seed: 0,
    });
    const grid = patternFromWeights(gCfg, qw.re, qw.im, 129, 2.2);
    const step = (2 * grid.half) / (grid.size - 1);
    let maxVisible = 0;
    for (let iv = 0; iv < grid.size; iv++) {
      const v = -grid.half + iv * step;
      for (let iu = 0; iu < grid.size; iu++) {
        const u = -grid.half + iu * step;
        if (u * u + v * v <= 1) {
          maxVisible = Math.max(maxVisible, grid.power[iv * grid.size + iu]);
        }
      }
    }
    expect(maxVisible).toBeCloseTo(1, 5);
  });

  it('marginDb es estrictamente coherente con outage en todo el rango de C/N', () => {
    const baseParams = {
      slantKm: 550,
      freqGHz: 12,
      txPowerW: 20,
      txGainDbi: 26.2,
      rxGainDbi: 0,
      noiseFigureDb: 2,
      bandwidthMHz: 100,
      elevationDeg: 60,
      implementationMarginDb: 1,
    };
    for (let rxGain = -5; rxGain <= 35; rxGain += 0.5) {
      const l = linkBudget({ ...baseParams, rxGainDbi: rxGain });
      if (l.outage) {
        expect(l.marginDb).toBeLessThan(0);
      } else {
        expect(l.marginDb).toBeGreaterThanOrEqual(0);
      }
    }
    // Zona crítica: -2.4 <= C/N < -1.4 (con margen de impl. 1 dB, effectiveCnDb < -2.4 -> outage).
    const edge = linkBudget({ ...baseParams, rxGainDbi: 2.66 });
    expect(edge.cnDb).toBeGreaterThan(-2.4);
    expect(edge.cnDb).toBeLessThan(-1.4);
    expect(edge.outage).toBe(true);
    expect(edge.marginDb).toBeLessThan(0);
  });

  it('subida usa receptor satelital de 290 K + NF 2.5 dB independiente del terminal terrestre', () => {
    const s1 = defaultState();
    s1.noiseFigureDb = 1.5;
    const d1 = new Engine(s1).derived;

    const s2 = defaultState();
    s2.noiseFigureDb = 6.0;
    const d2 = new Engine(s2).derived;

    const expectedSatTsys = SAT_ANTENNA_TEMP_K + (Math.pow(10, SAT_NOISE_FIGURE_DB / 10) - 1) * 290;
    expect(d1.links.uplink!.tsysK).toBeCloseTo(expectedSatTsys, 4);
    expect(d2.links.uplink!.tsysK).toBeCloseTo(expectedSatTsys, 4);
    expect(d2.links.downlink!.tsysK).toBeGreaterThan(d1.links.downlink!.tsysK + 500);
  });

  it('pérdida atmosférica escala con elevación y frecuencia', () => {
    expect(atmosphericLossDb(12, 10)).toBeGreaterThan(atmosphericLossDb(12, 60));
    expect(atmosphericLossDb(20, 30)).toBeGreaterThan(atmosphericLossDb(2.2, 30));

    const lowEl = linkBudget({
      slantKm: 900,
      freqGHz: 20,
      txPowerW: 20,
      txGainDbi: 28,
      rxGainDbi: 34,
      noiseFigureDb: 1.5,
      bandwidthMHz: 100,
      elevationDeg: 10,
    });
    const highEl = linkBudget({
      slantKm: 900,
      freqGHz: 20,
      txPowerW: 20,
      txGainDbi: 28,
      rxGainDbi: 34,
      noiseFigureDb: 1.5,
      bandwidthMHz: 100,
      elevationDeg: 80,
    });
    expect(lowEl.extraLossDb).toBeGreaterThan(highEl.extraLossDb);
  });

  it('diferencia capacidad por clúster y capacidad agregada ideal en modo celular', () => {
    const state = defaultState();
    state.mode = 'cellular';
    state.region = 'peru';
    state.reuse = 3;
    const engine = new Engine(state);
    const d = engine.derived;
    const visible = d.beamSet!.visibleCells;
    expect(visible).toBeGreaterThan(state.reuse);
    const perBeam = Math.min(d.links.downlink!.throughputMbps, d.links.uplink!.throughputMbps);
    expect(d.system.capacityMbps).toBeCloseTo(state.reuse * perBeam, 6);
    expect(d.system.aggregateCapacityMbps).toBeCloseTo(visible * perBeam, 6);
    expect(d.system.aggregateCapacityMbps).toBeGreaterThan(d.system.capacityMbps);
  });

  it('elementsOverPoint es exacto para órbitas excéntricas y ecefToGeodetic acota los polos', () => {
    const epoch = Date.UTC(2026, 10, 24, 18, 0, 0);
    const orbit = elementsOverPoint(1200, 53, -12.05, -77.04, epoch, 0, 0.08);
    const sat = propagate(orbit, epoch, false);
    expect(sat.lat / DEG).toBeCloseTo(-12.05, 5);
    expect(sat.lon / DEG).toBeCloseTo(-77.04, 5);

    const pole = ecefToGeodetic({ x: 0, y: 0, z: R_EARTH + 550 });
    expect(pole.lat).toBeCloseTo(Math.PI / 2, 12);
    expect(Number.isNaN(pole.lat)).toBe(false);
  });
});
