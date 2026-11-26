import { describe, expect, it } from 'vitest';
import indexHtml from '../index.html?raw';
import { geoOrbitAtLongitude, ORBIT_PRESETS, orbitForPreset, presetById } from '../src/core/presets';
import { orbitalPeriod, propagate } from '../src/core/orbit';
import { buildGroundCells, PERU_CITIES, regionPolygon } from '../src/core/regions';
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

  it('perfiles realistas de la flota Amazonas GEO cubren Américas/LatAm/Atlántico con haces múltiples y enlace positivo', () => {
    const epoch = Date.UTC(2026, 10, 26, 7, 0, 0);
    for (const id of ['amazonas-2', 'amazonas-3', 'amazonas-5', 'amazonas-nexus']) {
      const p = presetById(id);
      expect(p.payload, `falta payload realista en ${id}`).toBeDefined();
      const pay = p.payload!;
      const st = defaultState();
      st.presetId = id;
      st.orbit = orbitForPreset(p, epoch);
      st.simTime = epoch;
      st.mode = id === 'amazonas-2' ? 'shaped' : 'cellular';
      st.region = pay.region;
      st.shapedRegion = pay.shapedRegion ?? 'circle';
      st.reuse = pay.reuse;
      st.ptxW = pay.ptxW;
      if (pay.bandwidthMHz) st.bandwidthMHz = pay.bandwidthMHz;
      st.antenna = { ...st.antenna, n: pay.n, dx: pay.dx, dy: pay.dx, q: pay.q, taper: pay.taper, freqGHz: pay.freqGHz };

      const eng = new Engine(st);
      if (id === 'amazonas-2') {
        expect(p.allowedModes).not.toContain('cellular');
        const info = eng.synthesizeShaped();
        eng.update();
        expect(info.coverage).toBeGreaterThanOrEqual(0.65);
      } else {
        expect(p.allowedModes).toContain('cellular');
        expect(eng.derived.beams.length, `${id} haces`).toBeGreaterThanOrEqual(8);
        if (id === 'amazonas-5') expect(eng.derived.beams.length).toBeGreaterThanOrEqual(24);
      }
      expect(eng.derived.gainMap.uvHalf ?? 1).toBeLessThan(0.25);
      expect(eng.derived.gainMap.max).toBeGreaterThan(0);
      expect(eng.derived.links.downlink?.outage, `${id} enlace bajada`).toBe(false);
      expect(eng.derived.links.downlink?.cnDb ?? -99, `${id} C/N`).toBeGreaterThan(2);
    }

    // Ranura GEO libre (ej. 30°O Eur-Am) posiciona el satélite sobre esa longitud ecuatorial
    const eurOrbit = geoOrbitAtLongitude(-30, epoch);
    const satEur = propagate(eurOrbit, epoch, false);
    expect((satEur.lon * 180) / Math.PI).toBeCloseTo(-30, 0);
    expect((satEur.lat * 180) / Math.PI).toBeCloseTo(0, 1);
  }, 30000);

  it('incluye las principales ciudades del Perú sincronizadas entre PERU_CITIES e index.html', () => {
    expect(PERU_CITIES.length).toBeGreaterThanOrEqual(12);
    for (const city of PERU_CITIES) {
      expect(city.lat).toBeGreaterThan(-19);
      expect(city.lat).toBeLessThan(0);
      expect(city.lon).toBeGreaterThan(-82);
      expect(city.lon).toBeLessThan(-68);
    }
    for (const selectId of ['spot-city', 'shape-city']) {
      const m = indexHtml.match(new RegExp(`<select id="${selectId}">([\\s\\S]*?)<\\/select>`));
      expect(m, `falta select #${selectId}`).not.toBeNull();
      const ids = Array.from(m![1].matchAll(/<option value="([^"]+)"/g)).map((x) => x[1]).filter((v) => v !== 'custom');
      expect(new Set(ids)).toEqual(new Set(PERU_CITIES.map((c) => c.id)));
    }
  });

  it('restringe modos reales de Starlink, activa DTC banda S en 31005 y mantiene cobertura continua en ruta', () => {
    const epoch = Date.UTC(2026, 10, 26, 7, 0, 0);
    for (const id of ['starlink-1007', 'starlink-3005', 'starlink-31005', 'starlink-40001']) {
      const p = presetById(id);
      expect(p.allowedModes).toEqual(['cellular', 'spot']);
      expect(p.payload?.region).toBe('visible');
      expect(p.payload?.spotAutoTrack).toBe(true);
    }
    expect(presetById('starlink-31005').payload?.freqGHz).toBeCloseTo(2.2, 2);

    // En ruta (region='visible'), STARLINK-3005 mantiene haces y cambia de ciudad/ubicación a lo largo de la órbita
    const p3005 = presetById('starlink-3005');
    const st = defaultState();
    st.presetId = 'starlink-3005';
    st.orbit = orbitForPreset(p3005, epoch);
    st.mode = 'cellular';
    st.region = 'visible';
    const eng = new Engine(st);
    const locations = new Set<string>();
    for (const dtMin of [0, 20, 45]) {
      st.simTime = epoch + dtMin * 60_000;
      eng.invalidateBeams();
      eng.update(performance.now() + dtMin * 1000 + 2000);
      expect(eng.derived.beams.length).toBeGreaterThan(15);
      expect(eng.derived.servedLocation).toBeTruthy();
      locations.add(eng.derived.servedLocation!);
    }
    expect(locations.size).toBeGreaterThanOrEqual(2);

    // Auto-apuntado puntual en ruta: 1 haz válido en todo el recorrido
    eng.setMode('spot');
    eng.setSpotAutoTrack(true);
    for (const dtMin of [0, 20, 45]) {
      st.simTime = epoch + dtMin * 60_000;
      eng.invalidateBeams();
      eng.update(performance.now() + dtMin * 1000 + 5000);
      expect(eng.derived.beams.length).toBe(1);
      expect(eng.derived.servedLocation).toBeTruthy();
    }
  });

  it('utiliza textura diurna 4K de NASA (earth_day.jpg > 700 KB)', () => {
    const nodeFs = (globalThis as {
      process?: { getBuiltinModule?: (id: string) => { statSync: (p: URL) => { size: number } } };
    }).process?.getBuiltinModule?.('node:fs');
    if (nodeFs) {
      const stat = nodeFs.statSync(new URL('../public/assets/earth_day.jpg', import.meta.url));
      expect(stat.size).toBeGreaterThan(700_000);
    }
  });
});
