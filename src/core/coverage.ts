import { DEG, R_EARTH } from './constants';
import type { Beam } from './array';
import { type AntennaFrame, anglesForGroundPoint, beamGroundPoint } from './geometry';
import { ecefToGeodetic, elevationAngle, horizonOffNadir } from './orbit';
import type { Vec3 } from './vec';
import type { GroundCell } from './regions';

export const cellColor = (row: number, col: number, reuse: number): number =>
  (((col - row) % reuse) + reuse) % reuse;

/** Separación entre celdas en la superficie, a partir del HPBW y la altitud. */
export function cellSpacingKm(altKm: number, hpbwDeg: number): number {
  const hpbw = hpbwDeg * DEG;
  // Diámetro de la huella a nadir ≈ 2·h·tan(HPBW/2), con celdas que solapan ~10%.
  return Math.max(18, 2 * altKm * Math.tan(hpbw / 2) * 0.9);
}

/** Radio aproximado de la huella -3 dB a nadir [km]. */
export function footprintRadiusKm(altKm: number, hpbwDeg: number): number {
  return altKm * Math.tan((hpbwDeg * DEG) / 2);
}

export interface BeamSet {
  beams: Beam[];
  visibleCells: number;
  totalCells: number;
}

/**
 * Haces puntuales fijos a Tierra: cada celda conserva su lat/lon y el satélite
 * recalcula la fase necesaria para seguir apuntándola mientras la ve.
 */
export function beamsForGroundCells(
  cells: GroundCell[],
  satEcef: Vec3,
  frame: AntennaFrame,
  reuse: number,
  minElevDeg = 10,
  maxScanFactor = 0.97,
): BeamSet {
  const horizon = horizonOffNadir(Math.max(1, Math.hypot(satEcef.x, satEcef.y, satEcef.z) - R_EARTH));
  const beams: Beam[] = [];
  let visible = 0;
  for (const c of cells) {
    const ang = anglesForGroundPoint(satEcef, frame, c.lat * DEG, c.lon * DEG);
    if (ang.w <= 0.05) continue;
    const elev = elevationAngle(satEcef, c.lat * DEG, c.lon * DEG);
    if (elev < minElevDeg * DEG) continue;
    if (ang.theta > horizon * maxScanFactor) continue;
    visible++;
    beams.push({
      id: beams.length,
      u: ang.u,
      v: ang.v,
      amp: 1,
      color: cellColor(c.row, c.col, reuse),
      label: `C${c.row}-${c.col}`,
      target: { lat: c.lat, lon: c.lon },
    });
  }
  return { beams, visibleCells: visible, totalCells: cells.length };
}

/** Rejilla hexagonal de haces fija al satélite (modo "disco visible"). */
export function beamsVisibleLattice(
  satEcef: Vec3,
  frame: AntennaFrame,
  hpbwDeg: number,
  reuse: number,
  maxBeams = 400,
): Beam[] {
  const alt = Math.hypot(satEcef.x, satEcef.y, satEcef.z) - R_EARTH;
  const horizon = horizonOffNadir(alt) * 0.96;
  const du = (hpbwDeg * DEG) * 0.88;
  const dv = du * Math.sqrt(3) / 2;
  const nMax = Math.ceil(Math.sin(horizon) / du) + 2;
  const beams: Beam[] = [];
  for (let j = -nMax; j <= nMax; j++) {
    for (let i = -nMax; i <= nMax; i++) {
      const u = (i + 0.5 * (j & 1)) * du;
      const v = j * dv;
      if (u * u + v * v > Math.sin(horizon) ** 2) continue;
      const w = Math.sqrt(Math.max(0, 1 - u * u - v * v));
      const pt = beamGroundPoint(satEcef, frame, { id: 0, u, v, amp: 1, color: 0 });
      if (!pt) continue;
      const geo = ecefToGeodetic(pt);
      beams.push({
        id: beams.length,
        u,
        v,
        amp: 1,
        color: ((i - j) % reuse + reuse) % reuse,
        label: `${j + nMax}-${i + nMax}`,
        target: { lat: geo.lat / DEG, lon: geo.lon / DEG },
      });
      if (beams.length >= maxBeams) return beams;
    }
  }
  return beams;
}

/** Apunta un haz a un punto de la Tierra; devuelve null si no es visible. */
export function beamToTarget(
  satEcef: Vec3,
  frame: AntennaFrame,
  latDeg: number,
  lonDeg: number,
  color = 0,
): { beam: Beam; elevationDeg: number; rangeKm: number } | null {
  const ang = anglesForGroundPoint(satEcef, frame, latDeg * DEG, lonDeg * DEG);
  if (ang.w <= 0.02) return null;
  const elev = elevationAngle(satEcef, latDeg * DEG, lonDeg * DEG);
  if (elev <= 0) return null;
  return {
    beam: {
      id: 0,
      u: ang.u,
      v: ang.v,
      amp: 1,
      color,
      label: 'Haz puntual',
      target: { lat: latDeg, lon: lonDeg },
    },
    elevationDeg: elev / DEG,
    rangeKm: ang.range,
  };
}
