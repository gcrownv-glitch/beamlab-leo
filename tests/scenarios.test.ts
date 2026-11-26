import { describe, expect, it } from 'vitest';
import { DEG } from '../src/core/constants';
import { reflectorGainDbi, reflectorHpbwDeg } from '../src/core/link';
import { computePassWindows, observerLookAngles, propagate, radialDoppler } from '../src/core/orbit';
import {
  buildScenarioSetup,
  DEFAULT_OBSERVER,
  orbitForScenario,
  REPORT_PASS_EPOCH_MS,
} from '../src/core/scenarios';
import { Engine } from '../src/engine';
import { defaultState } from '../src/state';

function engineForScenario(
  id: 'report-amazonas5' | 'report-starlink11200' | 'report-nr-ntn',
  variant: 'ku-backhaul' | 'ka-34beams' | 'ref-2ghz' | 'pcs-g' | 'n255' | 'n256',
  offsetSec = 0,
): Engine {
  const s = defaultState();
  const cfg = buildScenarioSetup(id, variant, DEFAULT_OBSERVER, 'moving');
  s.scenarioId = id;
  s.scenarioVariant = variant;
  s.scenarioObserver = DEFAULT_OBSERVER;
  s.presetId = cfg.presetId;
  s.orbit = cfg.orbit;
  s.simTime = cfg.simTime + offsetSec * 1000;
  s.playing = cfg.playing;
  s.mode = cfg.mode;
  s.region = cfg.region;
  s.reuse = cfg.reuse;
  s.spotTarget = cfg.spotTarget;
  s.spotFixed = cfg.spotFixed;
  s.spotAutoTrack = cfg.spotAutoTrack;
  s.antenna.freqGHz = cfg.freqGHz;
  s.antenna.n = cfg.n;
  s.antenna.dx = cfg.dx;
  s.antenna.dy = cfg.dx;
  s.antenna.q = cfg.q;
  s.ptxW = cfg.ptxW;
  s.uplinkPowerW = cfg.uplinkPowerW;
  s.terminalId = cfg.terminalId;
  s.rxGainDbi = cfg.rxGainDbi;
  s.noiseFigureDb = cfg.noiseFigureDb;
  s.bandwidthMHz = cfg.bandwidthMHz;
  return new Engine(s);
}

