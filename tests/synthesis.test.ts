import { describe, expect, it } from 'vitest';
import { synthesizeCoverage } from '../src/core/synthesis';
import { gridDirectivity, type ArrayConfig } from '../src/core/array';
import type { DirectionSample } from '../src/core/regions';

const cfg: ArrayConfig = {
  n: 16,
  dx: 0.5,
  dy: 0.5,
  freqGHz: 12,
  taper: 'uniform',
  q: 1,
  efficiency: 1,
};

function softTarget(core: number, edge: number) {
  const inside: DirectionSample[] = [];
  const outside: DirectionSample[] = [];
  for (let u = -edge; u <= edge + 1e-9; u += 0.008) {
    for (let v = -edge; v <= edge + 1e-9; v += 0.008) {
      const r = Math.hypot(u, v);
      if (r > edge) continue;
      const d = r <= core ? 1 : 0.5 * (1 + Math.cos((Math.PI * (r - core)) / (edge - core)));
      inside.push({
        u, v, desired: d, inside: r <= core, lat: 0, lon: 0,
        weight: r <= core ? 4 : 2,
      });
    }
  }
  for (let u = -0.9; u <= 0.9 + 1e-9; u += 0.08) {
    for (let v = -0.9; v <= 0.9 + 1e-9; v += 0.08) {
      const r = Math.hypot(u, v);
      if (r <= edge + 0.04 || r > 0.9) continue;
      outside.push({ u, v, desired: 0, inside: false, lat: 0, lon: 0, weight: 1 });
    }
  }
  return { inside, outside };
}

describe('síntesis de cobertura', () => {
  it('cubre una zona con transición suave y suprime fuera', () => {
    const { inside, outside } = softTarget(0.04, 0.12);
    const res = synthesizeCoverage(cfg, inside, outside);
    expect(res.insideCoverage).toBeGreaterThan(0.85);
    expect(res.outsideMaxDb).toBeLessThan(-7);
    expect(res.grid.kind).toBe('synthesis');
    expect(res.re.length).toBe(256);
    expect(gridDirectivity(res.grid, 1)).toBeGreaterThan(20);
  }, 60000);
});
