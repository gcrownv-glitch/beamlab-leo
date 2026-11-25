import { describe, expect, it } from 'vitest';
import indexHtml from '../index.html?raw';
import { Engine } from '../src/engine';
import { defaultState } from '../src/state';
import { buildSample, type LabSample } from '../src/core/lab';
import { buildLabSheetData } from '../src/lab-sheet';

const nodeFs = (globalThis as {
  process?: { getBuiltinModule?: (id: string) => { readFileSync: (p: URL, enc: string) => string } };
}).process?.getBuiltinModule?.('node:fs');
const stylesCss = nodeFs ? nodeFs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8') : '';

describe('Tramo 5 — UX, Teoría, Móvil y Trazabilidad del Laboratorio', () => {
  it('reemplaza LaTeX crudo en index.html por elementos KaTeX inline y fórmulas actualizadas', () => {
    const withoutAttrs = indexHtml.replace(/data-tex="[^"]*"/g, '');
    expect(withoutAttrs).not.toContain('\\(');
    expect(withoutAttrs).not.toContain('\\)');
    expect(withoutAttrs).not.toContain('e^{');

    expect(indexHtml).toContain('class="math-inline" data-tex="2^b"');
    expect(indexHtml).toContain('class="math-inline" data-tex="2^a"');
    expect(indexHtml).toContain('class="math-inline" data-tex="e^{jk(x_m u_k + y_n v_k)}"');
    expect(indexHtml).toContain('97×97');
    expect(indexHtml).toContain('paso de 2 dB');
    expect(indexHtml).not.toContain('65×65');
    expect(indexHtml).not.toContain('0,5 dB');
  });

  it('mantiene accesibles los paneles en móvil <= 760 px como drawers en vez de ocultarlos con display: none', () => {
    const start = stylesCss.indexOf('@media (max-width: 760px)');
    expect(start).toBeGreaterThan(-1);
    const mobileBlock = stylesCss.slice(start);

    expect(mobileBlock).not.toMatch(/\.panel\s*\{\s*display:\s*none\s*;/);
    expect(mobileBlock).not.toMatch(/\.panel-tab\s*\{\s*display:\s*none\s*;/);
    expect(mobileBlock).toContain('.mobile-only');
    expect(mobileBlock).toContain('.modal-body');
    expect(mobileBlock).toContain('.lab-body');
  });

  it('incluye parámetros de enlace, región, C/I y tiempo orbital en configHash', () => {
    const s0 = defaultState();
    s0.mode = 'cellular';
    const d0 = new Engine(s0).derived;
    const h0 = buildSample(s0, d0).configHash;
    const hSame = buildSample(s0, d0).configHash;
    expect(hSame).toBe(h0);

    const sPtx = { ...s0, ptxW: s0.ptxW + 10 };
    expect(buildSample(sPtx, new Engine(sPtx).derived).configHash).not.toBe(h0);

    const sRegion = { ...s0, region: 'europe' as const };
    expect(buildSample(sRegion, new Engine(sRegion).derived).configHash).not.toBe(h0);

    const sCi = { ...s0, cellularCi: !s0.cellularCi };
    expect(buildSample(sCi, new Engine(sCi).derived).configHash).not.toBe(h0);

    const sTime = { ...s0, simTime: s0.simTime + 15_000 };
    expect(buildSample(sTime, new Engine(sTime).derived).configHash).not.toBe(h0);
  });

  it('buildLabSheetData prioriza todos los campos de la muestra histórica sobre el estado vivo', () => {
    const liveState = defaultState();
    liveState.antenna = {
      ...liveState.antenna,
      n: 32,
      freqGHz: 28,
      dx: 0.55,
      taper: 'kaiser30',
      q: 1,
      efficiency: 0.72,
    };
    liveState.quant = {
      mode: 'ideal',
      phaseBits: 8,
      ampBits: 6,
      phaseRmsDeg: 0,
      ampRmsDb: 0,
      seed: 99,
    };
    const liveDerived = new Engine(liveState).derived;
    liveDerived.shaped = null;

    const historicalSample: LabSample = {
      schema: 1,
      id: 'sample-hist-1',
      timestamp: '2026-11-24T12:00:00.000Z',
      appVersion: '2.3.4',
      mode: 'shaped',
      target: { lat: -12.05, lon: -77.04, label: 'target' },
      orbit: {
        altKm: 612,
        incDeg: 55.5,
        raanDeg: 42.2,
        subLatDeg: -10.5,
        subLonDeg: -75.25,
        speedKmS: 7.55,
      },
      array: {
        n: 8,
        dx: 0.5,
        dy: 0.5,
        freqGHz: 12,
        taper: 'uniform',
        q: 1,
        efficiency: 0.65,
      },
      quant: {
        mode: 'realtime',
        phaseBits: 4,
        ampBits: 3,
        phaseRmsDeg: 3,
        ampRmsDb: 0.5,
        seed: 7,
      },
      metrics: {
        directivityDbi: 24.5,
        gainDbi: 22.6,
        hpbwDeg: 11.4,
        sllDb: -13.2,
        pointingDeg: 0.34,
        note: 'Muestra histórica',
      },
      links: {
        downlink: {
          cn0DbHz: 84.1,
          cnDb: 11.2,
          modcod: 'QPSK 3/4',
          marginDb: 4.1,
          throughputMbps: 65,
          eirpDbW: 35.6,
          freqGHz: 12,
          outage: false,
        },
        uplink: {
          cn0DbHz: 79.2,
          cnDb: 6.3,
          modcod: 'QPSK 1/2',
          marginDb: 1.9,
          throughputMbps: 36,
          eirpDbW: 31.1,
          freqGHz: 14.25,
          outage: false,
        },
        selected: 'downlink',
        limiting: 'uplink',
      },
      system: {
        beams: 1,
        rfPowerW: 20,
        spectrumMHz: 36,
        capacityMbps: 36,
        perUserMbps: 3.6,
        coverage: 0.91,
      },
      shaped: {
        coverage: 0.91,
        spillDb: -12.3,
        directivityDbi: 21.4,
      },
      notes: '',
      configHash: 'deadbeef',
    };

    const sheet = buildLabSheetData(liveState, liveDerived, historicalSample);

    expect(sheet.orbit.altKm).toBe(612);
    expect(sheet.array.n).toBe(8);
    expect(sheet.array.freqGHz).toBe(12);
    expect(sheet.array.taper).toBe('uniform');
    expect(sheet.array.efficiency).toBe(0.65);

    expect(sheet.pattern.directivityDbi).toBe(24.5);
    expect(sheet.pattern.gainDbi).toBe(22.6);
    expect(sheet.pattern.hpbwDeg).toBe(11.4);
    expect(sheet.pattern.sllDb).toBe(-13.2);
    expect(sheet.pattern.phaseBits).toBe(4);
    expect(sheet.pattern.ampBits).toBe(3);
    expect(sheet.pattern.phaseRmsDeg).toBe(3);
    expect(sheet.pattern.ampRmsDb).toBe(0.5);
    expect(sheet.pattern.seed).toBe(7);
    expect(sheet.pattern.pointingDeg).toBe(0.34);

    expect(sheet.links.limiting).toBe('uplink');
    expect(sheet.links.capacityMbps).toBe(36);
    expect(sheet.links.coverage).toBe(0.91);
    expect(sheet.shaped).toEqual({
      coverage: 0.91,
      spillDb: -12.3,
      directivityDbi: 21.4,
    });
  });
});
