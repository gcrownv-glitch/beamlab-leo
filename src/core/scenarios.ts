import { DEG, R_EARTH } from './constants';
import {
  fsplDb,
  linkBudget,
  reflectorGainDbi,
  reflectorHpbwDeg,
} from './link';
import {
  computePassWindows,
  elementsForPassPeak,
  observerLookAngles,
  radialDoppler,
  type OrbitElements,
  type OrbitState,
} from './orbit';
import { geoOrbitAtLongitude } from './presets';
import type { Beam } from './array';
import type { Mode, SimState, TerminalId } from '../state';
import type { RegionId } from './regions';

export type ScenarioId = 'report-amazonas5' | 'report-starlink11200' | 'report-nr-ntn';

export type ScenarioVariantId =
  | 'ku-backhaul'
  | 'ka-34beams'
  | 'ref-2ghz'
  | 'pcs-g'
  | 'n255'
  | 'n256';

export type ScenarioBeamTracking = 'moving' | 'fixed-cell';

export interface ScenarioObserver {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

export interface ScenarioRouteNode {
  label: string;
  sub: string;
  role: 'ue' | 'bs-ground' | 'bs-orbit' | 'sat-relay' | 'gateway' | 'core';
  linkAfter?: {
    kind: 'terrestrial' | 'sat-service' | 'sat-backhaul' | 'sat-feeder' | 'isl';
    label: string;
  };
}

export interface ScenarioFeederTelemetry {
  gatewayName: string;
  lat: number;
  lon: number;
  freqGHz: number;
  azimuthDeg: number;
  elevationDeg: number;
  slantKm: number;
  delayMs: number;
  fsplDb: number;
  totalDelayMs: number;
}

export interface ScenarioSib19Info {
  enabled: boolean;
  rawDopplerHz: number;
  residualDopplerHz: number;
  timingAdvanceMs: number;
  status: string;
}

export interface ScenarioTelemetry {
  id: ScenarioId;
  variantId: ScenarioVariantId;
  title: string;
  subtitle: string;
  serviceModeBadge: string;
  baseStationLocation: string;
  observer: ScenarioObserver;
  gateway: { name: string; lat: number; lon: number } | null;
  azimuthDeg: number;
  elevationDeg: number;
  slantKm: number;
  visible: boolean;
  fsplDb: number;
  delayMs: number;
  dopplerHz: number;
  rawDopplerHz: number;
  cn0DbHz: number;
  cnDb: number;
  rxPowerDbw: number;
  eirpDbW: number;
  gtDbK: number;
  extraLossDb: number;
  bandSummary: string;
  beamBehaviorLabel: string;
  footprintRadiusKm: number;
  hpbwDeg: number;
  passWindow10Min: number | null;
  passPeakElevDeg: number | null;
  handoverState: string | null;
  feeder: ScenarioFeederTelemetry | null;
  sib19: ScenarioSib19Info | null;
  route: ScenarioRouteNode[];
  footnote: string;
}

export interface ScenarioVariantMeta {
  id: ScenarioVariantId;
  label: string;
  shortLabel: string;
}

export interface ScenarioSpec {
  id: ScenarioId;
  code: string;
  title: string;
  subtitle: string;
  shortTag: string;
  defaultVariant: ScenarioVariantId;
  variants: ScenarioVariantMeta[];
}

export const OBSERVER_PRESETS: ScenarioObserver[] = [
  { id: 'quilca', name: 'Quilca, Arequipa', lat: -16.7, lon: -72.4 },
  { id: 'lima', name: 'Lima (MTC)', lat: -12.05, lon: -77.04 },
  { id: 'arequipa', name: 'Arequipa', lat: -16.41, lon: -71.54 },
  { id: 'cusco', name: 'Cusco', lat: -13.53, lon: -71.97 },
];

export const DEFAULT_OBSERVER: ScenarioObserver = OBSERVER_PRESETS[0];

export const GATEWAY_LIMA = {
  id: 'lima-gw',
  name: 'Lima · Pasarela NTN / MTC',
  lat: -12.05,
  lon: -77.04,
};

/** Época exacta del paso LEO de referencia del informe (11 nov 2026, 14:32:48 UTC / 09:32:48 Perú). */
export const REPORT_PASS_EPOCH_MS = Date.UTC(2026, 10, 11, 14, 32, 48);

export const REPORT_SCENARIOS: ScenarioSpec[] = [
  {
    id: 'report-amazonas5',
    code: 'A',
    title: 'Amazonas 5 · Backhaul GEO',
    subtitle: 'Hispasat NORAD 42934 · 61° O · Reflector 3 m Ku / 34 haces Ka',
    shortTag: 'Backhaul GEO',
    defaultVariant: 'ku-backhaul',
    variants: [
      { id: 'ku-backhaul', label: 'Banda Ku · 12 GHz / 36 MHz (Backhaul fijo)', shortLabel: 'Ku · 36 MHz' },
      { id: 'ka-34beams', label: 'Banda Ka · 34 haces puntuales LatAm', shortLabel: 'Ka · 34 haces' },
    ],
  },
  {
    id: 'report-starlink11200',
    code: 'B',
    title: 'STARLINK-11200 [DTC] · LTE Directo',
    subtitle: 'SpaceX NORAD 60310 (2024-133K) · 362.83 km · 53.1602°',
    shortTag: 'LTE D2C LEO',
    defaultVariant: 'ref-2ghz',
    variants: [
      { id: 'ref-2ghz', label: 'Referencia 2 GHz · Subida UE 180 kHz', shortLabel: 'Ref. 2 GHz' },
      { id: 'pcs-g', label: 'PCS G FDD · 1910–1915 / 1990–1995 MHz (5 MHz)', shortLabel: 'PCS G · 5 MHz' },
    ],
  },
  {
    id: 'report-nr-ntn',
    code: 'C',
    title: 'Modelo 5G NR-NTN Transparente',
    subtitle: '3GPP Release 17 (TS 38.300) · Repetidor + Pasarela gNB + SIB19',
    shortTag: '5G NR-NTN',
    defaultVariant: 'n255',
    variants: [
      { id: 'n255', label: 'Banda n255 (L): 1626.5–1660.5 / 1525–1559 MHz', shortLabel: 'n255 (L)' },
      { id: 'n256', label: 'Banda n256 (S): 1980–2010 / 2170–2200 MHz', shortLabel: 'n256 (S)' },
    ],
  },
];

export function scenarioSpecById(id: ScenarioId): ScenarioSpec {
  return REPORT_SCENARIOS.find((s) => s.id === id) ?? REPORT_SCENARIOS[0];
}

export function observerPresetById(id: string): ScenarioObserver {
  return OBSERVER_PRESETS.find((o) => o.id === id) ?? DEFAULT_OBSERVER;
}

export interface ScenarioSetupConfig {
  orbit: OrbitElements;
  presetId: string;
  simTime: number;
  playing: boolean;
  mode: Mode;
  region: RegionId;
  reuse: number;
  spotTarget: { lat: number; lon: number };
  spotFixed: boolean;
  spotAutoTrack: boolean;
  freqGHz: number;
  n: number;
  dx: number;
  q: number;
  ptxW: number;
  uplinkPowerW: number;
  terminalId: TerminalId;
  rxGainDbi: number;
  noiseFigureDb: number;
  bandwidthMHz: number;
}

/** Construye órbita kepleriana calibrada exactamente para el escenario elegido. */
export function orbitForScenario(
  id: ScenarioId,
  observer: ScenarioObserver = DEFAULT_OBSERVER,
  epochMs = REPORT_PASS_EPOCH_MS,
): OrbitElements {
  if (id === 'report-amazonas5') {
    // GEO circular ecuatorial en 61° O con radio exacto r_s = 42 164 km (Ec. 7-12 del informe)
    return geoOrbitAtLongitude(-61, epochMs, 42164 - R_EARTH, 0, 0);
  }
  if (id === 'report-starlink11200') {
    // STARLINK-11200 [DTC]: h = 362.83 km al máximo del paso, i = 53.1602°, elevación máxima 37.16° sobre Quilca
    return elementsForPassPeak(
      362.83,
      53.1602,
      observer.lat,
      observer.lon,
      37.16,
      epochMs,
      true,
      'east',
      0,
    );
  }
  // Modelo NR-NTN Rel-17 LEO típico (600 km, 53°) visible simultáneamente desde Quilca y Pasarela Lima
  return elementsForPassPeak(
    600,
    53.0,
    observer.lat,
    observer.lon,
    55.0,
    epochMs,
    true,
    'east',
    0.0001,
  );
}

/** Configuración inicial completa de órbita, antena y enlace para aplicar un escenario del informe. */
export function buildScenarioSetup(
  id: ScenarioId,
  variant: ScenarioVariantId,
  observer: ScenarioObserver,
  beamTracking: ScenarioBeamTracking,
): ScenarioSetupConfig {
  const epoch = REPORT_PASS_EPOCH_MS;
  const orbit = orbitForScenario(id, observer, epoch);

  if (id === 'report-amazonas5') {
    const isKa = variant === 'ka-34beams';
    const gain3m = reflectorGainDbi(3.0, 0.55, isKa ? 20 : 12);
    return {
      orbit,
      presetId: 'amazonas-5',
      simTime: epoch,
      playing: false,
      mode: isKa ? 'cellular' : 'spot',
      region: 'latam',
      reuse: 4,
      spotTarget: { lat: observer.lat, lon: observer.lon },
      spotFixed: true,
      spotAutoTrack: false,
      freqGHz: isKa ? 20 : 12,
      n: 16,
      dx: isKa ? 2.9 : 1.9,
      q: isKa ? 48 : 36,
      ptxW: isKa ? 60 : 40,
      uplinkPowerW: 10,
      terminalId: isKa ? 'vsat60' : 'dish3m',
      rxGainDbi: isKa ? 34 : gain3m,
      noiseFigureDb: 1.5,
      bandwidthMHz: isKa ? 100 : 36,
    };
  }

  if (id === 'report-starlink11200') {
    const isPcs = variant === 'pcs-g';
    return {
      orbit,
      presetId: 'starlink-11200-dtc',
      simTime: epoch,
      playing: true,
      mode: 'cellular',
      region: beamTracking === 'fixed-cell' ? 'peru' : 'visible',
      reuse: 3,
      spotTarget: { lat: observer.lat, lon: observer.lon },
      spotFixed: true,
      spotAutoTrack: false,
      freqGHz: isPcs ? 1.9925 : 2.0,
      n: 16,
      dx: 0.5,
      q: 1,
      ptxW: 25,
      uplinkPowerW: 0.2,
      terminalId: 'phone',
      rxGainDbi: -3,
      noiseFigureDb: 7,
      bandwidthMHz: isPcs ? 5 : 1,
    };
  }

  // report-nr-ntn
  const isN256 = variant === 'n256';
  return {
    orbit,
    presetId: 'custom',
    simTime: epoch,
    playing: true,
    mode: 'spot',
    region: 'peru',
    reuse: 3,
    spotTarget: { lat: observer.lat, lon: observer.lon },
    spotFixed: true,
    spotAutoTrack: false,
    freqGHz: isN256 ? 2.185 : 1.542,
    n: 16,
    dx: 0.5,
    q: 1,
    ptxW: 25,
    uplinkPowerW: 0.2,
    terminalId: 'phone',
    rxGainDbi: -3,
    noiseFigureDb: 7,
    bandwidthMHz: 10,
  };
}

function amazonasRoute(): ScenarioRouteNode[] {
  return [
    {
      label: 'Celular',
      sub: 'Acceso radio en tierra',
      role: 'ue',
      linkAfter: { kind: 'terrestrial', label: 'LTE / NR' },
    },
    {
      label: 'eNB / gNB',
      sub: 'Estación base terrestre',
      role: 'bs-ground',
      linkAfter: { kind: 'terrestrial', label: 'IP local' },
    },
    {
      label: 'VSAT (3 m)',
      sub: 'Módem y antena',
      role: 'gateway',
      linkAfter: { kind: 'sat-backhaul', label: 'Backhaul Ku/Ka' },
    },
    {
      label: 'Amazonas 5',
      sub: 'GEO 61° O',
      role: 'sat-relay',
      linkAfter: { kind: 'sat-backhaul', label: 'Bajada pasarela' },
    },
    {
      label: 'Pasarela + Núcleo',
      sub: 'Red del operador',
      role: 'core',
    },
  ];
}

function starlinkD2cRoute(observerName: string): ScenarioRouteNode[] {
  return [
    {
      label: 'Celular LTE',
      sub: observerName,
      role: 'ue',
      linkAfter: { kind: 'sat-service', label: 'LTE Uu espacial' },
    },
    {
      label: 'STARLINK-11200',
      sub: 'eNB LTE en órbita',
      role: 'bs-orbit',
      linkAfter: { kind: 'isl', label: 'ISL / Bajada GW' },
    },
    {
      label: 'Red Starlink',
      sub: 'Pasarela terrestre',
      role: 'gateway',
      linkAfter: { kind: 'terrestrial', label: 'Interconexión' },
    },
    {
      label: 'Núcleo Entel',
      sub: 'Lima (MTC)',
      role: 'core',
    },
  ];
}

function nrNtnRoute(bandLabel: string): ScenarioRouteNode[] {
  return [
    {
      label: 'Terminal NR-NTN',
      sub: `UE Rel-17 (${bandLabel})`,
      role: 'ue',
      linkAfter: { kind: 'sat-service', label: 'Servicio NR-Uu' },
    },
    {
      label: 'Satélite NTN',
      sub: 'Repetidor transparente',
      role: 'sat-relay',
      linkAfter: { kind: 'sat-feeder', label: 'Alimentación Ka 28 GHz' },
    },
    {
      label: 'Pasarela NTN',
      sub: 'Gateway Lima',
      role: 'gateway',
      linkAfter: { kind: 'terrestrial', label: 'NG / Fibra' },
    },
    {
      label: 'gNB + Núcleo 5G',
      sub: 'gNB en tierra (AMF/UPF)',
      role: 'bs-ground',
    },
  ];
}

export interface PassCache {
  key: string;
  peakElevDeg: number;
  window10Min: number;
}

/** Calcula toda la telemetría de ingeniería del escenario activo desde el observador. */
export function evaluateScenarioTelemetry(
  id: ScenarioId,
  s: SimState,
  sat: OrbitState,
  activeBeam: Beam | null,
  satBeamHpbwDeg: number,
  passCache?: PassCache,
): { telemetry: ScenarioTelemetry; cache?: PassCache } {
  const observer = s.scenarioObserver;
  const obsLatRad = observer.lat * DEG;
  const obsLonRad = observer.lon * DEG;
  const look = observerLookAngles(sat.rEcef, obsLatRad, obsLonRad);
  const visible = look.elevationDeg >= 0;

  if (id === 'report-amazonas5') {
    const isKa = s.scenarioVariant === 'ka-34beams';
    const fGHz = isKa ? 20 : 12;
    const bwMHz = isKa ? 100 : 36;
    const diameterM = 3.0;
    const eta = 0.55;
    const grDbi = reflectorGainDbi(diameterM, eta, fGHz);
    const rxHpbw = reflectorHpbwDeg(diameterM, fGHz);
    const lad = (isKa ? 2.5 : 2.0) + s.rainMarginDb;
    const eirpRef = isKa ? 56 : 46;
    const res = linkBudget({
      slantKm: look.slantKm,
      freqGHz: fGHz,
      txPowerW: s.ptxW,
      txGainDbi: 30,
      rxGainDbi: grDbi,
      noiseFigureDb: 1.5,
      bandwidthMHz: bwMHz,
      elevationDeg: Math.max(0, look.elevationDeg),
      fixedEirpDbW: eirpRef,
      fixedTsysK: 150,
      fixedExtraLossDb: lad,
      implementationMarginDb: 1,
    });
    const hpbw = isKa ? Math.max(1.2, satBeamHpbwDeg) : rxHpbw;
    const footprintRadiusKm = isKa
      ? look.slantKm * Math.tan((Math.max(1.2, satBeamHpbwDeg) * DEG) / 2)
      : 3200;

    return {
      telemetry: {
        id,
        variantId: isKa ? 'ka-34beams' : 'ku-backhaul',
        title: 'Amazonas 5 · Backhaul GEO (NORAD 42934)',
        subtitle: `61° O · apuntamiento fijo desde ${observer.name}`,
        serviceModeBadge: isKa ? 'Ka HTS · 34 haces' : 'Backhaul Ku · D = 3 m',
        baseStationLocation: 'Estación base en tierra (eNB / gNB)',
        observer,
        gateway: { name: 'Pasarela GEO (Lima)', lat: GATEWAY_LIMA.lat, lon: GATEWAY_LIMA.lon },
        azimuthDeg: look.azimuthDeg,
        elevationDeg: look.elevationDeg,
        slantKm: look.slantKm,
        visible,
        fsplDb: res.fsplDb,
        delayMs: look.delayMs,
        dopplerHz: 0,
        rawDopplerHz: 0,
        cn0DbHz: res.cn0DbHz,
        cnDb: res.cnDb,
        rxPowerDbw: res.rxPowerDbm - 30,
        eirpDbW: res.eirpDbW,
        gtDbK: res.gtDbK,
        extraLossDb: lad,
        bandSummary: isKa
          ? 'Ka 20 GHz · 34 haces puntuales LatAm · 100 MHz'
          : `Ku 12 GHz · 36 MHz · PIRE 46 dBW · θ₃dB ≈ ${rxHpbw.toFixed(2)}°`,
        beamBehaviorLabel: isKa
          ? '34 haces puntuales fijos en Ka sobre Latinoamérica'
          : `Haz regional Ku fijo · reflector D=3 m (${grDbi.toFixed(2)} dBi)`,
        footprintRadiusKm,
        hpbwDeg: hpbw,
        passWindow10Min: null,
        passPeakElevDeg: look.elevationDeg,
        handoverState: `Apuntamiento GEO estable · salto doble ≈ ${(look.delayMs * 2).toFixed(1)} ms`,
        feeder: null,
        sib19: null,
        route: amazonasRoute(),
        footnote: isKa
          ? 'Conmutado a banda Ka: reutilización espacial en 34 haces puntuales sobre LatAm.'
          : `Bajada Ku (T_sys = 150 K, L_ad = ${lad.toFixed(1)} dB): G/T = ${res.gtDbK.toFixed(2)} dB/K · P_R = ${(res.rxPowerDbm - 30).toFixed(2)} dBW.`,
      },
    };
  }

  // Cálculo de paso LEO para Starlink-11200 y NR-NTN
  const isDtc = id === 'report-starlink11200';
  const freqCalcGHz = isDtc
    ? (s.scenarioVariant === 'pcs-g' ? 1.9125 : 2.0)
    : (s.scenarioVariant === 'n256' ? 2.185 : 1.542);

  const dop = radialDoppler(s.orbit, s.simTime, obsLatRad, obsLonRad, freqCalcGHz, 2, true);

  const pKey = [
    id,
    s.orbit.a.toFixed(2),
    (s.orbit.i / DEG).toFixed(4),
    (s.orbit.raan / DEG).toFixed(4),
    (s.orbit.M0 / DEG).toFixed(4),
    observer.id,
  ].join('|');
  let nextCache = passCache;
  if (!nextCache || nextCache.key !== pKey) {
    const win = computePassWindows(s.orbit, s.orbit.epoch, obsLatRad, obsLonRad, [0, 10, 20, 30], 420, 2);
    nextCache = {
      key: pKey,
      peakElevDeg: win.peakElevDeg,
      window10Min: win.windowsMin[10] ?? 0,
    };
  }

  if (isDtc) {
    const isPcs = s.scenarioVariant === 'pcs-g';
    const bwHz = isPcs ? 5_000_000 : 180_000;
    const lad = 2.0 + s.rainMarginDb;
    // Presupuesto ilustrativo en subida UE del informe (Sec. 9.6): PIRE_UE = 20 dBm (-10 dBW), G/T_sat = -5 dB/K
    const gtTargetSat = -5.0;
    const tsysSat = 290;
    const rxGainEquiv = gtTargetSat + 10 * Math.log10(tsysSat);
    const res = linkBudget({
      slantKm: look.slantKm,
      freqGHz: freqCalcGHz,
      txPowerW: 0.2,
      txGainDbi: -3,
      rxGainDbi: rxGainEquiv,
      noiseFigureDb: 2.5,
      bandwidthMHz: bwHz / 1e6,
      bandwidthHz: bwHz,
      elevationDeg: Math.max(0, look.elevationDeg),
      fixedEirpDbW: -10,
      fixedTsysK: tsysSat,
      fixedExtraLossDb: lad,
    });

    const maskActive = look.elevationDeg >= 10;
    const trackingMoving = s.scenarioBeamTracking === 'moving';
    let handoverState: string;
    if (look.elevationDeg < 0) {
      handoverState = 'Satélite bajo el horizonte local (esperando próximo paso)';
    } else if (!maskActive) {
      handoverState = `Bajo máscara de 10° (E = ${look.elevationDeg.toFixed(1)}°): búsqueda / handover`;
    } else if (look.elevationDeg < 15) {
      handoverState = `Borde de máscara 10° (E = ${look.elevationDeg.toFixed(1)}°): preparando traspaso entre haces/satélites`;
    } else if (trackingMoving) {
      handoverState = 'Haces en movimiento sobre traza subsatelital (compensación Doppler activa)';
    } else {
      handoverState = `Celdas fijas en tierra · haz asignado #${(activeBeam?.id ?? 0) + 1} (handover continuo)`;
    }

    const fsplCalc = fsplDb(look.slantKm, freqCalcGHz);
    const radiusKm = look.slantKm * Math.tan((Math.max(2, satBeamHpbwDeg) * DEG) / 2);

    return {
      cache: nextCache,
      telemetry: {
        id,
        variantId: isPcs ? 'pcs-g' : 'ref-2ghz',
        title: 'STARLINK-11200 [DTC] · Acceso Directo LTE',
        subtitle: `NORAD 60310 · 362.83 km · 53.16° · Entel–Starlink (${observer.name} → Lima)`,
        serviceModeBadge: isPcs ? 'LTE D2C · PCS G' : 'LTE D2C · 2 GHz',
        baseStationLocation: 'Estación base en órbita (eNB LTE a bordo)',
        observer,
        gateway: { name: 'Lima MTC (destino Entel)', lat: GATEWAY_LIMA.lat, lon: GATEWAY_LIMA.lon },
        azimuthDeg: look.azimuthDeg,
        elevationDeg: look.elevationDeg,
        slantKm: look.slantKm,
        visible,
        fsplDb: fsplCalc,
        delayMs: look.delayMs,
        dopplerHz: dop.dopplerHz,
        rawDopplerHz: dop.dopplerHz,
        cn0DbHz: res.cn0DbHz,
        cnDb: res.cnDb,
        rxPowerDbw: res.rxPowerDbm - 30,
        eirpDbW: -10,
        gtDbK: -5,
        extraLossDb: lad,
        bandSummary: isPcs
          ? 'PCS G FDD: UL 1910–1915 / DL 1990–1995 MHz · 5 MHz'
          : 'Portadora ref. 2 GHz · Subida UE −10 dBW (20 dBm) · B = 180 kHz',
        beamBehaviorLabel: trackingMoving
          ? 'Haces dinámicos siguiendo la traza subsatelital'
          : 'Celdas fijas en tierra con handover entre haces',
        footprintRadiusKm: radiusKm,
        hpbwDeg: satBeamHpbwDeg,
        passWindow10Min: nextCache.window10Min,
        passPeakElevDeg: nextCache.peakElevDeg,
        handoverState,
        feeder: null,
        sib19: null,
        route: starlinkD2cRoute(observer.name),
        footnote: `Ventana ≥10° ≈ ${nextCache.window10Min.toFixed(2)} min (pico ${nextCache.peakElevDeg.toFixed(2)}°). Enlace LTE directo teléfono ↔ eNB en órbita.`,
      },
    };
  }

  // Escenario C: 5G NR-NTN Transparente (3GPP Release 17, TS 38.300)
  const isN256 = s.scenarioVariant === 'n256';
  const gwLook = observerLookAngles(sat.rEcef, GATEWAY_LIMA.lat * DEG, GATEWAY_LIMA.lon * DEG);
  const feederFreqGHz = 28.0; // Ka 27.5–28.35 GHz (Tabla 8 del informe)
  const feederFspl = fsplDb(gwLook.slantKm, feederFreqGHz);
  const serviceFspl = fsplDb(look.slantKm, freqCalcGHz);
  const lad = 2.0 + s.rainMarginDb;

  // Bajada de servicio NR-NTN hacia UE compatible Rel-17 (-3 dBi, NF 7 dB, 10 MHz)
  const svcLink = linkBudget({
    slantKm: look.slantKm,
    freqGHz: freqCalcGHz,
    txPowerW: s.ptxW,
    txGainDbi: 28.5,
    rxGainDbi: -3,
    noiseFigureDb: 7,
    bandwidthMHz: 10,
    elevationDeg: Math.max(0, look.elevationDeg),
    fixedExtraLossDb: lad,
  });

  const totalDelayMs = look.delayMs + gwLook.delayMs;
  const residualDopplerHz = s.scenarioSib19 ? dop.dopplerHz * 0.002 : dop.dopplerHz;
  const bandShort = isN256 ? 'n256 · S' : 'n255 · L';

  return {
    cache: nextCache,
    telemetry: {
      id,
      variantId: isN256 ? 'n256' : 'n255',
      title: 'Modelo 5G NR-NTN Transparente (Rel-17)',
      subtitle: `TS 38.300 · Servicio ${bandShort} + Alimentación Ka 28 GHz`,
      serviceModeBadge: `5G NR-NTN · ${bandShort}`,
      baseStationLocation: 'gNB en tierra · satélite repetidor transparente',
      observer,
      gateway: { name: GATEWAY_LIMA.name, lat: GATEWAY_LIMA.lat, lon: GATEWAY_LIMA.lon },
      azimuthDeg: look.azimuthDeg,
      elevationDeg: look.elevationDeg,
      slantKm: look.slantKm,
      visible,
      fsplDb: serviceFspl,
      delayMs: look.delayMs,
      dopplerHz: residualDopplerHz,
      rawDopplerHz: dop.dopplerHz,
      cn0DbHz: svcLink.cn0DbHz,
      cnDb: svcLink.cnDb,
      rxPowerDbw: svcLink.rxPowerDbm - 30,
      eirpDbW: svcLink.eirpDbW,
      gtDbK: svcLink.gtDbK,
      extraLossDb: lad,
      bandSummary: isN256
        ? 'n256 (S): UL 1980–2010 / DL 2170–2200 MHz · Feeder Ka 27.5–28.35 GHz'
        : 'n255 (L): UL 1626.5–1660.5 / DL 1525–1559 MHz · Feeder Ka 27.5–28.35 GHz',
      beamBehaviorLabel: 'Repetidor transparente: doble salto servicio (UE) + alimentación (GW Lima)',
      footprintRadiusKm: look.slantKm * Math.tan((Math.max(2, satBeamHpbwDeg) * DEG) / 2),
      hpbwDeg: satBeamHpbwDeg,
      passWindow10Min: nextCache.window10Min,
      passPeakElevDeg: nextCache.peakElevDeg,
      handoverState: gwLook.elevationDeg >= 5
        ? `Doble enlace cerrado · τ_total (UE↔Sat↔GW) = ${totalDelayMs.toFixed(2)} ms`
        : 'Pasarela NTN Lima por debajo de 5° de elevación',
      feeder: {
        gatewayName: GATEWAY_LIMA.name,
        lat: GATEWAY_LIMA.lat,
        lon: GATEWAY_LIMA.lon,
        freqGHz: feederFreqGHz,
        azimuthDeg: gwLook.azimuthDeg,
        elevationDeg: gwLook.elevationDeg,
        slantKm: gwLook.slantKm,
        delayMs: gwLook.delayMs,
        fsplDb: feederFspl,
        totalDelayMs,
      },
      sib19: {
        enabled: s.scenarioSib19,
        rawDopplerHz: dop.dopplerHz,
        residualDopplerHz,
        timingAdvanceMs: totalDelayMs * 2,
        status: s.scenarioSib19
          ? `SIB19 activo · precompensación efemérides (${(dop.dopplerHz / 1000).toFixed(2)} kHz → ${residualDopplerHz.toFixed(0)} Hz)`
          : `SIB19 desactivado · deriva sin compensar ${(dop.dopplerHz / 1000).toFixed(2)} kHz`,
      },
      route: nrNtnRoute(bandShort),
      footnote: 'Interfaz NR-Uu atraviesa enlace de servicio y alimentación hasta el gNB ubicado en tierra.',
    },
  };
}
