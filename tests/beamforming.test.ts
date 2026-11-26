import { describe, expect, it } from 'vitest';
import { Engine } from '../src/engine';
import { defaultState } from '../src/state';
import { computeBasePattern, computeGainMap, type ArrayConfig, type Beam } from '../src/core/array';
import { DEG } from '../src/core/constants';
import { beamsForGroundCells, cellColor } from '../src/core/coverage';
import { beamGroundPoint } from '../src/core/geometry';
import { antennaBasis, ecefToGeodetic, orbitalPeriod, propagate } from '../src/core/orbit';
import { elementsOverPoint } from '../src/core/presets';
import { buildGroundCells, distanceToPolygonKm, pointInPolygon, regionPolygon } from '../src/core/regions';

function oddRNeighbors(row: number, col: number): [number, number][] {
  const odd = (row & 1) === 1;
  return odd
    ? [
        [row, col - 1],
        [row, col + 1],
        [row - 1, col],
        [row - 1, col + 1],
        [row + 1, col],
        [row + 1, col + 1],
      ]
    : [
        [row, col - 1],
        [row, col + 1],
        [row - 1, col - 1],
        [row - 1, col],
        [row + 1, col - 1],
        [row + 1, col],
      ];
}

function hasAnyVisibleAlpha(rgba: Uint8Array): boolean {
  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i] > 0) return true;
  }
  return false;
}

