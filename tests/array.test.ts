import { describe, expect, it } from 'vitest';
import {
  beamPhaseMap,
  computeBasePattern,
  computeMetrics,
  patternCut,
  qForHpbw,
  taperWeights,
  type ArrayConfig,
  type Beam,
} from '../src/core/array';

const cfg = (over: Partial<ArrayConfig> = {}): ArrayConfig => ({
  n: 16,
  dx: 0.5,
  dy: 0.5,
  freqGHz: 12,
  taper: 'uniform',
  q: 1,
  efficiency: 1,
  ...over,
});

const beam = (u = 0, v = 0): Beam => ({ id: 0, u, v, amp: 1, color: 0 });

describe('arreglo en fase', () => {
  it('bocina global de 17°', () => {
    const c = cfg({ n: 1, q: qForHpbw(17), freqGHz: 12 });
    const g = computeBasePattern(c);
    const m = computeMetrics(c, g, beam());
    expect(m.hpbwDeg).toBeCloseTo(17, 0);
    expect(m.directivityDb).toBeCloseTo(21.05, 0);
  });

  it('16×16 uniforme: directividad alta y haz estrecho', () => {
    const c = cfg();
    const g = computeBasePattern(c);
    const m = computeMetrics(c, g, beam());
    expect(m.directivityDb).toBeGreaterThan(27);
    expect(m.directivityDb).toBeLessThan(32);
    expect(m.hpbwDeg).toBeGreaterThan(4.5);
    expect(m.hpbwDeg).toBeLessThan(8);
    expect(m.sllDb).toBeLessThan(-10);
    expect(m.sllDb).toBeGreaterThan(-20);
  });

  it('el taper reduce lóbulos laterales', () => {
    const u = computeMetrics(cfg(), computeBasePattern(cfg()), beam());
    const k = cfg({ taper: 'kaiser30' });
    const t = computeMetrics(k, computeBasePattern(k), beam());
    expect(t.sllDb).toBeLessThan(u.sllDb - 5);
    expect(t.hpbwDeg).toBeGreaterThan(u.hpbwDeg);
  });

  it('la fase apunta al haz', () => {
    const c = cfg({ n: 8 });
    const { phases } = beamPhaseMap(c, beam(0.2, 0));
    const d = phases[4 * 8 + 7] - phases[4 * 8 + 0];
    const expected = -2 * Math.PI * (7 * c.dx) * 0.2;
    const wrapped = Math.atan2(Math.sin(d - expected), Math.cos(d - expected));
    expect(Math.abs(wrapped)).toBeLessThan(1e-9);
  });

  it('el corte tiene su máximo en 0 dB', () => {
    const c = cfg();
    const cut = patternCut(computeBasePattern(c), beam(), c.q, 20, 201);
    const max = Math.max(...cut.map((p) => p.db));
    expect(max).toBeCloseTo(0, 6);
    const center = cut.reduce((best, p) => (Math.abs(p.angle) < Math.abs(best.angle) ? p : best), cut[0]);
    expect(center.db).toBeCloseTo(0, 1);
  });

  it('el taper uniforme suma 1', () => {
    const w = taperWeights(8, 'uniform');
    expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
  });
});
