import type { ArrayConfig, ArrayMetrics, Beam, GainMap, PatternCutPoint, PatternGrid } from './core/array';
import type { AntennaFrame } from './core/geometry';
import type { LinkResult } from './core/link';
import type { OrbitElements, OrbitState } from './core/orbit';
import { elementsOverPoint } from './core/presets';
import type { RegionId } from './core/regions';
import {
  DEFAULT_OBSERVER,
  type ScenarioBeamTracking,
  type ScenarioId,
  type ScenarioObserver,
  type ScenarioTelemetry,
  type ScenarioVariantId,
} from './core/scenarios';

export type Mode = 'global' | 'spot' | 'cellular' | 'shaped';
export type CameraMode = 'earth' | 'sat' | 'follow';
export type Quality = 'high' | 'medium' | 'low';
export type TerminalId = 'vsat60' | 'vsat45' | 'isotropic' | 'dish3m' | 'phone';
export type QuantMode = 'ideal' | 'realtime' | 'analysis';
export type LinkDirection = 'downlink' | 'uplink';
export type ShapedRegionId = 'circle' | 'peru' | 'southamerica' | 'latam' | 'americas' | 'atlantic' | 'europe';

export interface QuantState {
  mode: QuantMode;
  phaseBits: number;
  /** 0 = taper fijo; 3–6 = VGA con cuantización de amplitud. */
  ampBits: number;
  phaseRmsDeg: number;
  ampRmsDb: number;
  seed: number;
}

export interface QuantInfo {
  mode: QuantMode;
  resolution: number;
  computeMs: number;
  stale: boolean;
  idealMetrics: ArrayMetrics | null;
  idealPattern: PatternGrid | null;
  activeCut: PatternCutPoint[] | null;
  idealCut: PatternCutPoint[] | null;
  pointingErrorDeg: number | null;
  note: string;
}

export interface SystemInfo {
  activeBeams: number;
  rfPowerW: number;
  spectrumMHz: number;
  capacityMbps: number;
  aggregateCapacityMbps: number;
  perUserMbps: number;
  coverageFraction: number | null;
  limitingLink: LinkDirection | null;
}

export interface PhaseView {
  phases: Float64Array;
  amps: Float64Array;
  n: number;
}

export interface ShapedInfo {
  coverage: number;
  spillDb: number;
  directivityDb: number;
  radiusKm: number;
  meanDb: number;
  region?: ShapedRegionId;
}

export interface Derived {
  sat: OrbitState;
  frame: AntennaFrame;
  pattern: PatternGrid;
  patternQ: number;
  metrics: ArrayMetrics;
  beams: Beam[];
  activeBeam: Beam | null;
  gainMap: GainMap;
  phase: PhaseView;
  link: LinkResult | null;
  links: { downlink: LinkResult | null; uplink: LinkResult | null };
  activePattern: PatternGrid;
  activeMetrics: ArrayMetrics;
  quant: QuantInfo | null;
  beamSet: {
    visibleCells: number;
    totalCells: number;
    coverageFraction: number;
    spacingKm: number;
  } | null;
  shaped: ShapedInfo | null;
  system: SystemInfo;
  source: 'horn' | 'array' | 'synthesis';
  servedLocation?: string | null;
  scenario: ScenarioTelemetry | null;
}

export interface SimState {
  presetId: string;
  orbit: OrbitElements;
  simTime: number;
  playing: boolean;
  speed: number;
  showOrbit: boolean;
  showTrack: boolean;
  showFootprint: boolean;
  showGain: boolean;
  showCones: boolean;
  showGrid: boolean;
  cameraMode: CameraMode;
  antenna: ArrayConfig;
  mode: Mode;
  activeBeam: number;
  region: RegionId;
  reuse: number;
  cellularCi: boolean;
  spotTarget: { lat: number; lon: number };
  spotFixed: boolean;
  spotAutoTrack: boolean;
  strictService: boolean;
  scenarioId: ScenarioId | null;
  scenarioVariant: ScenarioVariantId;
  scenarioObserver: ScenarioObserver;
  scenarioBeamTracking: ScenarioBeamTracking;
  scenarioSib19: boolean;
  shapedCenter: { lat: number; lon: number };
  shapedRadiusKm: number;
  shapedRegion: ShapedRegionId;
  cellTarget: { lat: number; lon: number } | null;
  terminalId: TerminalId;
  ptxW: number;
  uplinkPowerW: number;
  linkDirection: LinkDirection;
  rxGainDbi: number;
  noiseFigureDb: number;
  bandwidthMHz: number;
  rainMarginDb: number;
  usersPerBeam: number;
  quant: QuantState;
  fpsCap: number;
  quality: Quality;
  tourStep: number;
}

export function defaultState(): SimState {
  const epoch = Math.floor(Date.now() / 1000) * 1000;
  const orbit = elementsOverPoint(550, 53, -12.05, -77.04, epoch, 2.5, 0.0001);
  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  let fpsCap = isTauri ? 45 : 60;
  let quality: Quality = isTauri ? 'medium' : 'high';
  try {
    const rawCap = localStorage.getItem('beamlab:fpsCap');
    if (rawCap !== null) {
      const n = Number(rawCap);
      if ([30, 45, 60, 75, 120, 0].includes(n)) fpsCap = n;
    }
    const rawQuality = localStorage.getItem('beamlab:quality');
    if (rawQuality === 'high' || rawQuality === 'medium' || rawQuality === 'low') quality = rawQuality;
    // Tauri usa el compositor del sistema: una sola migración a un perfil
    // más frío. Después se respeta lo que el usuario elija.
    if (isTauri && !localStorage.getItem('beamlab:tauri-perf-v2')) {
      fpsCap = 45;
      quality = 'medium';
      localStorage.setItem('beamlab:tauri-perf-v2', '1');
    }
  } catch {
    // almacenamiento no disponible (modo privado, etc.)
  }
  return {
    presetId: 'starlink',
    orbit,
    simTime: epoch,
    playing: true,
    speed: 10,
    showOrbit: true,
    showTrack: true,
    showFootprint: true,
    showGain: true,
    showCones: false,
    showGrid: true,
    cameraMode: 'earth',
    antenna: {
      n: 16,
      dx: 0.5,
      dy: 0.5,
      freqGHz: 12,
      taper: 'kaiser30',
      q: 1,
      efficiency: 0.65,
    },
    mode: 'spot',
    activeBeam: 0,
    region: 'peru',
    reuse: 3,
    cellularCi: false,
    spotTarget: { lat: -12.05, lon: -77.04 },
    spotFixed: true,
    spotAutoTrack: false,
    strictService: true,
    scenarioId: null,
    scenarioVariant: 'ku-backhaul',
    scenarioObserver: DEFAULT_OBSERVER,
    scenarioBeamTracking: 'moving',
    scenarioSib19: true,
    shapedCenter: { lat: -12.05, lon: -77.04 },
    shapedRadiusKm: 100,
    shapedRegion: 'circle',
    cellTarget: null,
    terminalId: 'vsat60',
    ptxW: 20,
    uplinkPowerW: 4,
    linkDirection: 'downlink',
    rxGainDbi: 34,
    noiseFigureDb: 1.5,
    bandwidthMHz: 100,
    rainMarginDb: 0,
    usersPerBeam: 20,
    quant: {
      mode: 'realtime',
      phaseBits: 5,
      ampBits: 4,
      phaseRmsDeg: 2,
      ampRmsDb: 0.2,
      seed: 12345,
    },
    fpsCap,
    quality,
    tourStep: 0,
  };
}
