import { C_LIGHT, TWO_PI } from './constants';

export type TaperType = 'uniform' | 'kaiser25' | 'kaiser30' | 'kaiser40' | 'hann';

export interface ArrayConfig {
  /** Número de elementos por lado (nx = ny). */
  n: number;
  /** Separación entre elementos en longitudes de onda. */
  dx: number;
  dy: number;
  /** Frecuencia de trabajo [GHz]. */
  freqGHz: number;
  taper: TaperType;
  /** Exponente del patrón de elemento: g(θ) = cos^q θ. */
  q: number;
  /** Eficiencia de antena (pérdidas óhmicas, spillover, etc.). */
  efficiency: number;
}

export interface Beam {
  id: number;
  /** Coseno director u = sinθ cosφ en el marco de la antena. */
  u: number;
  /** Coseno director v = sinθ sinφ. */
  v: number;
  /** Amplitud de excitación (voltaje). */
  amp: number;
  /** Índice de color / reutilización de frecuencia. */
  color: number;
  label?: string;
  target?: { lat: number; lon: number };
}

export interface PatternGrid {
  size: number;
  half: number;
  /** Potencia normalizada |AF|², pico = 1. */
  power: Float32Array;
  kind: 'base' | 'synthesis';
  /** Excitaciones complejas (solo para síntesis). */
  weightsRe?: Float32Array;
  weightsIm?: Float32Array;
}

export interface ArrayMetrics {
  directivityDb: number;
  gainDb: number;
  hpbwDeg: number;
  sllDb: number;
  apertureM: number;
  lambdaM: number;
  elementGainDb: number;
  grating: boolean;
}

export const wavelengthM = (freqGHz: number): number => C_LIGHT / (freqGHz * 1e9);

/** Aproximación de Bessel I0 por serie. */
function besselI0(x: number): number {
  let sum = 1;
  let term = 1;
  const y = (x * x) / 4;
  for (let k = 1; k < 40; k++) {
    term *= y / (k * k);
    sum += term;
    if (term < 1e-12 * sum) break;
  }
  return sum;
}

/** Pesos de amplitud normalizados para que la suma sea 1. */
export function taperWeights(n: number, taper: TaperType): Float64Array {
  const w = new Float64Array(n);
  if (n <= 1) {
    w[0] = 1;
    return w;
  }
  if (taper === 'uniform') {
    w.fill(1);
  } else if (taper === 'hann') {
    if (n < 3) {
      w.fill(1);
    } else {
      for (let i = 0; i < n; i++) w[i] = 0.5 * (1 - Math.cos((TWO_PI * i) / (n - 1)));
    }
  } else {
    const A = taper === 'kaiser25' ? 25 : taper === 'kaiser30' ? 30 : 40;
    const beta =
      A > 50
        ? 0.1102 * (A - 8.7)
        : 0.5842 * Math.pow(A - 21, 0.4) + 0.07886 * (A - 21);
    const denom = besselI0(beta);
    for (let i = 0; i < n; i++) {
      const t = (2 * i) / (n - 1) - 1;
      w[i] = besselI0(beta * Math.sqrt(Math.max(0, 1 - t * t))) / denom;
    }
  }
  let s = 0;
  for (let i = 0; i < n; i++) s += w[i];
  if (s > 0) for (let i = 0; i < n; i++) w[i] /= s;
  return w;
}

export function apertureMeters(cfg: ArrayConfig): { lx: number; ly: number } {
  const lambda = wavelengthM(cfg.freqGHz);
  return { lx: (cfg.n - 1) * cfg.dx * lambda, ly: (cfg.n - 1) * cfg.dy * lambda };
}

/**
 * Patrón base del arreglo en el espacio de cosenos directores.
 * Para pesos separables, AF(du,dv) = fx(du)·fy(dv), por lo que se calcula
 * en O(size·N) y luego se hace el producto externo.
 */
