import { describe, expect, it } from 'vitest';
import { Engine } from '../src/engine';
import { defaultState } from '../src/state';
import { uplinkFrequencyGHz } from '../src/core/link';

describe('enlace bidireccional', () => {
  it('empareja frecuencias de subida Ku/K y deja L/S iguales', () => {
    expect(uplinkFrequencyGHz(12)).toBe(14);
    expect(uplinkFrequencyGHz(20)).toBe(30);
    expect(uplinkFrequencyGHz(2.2)).toBe(2.2);
  });

  it('calcula bajada y subida para el haz activo', () => {
    const state = defaultState();
    const engine = new Engine(state);
    const d = engine.derived;
    expect(d.links.downlink).not.toBeNull();
    expect(d.links.uplink).not.toBeNull();
    expect(d.link).toBe(d.links.downlink);
    expect(d.links.downlink!.freqGHz).toBe(12);
    expect(d.links.uplink!.freqGHz).toBe(14);
    expect(d.system.limitingLink).not.toBeNull();
    expect(d.system.capacityMbps).toBeLessThanOrEqual(d.links.downlink!.throughputMbps);
    expect(d.system.capacityMbps).toBeLessThanOrEqual(d.links.uplink!.throughputMbps);
  });

  it('la potencia del terminal mueve la subida y la capacidad de sistema', () => {
    const state = defaultState();
    state.uplinkPowerW = 1;
    state.linkDirection = 'uplink';
    const engine = new Engine(state);
    const low = engine.derived;
    const lowCn = low.links.uplink!.cnDb;
    state.uplinkPowerW = 10;
    engine.update();
    const high = engine.derived;
    expect(high.links.uplink!.cnDb).toBeGreaterThan(lowCn + 8);
    expect(high.link).toBe(high.links.uplink);
    expect(high.system.capacityMbps).toBe(
      Math.min(high.links.downlink!.throughputMbps, high.links.uplink!.throughputMbps),
    );
  });

  it('con terminal isotrópico ambos enlaces quedan en outage', () => {
    const state = defaultState();
    state.rxGainDbi = 0;
    state.noiseFigureDb = 2;
    const engine = new Engine(state);
    expect(engine.derived.links.downlink!.outage).toBe(true);
    expect(engine.derived.links.uplink!.outage).toBe(true);
    expect(engine.derived.system.capacityMbps).toBe(0);
  });
});
