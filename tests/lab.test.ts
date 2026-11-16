import { describe, expect, it } from 'vitest';
import { Engine } from '../src/engine';
import { defaultState } from '../src/state';
import { buildSample, createSession, samplesToCsv } from '../src/core/lab';
import { compare } from '../src/update';

describe('laboratorio', () => {
  it('construye una muestra con órbita, arreglo, enlace y cuantización', () => {
    const state = defaultState();
    const engine = new Engine(state);
    const sample = buildSample(state, engine.derived, 'prueba');
    expect(sample.mode).toBe('spot');
    expect(sample.array.n).toBe(16);
    expect(sample.quant.phaseBits).toBe(5);
    expect(sample.links.downlink).not.toBeNull();
    expect(sample.links.uplink).not.toBeNull();
    expect(sample.metrics.hpbwDeg).toBeGreaterThan(0);
    expect(sample.notes).toBe('prueba');
  });

  it('exporta CSV con cabecera y una fila por muestra', () => {
    const state = defaultState();
    const engine = new Engine(state);
    const session = createSession();
    session.samples.push(buildSample(state, engine.derived));
    const csv = samplesToCsv(session);
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('sample_id');
    expect(lines[0]).toContain('dl_cn0');
    expect(lines[1]).toContain(session.id);
  });

  it('compara versiones semánticas', () => {
    expect(compare('2.4.0', '2.3.0')).toBeGreaterThan(0);
    expect(compare('2.3.0', '2.3.0')).toBe(0);
    expect(compare('2.3.0', '2.4.0')).toBeLessThan(0);
  });
});
