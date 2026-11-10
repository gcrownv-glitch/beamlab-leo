import { R_EARTH } from './constants';
import { type Vec3, cross, dot, len, normalize, sub, v3 } from './vec';
import type { Beam } from './array';
import { raySphere } from './orbit';

export interface AntennaFrame {
  x: Vec3;
  y: Vec3;
  z: Vec3;
}

export interface GroundAngles {
  u: number;
  v: number;
  w: number;
  theta: number;
  phi: number;
  visible: boolean;
}

/** Dirección (θ,φ) en el marco de la antena -> vector unitario ECEF. */
export function directionFromAngles(frame: AntennaFrame, theta: number, phi: number): Vec3 {
  const st = Math.sin(theta);
  return normalize({
    x: frame.x.x * st * Math.cos(phi) + frame.y.x * st * Math.sin(phi) + frame.z.x * Math.cos(theta),
    y: frame.x.y * st * Math.cos(phi) + frame.y.y * st * Math.sin(phi) + frame.z.y * Math.cos(theta),
    z: frame.x.z * st * Math.cos(phi) + frame.y.z * st * Math.sin(phi) + frame.z.z * Math.cos(theta),
  });
}

/** Vector unitario ECEF -> cosenos directores y ángulos en el marco de antena. */
export function anglesFromDirection(frame: AntennaFrame, dir: Vec3): GroundAngles {
  const u = dot(dir, frame.x);
  const v = dot(dir, frame.y);
  const w = dot(dir, frame.z);
  return {
    u,
    v,
    w,
    theta: Math.acos(Math.max(-1, Math.min(1, w))),
    phi: Math.atan2(v, u),
    visible: w > 0,
  };
}

/** Punto de la superficie -> dirección y cosenos directores vistos por el satélite. */
export function anglesForGroundPoint(
  satEcef: Vec3,
  frame: AntennaFrame,
  lat: number,
  lon: number,
): GroundAngles & { point: Vec3; range: number } {
  const rho = R_EARTH;
  const point = {
    x: rho * Math.cos(lat) * Math.cos(lon),
    y: rho * Math.cos(lat) * Math.sin(lon),
    z: rho * Math.sin(lat),
  };
  const vec = sub(point, satEcef);
  const range = len(vec);
  return { ...anglesFromDirection(frame, normalize(vec)), point, range };
}

/** Dirección (θ,φ) -> punto de intersección con la Tierra (o null). */
export function groundPointForAngles(
  satEcef: Vec3,
  frame: AntennaFrame,
  theta: number,
  phi: number,
): { point: Vec3; t: number; dir: Vec3 } | null {
  const dir = directionFromAngles(frame, theta, phi);
  const hit = raySphere(satEcef, dir);
  if (!hit) return null;
  return { ...hit, dir };
}

/** Punto de intersección para un haz dado (dirección u,v). */
export function beamGroundPoint(satEcef: Vec3, frame: AntennaFrame, beam: Beam): Vec3 | null {
  const w = Math.sqrt(Math.max(0, 1 - beam.u * beam.u - beam.v * beam.v));
  const dir = normalize({
    x: frame.x.x * beam.u + frame.y.x * beam.v + frame.z.x * w,
    y: frame.x.y * beam.u + frame.y.y * beam.v + frame.z.y * w,
    z: frame.x.z * beam.u + frame.y.z * beam.v + frame.z.z * w,
  });
  const hit = raySphere(satEcef, dir);
  return hit ? hit.point : null;
}

/**
 * Anillo de contorno de un haz sobre la Tierra.
 * @param radiusRad semiángulo del cono (por ejemplo, HPBW/2).
 */
export function footprintRing(
  satEcef: Vec3,
  frame: AntennaFrame,
  beam: Beam,
  radiusRad: number,
  samples = 72,
): Vec3[] {
  const w = Math.sqrt(Math.max(0, 1 - beam.u * beam.u - beam.v * beam.v));
  const d = normalize({
    x: frame.x.x * beam.u + frame.y.x * beam.v + frame.z.x * w,
    y: frame.x.y * beam.u + frame.y.y * beam.v + frame.z.y * w,
    z: frame.x.z * beam.u + frame.y.z * beam.v + frame.z.z * w,
  });
  let e1 = normalize(cross(d, frame.z));
  if (len(e1) < 1e-6) e1 = normalize(cross(d, frame.x));
  const e2 = normalize(cross(d, e1));
  const pts: Vec3[] = [];
  for (let k = 0; k < samples; k++) {
    const a = (2 * Math.PI * k) / samples;
    const dir = normalize({
      x: d.x * Math.cos(radiusRad) + (e1.x * Math.cos(a) + e2.x * Math.sin(a)) * Math.sin(radiusRad),
      y: d.y * Math.cos(radiusRad) + (e1.y * Math.cos(a) + e2.y * Math.sin(a)) * Math.sin(radiusRad),
      z: d.z * Math.cos(radiusRad) + (e1.z * Math.cos(a) + e2.z * Math.sin(a)) * Math.sin(radiusRad),
    });
    const hit = raySphere(satEcef, dir);
    if (hit) pts.push(hit.point);
  }
  return pts;
}

/** Ángulo central Tierra entre dos puntos de la superficie [rad]. */
export function centralAngleBetween(a: Vec3, b: Vec3): number {
  const na = normalize(a);
  const nb = normalize(b);
  return Math.acos(Math.max(-1, Math.min(1, dot(na, nb))));
}

/** Distancia sobre la superficie terrestre [km]. */
export function surfaceDistanceKm(a: Vec3, b: Vec3): number {
  return centralAngleBetween(a, b) * R_EARTH;
}

/** Punto de la superficie a partir de lat/lon (km ECEF). */
export function surfacePoint(lat: number, lon: number): Vec3 {
  return {
    x: R_EARTH * Math.cos(lat) * Math.cos(lon),
    y: R_EARTH * Math.cos(lat) * Math.sin(lon),
    z: R_EARTH * Math.sin(lat),
  };
}

/** Vector "arriba" local en un punto. */
export const upAt = (p: Vec3): Vec3 => normalize(p);

/** Este local aproximado. */
export const eastAt = (p: Vec3): Vec3 => normalize(cross(v3(0, 0, 1), normalize(p)));