export function computeBasePattern(cfg: ArrayConfig, size = 801, half = 1.35): PatternGrid {
  const lambda = wavelengthM(cfg.freqGHz);
  const w = taperWeights(cfg.n, cfg.taper);
  const step = (2 * half) / (size - 1);
  const fxRe = new Float64Array(size);
  const fxIm = new Float64Array(size);
  const fyRe = new Float64Array(size);
  const fyIm = new Float64Array(size);
  const xm = new Float64Array(cfg.n);
  const yn = new Float64Array(cfg.n);
  for (let i = 0; i < cfg.n; i++) {
    xm[i] = (i - (cfg.n - 1) / 2) * cfg.dx;
    yn[i] = (i - (cfg.n - 1) / 2) * cfg.dy;
  }
  for (let j = 0; j < size; j++) {
    const du = -half + j * step;
    let re = 0, im = 0;
    for (let i = 0; i < cfg.n; i++) {
      const ph = TWO_PI * xm[i] * du;
      re += w[i] * Math.cos(ph);
      im += w[i] * Math.sin(ph);
    }
    fxRe[j] = re;
    fxIm[j] = im;
    let re2 = 0, im2 = 0;
    for (let i = 0; i < cfg.n; i++) {
      const ph = TWO_PI * yn[i] * du;
      re2 += w[i] * Math.cos(ph);
      im2 += w[i] * Math.sin(ph);
    }
    fyRe[j] = re2;
    fyIm[j] = im2;
  }
  const power = new Float32Array(size * size);
  for (let iv = 0; iv < size; iv++) {
    const py = fyRe[iv] * fyRe[iv] + fyIm[iv] * fyIm[iv];
    const row = iv * size;
    for (let iu = 0; iu < size; iu++) {
      const px = fxRe[iu] * fxRe[iu] + fxIm[iu] * fxIm[iu];
      power[row + iu] = px * py;
    }
  }
  return { size, half, power, kind: 'base' };
}

/** Muestreo bilineal del patrón en (du,dv). */
export function patternPowerAt(grid: PatternGrid, du: number, dv: number): number {
  const step = (2 * grid.half) / (grid.size - 1);
  const fx = (du + grid.half) / step;
  const fy = (dv + grid.half) / step;
  if (fx < 0 || fy < 0 || fx > grid.size - 1.001 || fy > grid.size - 1.001) return 0;
  const x0 = fx | 0;
  const y0 = fy | 0;
  const tx = fx - x0;
  const ty = fy - y0;
  const s = grid.size;
  const p00 = grid.power[y0 * s + x0];
  const p10 = grid.power[y0 * s + x0 + 1];
  const p01 = grid.power[(y0 + 1) * s + x0];
  const p11 = grid.power[(y0 + 1) * s + x0 + 1];
  const a = p00 + (p10 - p00) * tx;
  const b = p01 + (p11 - p01) * tx;
  return a + (b - a) * ty;
}

/** Potencia (relativa al pico de un haz) en la dirección (u,v), sumando haces. */
export function compositePower(grid: PatternGrid, beams: Beam[], u: number, v: number, q: number): number {
  const w2 = 1 - u * u - v * v;
  if (w2 <= 1e-6) return 0;
  let p = 0;
  for (let i = 0; i < beams.length; i++) {
    const b = beams[i];
    p += b.amp * b.amp * patternPowerAt(grid, u - b.u, v - b.v);
  }
  return p * Math.pow(w2, q);
}

export interface GainMap {
  size: number;
  /** Potencia normalizada 0..1 */
  data: Float32Array;
  max: number;
  /** Color + ganancia listos para la textura del globo (RGBA). */
  rgba: Uint8Array;
}

const BEAM_RGB: [number, number, number][] = [
  [34, 211, 238], [251, 191, 36], [244, 114, 182], [163, 230, 53],
  [167, 139, 250], [251, 146, 60], [96, 165, 250],
];

/**
 * Mapa de ganancia compuesto en el disco (u,v) ∈ [-1,1]².
 * `combine = 'max'` muestra celdas individuales (cobertura celular);
 * `'sum'` suma potencias (haz único o conformado).
 */
