import { DEG, TWO_PI } from './constants';
import { taperWeights, type ArrayConfig, type Beam } from './array';

export interface QuantConfig {
  phaseBits: number;
  /** 0 = taper fijo, sin VGA; 3–6 = cuantización de amplitud. */
  ampBits: number;
  phaseRmsDeg: number;
  ampRmsDb: number;
  seed: number;
}

export interface QuantizedWeights {
  re: Float32Array;
  im: Float32Array;
  phases: Float64Array;
  amps: Float64Array;
  idealPhases: Float64Array;
  idealAmps: Float64Array;
}

const wrap = (p: number): number => Math.atan2(Math.sin(p), Math.cos(p));

/** PRNG determinista y barato (mulberry32), sembrado por elemento. */
function seededRandom(seed: number, index: number): number {
  let a = (seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  a = (a + 0x6d2b79f5) >>> 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Gaussiana estándar determinista (Box–Muller). */
function gaussian(seed: number, index: number): number {
  const u1 = Math.max(1e-12, seededRandom(seed, index * 2));
  const u2 = seededRandom(seed, index * 2 + 1);
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(TWO_PI * u2);
}

export function phaseStep(bits: number): number {
  return TWO_PI / Math.pow(2, Math.max(1, Math.min(8, Math.round(bits))));
}

export function quantizePhase(phase: number, bits: number): number {
  if (!Number.isFinite(bits) || bits <= 0) return wrap(phase);
  const step = phaseStep(bits);
  return wrap(Math.round(phase / step) * step);
}

/**
 * Cuantiza una amplitud relativa al máximo del arreglo. Con 0 bits se deja
 * continua (taper fijo); con n bits se usan 2^n niveles entre 0 y el máximo.
 */
export function quantizeAmplitude(amp: number, maxAmp: number, bits: number): number {
  if (!Number.isFinite(bits) || bits <= 0 || maxAmp <= 0) return amp;
  const levels = Math.pow(2, Math.round(bits)) - 1;
  if (levels <= 0) return amp;
  const step = maxAmp / levels;
  return Math.round(Math.max(0, amp) / step) * step;
}

function residualPhase(seed: number, index: number, rmsDeg: number): number {
  return rmsDeg > 0 ? gaussian(seed, index) * rmsDeg * DEG : 0;
}

function residualAmp(seed: number, index: number, rmsDb: number): number {
  return rmsDb > 0 ? Math.pow(10, (gaussian(seed, index + 7919) * rmsDb) / 20) : 1;
}

/**
 * Pesos complejos de un haz de barrido, con error residual, cuantización de
 * fase y (opcionalmente) de amplitud. Todo es determinista para una semilla.
 */
export function quantizedBeamWeights(cfg: ArrayConfig, beam: Beam, q: QuantConfig): QuantizedWeights {
  const n = cfg.n;
  const N = n * n;
  const w = taperWeights(n, cfg.taper);
  const re = new Float32Array(N);
  const im = new Float32Array(N);
  const phases = new Float64Array(N);
  const amps = new Float64Array(N);
  const idealPhases = new Float64Array(N);
  const idealAmps = new Float64Array(N);
  let maxAmp = 0;

  for (let iy = 0; iy < n; iy++) {
    const yn = (iy - (n - 1) / 2) * cfg.dy;
    for (let ix = 0; ix < n; ix++) {
      const xm = (ix - (n - 1) / 2) * cfg.dx;
      const k = iy * n + ix;
      const a0 = w[ix] * w[iy];
      const p0 = wrap(-TWO_PI * (xm * beam.u + yn * beam.v));
      const a = a0 * residualAmp(q.seed, k, q.ampRmsDb);
      const p = wrap(p0 + residualPhase(q.seed, k + 104729, q.phaseRmsDeg));
      idealPhases[k] = p0;
      idealAmps[k] = a0;
      amps[k] = a;
      phases[k] = p;
      if (a > maxAmp) maxAmp = a;
    }
  }

  for (let k = 0; k < N; k++) {
    const aq = quantizeAmplitude(amps[k], maxAmp, q.ampBits);
    const pq = quantizePhase(phases[k], q.phaseBits);
    amps[k] = aq;
    phases[k] = pq;
    re[k] = aq * Math.cos(pq);
    im[k] = aq * Math.sin(pq);
  }
  return { re, im, phases, amps, idealPhases, idealAmps };
}

/** Cuantiza pesos complejos arbitrarios (por ejemplo, la síntesis conformada). */
export function quantizedComplexWeights(
  cfg: ArrayConfig,
  reIn: Float32Array | Float64Array,
  imIn: Float32Array | Float64Array,
  q: QuantConfig,
): QuantizedWeights {
  const N = cfg.n * cfg.n;
  const re = new Float32Array(N);
  const im = new Float32Array(N);
  const phases = new Float64Array(N);
  const amps = new Float64Array(N);
  const idealPhases = new Float64Array(N);
  const idealAmps = new Float64Array(N);
  let maxAmp = 0;
  for (let k = 0; k < N; k++) {
    const a0 = Math.hypot(reIn[k], imIn[k]);
    const p0 = Math.atan2(imIn[k], reIn[k]);
    const a = a0 * residualAmp(q.seed, k, q.ampRmsDb);
    const p = wrap(p0 + residualPhase(q.seed, k + 104729, q.phaseRmsDeg));
    idealAmps[k] = a0;
    idealPhases[k] = p0;
    amps[k] = a;
    phases[k] = p;
    if (a > maxAmp) maxAmp = a;
  }
  for (let k = 0; k < N; k++) {
    const aq = quantizeAmplitude(amps[k], maxAmp, q.ampBits);
    const pq = quantizePhase(phases[k], q.phaseBits);
    amps[k] = aq;
    phases[k] = pq;
    re[k] = aq * Math.cos(pq);
    im[k] = aq * Math.sin(pq);
  }
  return { re, im, phases, amps, idealPhases, idealAmps };
}

export function quantBitsLabel(phaseBits: number, ampBits: number): string {
  const p = `${phaseBits} bit${phaseBits === 1 ? '' : 's'} fase`;
  const a = ampBits > 0 ? `${ampBits} bit${ampBits === 1 ? '' : 's'} amp` : 'amplitud fija';
  return `${p} · ${a}`;
}
