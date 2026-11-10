import { DEG, J2, MU_EARTH, R_EARTH, TWO_PI } from './constants';
import { type Vec3, cross, dot, len, normalize, rotateZ, v3 } from './vec';

/** Elementos keplerianos. Los ángulos están en radianes. */
export interface OrbitElements {
  /** Semieje mayor [km] */
  a: number;
  /** Excentricidad [-] */
  e: number;
  /** Inclinación [rad] */
  i: number;
  /** Ascensión recta del nodo ascendente [rad] */
  raan: number;
  /** Argumento del perigeo [rad] */
  argp: number;
  /** Anomalía media en la época [rad] */
  M0: number;
  /** Época en milisegundos UTC */
  epoch: number;
}

export interface OrbitState {
  /** Posición ECI [km] */
  r: Vec3;
  /** Velocidad ECI [km/s] */
  v: Vec3;
  /** Posición ECEF [km] */
  rEcef: Vec3;
  /** Latitud geocéntrica [rad] */
  lat: number;
  /** Longitud [rad] */
  lon: number;
  /** Altitud sobre esfera [km] */
  alt: number;
  /** Rapidez orbital [km/s] */
  speed: number;
  /** Anomalía verdadera [rad] */
  nu: number;
  /** Anomalía media [rad] */
  M: number;
  /** Ángulo de giro sidéreo de Greenwich [rad] */
  gmst: number;
}

export const meanMotion = (a: number): number => Math.sqrt(MU_EARTH / (a * a * a));
export const orbitalPeriod = (a: number): number => TWO_PI / meanMotion(a);

/** Fecha (ms UTC) -> día juliano. */
export const julianDate = (ms: number): number => ms / 86400000 + 2440587.5;

/** Tiempo sidéreo de Greenwich (IAU 1982), en radianes. */
export function gmstRad(ms: number): number {
  const jd = julianDate(ms);
  const d = jd - 2451545.0;
  const T = d / 36525;
  let deg =
    280.46061837 +
    360.98564736629 * d +
    0.000387933 * T * T -
    (T * T * T) / 38710000;
  deg = ((deg % 360) + 360) % 360;
  return deg * DEG;
}

/** Resuelve la ecuación de Kepler M = E - e sin E. */
export function solveKepler(M: number, e: number): number {
  let m = ((M % TWO_PI) + TWO_PI) % TWO_PI;
  let E = e < 0.8 ? m : Math.PI;
  for (let k = 0; k < 24; k++) {
    const f = E - e * Math.sin(E) - m;
    const fp = 1 - e * Math.cos(E);
    const dE = f / fp;
    E -= dE;
    if (Math.abs(dE) < 1e-13) break;
  }
  return E;
}

const perifocalToEci = (x: number, y: number, i: number, raan: number, argp: number): Vec3 => {
  const cO = Math.cos(raan), sO = Math.sin(raan);
  const ci = Math.cos(i), si = Math.sin(i);
  const cw = Math.cos(argp), sw = Math.sin(argp);
  const m11 = cO * cw - sO * sw * ci;
  const m12 = -cO * sw - sO * cw * ci;
  const m21 = sO * cw + cO * sw * ci;
  const m22 = -sO * sw + cO * cw * ci;
  const m31 = sw * si;
  const m32 = cw * si;
  return {
    x: m11 * x + m12 * y,
    y: m21 * x + m22 * y,
    z: m31 * x + m32 * y,
  };
};

/** Deriva secular por J2 de los elementos angulares [rad/s]. */
export function j2Rates(a: number, e: number, i: number) {
  const n = meanMotion(a);
  const p = a * (1 - e * e);
  const k = 1.5 * J2 * (R_EARTH / p) ** 2 * n;
  const cosI = Math.cos(i);
  return {
    raanDot: -k * cosI,
    argpDot: 0.5 * k * (5 * cosI * cosI - 1),
    mDotJ2: 0.5 * k * Math.sqrt(1 - e * e) * (3 * cosI * cosI - 1),
  };
}

/** Convierte una posición ECI a ECEF (rotación por GMST). */
export const eciToEcef = (r: Vec3, ms: number): Vec3 => rotateZ(r, -gmstRad(ms));

/** Convierte una posición ECEF a ECI (rotación por GMST). */
export const ecefToEci = (r: Vec3, ms: number): Vec3 => rotateZ(r, gmstRad(ms));

/** Geodésicas esféricas -> ECEF [km]. */
export function geodeticToEcef(lat: number, lon: number, altKm = 0): Vec3 {
  const rho = R_EARTH + altKm;
  const cl = Math.cos(lat);
  return {
    x: rho * cl * Math.cos(lon),
    y: rho * cl * Math.sin(lon),
    z: rho * Math.sin(lat),
  };
}

/** ECEF -> latitud/longitud geocéntricas y altitud. */
export function ecefToGeodetic(r: Vec3): { lat: number; lon: number; alt: number } {
  const rho = len(r);
  return {
    lat: Math.asin(r.z / rho),
    lon: Math.atan2(r.y, r.x),
    alt: rho - R_EARTH,
  };
}