export function computeGainMap(
  grid: PatternGrid,
  beams: Beam[],
  q: number,
  size = 384,
  combine: 'sum' | 'max' = 'sum',
): GainMap {
  const data = new Float32Array(size * size);
  const colorIdx = new Uint8Array(size * size);
  let max = 0;
  for (let iv = 0; iv < size; iv++) {
    const v = -1 + (2 * (iv + 0.5)) / size;
    for (let iu = 0; iu < size; iu++) {
      const u = -1 + (2 * (iu + 0.5)) / size;
      const w2 = 1 - u * u - v * v;
      let p = 0;
      let ci = 0;
      if (w2 > 1e-6) {
        if (combine === 'max') {
          let best = 0;
          for (let k = 0; k < beams.length; k++) {
            const b = beams[k];
            const val = b.amp * b.amp * patternPowerAt(grid, u - b.u, v - b.v);
            if (val > best) {
              best = val;
              ci = b.color;
            }
          }
          p = best;
        } else {
          for (let k = 0; k < beams.length; k++) {
            const b = beams[k];
            p += b.amp * b.amp * patternPowerAt(grid, u - b.u, v - b.v);
          }
          ci = beams[0]?.color ?? 0;
        }
        p *= Math.pow(w2, q);
      }
      const idx = iv * size + iu;
      data[idx] = p;
      colorIdx[idx] = ci;
      if (p > max) max = p;
    }
  }
  const rgba = new Uint8Array(size * size * 4);
  if (max > 0) {
    const inv = 1 / max;
    for (let i = 0; i < data.length; i++) {
      data[i] *= inv;
      const db = 10 * Math.log10(Math.max(data[i], 1e-9));
      const a = Math.max(0, Math.min(255, Math.round(((db + 40) / 40) * 255)));
      const c = BEAM_RGB[colorIdx[i] % BEAM_RGB.length];
      rgba[i * 4] = c[0];
      rgba[i * 4 + 1] = c[1];
      rgba[i * 4 + 2] = c[2];
      rgba[i * 4 + 3] = a;
    }
  }
  return { size, data, max, rgba };
}

/** Exponente q para que una bocina tenga un HPBW dado (grados). */
export function qForHpbw(hpbwDeg: number): number {
  const half = (hpbwDeg / 2) * (Math.PI / 180);
  return Math.log(0.5) / (2 * Math.log(Math.cos(half)));
}

function rotateAround(d: [number, number, number], axis: [number, number, number], ang: number): [number, number, number] {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const dot = d[0] * axis[0] + d[1] * axis[1] + d[2] * axis[2];
  return [
    d[0] * c + (axis[1] * d[2] - axis[2] * d[1]) * s + axis[0] * dot * (1 - c),
    d[1] * c + (axis[2] * d[0] - axis[0] * d[2]) * s + axis[1] * dot * (1 - c),
    d[2] * c + (axis[0] * d[1] - axis[1] * d[0]) * s + axis[2] * dot * (1 - c),
  ];
}

/** Potencia del haz en un desplazamiento angular δ respecto a su centro. */
export function powerAtOffset(grid: PatternGrid, beam: Beam, deltaRad: number, q: number, axisSign = 1): number {
  const th = Math.acos(Math.max(-1, Math.min(1, Math.sqrt(Math.max(0, 1 - beam.u * beam.u - beam.v * beam.v)))));
  const ph = Math.atan2(beam.v, beam.u);
  const d: [number, number, number] = [
    Math.sin(th) * Math.cos(ph),
    Math.sin(th) * Math.sin(ph),
    Math.cos(th),
  ];
  let axis: [number, number, number] = [d[1], -d[0], 0];
  let al = Math.hypot(axis[0], axis[1], axis[2]);
  if (al < 1e-9) axis = [1, 0, 0];
  else axis = [axis[0] / al, axis[1] / al, 0];
  const r = rotateAround(d, axis, deltaRad * axisSign);
  const u = r[0];
  const v = r[1];
  const w2 = 1 - u * u - v * v;
  if (w2 <= 0) return 0;
  const p = patternPowerAt(grid, u - beam.u, v - beam.v);
  return p * Math.pow(w2, q);
}

