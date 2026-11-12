import { describe, expect, it } from 'vitest';
import { DEG, R_EARTH } from '../src/core/constants';
import { antennaBasis, horizonOffNadir, maxCentralAngle } from '../src/core/orbit';

describe('geometría de la huella y base de antena', () => {
  it('el horizonte a 550 km tiene 67° de nadir y 23° de ángulo central', () => {
    const alt = 550;
    expect((horizonOffNadir(alt) / DEG)).toBeCloseTo(67.02, 1);
    expect((maxCentralAngle(alt) / DEG)).toBeCloseTo(22.98, 1);
    expect(R_EARTH * maxCentralAngle(alt)).toBeCloseTo(2559, 0);
  });

  it('la base de antena apunta +X al este y +Z al nadir', () => {
    const f = antennaBasis({ x: R_EARTH + 550, y: 0, z: 0 });
    expect(f.z.x).toBeCloseTo(-1, 6);
    expect(f.x.y).toBeCloseTo(1, 6);
    expect(f.y.z).toBeCloseTo(-1, 6);
  });
});