describe('regresiones de beamforming 3D y cobertura', () => {
  it('devuelve EMPTY_GAIN cuando beams está vacío en modo puntual y celular', () => {
    const state = defaultState();
    const halfPeriodMs = orbitalPeriod(state.orbit.a) * 500;
    state.simTime = state.orbit.epoch + halfPeriodMs;
    const engine = new Engine(state);

    expect(engine.derived.beams.length).toBe(0);
    expect(engine.derived.gainMap.max).toBe(0);
    expect(hasAnyVisibleAlpha(engine.derived.gainMap.rgba)).toBe(false);

    engine.setMode('cellular');
    engine.setRegion('peru');
    engine.update(performance.now() + 5000);

    expect(engine.derived.beams.length).toBe(0);
    expect(engine.derived.gainMap.max).toBe(0);
    expect(hasAnyVisibleAlpha(engine.derived.gainMap.rgba)).toBe(false);
    expect(engine.derived.beamSet?.visibleCells).toBe(0);
    expect(engine.derived.beamSet?.coverageFraction).toBe(0);
  });

  it('conserva el haz y su huella al moverse con spotFixed = false', () => {
    const state = defaultState();
    const engine = new Engine(state);
    const t0 = performance.now() + 5000;

    engine.setSpotFixed(false);
    engine.update(t0);
    expect(engine.derived.beams.length).toBe(1);
    expect(engine.derived.gainMap.max).toBeGreaterThan(0);

    // Avanzar 180 s (~1360 km) lejos de Lima: el haz fijo al cuerpo sigue apuntando al suelo.
    state.simTime += 180_000;
    engine.invalidateBeams();
    engine.update(t0 + 2000);

    expect(engine.derived.beams.length).toBe(1);
    expect(engine.derived.gainMap.max).toBeGreaterThan(0);
    expect(hasAnyVisibleAlpha(engine.derived.gainMap.rgba)).toBe(true);
    expect(engine.derived.gainMap.snapshot?.groundFixed).toBe(false);
  });

  it('colorea malla hexagonal con reutilización 3, 4 y 7 sin colisiones entre vecinos y paso sqrt(3)/2', () => {
    for (const reuse of [3, 4, 7]) {
      for (let row = -10; row <= 10; row++) {
        for (let col = -10; col <= 10; col++) {
          const c = cellColor(row, col, reuse);
          const nbrColors = oddRNeighbors(row, col).map(([nr, nc]) => cellColor(nr, nc, reuse));
          for (const nc of nbrColors) {
            expect(nc).not.toBe(c);
          }
          if (reuse === 7) {
            expect(new Set([c, ...nbrColors]).size).toBe(7);
          }
        }
      }
    }

    const poly = regionPolygon('peru')!;
    const cells = buildGroundCells(poly, 120, 2500);
    expect(cells.length).toBeGreaterThan(10);

    // Verificar relación de paso vertical/horizontal = sqrt(3)/2 en la malla generada.
    const row0 = cells.filter((c) => c.row === cells[0].row);
    const row1 = cells.filter((c) => c.row === cells[0].row + 1);
    expect(row0.length).toBeGreaterThan(1);
    expect(row1.length).toBeGreaterThan(0);
    const dLonDeg = Math.abs(row0[1].lon - row0[0].lon) / Math.max(1, Math.abs(row0[1].col - row0[0].col));
    const dLatDeg = Math.abs(row1[0].lat - row0[0].lat);
    const minLat = Math.min(...poly.map((p) => p[0]));
    const maxLat = Math.max(...poly.map((p) => p[0]));
    const cosMid = Math.cos(((minLat + maxLat) / 2) * DEG);
    expect(dLatDeg / (dLonDeg * cosMid)).toBeCloseTo(Math.sqrt(3) / 2, 5);

    // Verificar ausencia de colisiones en beamsForGroundCells para reuse 3, 4 y 7.
    const epoch = Date.UTC(2026, 10, 10, 12, 0, 0);
    const orbit = elementsOverPoint(550, 53, -9.2, -75.0, epoch, 0, 0.0001);
    const sat = propagate(orbit, epoch);
    const frame = antennaBasis(sat.rEcef);
    const byKey = new Map(cells.map((c) => [`${c.row},${c.col}`, c]));

    for (const reuse of [3, 4, 7]) {
      const set = beamsForGroundCells(cells, sat.rEcef, frame, reuse, 10, 0.98);
      expect(set.beams.length).toBeGreaterThan(5);
      const beamByCoord = new Map(
        set.beams.map((b) => [b.label!, b.color]),
      );
      for (const c of cells) {
        const colA = beamByCoord.get(`C${c.row}-${c.col}`);
        if (colA === undefined) continue;
        for (const [nr, nc] of oddRNeighbors(c.row, c.col)) {
          const nbr = byKey.get(`${nr},${nc}`);
          if (!nbr) continue;
          const colB = beamByCoord.get(`C${nbr.row}-${nbr.col}`);
          if (colB !== undefined) {
            expect(colB).not.toBe(colA);
          }
        }
      }
    }
  });

  it('coverageFraction celular escala con visibleCells bajo visibilidad parcial', () => {
    const epoch = Date.UTC(2026, 10, 10, 12, 0, 0);
    const makeEngine = (alongDeg: number, timeOffsetMs = 0) => {
      const state = defaultState();
      state.mode = 'cellular';
      state.region = 'peru';
      state.orbit = elementsOverPoint(550, 53, -9.2, -75.0, epoch, alongDeg, 0.0001);
      state.simTime = epoch + timeOffsetMs;
      return new Engine(state);
    };

    const full = makeEngine(0);
    const partial = makeEngine(22);
    const hidden = makeEngine(0, orbitalPeriod(full.state.orbit.a) * 500);

    expect(full.derived.beamSet).not.toBeNull();
    expect(partial.derived.beamSet).not.toBeNull();
    expect(hidden.derived.beamSet).not.toBeNull();

    expect(full.derived.beamSet!.visibleCells).toBeGreaterThan(partial.derived.beamSet!.visibleCells);
    expect(partial.derived.beamSet!.visibleCells).toBeGreaterThan(0);
    expect(hidden.derived.beamSet!.visibleCells).toBe(0);

    expect(hidden.derived.beamSet!.coverageFraction).toBe(0);
    expect(partial.derived.beamSet!.coverageFraction).toBeGreaterThan(0);
    expect(partial.derived.beamSet!.coverageFraction).toBeLessThan(full.derived.beamSet!.coverageFraction);
  });

  it('adjunta snapshot ECEF, distingue conformada sin sintetizar y ajusta HPBW global con altitud', () => {
    const state = defaultState();
    const engine = new Engine(state);
    expect(engine.derived.gainMap.snapshot?.groundFixed).toBe(true);

    const t0 = performance.now() + 5000;
    engine.setMode('cellular');
    engine.setRegion('peru');
    engine.update(t0);
    expect(engine.derived.gainMap.snapshot?.groundFixed).toBe(true);

    // Conformada sin sintetizar: sin mapa de ganancia falso.
    engine.setMode('shaped');
    engine.update(t0 + 1000);
    expect(engine.derived.source).not.toBe('synthesis');
    expect(engine.derived.gainMap.max).toBe(0);

    engine.synthesizeShaped();
    engine.update(t0 + 2000);
    expect(engine.derived.source).toBe('synthesis');
    expect(engine.derived.gainMap.max).toBeGreaterThan(0);
    expect(engine.derived.gainMap.snapshot?.groundFixed).toBe(true);

    // Global: HPBW disminuye al subir la altitud (horizonte más estrecho).
    const hpbwAt = (altKm: number) => {
      const s = defaultState();
      s.mode = 'global';
      s.orbit = elementsOverPoint(altKm, 53, -12.05, -77.04, s.orbit.epoch, 0, 0.0001);
      return new Engine(s).derived.activeMetrics.hpbwDeg;
    };
    const h300 = hpbwAt(300);
    const h550 = hpbwAt(550);
    const h1500 = hpbwAt(1500);
    expect(h300).toBeGreaterThan(h550);
    expect(h550).toBeGreaterThan(h1500);
  }, 60000);

  it('usa mapa celular 512×512 con caída RF natural sin recorte poligonal ni fuga fuera del disco', () => {
    const epoch = Date.UTC(2026, 10, 26, 7, 22, 26);
    const state = defaultState();
    state.mode = 'cellular';
    state.region = 'peru';
    state.presetId = 'starlink-v15-3005';
    state.orbit = elementsOverPoint(570, 97.6, -9.2, -75.0, epoch, 0, 0.0002);
    state.simTime = epoch;

    const engine = new Engine(state);
    const map = engine.derived.gainMap;
    const poly = regionPolygon('peru')!;

    expect(engine.derived.beams.length).toBeGreaterThan(300);
    expect(map.size).toBe(512);
    expect(map.max).toBeGreaterThan(0);

    let outsideSpillCount = 0;
    let farOutsideVisibleCount = 0;
    for (let iv = 0; iv < map.size; iv += 2) {
      const v = -1 + (2 * (iv + 0.5)) / map.size;
      for (let iu = 0; iu < map.size; iu += 2) {
        const u = -1 + (2 * (iu + 0.5)) / map.size;
        const idx = iv * map.size + iu;
        if (u * u + v * v > 1) {
          expect(map.data[idx]).toBe(0);
          expect(map.rgba[idx * 4 + 3]).toBe(0);
          continue;
        }
        if (map.data[idx] > 0.05) {
          const pt = beamGroundPoint(engine.derived.sat.rEcef, engine.derived.frame, { id: 0, u, v, amp: 1, color: 0 });
          if (pt) {
            const g = ecefToGeodetic(pt);
            const latD = g.lat / DEG;
            const lonD = g.lon / DEG;
            if (!pointInPolygon(latD, lonD, poly)) {
              outsideSpillCount++;
              if (distanceToPolygonKm(latD, lonD, poly) > 160 && map.rgba[idx * 4 + 3] > 0) {
                farOutsideVisibleCount++;
              }
            }
          }
        }
      }
    }
    expect(outsideSpillCount).toBeGreaterThan(0);
    expect(farOutsideVisibleCount).toBe(0);
  });

  it('normaliza computeGainMap max en [0, 1] y suaviza alpha en fronteras entre celdas', () => {
    const cfg: ArrayConfig = {
      n: 16,
      dx: 0.5,
      dy: 0.5,
      freqGHz: 12,
      taper: 'kaiser30',
      q: 1,
      efficiency: 0.65,
    };
    const grid = computeBasePattern(cfg);
    const single: Beam[] = [{ id: 0, u: -0.055, v: 0, amp: 1, color: 0 }];
    const pair: Beam[] = [
      { id: 0, u: -0.055, v: 0, amp: 1, color: 0 },
      { id: 1, u: 0.055, v: 0, amp: 1, color: 1 },
    ];
    const mSingle = computeGainMap(grid, single, cfg.q, 129, 'max');
    const mPair = computeGainMap(grid, pair, cfg.q, 129, 'max');

    let peak = 0;
    for (let i = 0; i < mPair.data.length; i++) {
      expect(mPair.data[i]).toBeGreaterThanOrEqual(0);
      expect(mPair.data[i]).toBeLessThanOrEqual(1 + 1e-6);
      if (mPair.data[i] > peak) peak = mPair.data[i];
    }
    expect(peak).toBeCloseTo(1, 5);

    const midIdx = 64 * 129 + 64;
    expect(mPair.data[midIdx]).toBeCloseTo(mSingle.data[midIdx], 5);
    expect(mPair.rgba[midIdx * 4 + 3]).toBeLessThan(mSingle.rgba[midIdx * 4 + 3]);

    const farIdx = 64 * 129 + 90; // u ≈ +0.40, fuera de -5.8 dB del haz
    expect(mPair.rgba[farIdx * 4 + 3]).toBe(0);
  });
});