describe('Escenarios LTE y 5G del informe técnico (Quilca 16.7°S, 72.4°O)', () => {
  it('mantiene el arranque por defecto sin escenario activo para no alterar otros modos', () => {
    const s = defaultState();
    expect(s.scenarioId).toBeNull();
    const eng = new Engine(s);
    expect(eng.derived.scenario).toBeNull();
  });

  it('Escenario A (Amazonas 5 GEO 61°O): reproduce apuntamiento exacto desde Quilca y balance Ku (Tablas 11 y Ec. 3-21)', () => {
    const eng = engineForScenario('report-amazonas5', 'ku-backhaul');
    const sc = eng.derived.scenario!;
    expect(sc).not.toBeNull();
    expect(sc.azimuthDeg).toBeCloseTo(35.06, 1);
    expect(sc.elevationDeg).toBeCloseTo(66.40, 1);
    expect(sc.slantKm).toBeCloseTo(36241.92, 0);
    expect(sc.delayMs).toBeCloseTo(120.89, 1);

    expect(reflectorGainDbi(3, 0.55, 12)).toBeCloseTo(48.94, 1);
    expect(reflectorHpbwDeg(3, 12)).toBeCloseTo(0.58, 1);

    expect(sc.fsplDb).toBeCloseTo(205.22, 1);
    expect(sc.rxPowerDbw).toBeCloseTo(-112.28, 1);
    expect(sc.gtDbK).toBeCloseTo(27.18, 1);
    expect(sc.cnDb).toBeCloseTo(19.00, 1);
    expect(sc.cn0DbHz).toBeCloseTo(94.56, 1);
    expect(sc.baseStationLocation).toContain('tierra');

    // Conmutación a 34 haces puntuales en banda Ka
    const engKa = engineForScenario('report-amazonas5', 'ka-34beams');
    expect(engKa.derived.beams.length).toBeGreaterThanOrEqual(20);
    expect(engKa.derived.scenario?.variantId).toBe('ka-34beams');
  });

  it('Escenario B (STARLINK-11200 [DTC]): reproduce geometría de paso, ventana ≥10°, Doppler ±42.26 kHz y subida UE sobre Quilca', () => {
    const obsLat = DEFAULT_OBSERVER.lat * DEG;
    const obsLon = DEFAULT_OBSERVER.lon * DEG;
    const orbit = orbitForScenario('report-starlink11200', DEFAULT_OBSERVER, REPORT_PASS_EPOCH_MS);

    // Pico del paso sobre Quilca
    const peakEng = engineForScenario('report-starlink11200', 'ref-2ghz', 0);
    const scPeak = peakEng.derived.scenario!;
    expect(scPeak.elevationDeg).toBeCloseTo(37.16, 1);
    expect(scPeak.slantKm).toBeCloseTo(574.91, 0);
    expect(scPeak.fsplDb).toBeCloseTo(153.66, 0);
    expect(scPeak.delayMs).toBeCloseTo(1.92, 1);
    expect(Math.abs(scPeak.dopplerHz)).toBeLessThan(500);
    expect(scPeak.cn0DbHz).toBeCloseTo(57.94, 0);
    expect(scPeak.cnDb).toBeCloseTo(5.39, 0);
    expect(scPeak.baseStationLocation).toContain('órbita');

    // Extremos ±2.5 min (acercamiento y alejamiento)
    const preEng = engineForScenario('report-starlink11200', 'ref-2ghz', -150);
    const postEng = engineForScenario('report-starlink11200', 'ref-2ghz', 150);
    const scPre = preEng.derived.scenario!;
    const scPost = postEng.derived.scenario!;

    expect(scPre.elevationDeg).toBeGreaterThan(10.5);
    expect(scPre.elevationDeg).toBeLessThan(14.0);
    expect(scPre.slantKm).toBeGreaterThan(1160);
    expect(scPre.slantKm).toBeLessThan(1290);
    expect(scPre.fsplDb).toBeGreaterThan(159.7);
    expect(scPre.fsplDb).toBeLessThan(160.8);
    expect(scPre.delayMs).toBeGreaterThan(3.85);
    expect(scPre.delayMs).toBeLessThan(4.30);
    expect(scPre.dopplerHz / 1000).toBeGreaterThan(40.0);
    expect(scPre.dopplerHz / 1000).toBeLessThan(44.5);
    expect(scPost.dopplerHz / 1000).toBeLessThan(-40.0);
    expect(scPost.dopplerHz / 1000).toBeGreaterThan(-44.5);
    expect(scPre.cn0DbHz).toBeCloseTo(51.39, 0);
    expect(scPre.cnDb).toBeCloseTo(-1.16, 0);

    // Ventana geométrica con máscara de 10° ≈ 5.57 min
    const win = computePassWindows(orbit, REPORT_PASS_EPOCH_MS, obsLat, obsLon, [0, 10, 20, 30], 420, 2);
    expect(win.windowsMin[10]).toBeGreaterThan(5.2);
    expect(win.windowsMin[10]).toBeLessThan(5.95);

    // Validación directa de orbital look + Doppler centrado
    const satNow = propagate(orbit, REPORT_PASS_EPOCH_MS - 150_000, true);
    const look = observerLookAngles(satNow.rEcef, obsLat, obsLon);
    const dop = radialDoppler(orbit, REPORT_PASS_EPOCH_MS - 150_000, obsLat, obsLon, 2.0, 2, true);
    expect(look.elevationDeg).toBeCloseTo(scPre.elevationDeg, 2);
    expect(dop.dopplerHz).toBeCloseTo(scPre.dopplerHz, 1);

    // Variante PCS G (5 MHz)
    const engPcs = engineForScenario('report-starlink11200', 'pcs-g', 0);
    expect(engPcs.derived.scenario?.bandSummary).toContain('1910–1915');
    expect(engPcs.derived.scenario?.bandSummary).toContain('1990–1995');
  });

  it('Escenario C (5G NR-NTN transparente Rel-17): bandas n255/n256, doble enlace servicio+alimentación y SIB19', () => {
    const engN255 = engineForScenario('report-nr-ntn', 'n255', -120);
    const sc = engN255.derived.scenario!;
    expect(sc.baseStationLocation).toContain('gNB en tierra');
    expect(sc.bandSummary).toContain('1626.5–1660.5');
    expect(sc.bandSummary).toContain('1525–1559');
    expect(sc.feeder).not.toBeNull();
    expect(sc.feeder!.freqGHz).toBe(28.0);
    expect(sc.feeder!.totalDelayMs).toBeGreaterThan(sc.delayMs);
    expect(sc.sib19).not.toBeNull();
    expect(sc.sib19!.enabled).toBe(true);
    expect(Math.abs(sc.dopplerHz)).toBeLessThan(150);
    expect(Math.abs(sc.rawDopplerHz)).toBeGreaterThan(5000);

    // Al desactivar SIB19 se expone el desplazamiento Doppler geométrico sin compensar
    engN255.setScenarioState({ scenarioSib19: false });
    engN255.update();
    const scNoSib = engN255.derived.scenario!;
    expect(scNoSib.sib19!.enabled).toBe(false);
    expect(Math.abs(scNoSib.dopplerHz)).toBeCloseTo(Math.abs(scNoSib.rawDopplerHz), 1);

    // Banda n256 (S)
    const engN256 = engineForScenario('report-nr-ntn', 'n256', 0);
    expect(engN256.derived.scenario?.bandSummary).toContain('1980–2010');
    expect(engN256.derived.scenario?.bandSummary).toContain('2170–2200');
  });
});