export function computeMetrics(cfg: ArrayConfig, grid: PatternGrid, beam: Beam): ArrayMetrics {
  const peak = powerAtOffset(grid, beam, 0, cfg.q);
  const NTH = 180;
  const NPH = 360;
  const dth = Math.PI / 2 / NTH;
  const dph = TWO_PI / NPH;
  let integral = 0;
  for (let it = 0; it < NTH; it++) {
    const th = (it + 0.5) * dth;
    const st = Math.sin(th);
    const ct = Math.cos(th);
    const w2 = ct * ct;
    for (let ip = 0; ip < NPH; ip++) {
      const ph = (ip + 0.5) * dph;
      const u = st * Math.cos(ph);
      const v = st * Math.sin(ph);
      const p = patternPowerAt(grid, u - beam.u, v - beam.v) * Math.pow(w2, cfg.q);
      integral += p * st;
    }
  }
  integral *= dth * dph;
  const directivity = integral > 0 ? (4 * Math.PI * peak) / integral : 0;
  const directivityDb = 10 * Math.log10(Math.max(directivity, 1e-9));
  const gainDb = directivityDb + 10 * Math.log10(Math.max(cfg.efficiency, 1e-6));

  // HPBW: barrido fino alrededor del centro del haz, interpolando el cruce -3 dB.
  const step = 0.0005;
  const halfWidth = (sign: number): number => {
    let prev = peak;
    for (let k = 1; k < 4000; k++) {
      const d = k * step;
      const p = powerAtOffset(grid, beam, d, cfg.q, sign);
      if (p < peak / 2) {
        const frac = (prev - peak / 2) / Math.max(1e-12, prev - p);
        return (k - 1 + frac) * step;
      }
      prev = p;
    }
    return (30 * Math.PI) / 180;
  };
  const hpbw = (halfWidth(-1) + halfWidth(1)) * (180 / Math.PI);

  // SLL: máximo lóbulo lateral, empezando después del primer nulo del lóbulo principal.
  let sll = 0;
  const scanMax = Math.min(Math.PI / 2.5, Math.max(0.45, (hpbw * 3 * Math.PI) / 180));
  for (let k = 0; k < 1400; k++) {
    const d = scanMax * (k / 1399);
    if (d * (180 / Math.PI) < hpbw * 1.25) continue;
    sll = Math.max(sll, powerAtOffset(grid, beam, d, cfg.q, 1), powerAtOffset(grid, beam, d, cfg.q, -1));
  }
  const sllDb = 10 * Math.log10(Math.max(sll, 1e-9) / Math.max(peak, 1e-12));

  const ap = apertureMeters(cfg);
  return {
    directivityDb,
    gainDb,
    hpbwDeg: hpbw,
    sllDb,
    apertureM: Math.max(ap.lx, ap.ly),
    lambdaM: wavelengthM(cfg.freqGHz),
    elementGainDb: 10 * Math.log10(Math.max(4 * cfg.q + 2, 1e-6)),
    grating: Math.max(cfg.dx, cfg.dy) > 0.5,
  };
}

/** Fases y amplitudes por elemento para un haz (para el mapa de fase). */
export function beamPhaseMap(cfg: ArrayConfig, beam: Beam): { phases: Float64Array; amps: Float64Array } {
  const phases = new Float64Array(cfg.n * cfg.n);
  const amps = new Float64Array(cfg.n * cfg.n);
  const w = taperWeights(cfg.n, cfg.taper);
  for (let iy = 0; iy < cfg.n; iy++) {
    const yn = (iy - (cfg.n - 1) / 2) * cfg.dy;
    for (let ix = 0; ix < cfg.n; ix++) {
      const xm = (ix - (cfg.n - 1) / 2) * cfg.dx;
      let ph = -TWO_PI * (xm * beam.u + yn * beam.v);
      ph = Math.atan2(Math.sin(ph), Math.cos(ph));
      phases[iy * cfg.n + ix] = ph;
      amps[iy * cfg.n + ix] = w[ix] * w[iy];
    }
  }
  return { phases, amps };
}

