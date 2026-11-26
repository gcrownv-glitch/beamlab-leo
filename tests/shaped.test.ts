import { describe, expect, it } from 'vitest';
import { synthesizeCoverage } from '../src/core/synthesis';
import { Engine } from '../src/engine';
import { defaultState } from '../src/state';
import {
  computeBasePattern,
  computeMetrics,
  gridDirectivity,
  type ArrayConfig,
  type Beam,
} from '../src/core/array';
import { anglesForGroundPoint } from '../src/core/geometry';
import { antennaBasis, propagate } from '../src/core/orbit';
import { elementsOverPoint } from '../src/core/presets';
import { DEG } from '../src/core/constants';
import type { DirectionSample } from '../src/core/regions';

const cfg: ArrayConfig = {
  n: 16,
  dx: 0.5,
  dy: 0.5,
  freqGHz: 12,
  taper: 'kaiser30',
  q: 1,
  efficiency: 0.65,
};
const ZERO: Beam = { id: 0, u: 0, v: 0, amp: 1, color: 0 };

describe('haz conformado con geometría real', () => {
  it('cubre una zona de 100 km sobre Lima y suprime el exterior', () => {
    const epoch = Date.UTC(2026, 10, 10, 15, 36, 9);
    const orbit = elementsOverPoint(550, 53, -12.05, -77.04, epoch, 2.5, 0.0001);
    const sat = propagate(orbit, epoch);
    const frame = antennaBasis(sat.rEcef);
    const center = anglesForGroundPoint(sat.rEcef, frame, -12.05 * DEG, -77.04 * DEG);
    const hpbw = computeMetrics(cfg, computeBasePattern(cfg), ZERO).hpbwDeg * DEG;
    const core = 100 / center.range;
    const edge = core + Math.max(0.55 * hpbw, 0.012);
    const maxR = Math.min(0.94, edge + 4 * hpbw);
    const step = Math.max(hpbw / 5, 0.0035);
    const inside: DirectionSample[] = [];
    const outside: DirectionSample[] = [];

    for (let du = -maxR; du <= maxR + 1e-9; du += step) {
      for (let dv = -maxR; dv <= maxR + 1e-9; dv += step) {
        const r = Math.hypot(du, dv);
        const u = center.u + du;
        const v = center.v + dv;
        if (u * u + v * v > 0.92) continue;
        if (r <= edge) {
          const desired = r <= core ? 1 : 0.5 * (1 + Math.cos((Math.PI * (r - core)) / (edge - core)));
          inside.push({ u, v, desired, inside: r <= core, lat: 0, lon: 0, weight: r <= core ? 4 : 2 });
        } else if (r <= maxR) {
          inside.push({ u, v, desired: 0, inside: false, lat: 0, lon: 0, weight: 0.8 });
        }
      }
    }
    for (let u = -0.9; u <= 0.9 + 1e-9; u += 0.12) {
      for (let v = -0.9; v <= 0.9 + 1e-9; v += 0.12) {
        if (u * u + v * v > 0.9) continue;
        if (Math.hypot(u - center.u, v - center.v) <= maxR) continue;
        outside.push({ u, v, desired: 0, inside: false, lat: 0, lon: 0, weight: 0.28 });
      }
    }

    const thin = <T>(arr: T[], max: number): T[] => {
      if (arr.length <= max) return arr;
      const stride = arr.length / max;
      return Array.from({ length: max }, (_, i) => arr[Math.floor(i * stride)]);
    };
    const res = synthesizeCoverage(cfg, thin(inside, 720), thin(outside, 420), 1e-2);
    const d = gridDirectivity(res.grid, 1);

    expect(res.insideCoverage).toBeGreaterThan(0.9);
    expect(res.outsideMaxDb).toBeLessThan(-12);
    expect(d).toBeGreaterThan(16);
    expect(d).toBeLessThan(28);
  }, 120000);

  it('converge en todo el rango de radios (40-400 km) para arreglos 8×8 y 16×16 sin rechazos espurios', () => {
    for (const n of [8, 16]) {
      for (const radiusKm of [40, 60, 70, 80, 100, 200, 300, 400]) {
        const state = defaultState();
        state.mode = 'shaped';
        state.antenna.n = n;
        state.shapedRadiusKm = radiusKm;
        const engine = new Engine(state);
        const info = engine.synthesizeShaped();
        expect(info.coverage, `n=${n}, r=${radiusKm}`).toBeGreaterThanOrEqual(0.5);
        if (n === 16 && radiusKm <= 200) {
          expect(info.coverage, `n=${n}, r=${radiusKm}`).toBeGreaterThanOrEqual(0.8);
        }
      }
    }
  }, 120000);

  it('converge también en zonas fuera de nadir dentro de la huella (hasta ~60° de escaneo) y rechaza caras ocultas', () => {
    const base = defaultState();
    base.mode = 'shaped';
    const baseEng = new Engine(base);
    const subLat = baseEng.derived.sat.lat / DEG;
    const subLon = baseEng.derived.sat.lon / DEG;

    const offsets: [number, number][] = [
      [3, 0],
      [6, 0],
      [9, 0],
      [-6, 6],
      [-8, -6],
      [0, 9],
    ];
    for (const [dlat, dlon] of offsets) {
      for (const radiusKm of [60, 100, 200, 350]) {
        const state = defaultState();
        state.mode = 'shaped';
        state.shapedCenter = { lat: subLat + dlat, lon: subLon + dlon };
        state.shapedRadiusKm = radiusKm;
        const engine = new Engine(state);
        const info = engine.synthesizeShaped();
        expect(info.coverage, `off-nadir d=(${dlat},${dlon}), r=${radiusKm}`).toBeGreaterThanOrEqual(0.75);
      }
    }

    const hiddenState = defaultState();
    hiddenState.mode = 'shaped';
    hiddenState.shapedCenter = { lat: -subLat, lon: subLon + 180 };
    const hiddenEng = new Engine(hiddenState);
    expect(() => hiddenEng.prepareShapedSynthesis()).toThrow(/visible/);
  }, 120000);
});
