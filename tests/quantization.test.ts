import { describe, expect, it } from 'vitest';
import {
  computeBasePattern,
  computeMetrics,
  cutFromWeights,
  type ArrayConfig,
  type Beam,
} from '../src/core/array';
import { phaseStep, quantizedBeamWeights } from '../src/core/quantization';

const cfg: ArrayConfig = { n: 16, dx: 0.5, dy: 0.5, freqGHz: 12, taper: 'kaiser30', q: 1, efficiency: 0.65 };
const beam: Beam = { id: 0, u: 0.08, v: 0.2, amp: 1, color: 0 };
const q = { phaseBits: 5, ampBits: 4, phaseRmsDeg: 2, ampRmsDb: 0.2, seed: 12345 };

describe('cuantización del arreglo', () => {
  it('las fases quedan en múltiplos del paso de 5 bits', () => {
    const w = quantizedBeamWeights(cfg, beam, q);
    const step = phaseStep(5);
    for (const p of w.phases) {
      const k = p / step;
      expect(Math.abs(k - Math.round(k))).toBeLessThan(1e-6);
    }
  });

  it('es determinista para la misma semilla y cambia con otra', () => {
    const a = quantizedBeamWeights(cfg, beam, q);
    const b = quantizedBeamWeights(cfg, beam, q);
    const c = quantizedBeamWeights(cfg, beam, { ...q, seed: 999 });
    expect(Array.from(a.re)).toEqual(Array.from(b.re));
    expect(Array.from(a.re)).not.toEqual(Array.from(c.re));
  });

  it('la amplitud usa 2^n niveles y respeta el máximo', () => {
    const w = quantizedBeamWeights(cfg, beam, q);
    const max = Math.max(...w.amps);
    const step = max / (Math.pow(2, q.ampBits) - 1);
    for (const a of w.amps) {
      const k = a / step;
      expect(Math.abs(k - Math.round(k))).toBeLessThan(1e-5);
    }
  });

  it('el corte exacto ideal coincide con el patrón base a nadir', () => {
    const w = quantizedBeamWeights(cfg, { ...beam, u: 0, v: 0 }, { ...q, phaseBits: 0, ampBits: 0, phaseRmsDeg: 0, ampRmsDb: 0 });
    const cut = cutFromWeights(cfg, w.re, w.im, { ...beam, u: 0, v: 0 }, 1, 30, 481);
    let mid = 0;
    for (let i = 0; i < cut.length; i++) if (Math.abs(cut[i].angle) < Math.abs(cut[mid].angle)) mid = i;
    let li = mid, ri = mid;
    while (li > 0 && cut[li].db > -3) li--;
    while (ri < cut.length - 1 && cut[ri].db > -3) ri++;
    const hpbw = Math.abs(cut[ri].angle - cut[li].angle);
    const base = computeMetrics(cfg, computeBasePattern(cfg), { ...beam, u: 0, v: 0 });
    expect(hpbw).toBeGreaterThan(base.hpbwDeg - 1.5);
    expect(hpbw).toBeLessThan(base.hpbwDeg + 1.5);
  });
});