/** Propaga los elementos keplerianos (con deriva secular J2 opcional). */
export function propagate(el: OrbitElements, ms: number, useJ2 = true): OrbitState {
  const dt = (ms - el.epoch) / 1000;
  const n = meanMotion(el.a);
  const rates = useJ2 ? j2Rates(el.a, el.e, el.i) : { raanDot: 0, argpDot: 0, mDotJ2: 0 };

  const raan = el.raan + rates.raanDot * dt;
  const argp = el.argp + rates.argpDot * dt;
  const M = el.M0 + (n + rates.mDotJ2) * dt;

  const E = solveKepler(M, el.e);
  const cosE = Math.cos(E);
  const sinE = Math.sin(E);
  const b = el.a * Math.sqrt(1 - el.e * el.e);
  const xp = el.a * (cosE - el.e);
  const yp = b * sinE;
  const nu = Math.atan2(yp, xp);

  const p = el.a * (1 - el.e * el.e);
  const r = p / (1 + el.e * Math.cos(nu));
  const sqrtMuP = Math.sqrt(MU_EARTH / p);
  const vxp = -sqrtMuP * Math.sin(nu);
  const vyp = sqrtMuP * (el.e + Math.cos(nu));

  const rEci = perifocalToEci(xp, yp, el.i, raan, argp);
  const vEci = perifocalToEci(vxp, vyp, el.i, raan, argp);
  const rEcef = eciToEcef(rEci, ms);
  const geo = ecefToGeodetic(rEcef);

  return {
    r: rEci,
    v: vEci,
    rEcef,
    lat: geo.lat,
    lon: geo.lon,
    alt: geo.alt,
    speed: len(vEci),
    nu,
    M,
    gmst: gmstRad(ms),
  };
}

/** Altitud de apogeo [km]. */
export const apogeeAlt = (el: OrbitElements): number => el.a * (1 + el.e) - R_EARTH;
/** Altitud de perigeo [km]. */
export const perigeeAlt = (el: OrbitElements): number => el.a * (1 - el.e) - R_EARTH;

/** Ángulo central máximo visible desde la altitud dada [rad]. */
export function maxCentralAngle(altKm: number): number {
  return Math.acos(R_EARTH / (R_EARTH + altKm));
}

/** Ángulo de nadir al horizonte [rad]. */
export function horizonOffNadir(altKm: number): number {
  return Math.asin(R_EARTH / (R_EARTH + altKm));
}

/** Elevación de un punto de la superficie visto desde el satélite [rad]. */
export function elevationAngle(satEcef: Vec3, lat: number, lon: number): number {
  const g = geodeticToEcef(lat, lon);
  const up = normalize(g);
  const los = { x: satEcef.x - g.x, y: satEcef.y - g.y, z: satEcef.z - g.z };
  const d = len(los);
  return Math.asin(Math.max(-1, Math.min(1, dot(los, up) / d)));
}

/** Distancia geométrica satélite-punto [km]. */
export function slantRange(satEcef: Vec3, lat: number, lon: number): number {
  const g = geodeticToEcef(lat, lon);
  return len({ x: satEcef.x - g.x, y: satEcef.y - g.y, z: satEcef.z - g.z });
}

/**
 * Base local de la antena: +Z apunta al nadir, +X hacia el este (aprox.),
 * +Y completa la terna derecha.
 */
export function antennaBasis(satEcef: Vec3): { x: Vec3; y: Vec3; z: Vec3 } {
  const z = normalize({ x: -satEcef.x, y: -satEcef.y, z: -satEcef.z });
  let x = normalize(cross(v3(0, 0, 1), z));
  if (len(x) < 1e-6) x = v3(1, 0, 0);
  const y = cross(z, x);
  return { x, y, z };
}

/**
 * Intersección del rayo satélite + t·dir con la esfera terrestre.
 * Devuelve null si no hay intersección en el sentido del rayo.
 */
export function raySphere(
  origin: Vec3,
  dir: Vec3,
  radius = R_EARTH,
): { point: Vec3; t: number } | null {
  const b = dot(origin, dir);
  const c = dot(origin, origin) - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  let t = -b - sq;
  if (t < 0) t = -b + sq;
  if (t < 0) return null;
  return { point: { x: origin.x + dir.x * t, y: origin.y + dir.y * t, z: origin.z + dir.z * t }, t };
}

/** Trayectoria orbital ECI para dibujar (una revolución desde `ms`). */
export function orbitPathEci(el: OrbitElements, ms: number, samples = 360): Vec3[] {
  const T = orbitalPeriod(el.a) * 1000;
  const out: Vec3[] = [];
  for (let k = 0; k <= samples; k++) {
    const t = ms + (k / samples) * T;
    out.push(propagate(el, t, true).r);
  }
  return out;
}

/** Traza terrestre (lat/lon) en una ventana temporal. */
export function groundTrack(
  el: OrbitElements,
  ms: number,
  durationMs: number,
  samples = 400,
): { lat: number; lon: number; alt: number; t: number }[] {
  const out: { lat: number; lon: number; alt: number; t: number }[] = [];
  for (let k = 0; k <= samples; k++) {
    const t = ms - durationMs / 2 + (k / samples) * durationMs;
    const s = propagate(el, t, true);
    out.push({ lat: s.lat, lon: s.lon, alt: s.alt, t });
  }
  return out;
}

/** Elementos a partir de altitud circular, inclinación y ángulos. */
export function circularElements(
  altKm: number,
  incDeg: number,
  raanDeg: number,
  epoch: number,
  argpDeg = 0,
  M0Deg = 0,
): OrbitElements {
  return {
    a: R_EARTH + altKm,
    e: 0,
    i: incDeg * DEG,
    raan: raanDeg * DEG,
    argp: argpDeg * DEG,
    M0: M0Deg * DEG,
    epoch,
  };
}
