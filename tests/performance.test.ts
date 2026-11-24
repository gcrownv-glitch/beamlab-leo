import { describe, expect, it } from 'vitest';
import { TWO_PI } from '../src/core/constants';
import { patternFromWeights, type ArrayConfig } from '../src/core/array';
import { runShapedSynthesisJob } from '../src/core/synthesis';
import { Engine } from '../src/engine';
import { defaultState } from '../src/state';

import sceneTs from '../src/scene.ts?raw';
import tauriConfJson from '../src-tauri/tauri.conf.json?raw';

function naivePatternPower(
  cfg: ArrayConfig,
  re: Float32Array,
  im: Float32Array,
  du: number,
  dv: number,
): number {
  const n = cfg.n;
  let pr = 0;
  let pi = 0;
  let idx = 0;
  for (let iy = 0; iy < n; iy++) {
    const yn = (iy - (n - 1) / 2) * cfg.dy;
    for (let ix = 0; ix < n; ix++) {
      const xm = (ix - (n - 1) / 2) * cfg.dx;
      const ph = TWO_PI * (xm * du + yn * dv);
      const c = Math.cos(ph);
      const s = Math.sin(ph);
      pr += re[idx] * c - im[idx] * s;
      pi += re[idx] * s + im[idx] * c;
      idx++;
    }
  }
  return pr * pr + pi * pi;
}

describe('rendimiento y arquitectura asíncrona (Tramo 4)', () => {
  it('patternFromWeights factorizado coincide con la evaluación directa 2D (< 1e-5)', () => {
    const cfg: ArrayConfig = {
      n: 8,
      dx: 0.55,
      dy: 0.55,
      freqGHz: 12,
      taper: 'uniform',
      q: 1,
      efficiency: 0.65,
    };
    const N = cfg.n * cfg.n;
    const reRaw = new Float32Array(N);
    const imRaw = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      reRaw[i] = Math.cos(i * 0.73) * (1 + 0.3 * Math.sin(i * 1.1));
      imRaw[i] = Math.sin(i * 0.41) * (0.8 + 0.2 * Math.cos(i * 0.9));
    }
    const re = Float32Array.from(reRaw);
    const im = Float32Array.from(imRaw);
    const size = 65;
    const half = 1.05;
    const grid = patternFromWeights(cfg, re, im, size, half);

    // Calcular máximo visible en el mismo muestreo para normalizar la referencia ingenua.
    const step = (2 * half) / (size - 1);
    let maxNaive = 0;
    const rawNaive = new Float64Array(size * size);
    for (let iv = 0; iv < size; iv++) {
      const dv = -half + iv * step;
      for (let iu = 0; iu < size; iu++) {
        const du = -half + iu * step;
        const p = naivePatternPower(cfg, reRaw, imRaw, du, dv);
        rawNaive[iv * size + iu] = p;
        if (du * du + dv * dv <= 1 && p > maxNaive) maxNaive = p;
      }
    }

    let maxErr = 0;
    for (let i = 0; i < rawNaive.length; i++) {
      const expected = rawNaive[i] / maxNaive;
      maxErr = Math.max(maxErr, Math.abs(grid.power[i] - expected));
    }
    expect(maxErr).toBeLessThan(1e-5);
  });

  it('omite computeGainMap cuando showGain es false y recalcula al activarlo', () => {
    const state = defaultState();
    state.showGain = false;
    const engine = new Engine(state);
    expect(engine.derived.gainMap.max).toBe(0);

    const t0 = performance.now() + 5000;
    state.simTime += 30_000;
    engine.invalidateBeams();
    engine.update(t0);
    expect(engine.derived.beams.length).toBeGreaterThan(0);
    expect(engine.derived.gainMap.max).toBe(0);

    state.showGain = true;
    engine.update(t0 + 200);
    expect(engine.derived.gainMap.max).toBeGreaterThan(0);
  });

  it('el pipeline desacoplado prepare + runShapedSynthesisJob + apply coincide con synthesizeShaped', () => {
    const sSync = defaultState();
    sSync.mode = 'shaped';
    sSync.antenna.n = 8;
    const eSync = new Engine(sSync);
    const syncInfo = eSync.synthesizeShaped();

    const sAsync = defaultState();
    sAsync.orbit = { ...sSync.orbit };
    sAsync.simTime = sSync.simTime;
    sAsync.mode = 'shaped';
    sAsync.antenna.n = 8;
    const eAsync = new Engine(sAsync);
    const prep = eAsync.prepareShapedSynthesis();
    const out = runShapedSynthesisJob(prep.job);
    const asyncInfo = eAsync.applyShapedSynthesis(prep, out);

    expect(asyncInfo.coverage).toBeCloseTo(syncInfo.coverage, 9);
    expect(asyncInfo.spillDb).toBeCloseTo(syncInfo.spillDb, 9);
    expect(asyncInfo.directivityDb).toBeCloseTo(syncInfo.directivityDb, 9);
  });

  it('SceneView evita preserveDrawingBuffer, limpia listeners en dispose y Tauri permite worker blob', () => {
    expect(sceneTs).not.toMatch(/preserveDrawingBuffer\s*:\s*true/);
    expect(sceneTs).toContain('removeEventListener');
    expect(sceneTs).toContain('this.controls.dispose()');

    const conf = JSON.parse(tauriConfJson) as {
      app: { security: { csp: string; devCsp?: string } };
    };
    expect(conf.app.security.csp).toContain("worker-src 'self' blob:");
    expect(conf.app.security.devCsp).toContain("worker-src 'self' blob:");
  });
});
