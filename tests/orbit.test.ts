import { describe, expect, it } from 'vitest';
import {
  circularElements,
  elevationAngle,
  geodeticToEcef,
  gmstRad,
  julianDate,
  meanMotion,
  orbitalPeriod,
  propagate,
} from '../src/core/orbit';
import { elementsOverPoint } from '../src/core/presets';
import { DEG, R_EARTH } from '../src/core/constants';

describe('tiempo y marcos', () => {
  it('JD de J2000', () => {
    expect(julianDate(Date.UTC(2000, 0, 1, 12))).toBeCloseTo(2451545.0, 6);
  });

  it('GMST en J2000 ≈ 280.4606°', () => {
    const g = gmstRad(Date.UTC(2000, 0, 1, 12)) / DEG;
    expect(g).toBeCloseTo(280.4606, 3);
  });

  it('lat/lon de un punto geodésico', () => {
    const p = geodeticToEcef(-12.05 * DEG, -77.04 * DEG);
    expect(Math.hypot(p.x, p.y, p.z)).toBeCloseTo(R_EARTH, 6);
    expect(Math.asin(p.z / R_EARTH) / DEG).toBeCloseTo(-12.05, 6);
    expect(Math.atan2(p.y, p.x) / DEG).toBeCloseTo(-77.04, 6);
  });
});

describe('órbita kepleriana', () => {
  it('ISS circular: rapidez y período', () => {
    const a = R_EARTH + 420;
    expect(Math.sqrt(398600.4418 / a)).toBeCloseTo(7.66, 1);
    expect(orbitalPeriod(a) / 60).toBeCloseTo(92.6, 0);
    expect(meanMotion(a)).toBeGreaterThan(0);
  });

  it('propaga en la época sin error', () => {
    const epoch = Date.UTC(2026, 10, 10, 0, 0, 0);
    const el = circularElements(550, 53, 120, epoch, 0, 30);
    const s = propagate(el, epoch);
    expect(Math.hypot(s.r.x, s.r.y, s.r.z)).toBeCloseTo(el.a, 6);
    expect(s.speed).toBeCloseTo(Math.sqrt(398600.4418 / el.a), 6);
  });

  it('pasa por Lima en la época', () => {
    const epoch = Date.UTC(2026, 10, 10, 0, 0, 0);
    const el = elementsOverPoint(550, 53, -12.05, -77.04, epoch, 0);
    const s = propagate(el, epoch);
    expect(s.lat / DEG).toBeCloseTo(-12.05, 6);
    expect(s.lon / DEG).toBeCloseTo(-77.04, 6);
    expect(s.alt).toBeCloseTo(550, 3);
  });

  it('J2 produce deriva nodal', () => {
    const epoch = Date.UTC(2026, 0, 1);
    const el = circularElements(550, 53, 0, epoch);
    const a = propagate(el, epoch, true);
    const b = propagate(el, epoch + 86400000, true);
    // Tras un día, Ω cambia varios grados.
    expect(Math.abs(b.r.x - a.r.x) + Math.abs(b.r.y - a.r.y)).toBeGreaterThan(10);
  });

  it('elevación positiva sobre el punto subsatelital', () => {
    const epoch = Date.UTC(2026, 10, 10);
    const el = circularElements(550, 53, 0, epoch);
    const s = propagate(el, epoch);
    expect(elevationAngle(s.rEcef, s.lat, s.lon) / DEG).toBeCloseTo(90, 0);
  });
});
