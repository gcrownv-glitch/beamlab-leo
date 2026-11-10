import type { ArrayConfig, ArrayMetrics, Beam, GainMap, PatternGrid } from './core/array';
import type { AntennaFrame } from './core/geometry';
import type { LinkResult } from './core/link';
import type { OrbitElements, OrbitState } from './core/orbit';
import { elementsOverPoint } from './core/presets';
import type { RegionId } from './core/regions';

export type Mode = 'global' | 'spot' | 'cellular' | 'shaped';
export type CameraMode = 'earth' | 'sat' | 'follow';

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
  beamSet: { visibleCells: number; totalCells: number } | null;
  shaped: ShapedInfo | null;
  source: 'horn' | 'array' | 'synthesis';
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
  spotTarget: { lat: number; lon: number };
  spotFixed: boolean;
  shapedCenter: { lat: number; lon: number };
  shapedRadiusKm: number;
  ptxW: number;
  rxGainDbi: number;
  noiseFigureDb: number;
  bandwidthMHz: number;
  tourStep: number;
}

export function defaultState(): SimState {
  const epoch = Math.floor(Date.now() / 1000) * 1000;
  const orbit = elementsOverPoint(550, 53, -12.05, -77.04, epoch, 2.5, 0.0001);
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
    spotTarget: { lat: -12.05, lon: -77.04 },
    spotFixed: true,
    shapedCenter: { lat: -12.05, lon: -77.04 },
    shapedRadiusKm: 100,
    ptxW: 20,
    rxGainDbi: 0,
    noiseFigureDb: 2,
    bandwidthMHz: 100,
    tourStep: 0,
  };
}
