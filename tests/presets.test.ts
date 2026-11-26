import { describe, expect, it } from 'vitest';
import indexHtml from '../index.html?raw';
import { ORBIT_PRESETS, orbitForPreset, presetById } from '../src/core/presets';
import { orbitalPeriod, propagate } from '../src/core/orbit';
import { buildGroundCells, regionPolygon } from '../src/core/regions';
import { Engine } from '../src/engine';
import { defaultState } from '../src/state';

describe('Catálogo de satélites Starlink (V1.0–V3) y flota GEO Amazonas', () => {
  it('incluye todas las unidades Starlink solicitadas (V1.0, V1.5, V2 Mini, V2 Full, V3) y flota Amazonas GEO', () => {
    const required: Array<{ id: string; norad?: number; minAlt: number; maxAlt: number }> = [
      { id: 'starlink-1007', norad: 44713, minAlt: 500, maxAlt: 560 },
      { id: 'starlink-2150', norad: 47751, minAlt: 500, maxAlt: 560 },
      { id: 'starlink-3005', norad: 49131, minAlt: 520, maxAlt: 580 },
      { id: 'starlink-5241', norad: 55623, minAlt: 500, maxAlt: 560 },
      { id: 'starlink-30001', norad: 55693, minAlt: 500, maxAlt: 560 },
      { id: 'starlink-31005', norad: 58695, minAlt: 340, maxAlt: 380 },
      { id: 'starlink-v2-sim', minAlt: 320, maxAlt: 360 },
      { id: 'starlink-40001', minAlt: 450, maxAlt: 520 },
      { id: 'starlink-40012', minAlt: 330, maxAlt: 370 },
      { id: 'amazonas-2', norad: 35942, minAlt: 35780, maxAlt: 35790 },
      { id: 'amazonas-3', norad: 39078, minAlt: 35780, maxAlt: 35790 },
      { id: 'amazonas-5', norad: 42934, minAlt: 35780, maxAlt: 35790 },
      { id: 'amazonas-nexus', norad: 55508, minAlt: 35780, maxAlt: 35790 },
    ];

    for (const item of required) {
      const p = ORBIT_PRESETS.find((x) => x.id === item.id);
      expect(p, `falta preset ${item.id}`).toBeDefined();
      if (item.norad !== undefined) expect(p!.noradId).toBe(item.norad);
      expect(p!.altKm).toBeGreaterThanOrEqual(item.minAlt);
      expect(p!.altKm).toBeLessThanOrEqual(item.maxAlt);
    }
  });

  it('sincroniza exactamente las opciones de #orbit-preset en index.html con ORBIT_PRESETS', () => {
    const selectMatch = indexHtml.match(/<select id="orbit-preset">([\s\S]*?)<\/select>/);
    expect(selectMatch).not.toBeNull();
    const htmlIds = Array.from(selectMatch![1].matchAll(/<option value="([^"]+)"/g)).map((m) => m[1]);
    const presetIds = ORBIT_PRESETS.map((p) => p.id);

    expect(new Set(htmlIds)).toEqual(new Set(presetIds));
    expect(htmlIds.length).toBe(presetIds.length);
  });

  it('Amazonas 3 (GEO 61°O) permanece geoestacionario y opera correctamente en enlace y modo celular', () => {
    const epoch = Date.UTC(2026, 10, 26, 7, 0, 0);
    const amazonas3 = presetById('amazonas-3');
    const orbit = orbitForPreset(amazonas3, epoch);

    const periodH = orbitalPeriod(orbit.a) / 3600;
    expect(periodH).toBeCloseTo(23.93, 1);

    const s0 = propagate(orbit, epoch, false);
    const s6h = propagate(orbit, epoch + 6 * 3600 * 1000, false);
    expect((s0.lon * 180) / Math.PI).toBeCloseTo(-61, 0);
    expect((s6h.lon * 180) / Math.PI).toBeCloseTo(-61, 0);
    expect(s0.alt).toBeCloseTo(35786, -2);

    const st = defaultState();
    st.presetId = 'amazonas-3';
    st.orbit = orbit;
    st.simTime = epoch;
    st.mode = 'global';
    const engGlobal = new Engine(st);
    expect(engGlobal.derived.activeMetrics.hpbwDeg).toBeCloseTo(17.4, 0);
    expect(Number.isFinite(engGlobal.derived.link?.cnDb ?? NaN)).toBe(true);
    expect(Number.isFinite(engGlobal.derived.link?.throughputMbps ?? NaN)).toBe(true);

    // En modo celular sobre Perú, buildGroundCells debe entregar al menos 1 celda aunque el haz GEO sea amplio
    const cellsPeru = buildGroundCells(regionPolygon('peru')!, 8000);
    expect(cellsPeru.length).toBeGreaterThanOrEqual(1);
    engGlobal.setMode('cellular');
    engGlobal.setRegion('peru');
    engGlobal.update();
    expect(engGlobal.derived.beams.length).toBeGreaterThanOrEqual(1);
  });

  it('STARLINK-3005 (polar V1.5) y STARLINK-40012 (V3 VLEO 350 km) propagan con física válida', () => {
    const epoch = Date.UTC(2026, 10, 26, 7, 0, 0);
    const polar = propagate(orbitForPreset(presetById('starlink-3005'), epoch), epoch, false);
    const vleo = propagate(orbitForPreset(presetById('starlink-40012'), epoch), epoch, false);

    expect(polar.alt).toBeCloseTo(570, -1);
    expect(vleo.alt).toBeCloseTo(350, -1);
    expect(vleo.speed).toBeGreaterThan(polar.speed);
  });
});