/** Corte del patrón (dB) alrededor del centro del haz. */
export function patternCut(
  grid: PatternGrid,
  beam: Beam,
  q: number,
  spanDeg: number,
  samples = 401,
): { angle: number; db: number }[] {
  const peak = powerAtOffset(grid, beam, 0, q);
  const out: { angle: number; db: number }[] = [];
  const span = (spanDeg * Math.PI) / 180;
  for (let i = 0; i < samples; i++) {
    const d = -span + (2 * span * i) / (samples - 1);
    const p = powerAtOffset(grid, beam, Math.abs(d), q, d >= 0 ? 1 : -1);
    out.push({ angle: (d * 180) / Math.PI, db: 10 * Math.log10(Math.max(p, 1e-9) / Math.max(peak, 1e-12)) });
  }
  return out;
}

/** Crea la grilla de patrón a partir de excitaciones complejas (síntesis). */
export function patternFromWeights(
  cfg: ArrayConfig,
  re: Float32Array,
  im: Float32Array,
  size = 257,
  half = 2.2,
): PatternGrid {
  const step = (2 * half) / (size - 1);
  const power = new Float32Array(size * size);
  const n = cfg.n;
  const xm = new Float64Array(n);
  const yn = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    xm[i] = (i - (n - 1) / 2) * cfg.dx;
    yn[i] = (i - (n - 1) / 2) * cfg.dy;
  }
  // Bases trigonométricas por fila/columna: evita recalcular senos y cosenos
  // para cada elemento en cada punto de la grilla.
  const cx = new Float64Array(n);
  const sx = new Float64Array(n);
  const cy = new Float64Array(n);
  const sy = new Float64Array(n);
  let max = 0;
  for (let iv = 0; iv < size; iv++) {
    const dv = -half + iv * step;
    for (let iy = 0; iy < n; iy++) {
      const phy = TWO_PI * yn[iy] * dv;
      cy[iy] = Math.cos(phy);
      sy[iy] = Math.sin(phy);
    }
    const row = iv * size;
    for (let iu = 0; iu < size; iu++) {
      const du = -half + iu * step;
      for (let ix = 0; ix < n; ix++) {
        const phx = TWO_PI * xm[ix] * du;
        cx[ix] = Math.cos(phx);
        sx[ix] = Math.sin(phx);
      }
      let pr = 0;
      let pi = 0;
      let idx = 0;
      for (let iy = 0; iy < n; iy++) {
        const cyv = cy[iy];
        const syv = sy[iy];
        for (let ix = 0; ix < n; ix++) {
          const c = cx[ix] * cyv - sx[ix] * syv;
          const s = sx[ix] * cyv + cx[ix] * syv;
          pr += re[idx] * c - im[idx] * s;
          pi += re[idx] * s + im[idx] * c;
          idx++;
        }
      }
      const p = pr * pr + pi * pi;
      power[row + iu] = p;
      if (p > max) max = p;
    }
  }
  if (max > 0) {
    const inv = 1 / max;
    for (let i = 0; i < power.length; i++) power[i] *= inv;
    const sv = 1 / Math.sqrt(max);
    for (let i = 0; i < re.length; i++) {
      re[i] *= sv;
      im[i] *= sv;
    }
  }
  return { size, half, power, kind: 'synthesis', weightsRe: re, weightsIm: im };
}

/** Dirección del máximo de un patrón absoluto dentro del disco visible. */
export function peakDirection(grid: PatternGrid): { u: number; v: number; power: number } {
  let best = { u: 0, v: 0, power: 0 };
  for (let u = -0.95; u <= 0.95; u += 0.005) {
    for (let v = -0.95; v <= 0.95; v += 0.005) {
      if (u * u + v * v > 0.9) continue;
      const p = patternPowerAt(grid, u, v);
      if (p > best.power) best = { u, v, power: p };
    }
  }
  return best;
}

