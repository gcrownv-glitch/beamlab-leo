import { TWO_PI } from './constants';
import {
  type ArrayConfig,
  type PatternGrid,
  type Beam,
  compositePower,
  patternFromWeights,
} from './array';
import type { DirectionSample } from './regions';

export interface SynthesisResult {
  re: Float32Array;
  im: Float32Array;
  grid: PatternGrid;
  insideCoverage: number;
  insideMeanDb: number;
  outsideMaxDb: number;
  conditionNote: string;
}

/**
 * Síntesis de cobertura por mínimos cuadrados complejos.
 *
 * Se busca w que haga AF(u,v) ≈ 1 dentro de la región y ≈ 0 fuera:
 *   min_w ||A w - d||² + λ||w||²
 * cuya solución son las ecuaciones normales (AᴴA + λI) w = Aᴴd.
 * A es la matriz de fases del arreglo evaluada en cada punto de la Tierra.
 */
export function synthesizeCoverage(
  cfg: ArrayConfig,
  inside: DirectionSample[],
  outside: DirectionSample[],
  lambdaFactor = 1e-4,
): SynthesisResult {
  const L = cfg.n * cfg.n;
  if (L > 400) {
    throw new Error('La síntesis está limitada a arreglos de hasta 20×20 elementos.');
  }
  if (inside.length < 8) {
    throw new Error('La región no tiene suficientes puntos visibles desde el satélite.');
  }

  const xm = new Float64Array(cfg.n);
  const yn = new Float64Array(cfg.n);
  for (let i = 0; i < cfg.n; i++) {
    xm[i] = (i - (cfg.n - 1) / 2) * cfg.dx;
    yn[i] = (i - (cfg.n - 1) / 2) * cfg.dy;
  }

  // Solo triángulo superior; luego se refleja con conjugación.
  const hr = new Float64Array(L * L);
  const hi = new Float64Array(L * L);
  const br = new Float64Array(L);
  const bi = new Float64Array(L);
  const ar = new Float64Array(L);
  const ai = new Float64Array(L);

  const samples = [...inside, ...outside];
  for (const s of samples) {
    const w2 = Math.max(1e-6, 1 - s.u * s.u - s.v * s.v);
    const g = Math.max(Math.pow(w2, cfg.q / 2), 0.25);
    let k = 0;
    for (let iy = 0; iy < cfg.n; iy++) {
      for (let ix = 0; ix < cfg.n; ix++) {
        const ph = TWO_PI * (xm[ix] * s.u + yn[iy] * s.v);
        ar[k] = Math.cos(ph);
        ai[k] = Math.sin(ph);
        k++;
      }
    }
    const desired = s.desired > 0 ? s.desired / g : 0;
    const sw = Math.max(s.weight, 0);
    const target = desired * sw;
    for (let l = 0; l < L; l++) {
      br[l] += ar[l] * target;
      bi[l] += -ai[l] * target;
    }
    for (let l1 = 0; l1 < L; l1++) {
      const r1 = ar[l1], i1 = ai[l1];
      const row = l1 * L;
      for (let l2 = l1; l2 < L; l2++) {
        hr[row + l2] += (r1 * ar[l2] + i1 * ai[l2]) * sw;
        hi[row + l2] += (r1 * ai[l2] - i1 * ar[l2]) * sw;
      }
    }
  }

  // Reflejo hermítico del triángulo superior.
  for (let i = 0; i < L; i++) {
    for (let j = i + 1; j < L; j++) {
      hr[j * L + i] = hr[i * L + j];
      hi[j * L + i] = -hi[i * L + j];
    }
  }

  let avgDiag = 0;
  for (let i = 0; i < L; i++) avgDiag += hr[i * L + i];
  avgDiag /= L;
  const lambda = Math.max(avgDiag * lambdaFactor, 1e-9);
  for (let i = 0; i < L; i++) hr[i * L + i] += lambda;

  // Gradiente conjugado sobre el sistema hermítico definido positivo H·w = b.
  // Es más robusto numéricamente que una factorización directa para este caso.
  const wr = new Float64Array(L);
  const wi = new Float64Array(L);
  const rr = Float64Array.from(br);
  const ri = Float64Array.from(bi);
  const pr = Float64Array.from(br);
  const pi = Float64Array.from(bi);
  const apr = new Float64Array(L);
  const api = new Float64Array(L);
  let rsOld = 0;
  for (let i = 0; i < L; i++) rsOld += rr[i] * rr[i] + ri[i] * ri[i];
  const rs0 = Math.max(rsOld, 1e-30);
  let iterations = 0;
  for (let iter = 0; iter < 600; iter++) {
    iterations = iter + 1;
    for (let i = 0; i < L; i++) {
      let sr = 0, si = 0;
      const row = i * L;
      for (let j = 0; j < L; j++) {
        const a = hr[row + j], b = hi[row + j];
        sr += a * pr[j] - b * pi[j];
        si += a * pi[j] + b * pr[j];
      }
      apr[i] = sr;
      api[i] = si;
    }
    let pHp = 0;
    for (let i = 0; i < L; i++) pHp += pr[i] * apr[i] + pi[i] * api[i];
    if (pHp <= 1e-18) break;
    const alpha = rsOld / pHp;
    let rsNew = 0;
    for (let i = 0; i < L; i++) {
      wr[i] += alpha * pr[i];
      wi[i] += alpha * pi[i];
      rr[i] -= alpha * apr[i];
      ri[i] -= alpha * api[i];
      rsNew += rr[i] * rr[i] + ri[i] * ri[i];
    }
    if (rsNew < rs0 * 1e-18) break;
    const beta = rsNew / rsOld;
    for (let i = 0; i < L; i++) {
      pr[i] = rr[i] + beta * pr[i];
      pi[i] = ri[i] + beta * pi[i];
    }
    rsOld = rsNew;
  }
  void iterations;

  let maxAmp = 0;
  for (let i = 0; i < L; i++) maxAmp = Math.max(maxAmp, Math.hypot(wr[i], wi[i]));
  if (maxAmp > 0) {
    for (let i = 0; i < L; i++) {
      wr[i] /= maxAmp;
      wi[i] /= maxAmp;
    }
  }

  const re = Float32Array.from(wr);
  const im = Float32Array.from(wi);
  const grid = patternFromWeights(cfg, re, im);

  // Evaluación de la cobertura sintetizada.
  const beam: Beam = { id: 0, u: 0, v: 0, amp: 1, color: 0 };
  let covered = 0;
  let sumDb = 0;
  let insideCount = 0;
  for (const s of inside) {
    if (!s.inside) continue;
    insideCount++;
    const p = compositePower(grid, [beam], s.u, s.v, cfg.q);
    const db = 10 * Math.log10(Math.max(p, 1e-12));
    if (db >= -3) covered++;
    sumDb += db;
  }
  let outsideMaxDb = -Infinity;
  for (const s of outside) {
    const p = compositePower(grid, [beam], s.u, s.v, cfg.q);
    outsideMaxDb = Math.max(outsideMaxDb, 10 * Math.log10(Math.max(p, 1e-12)));
  }

  return {
    re,
    im,
    grid,
    insideCoverage: covered / Math.max(1, insideCount),
    insideMeanDb: sumDb / Math.max(1, insideCount),
    outsideMaxDb,
    conditionNote: `λ=${lambda.toExponential(1)} · ${inside.length} puntos internos`,
  };
}
