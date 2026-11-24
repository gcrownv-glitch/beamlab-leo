import { describe, expect, it } from 'vitest';
import { Engine } from '../src/engine';
import { defaultState } from '../src/state';
import { DEG } from '../src/core/constants';
import { beamsForGroundCells, cellColor } from '../src/core/coverage';
import { antennaBasis, orbitalPeriod, propagate } from '../src/core/orbit';
import { elementsOverPoint } from '../src/core/presets';
import { buildGroundCells, regionPolygon } from '../src/core/regions';

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
});