/** Directividad de un patrón absoluto (grilla ya referida a u,v). */
export function gridDirectivity(grid: PatternGrid, q: number): number {
  const NTH = 180;
  const NPH = 360;
  const dth = Math.PI / 2 / NTH;
  const dph = TWO_PI / NPH;
  let integral = 0;
  for (let it = 0; it < NTH; it++) {
    const th = (it + 0.5) * dth;
    const st = Math.sin(th);
    const w2 = Math.cos(th) * Math.cos(th);
    for (let ip = 0; ip < NPH; ip++) {
      const ph = (ip + 0.5) * dph;
      const p = patternPowerAt(grid, st * Math.cos(ph), st * Math.sin(ph)) * Math.pow(w2, q);
      integral += p * st;
    }
  }
  integral *= dth * dph;
  return 10 * Math.log10(Math.max(4 * Math.PI / Math.max(integral, 1e-12), 1e-9));
}

/** Corte exacto del patrón a partir de pesos complejos, sin interpolar la grilla 2D. */
export interface PatternCutPoint {
  angle: number;
  db: number;
}

export function cutFromWeights(
  cfg: ArrayConfig,
  re: Float32Array,
  im: Float32Array,
  beam: Beam,
  q: number,
  spanDeg = 30,
  samples = 481,
): PatternCutPoint[] {
  const w0 = Math.sqrt(Math.max(0, 1 - beam.u * beam.u - beam.v * beam.v));
  const d: [number, number, number] = [beam.u, beam.v, w0];
  let axis: [number, number, number] = [beam.v, -beam.u, 0];
  const al = Math.hypot(axis[0], axis[1], axis[2]);
  axis = al > 1e-9 ? [axis[0] / al, axis[1] / al, 0] : [1, 0, 0];

  const afAt = (u: number, v: number): number => {
    const w2 = 1 - u * u - v * v;
    if (w2 <= 1e-9) return 0;
    let pr = 0;
    let pi = 0;
    let idx = 0;
    for (let iy = 0; iy < cfg.n; iy++) {
      const yn = (iy - (cfg.n - 1) / 2) * cfg.dy;
      for (let ix = 0; ix < cfg.n; ix++) {
        const xm = (ix - (cfg.n - 1) / 2) * cfg.dx;
        const ph = TWO_PI * (xm * u + yn * v);
        const c = Math.cos(ph);
        const s = Math.sin(ph);
        pr += re[idx] * c - im[idx] * s;
        pi += re[idx] * s + im[idx] * c;
        idx++;
      }
    }
    return (pr * pr + pi * pi) * Math.pow(w2, q);
  };

  const peak = afAt(d[0], d[1]);
  const span = (spanDeg * Math.PI) / 180;
  const out: PatternCutPoint[] = [];
  for (let i = 0; i < samples; i++) {
    const delta = -span + (2 * span * i) / (samples - 1);
    const r = rotateAround(d, axis, delta);
    const p = afAt(r[0], r[1]);
    out.push({
      angle: (delta * 180) / Math.PI,
      db: 10 * Math.log10(Math.max(p, 1e-12) / Math.max(peak, 1e-12)),
    });
  }
  return out;
}

export function patternCutAt(
  grid: PatternGrid,
  u0: number,
  v0: number,
  q: number,
  spanDeg: number,
  samples = 401,
): { angle: number; db: number }[] {
  const w0 = Math.sqrt(Math.max(0, 1 - u0 * u0 - v0 * v0));
  const d: [number, number, number] = [u0, v0, w0];
  let axis: [number, number, number] = [v0, -u0, 0];
  const al = Math.hypot(axis[0], axis[1], axis[2]);
  axis = al > 1e-9 ? [axis[0] / al, axis[1] / al, 0] : [1, 0, 0];
  const span = (spanDeg * Math.PI) / 180;
  const out: { angle: number; db: number }[] = [];
  for (let i = 0; i < samples; i++) {
    const delta = -span + (2 * span * i) / (samples - 1);
    const r = rotateAround(d, axis, delta);
    const w2 = 1 - r[0] * r[0] - r[1] * r[1];
    const p = w2 > 0 ? patternPowerAt(grid, r[0], r[1]) * Math.pow(w2, q) : 0;
    out.push({ angle: (delta * 180) / Math.PI, db: 10 * Math.log10(Math.max(p, 1e-12)) });
  }
  return out;
}
