import {
  type ArrayConfig,
  type ArrayMetrics,
  type Beam,
  type GainMap,
  type PatternGrid,
  beamPhaseMap,
  computeBasePattern,
  computeGainMap,
  computeMetrics,
  gridDirectivity,
  patternCutAt,
  patternFromWeights,
  peakDirection,
  cutFromWeights,
  type PatternCutPoint,
  qForHpbw,
} from './core/array';
import { DEG, R_EARTH } from './core/constants';
import type { Vec3 } from './core/vec';
import {
  anglesForGroundPoint,
  beamGroundPoint,
  footprintRing,
  type AntennaFrame,
} from './core/geometry';
import { linkBudget, SAT_ANTENNA_TEMP_K, SAT_NOISE_FIGURE_DB, uplinkFrequencyGHz } from './core/link';
import { quantizedBeamWeights } from './core/quantization';
import {
  antennaBasis,
  ecefToGeodetic,
  elevationAngle,
  horizonOffNadir,
  propagate,
  slantRange,
  type OrbitElements,
  type OrbitState,
} from './core/orbit';
import {
  beamsForGroundCells,
  beamsVisibleLattice,
  beamToTarget,
  cellSpacingKm,
  coChannelCiDb,
} from './core/coverage';
import {
  buildGroundCells,
  regionAreaKm2,
  regionPolygon,
  pointInPolygon,
  type DirectionSample,
  type GroundCell,
} from './core/regions';
import {
  runShapedSynthesisJob,
  type ShapedSynthesisJob,
  type ShapedSynthesisOutput,
  type SynthesisResult,
} from './core/synthesis';
import type { Derived, Mode, PhaseView, QuantInfo, ShapedInfo, SimState, SystemInfo } from './state';

const ZERO_BEAM: Beam = { id: 0, u: 0, v: 0, amp: 1, color: 0 };
const SHAPED_BEAM: Beam = { id: 0, u: 0, v: 0, amp: 1, color: 1 };
const EMPTY_GAIN: GainMap = { size: 1, data: new Float32Array([0]), max: 0, rgba: new Uint8Array([0, 0, 0, 0]) };
/** En GEO una bocina de 17° cubre el disco; en LEO depende de la altitud (2 × horizonte). */
const globalHpbwDeg = (altKm: number): number => (2 * horizonOffNadir(Math.max(100, altKm))) / DEG;

export interface PreparedShapedSynthesis {
  job: ShapedSynthesisJob;
  satEcef: Vec3;
  frame: AntennaFrame;
}

export class Engine {
  state: SimState;
  derived: Derived;

  private baseGrid: PatternGrid;
  private baseMetrics: ArrayMetrics;
  private hornGrid: PatternGrid;
  private hornCfg: ArrayConfig;

  private synth: SynthesisResult | null = null;
  private synthKey = '';
  private synthInfo: ShapedInfo | null = null;
  private synthIdealMetrics: ArrayMetrics | null = null;
  private synthIdealPattern: PatternGrid | null = null;
  private synthMetrics: ArrayMetrics | null = null;
  private synthCut: PatternCutPoint[] | null = null;
  private synthIdealCut: PatternCutPoint[] | null = null;
  private synthComputeMs = 0;

  private cells: GroundCell[] = [];
  private cellKey = '';
  private cellSpacing = 0;

  private quantKey = '';
  private quantPattern: PatternGrid | null = null;
  private quantMetrics: ArrayMetrics | null = null;
  private quantIdealMetrics: ArrayMetrics | null = null;
  private quantIdealPattern: PatternGrid | null = null;
  private quantCut: PatternCutPoint[] | null = null;
  private quantIdealCut: PatternCutPoint[] | null = null;
  private quantPointing = 0;
  private quantPhases: Float64Array | null = null;
  private quantAmps: Float64Array | null = null;
  private quantMs = 0;
  private lastQuantMs = 0;

  private patternDirty = true;
  private hornDirty = false;
  private beamsDirty = true;
  private gainDirty = true;
  private lastShowGain = true;
  private lastBeamMs = 0;
  private lastGainMs = 0;
  private lastBeamSat = { x: Infinity, y: Infinity, z: Infinity };
  private lastBeamFrame: AntennaFrame | null = null;
  private quantSatEcef: Vec3 | null = null;
  private quantFrame: AntennaFrame | null = null;
  private synthSatEcef: Vec3 | null = null;
  private synthFrame: AntennaFrame | null = null;
  private bodyBeam: { u: number; v: number } | null = null;
  private cachedMetrics: ArrayMetrics | null = null;
  private cachedActive: Beam | null = null;
  private cachedPhase: PhaseView | null = null;

  constructor(state: SimState) {
    this.state = state;
    this.hornCfg = {
      n: 1,
      dx: 0.5,
      dy: 0.5,
      freqGHz: state.antenna.freqGHz,
      taper: 'uniform',
      q: qForHpbw(globalHpbwDeg(state.orbit.a - R_EARTH)),
      efficiency: 0.65,
    };
    this.hornGrid = computeBasePattern(this.hornCfg);
    this.baseGrid = computeBasePattern(state.antenna);
    this.baseMetrics = computeMetrics(state.antenna, this.baseGrid, ZERO_BEAM);
    this.lastShowGain = state.showGain;
    this.derived = this.compute(performance.now(), true, true);
  }

  invalidateAll() {
    this.patternDirty = true;
    this.beamsDirty = true;
    this.gainDirty = true;
  }

  invalidateBeams() {
    this.beamsDirty = true;
  }

  setMode(mode: Mode) {
    if (this.state.mode === mode) return;
    this.state.mode = mode;
    if (mode !== 'cellular') this.state.cellTarget = null;
    this.resetQuant();
    this.beamsDirty = true;
    this.gainDirty = true;
  }

  setCellTarget(lat: number, lon: number) {
    this.state.cellTarget = { lat, lon };
    this.cachedActive = null;
    this.cachedMetrics = null;
    this.resetQuant();
  }

  private resetSynthesis() {
    this.synth = null;
    this.synthKey = '';
    this.synthInfo = null;
    this.synthIdealMetrics = null;
    this.synthIdealPattern = null;
    this.synthMetrics = null;
    this.synthCut = null;
    this.synthIdealCut = null;
    this.synthSatEcef = null;
    this.synthFrame = null;
    this.cachedMetrics = null;
    this.cachedActive = null;
    this.cachedPhase = null;
    this.beamsDirty = true;
    this.gainDirty = true;
  }

  private resetQuant() {
    this.quantKey = '';
    this.quantPattern = null;
    this.quantMetrics = null;
    this.quantIdealMetrics = null;
    this.quantIdealPattern = null;
    this.quantCut = null;
    this.quantIdealCut = null;
    this.quantPhases = null;
    this.quantAmps = null;
    this.quantSatEcef = null;
    this.quantFrame = null;
    this.quantPointing = 0;
    this.quantMs = 0;
    this.lastQuantMs = 0;
  }

  invalidateQuant() {
    this.resetQuant();
    this.gainDirty = true;
  }

  setQuant(patch: Partial<SimState['quant']>) {
    Object.assign(this.state.quant, patch);
    this.resetQuant();
    if (this.state.mode === 'shaped') this.resetSynthesis();
    this.gainDirty = true;
  }

  setAntenna(patch: Partial<ArrayConfig>) {
    Object.assign(this.state.antenna, patch);
    this.resetSynthesis();
    this.resetQuant();
    this.cellKey = '';
    this.patternDirty = true;
  }

  setFrequency(freqGHz: number) {
    this.state.antenna.freqGHz = freqGHz;
    this.hornCfg = { ...this.hornCfg, freqGHz };
    this.resetSynthesis();
    this.resetQuant();
    this.patternDirty = true;
  }

  setOrbit(orbit: OrbitElements, presetId?: string) {
    this.state.orbit = orbit;
    if (presetId) this.state.presetId = presetId;
    const newQ = qForHpbw(globalHpbwDeg(orbit.a - R_EARTH));
    if (Math.abs(newQ - this.hornCfg.q) > 1e-4) {
      this.hornCfg = { ...this.hornCfg, q: newQ };
      this.hornDirty = true;
      this.gainDirty = true;
    }
    this.cellKey = '';
    this.resetSynthesis();
    this.resetQuant();
    this.lastBeamSat = { x: Infinity, y: Infinity, z: Infinity };
    this.beamsDirty = true;
  }

  setSpotTarget(lat: number, lon: number) {
    this.state.spotTarget = { lat, lon };
    this.state.spotFixed = true;
    this.bodyBeam = null;
    this.beamsDirty = true;
    this.resetQuant();
  }

  setSpotFixed(fixed: boolean) {
    if (!fixed && this.derived.activeBeam) {
      this.bodyBeam = { u: this.derived.activeBeam.u, v: this.derived.activeBeam.v };
    }
    this.state.spotFixed = fixed;
    this.beamsDirty = true;
    this.resetQuant();
  }

  setShapedCenter(lat: number, lon: number) {
    this.state.shapedCenter = { lat, lon };
    this.resetSynthesis();
    this.resetQuant();
  }

  setShapedRadius(km: number) {
    this.state.shapedRadiusKm = km;
    this.resetSynthesis();
    this.resetQuant();
  }

  setRegion(region: SimState['region']) {
    this.state.region = region;
    this.state.cellTarget = null;
    this.cellKey = '';
    this.beamsDirty = true;
    this.gainDirty = true;
    this.resetQuant();
  }

  setReuse(reuse: number) {
    this.state.reuse = reuse;
    this.state.cellTarget = null;
    this.beamsDirty = true;
    this.gainDirty = true;
    this.resetQuant();
  }

  setCellularCi(enabled: boolean) {
    this.state.cellularCi = enabled;
  }

  update(now = performance.now()) {
    this.derived = this.compute(now, false, false);
  }

  private compute(now: number, force: boolean, initial: boolean): Derived {
    const s = this.state;
    const sat = propagate(s.orbit, s.simTime, true);
    const frame = antennaBasis(sat.rEcef);

    if (this.patternDirty) {
      this.baseGrid = computeBasePattern(s.antenna);
      this.baseMetrics = computeMetrics(s.antenna, this.baseGrid, ZERO_BEAM);
      this.hornGrid = computeBasePattern(this.hornCfg);
      this.patternDirty = false;
      this.hornDirty = false;
      this.beamsDirty = true;
      this.gainDirty = true;
      this.cachedPhase = null;
    } else if (this.hornDirty) {
      this.hornGrid = computeBasePattern(this.hornCfg);
      this.hornDirty = false;
      this.cachedMetrics = null;
      this.gainDirty = true;
    }
    if (this.cachedPhase && this.cachedPhase.n !== s.antenna.n) this.cachedPhase = null;

    let beams = initial ? [] : this.derived.beams;
    let beamSet = initial ? null : this.derived.beamSet;
    let beamsChanged = initial;

    const spotInterval = 16;
    const cellInterval = 150;
    const moved = Math.hypot(
      sat.rEcef.x - this.lastBeamSat.x,
      sat.rEcef.y - this.lastBeamSat.y,
      sat.rEcef.z - this.lastBeamSat.z,
    ) > 0.5;
    const due =
      this.beamsDirty ||
      force ||
      ((s.mode === 'spot' || s.mode === 'cellular') && moved && now - this.lastBeamMs > (s.mode === 'spot' ? spotInterval : cellInterval));

    if (due) {
      const res = this.computeBeams(sat, frame);
      beams = res.beams;
      beamSet = res.beamSet;
      beamsChanged = true;
      this.beamsDirty = false;
      this.lastBeamMs = now;
      this.lastBeamSat = { x: sat.rEcef.x, y: sat.rEcef.y, z: sat.rEcef.z };
      this.lastBeamFrame = frame;
      this.gainDirty = true;
      this.cachedPhase = null;
    }

    const synthActive = s.mode === 'shaped' && this.synth !== null && this.synthKey === this.synthesisKey();
    let pattern: PatternGrid;
    let patternQ: number;
    let source: Derived['source'];
    if (s.mode === 'global') {
      pattern = this.hornGrid;
      patternQ = this.hornCfg.q;
      source = 'horn';
    } else if (synthActive && this.synth) {
      pattern = this.synth.grid;
      patternQ = s.antenna.q;
      source = 'synthesis';
    } else {
      pattern = this.baseGrid;
      patternQ = s.antenna.q;
      source = 'array';
    }

    let active: Beam | null = null;
    if (beams.length) {
      active = s.mode === 'cellular' ? beams[this.pickActive(beams)] : beams[0];
    } else if (s.mode === 'shaped') {
      const ang = anglesForGroundPoint(sat.rEcef, frame, s.shapedCenter.lat * DEG, s.shapedCenter.lon * DEG);
      if (ang.w > 0.02) {
        active = { id: 0, u: ang.u, v: ang.v, amp: 1, color: 0, target: s.shapedCenter };
      }
    }

    if (beamsChanged || !this.cachedMetrics || active !== this.cachedActive) {
      if (source === 'synthesis' && pattern.kind === 'synthesis') {
        this.cachedMetrics = this.patternMetrics(pattern, patternQ);
      } else {
        const cfg = source === 'horn' ? this.hornCfg : s.antenna;
        this.cachedMetrics = computeMetrics(cfg, pattern, active ?? ZERO_BEAM);
      }
      this.cachedActive = active;
      this.cachedPhase = null;
    }
    const metrics = this.cachedMetrics;
    if (!metrics) throw new Error('sin métricas');

    const quantEnabled = s.quant.mode !== 'ideal' && active !== null && source !== 'horn';
    let activePattern: PatternGrid = pattern;
    let activeMetrics: ArrayMetrics = metrics;
    let quantInfo: QuantInfo | null = null;
    let quantPhases: Float64Array | null = null;
    let quantAmps: Float64Array | null = null;
    let quantUpdated = false;

    if (quantEnabled && source === 'synthesis' && this.synth) {
      activePattern = this.synth.grid;
      activeMetrics = this.synthMetrics ?? this.patternMetrics(activePattern, s.antenna.q);
      quantInfo = {
        mode: s.quant.mode,
        resolution: activePattern.size,
        computeMs: this.synthComputeMs,
        stale: false,
        idealMetrics: this.synthIdealMetrics,
        idealPattern: this.synthIdealPattern,
        activeCut: this.synthCut,
        idealCut: this.synthIdealCut,
        pointingErrorDeg: active ? this.pointingError(activePattern, active) : null,
        note: 'Síntesis conformada cuantizada',
      };
      if (activePattern.weightsRe && activePattern.weightsIm) {
        const n = s.antenna.n;
        const phases = new Float64Array(n * n);
        const amps = new Float64Array(n * n);
        for (let i = 0; i < n * n; i++) {
          phases[i] = Math.atan2(activePattern.weightsIm[i], activePattern.weightsRe[i]);
          amps[i] = Math.hypot(activePattern.weightsRe[i], activePattern.weightsIm[i]);
        }
        this.cachedPhase = { phases, amps, n };
      }
    } else if (quantEnabled && active) {
      const key = [
        s.quant.mode, s.quant.phaseBits, s.quant.ampBits, s.quant.phaseRmsDeg,
        s.quant.ampRmsDb, s.quant.seed, active.u.toFixed(5), active.v.toFixed(5),
        s.antenna.n, s.antenna.dx, s.antenna.dy, s.antenna.freqGHz, s.antenna.taper, s.antenna.q, source,
      ].join('|');
      const interval = s.quant.mode === 'analysis' ? 900 : 220;
      const due = !this.quantPattern || (key !== this.quantKey && now - this.lastQuantMs >= interval);
      if (due) {
        const t0 = performance.now();
        const size = s.quant.mode === 'analysis' ? 257 : (s.antenna.n >= 32 ? 129 : 97);
        const qw = quantizedBeamWeights(s.antenna, active, s.quant);
        const qp = patternFromWeights(s.antenna, qw.re, qw.im, size, 1.05);
        const idealWeights = quantizedBeamWeights(s.antenna, active, {
          phaseBits: 0, ampBits: 0, phaseRmsDeg: 0, ampRmsDb: 0, seed: 0,
        });
        const idealPattern = patternFromWeights(s.antenna, idealWeights.re, idealWeights.im, size, 1.05);
        const span = Math.min(60, Math.max(20, this.baseMetrics.hpbwDeg * 4));
        const cut = cutFromWeights(s.antenna, qw.re, qw.im, active, s.antenna.q, span, 481);
        const idealCut = cutFromWeights(s.antenna, idealWeights.re, idealWeights.im, active, s.antenna.q, span, 481);
        this.quantPattern = qp;
        this.quantMetrics = this.metricsFromCut(cut, gridDirectivity(qp, s.antenna.q));
        this.quantIdealPattern = idealPattern;
        this.quantCut = cut;
        this.quantIdealCut = idealCut;
        this.quantIdealMetrics = this.metricsFromCut(idealCut, gridDirectivity(idealPattern, s.antenna.q));
        this.quantPhases = qw.phases;
        this.quantAmps = qw.amps;
        this.quantPointing = this.pointingError(qp, active);
        this.quantMs = performance.now() - t0;
        this.quantKey = key;
        this.lastQuantMs = now;
        this.quantSatEcef = { x: sat.rEcef.x, y: sat.rEcef.y, z: sat.rEcef.z };
        this.quantFrame = frame;
        this.gainDirty = true;
        quantUpdated = true;
        this.cachedPhase = null;
      }
      if (this.quantPattern && this.quantMetrics) {
        activePattern = this.quantPattern;
        activeMetrics = this.quantMetrics;
        quantPhases = this.quantPhases;
        quantAmps = this.quantAmps;
        quantInfo = {
          mode: s.quant.mode,
          resolution: this.quantPattern.size,
          computeMs: this.quantMs,
          stale: false,
          idealMetrics: this.quantIdealMetrics,
          idealPattern: this.quantIdealPattern,
          activeCut: this.quantCut,
          idealCut: this.quantIdealCut,
          pointingErrorDeg: this.quantPointing,
          note: s.mode === 'cellular'
            ? 'Haz activo exacto; mapa multihaz ideal'
            : 'Patrón exacto del haz activo',
        };
      }
    }

    if (!this.cachedPhase) {
      if (source === 'synthesis' && pattern.weightsRe && pattern.weightsIm) {
        const n = s.antenna.n;
        const phases = new Float64Array(n * n);
        const amps = new Float64Array(n * n);
        for (let i = 0; i < n * n; i++) {
          phases[i] = Math.atan2(pattern.weightsIm[i], pattern.weightsRe[i]);
          amps[i] = Math.hypot(pattern.weightsRe[i], pattern.weightsIm[i]);
        }
        this.cachedPhase = { phases, amps, n };
      } else if (quantPhases && quantAmps) {
        this.cachedPhase = { phases: quantPhases, amps: quantAmps, n: s.antenna.n };
      } else if (active) {
        const cfg = source === 'horn' ? this.hornCfg : s.antenna;
        const map = beamPhaseMap(cfg, active);
        this.cachedPhase = { phases: map.phases, amps: map.amps, n: cfg.n };
      } else {
        const n = source === 'horn' ? 1 : s.antenna.n;
        this.cachedPhase = { phases: new Float64Array(n * n), amps: new Float64Array(n * n).fill(1), n };
      }
    }

    const showGainTurnedOn = !this.lastShowGain && s.showGain;
    this.lastShowGain = s.showGain;
    if (showGainTurnedOn) this.gainDirty = true;

    let gainMap = initial ? EMPTY_GAIN : this.derived.gainMap;
    const gainInterval = s.mode === 'cellular' ? 850 : 160;
    if (!s.showGain) {
      // Omitir computeGainMap y maskGainMap mientras la capa de ganancia esté oculta.
    } else if ((beams.length === 0 && s.mode !== 'global') || (s.mode === 'shaped' && !synthActive)) {
      gainMap = EMPTY_GAIN;
      this.gainDirty = false;
      this.lastGainMs = now;
    } else if (this.gainDirty && (now - this.lastGainMs > gainInterval || initial || quantUpdated || showGainTurnedOn)) {
      const count = beams.length;
      const size = count > 1600 ? 128 : count > 800 ? 160 : count > 400 ? 192 : count > 180 ? 224 : count > 80 ? 256 : count > 30 ? 320 : 384;
      let snapSat: Vec3;
      let snapFrame: AntennaFrame;
      let groundFixed: boolean;
      if (source === 'synthesis') {
        snapSat = this.synthSatEcef ?? sat.rEcef;
        snapFrame = this.synthFrame ?? frame;
        groundFixed = true;
        gainMap = computeGainMap(pattern, [SHAPED_BEAM], patternQ, size);
      } else if (quantEnabled && s.mode !== 'cellular' && activePattern !== pattern && activePattern) {
        snapSat = this.quantSatEcef ?? sat.rEcef;
        snapFrame = this.quantFrame ?? frame;
        groundFixed = s.mode === 'spot' ? s.spotFixed : false;
        gainMap = computeGainMap(activePattern, [SHAPED_BEAM], patternQ, size);
      } else {
        snapSat = this.lastBeamFrame ? this.lastBeamSat : sat.rEcef;
        snapFrame = this.lastBeamFrame ?? frame;
        groundFixed = (s.mode === 'cellular' && s.region !== 'visible') || (s.mode === 'spot' && s.spotFixed);
        gainMap = computeGainMap(pattern, beams, patternQ, size, s.mode === 'cellular' ? 'max' : 'sum');
      }
      if (s.mode === 'cellular' || s.mode === 'shaped' || s.mode === 'spot') {
        this.maskGainMap(gainMap, snapSat, snapFrame, s, active);
      }
      gainMap.snapshot = {
        satEcef: { x: snapSat.x, y: snapSat.y, z: snapSat.z },
        frame: snapFrame,
        groundFixed,
      };
      this.gainDirty = false;
      this.lastGainMs = now;
    }

    let rangeKm = sat.alt;
    let elevationDeg = 90;
    if (active) {
      if (active.target) {
        rangeKm = slantRange(sat.rEcef, active.target.lat * DEG, active.target.lon * DEG);
        elevationDeg = elevationAngle(sat.rEcef, active.target.lat * DEG, active.target.lon * DEG) / DEG;
      } else if (s.mode === 'shaped') {
        rangeKm = slantRange(sat.rEcef, s.shapedCenter.lat * DEG, s.shapedCenter.lon * DEG);
        elevationDeg = elevationAngle(sat.rEcef, s.shapedCenter.lat * DEG, s.shapedCenter.lon * DEG) / DEG;
      } else {
        const pt = beamGroundPoint(sat.rEcef, frame, active);
        if (pt) {
          const geo = ecefToGeodetic(pt);
          rangeKm = slantRange(sat.rEcef, geo.lat, geo.lon);
          elevationDeg = elevationAngle(sat.rEcef, geo.lat, geo.lon) / DEG;
        }
      }
    }

    const upFreqGHz = uplinkFrequencyGHz(s.antenna.freqGHz);
    const upGainScale = 20 * Math.log10(upFreqGHz / s.antenna.freqGHz);
    const terminalUpGain = s.rxGainDbi > 0 ? s.rxGainDbi + upGainScale : s.rxGainDbi;
    const satUpGain = activeMetrics.gainDb + upGainScale;
    const ciDb = s.mode === 'cellular' && s.cellularCi && active
      ? coChannelCiDb(this.baseGrid, beams, active)
      : null;
    const downlink = active
      ? linkBudget({
          slantKm: rangeKm,
          freqGHz: s.antenna.freqGHz,
          txPowerW: s.ptxW,
          txGainDbi: activeMetrics.gainDb,
          rxGainDbi: s.rxGainDbi,
          noiseFigureDb: s.noiseFigureDb,
          bandwidthMHz: s.bandwidthMHz,
          elevationDeg,
          rainMarginDb: s.rainMarginDb,
          usersPerBeam: s.usersPerBeam,
          coChannelCiDb: ciDb,
        })
      : null;
    const uplink = active
      ? linkBudget({
          slantKm: rangeKm,
          freqGHz: upFreqGHz,
          txPowerW: s.uplinkPowerW,
          txGainDbi: terminalUpGain,
          rxGainDbi: satUpGain,
          noiseFigureDb: SAT_NOISE_FIGURE_DB,
          antennaTempK: SAT_ANTENNA_TEMP_K,
          bandwidthMHz: s.bandwidthMHz,
          elevationDeg,
          rainMarginDb: s.rainMarginDb,
          usersPerBeam: s.usersPerBeam,
          coChannelCiDb: ciDb,
        })
      : null;
    const link = s.linkDirection === 'uplink' ? uplink : downlink;

    const colors = s.mode === 'cellular' ? s.reuse : 1;
    const downMbps = downlink?.throughputMbps ?? 0;
    const upMbps = uplink?.throughputMbps ?? 0;
    const perBeamMbps = active ? Math.min(downMbps, upMbps) : 0;
    let limitingLink: 'downlink' | 'uplink' | null = null;
    if (active) {
      if (downMbps < upMbps) limitingLink = 'downlink';
      else if (upMbps < downMbps) limitingLink = 'uplink';
      else if (downlink && uplink) limitingLink = downlink.cnDb <= uplink.cnDb ? 'downlink' : 'uplink';
    }
    const system: SystemInfo = {
      activeBeams: beams.length,
      rfPowerW: beams.length * s.ptxW,
      spectrumMHz: colors * s.bandwidthMHz,
      capacityMbps: colors * perBeamMbps,
      aggregateCapacityMbps: (s.mode === 'cellular' ? beams.length : 1) * perBeamMbps,
      perUserMbps: perBeamMbps / Math.max(1, s.usersPerBeam),
      coverageFraction: beamSet?.coverageFraction ?? (s.mode === 'shaped' ? (this.synthInfo?.coverage ?? null) : null),
      limitingLink,
    };

    return {
      sat,
      frame,
      pattern,
      patternQ,
      metrics,
      activePattern,
      activeMetrics,
      quant: quantInfo,
      beams,
      activeBeam: active,
      gainMap,
      phase: this.cachedPhase,
      link,
      links: { downlink, uplink },
      beamSet,
      shaped: this.synthInfo,
      system,
      source,
    };
  }

  private computeBeams(sat: OrbitState, frame: AntennaFrame): { beams: Beam[]; beamSet: Derived['beamSet'] } {
    const s = this.state;
    if (s.mode === 'global') {
      return {
        beams: [{ id: 0, u: 0, v: 0, amp: 1, color: 0, label: 'Global' }],
        beamSet: null,
      };
    }
    if (s.mode === 'spot') {
      if (s.spotFixed) {
        const res = beamToTarget(sat.rEcef, frame, s.spotTarget.lat, s.spotTarget.lon, 0);
        if (!res) return { beams: [], beamSet: null };
        this.bodyBeam = { u: res.beam.u, v: res.beam.v };
        return { beams: [res.beam], beamSet: null };
      }
      if (!this.bodyBeam) {
        const res = beamToTarget(sat.rEcef, frame, s.spotTarget.lat, s.spotTarget.lon, 0);
        this.bodyBeam = res ? { u: res.beam.u, v: res.beam.v } : { u: 0, v: 0 };
      }
      return {
        beams: [{ id: 0, u: this.bodyBeam.u, v: this.bodyBeam.v, amp: 1, color: 0, label: 'Cuerpo' }],
        beamSet: null,
      };
    }
    if (s.mode === 'cellular') {
      const poly = regionPolygon(s.region);
      if (!poly) {
        const beams = beamsVisibleLattice(sat.rEcef, frame, this.baseMetrics.hpbwDeg, s.reuse, 1200);
        const radius = R_EARTH * Math.acos(R_EARTH / (R_EARTH + Math.max(1, sat.alt)));
        const area = Math.PI * radius * radius;
        const spacing = cellSpacingKm(sat.alt, Math.max(1.2, this.baseMetrics.hpbwDeg));
        const footRadius = sat.alt * Math.tan((Math.max(1.2, this.baseMetrics.hpbwDeg) * DEG) / 2);
        const coverageFraction = area > 0
          ? Math.min(1, (beams.length * Math.PI * footRadius * footRadius) / area)
          : 0;
        return {
          beams,
          beamSet: {
            visibleCells: beams.length,
            totalCells: beams.length,
            coverageFraction,
            spacingKm: spacing,
          },
        };
      }
      this.rebuildCells(sat);
      const res = beamsForGroundCells(this.cells, sat.rEcef, frame, s.reuse, 10, 0.98);
      const area = regionAreaKm2(poly);
      const footRadius = sat.alt * Math.tan((Math.max(1.2, this.baseMetrics.hpbwDeg) * DEG) / 2);
      const coverageFraction = area > 0
        ? Math.min(1, (res.visibleCells * Math.PI * footRadius * footRadius) / area)
        : 0;
      return {
        beams: res.beams,
        beamSet: {
          visibleCells: res.visibleCells,
          totalCells: res.totalCells,
          coverageFraction,
          spacingKm: this.cellSpacing,
        },
      };
    }
    // shaped: un haz marcador en el centro de la zona
    const ang = anglesForGroundPoint(sat.rEcef, frame, s.shapedCenter.lat * DEG, s.shapedCenter.lon * DEG);
    if (ang.w <= 0.02) return { beams: [], beamSet: null };
    return {
      beams: [{ id: 0, u: ang.u, v: ang.v, amp: 1, color: 0, label: 'Zona', target: s.shapedCenter }],
      beamSet: null,
    };
  }

  private rebuildCells(sat: OrbitState) {
    const s = this.state;
    const poly = regionPolygon(s.region);
    if (!poly) {
      this.cells = [];
      this.cellKey = 'visible';
      return;
    }
    const spacing = cellSpacingKm(sat.alt, Math.max(1.2, this.baseMetrics.hpbwDeg));
    this.cellSpacing = spacing;
    const key = `${s.region}|${spacing.toFixed(1)}|2500`;
    if (key === this.cellKey) return;
    this.cellKey = key;
    this.cells = buildGroundCells(poly, spacing, 2500);
  }

  private pickActive(beams: Beam[]): number {
    const s = this.state;
    if (s.mode === 'cellular' && s.cellTarget) {
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < beams.length; i++) {
        const t = beams[i].target;
        if (!t) continue;
        const dLat = (t.lat - s.cellTarget.lat) * DEG;
        const dLon = (t.lon - s.cellTarget.lon) * DEG;
        const a =
          Math.sin(dLat / 2) ** 2 +
          Math.cos(s.cellTarget.lat * DEG) * Math.cos(t.lat * DEG) * Math.sin(dLon / 2) ** 2;
        const d = 2 * Math.asin(Math.min(1, Math.sqrt(a)));
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      return best;
    }
    let best = 0;
    let bestTheta = Infinity;
    for (let i = 0; i < beams.length; i++) {
      const th = Math.acos(Math.min(1, Math.sqrt(Math.max(0, 1 - beams[i].u ** 2 - beams[i].v ** 2))));
      if (th < bestTheta) {
        bestTheta = th;
        best = i;
      }
    }
    return best;
  }

  private patternMetrics(pattern: PatternGrid, q: number): ArrayMetrics {
    const peak = peakDirection(pattern);
    const span = Math.min(60, Math.max(20, this.baseMetrics.hpbwDeg * 4));
    const cut = patternCutAt(pattern, peak.u, peak.v, q, span, 481);
    let hpbw = 0;
    let mid = 0;
    for (let i = 0; i < cut.length; i++) {
      if (Math.abs(cut[i].angle) < Math.abs(cut[mid].angle)) mid = i;
    }
    let li = mid;
    let ri = mid;
    while (li > 0 && cut[li].db > -3) li--;
    while (ri < cut.length - 1 && cut[ri].db > -3) ri++;
    if (cut[li].db <= -3 && cut[ri].db <= -3) {
      hpbw = Math.abs(cut[ri].angle - cut[li].angle);
    }
    if (!hpbw) hpbw = this.baseMetrics.hpbwDeg * 2;
    let maxOutside = -100;
    for (const p of cut) {
      if (Math.abs(p.angle) < hpbw * 1.05) continue;
      maxOutside = Math.max(maxOutside, p.db);
    }
    const ap = this.state.antenna;
    const D = gridDirectivity(pattern, q);
    return {
      directivityDb: D,
      gainDb: D + 10 * Math.log10(Math.max(ap.efficiency, 1e-6)),
      hpbwDeg: hpbw,
      sllDb: maxOutside,
      apertureM: this.baseMetrics.apertureM,
      lambdaM: this.baseMetrics.lambdaM,
      elementGainDb: this.baseMetrics.elementGainDb,
      grating: this.baseMetrics.grating,
    };
  }

  private metricsFromCut(cut: PatternCutPoint[], directivityDb: number): ArrayMetrics {
    let mid = 0;
    for (let i = 0; i < cut.length; i++) {
      if (Math.abs(cut[i].angle) < Math.abs(cut[mid].angle)) mid = i;
    }
    let li = mid;
    let ri = mid;
    while (li > 0 && cut[li].db > -3) li--;
    while (ri < cut.length - 1 && cut[ri].db > -3) ri++;
    const hpbw = Math.abs(cut[ri].angle - cut[li].angle);
    let sll = -100;
    for (const p of cut) {
      if (Math.abs(p.angle) < hpbw * 1.05) continue;
      sll = Math.max(sll, p.db);
    }
    const ap = this.state.antenna;
    return {
      directivityDb,
      gainDb: directivityDb + 10 * Math.log10(Math.max(ap.efficiency, 1e-6)),
      hpbwDeg: hpbw,
      sllDb: sll,
      apertureM: this.baseMetrics.apertureM,
      lambdaM: this.baseMetrics.lambdaM,
      elementGainDb: this.baseMetrics.elementGainDb,
      grating: this.baseMetrics.grating,
    };
  }

  private pointingError(pattern: PatternGrid, beam: Beam): number {
    const peak = peakDirection(pattern);
    const w0 = Math.sqrt(Math.max(0, 1 - beam.u * beam.u - beam.v * beam.v));
    const wp = Math.sqrt(Math.max(0, 1 - peak.u * peak.u - peak.v * peak.v));
    const dot = Math.max(-1, Math.min(1, peak.u * beam.u + peak.v * beam.v + wp * w0));
    return Math.acos(dot) * (180 / Math.PI);
  }

  private synthesisKey(): string {
    const s = this.state;
    const a = s.antenna;
    const o = s.orbit;
    return [
      s.shapedCenter.lat.toFixed(3), s.shapedCenter.lon.toFixed(3), s.shapedRadiusKm,
      a.n, a.dx, a.dy, a.freqGHz, a.taper, a.q,
      s.simTime, o.a.toFixed(3), o.e.toFixed(6), o.i.toFixed(6), o.raan.toFixed(6),
      o.argp.toFixed(6), o.M0.toFixed(6), o.epoch,
      s.quant.mode, s.quant.phaseBits, s.quant.ampBits, s.quant.phaseRmsDeg, s.quant.ampRmsDb, s.quant.seed,
    ].join('|');
  }

  /** Prepara las muestras geométricas del haz conformado (rápido, sin resolver CG). */
  prepareShapedSynthesis(): PreparedShapedSynthesis {
    const s = this.state;
    const sat = propagate(s.orbit, s.simTime, true);
    const frame = antennaBasis(sat.rEcef);
    const center = anglesForGroundPoint(sat.rEcef, frame, s.shapedCenter.lat * DEG, s.shapedCenter.lon * DEG);
    if (center.w <= 0.02) {
      throw new Error('La zona no es visible desde el satélite. Mueve el tiempo o elige otro centro.');
    }
    const scan = Math.acos(Math.max(-1, Math.min(1, center.w)));
    if (scan > 62 * DEG) {
      throw new Error('La zona está a más de 62° de nadir: el haz se deforma demasiado. Reposiciona el satélite.');
    }

    const hpbw = Math.max(1.2, this.baseMetrics.hpbwDeg) * DEG;
    const radiusKm = Math.max(10, s.shapedRadiusKm);
    const edgeKm = Math.max(10, 0.55 * hpbw * center.range);
    const guardKm = edgeKm + Math.max(40, 4 * hpbw * center.range);
    const totalKm = radiusKm + guardKm;
    const stepKm = Math.max(6, Math.min(20, radiusKm / 14));
    const cosLat = Math.max(0.2, Math.cos(s.shapedCenter.lat * DEG));
    const dLat = stepKm / R_EARTH;
    const dLon = dLat / cosLat;
    const latSpan = totalKm / R_EARTH;
    const lonSpan = latSpan / cosLat;
    const lat0 = s.shapedCenter.lat * DEG;
    const lon0 = s.shapedCenter.lon * DEG;
    const edgeFrac = edgeKm / radiusKm;
    const inside: DirectionSample[] = [];
    const outside: DirectionSample[] = [];

    // Muestreo en coordenadas de Tierra: el objetivo es un círculo de radio
    // `radiusKm` sobre la superficie, no un círculo en el espacio (u,v).
    for (let dlat = -latSpan; dlat <= latSpan + 1e-12; dlat += dLat) {
      for (let dlon = -lonSpan; dlon <= lonSpan + 1e-12; dlon += dLon) {
        const lat = lat0 + dlat;
        const lon = lon0 + dlon;
        if (lat <= -Math.PI / 2 || lat >= Math.PI / 2) continue;
        const groundKm = Math.hypot(dlat, dlon * cosLat) * R_EARTH;
        if (groundKm > totalKm + stepKm) continue;
        const ang = anglesForGroundPoint(sat.rEcef, frame, lat, lon);
        if (ang.w <= 0.02) continue;
        const rho = groundKm / radiusKm;
        if (rho <= 1) {
          inside.push({ u: ang.u, v: ang.v, desired: 1, inside: true, lat, lon, weight: 4 });
        } else if (rho <= 1 + edgeFrac) {
          const desired = 0.5 * (1 + Math.cos((Math.PI * (rho - 1)) / edgeFrac));
          inside.push({ u: ang.u, v: ang.v, desired, inside: false, lat, lon, weight: 0.5 });
        } else {
          outside.push({ u: ang.u, v: ang.v, desired: 0, inside: false, lat, lon, weight: 1.0 });
        }
      }
    }

    let maxInUv = 0;
    for (const p of inside) {
      maxInUv = Math.max(maxInUv, Math.hypot(p.u - center.u, p.v - center.v));
    }
    const farMinR = Math.min(0.92, maxInUv + 0.03);
    const farOutside: DirectionSample[] = [];
    const farStep = 0.085;
    for (let u = -0.96; u <= 0.96 + 1e-9; u += farStep) {
      for (let v = -0.96; v <= 0.96 + 1e-9; v += farStep) {
        if (u * u + v * v > 0.96) continue;
        const du = u - center.u;
        const dv = v - center.v;
        if (Math.hypot(du, dv) <= farMinR) continue;
        farOutside.push({ u, v, desired: 0, inside: false, lat: 0, lon: 0, weight: 0.45 });
      }
    }

    if (inside.filter((x) => x.inside).length < 12) {
      throw new Error('La zona es demasiado pequeña para la apertura actual. Aumenta el radio.');
    }

    const thin = <T>(arr: T[], max: number): T[] => {
      if (arr.length <= max) return arr;
      const stride = arr.length / max;
      return Array.from({ length: max }, (_, i) => arr[Math.floor(i * stride)]);
    };

    const centerBeam: Beam = { id: 0, u: center.u, v: center.v, amp: 1, color: 0 };
    return {
      job: {
        antenna: { ...s.antenna },
        quant: { ...s.quant },
        baseHpbwDeg: this.baseMetrics.hpbwDeg,
        centerBeam,
        inside: thin(inside, 900),
        outside: [...thin(outside, 300), ...thin(farOutside, 400)],
      },
      satEcef: { x: sat.rEcef.x, y: sat.rEcef.y, z: sat.rEcef.z },
      frame,
    };
  }

  /** Valida y aplica el resultado de la síntesis (desde el Web Worker o modo síncrono). */
  applyShapedSynthesis(prep: PreparedShapedSynthesis, output: ShapedSynthesisOutput): ShapedInfo {
    const s = this.state;
    const directivity = output.finalDirectivityDb;
    const dMax =
      10 * Math.log10(4 * Math.PI * (s.antenna.n * s.antenna.dx) * (s.antenna.n * s.antenna.dy));
    if (directivity > dMax + 1.5) {
      throw new Error('La síntesis no converge para esta geometría. Prueba otro radio o vuelve a intentar.');
    }
    if (output.finalResult.insideCoverage < 0.25) {
      throw new Error('No se logró cubrir la zona. Reduce el radio o aumenta el número de elementos.');
    }

    this.synthIdealPattern = output.result.grid;
    this.synthIdealCut = output.idealCut;
    this.synthIdealMetrics = this.metricsFromCut(output.idealCut, output.idealDirectivityDb);
    this.synthCut = output.activeCut;
    this.synthMetrics = this.metricsFromCut(output.activeCut, directivity);
    this.synth = output.finalResult;
    this.synthComputeMs = output.computeMs;
    this.synthKey = this.synthesisKey();
    this.synthSatEcef = { x: prep.satEcef.x, y: prep.satEcef.y, z: prep.satEcef.z };
    this.synthFrame = prep.frame;

    const info: ShapedInfo = {
      coverage: output.finalResult.insideCoverage,
      spillDb: output.finalResult.outsideMaxDb,
      directivityDb: directivity,
      radiusKm: s.shapedRadiusKm,
      meanDb: output.finalResult.insideMeanDb,
    };
    this.synthInfo = info;
    this.beamsDirty = true;
    this.gainDirty = true;
    this.cachedPhase = null;
    this.cachedMetrics = null;
    return info;
  }

  /** Diseña la fase/amplitud de forma síncrona para iluminar la zona circular seleccionada. */
  synthesizeShaped(): ShapedInfo {
    const prep = this.prepareShapedSynthesis();
    this.synth = null;
    this.synthKey = '';
    this.synthInfo = null;
    const output = runShapedSynthesisJob(prep.job);
    return this.applyShapedSynthesis(prep, output);
  }

  /**
   * Recorta el mapa de ganancia a la región que realmente se está cubriendo.
   *
   * El cálculo de haces es correcto, pero el overlay de color podía extenderse
   * fuera de la huella y dar la impresión de una cobertura mayor. Para celular
   * uso el polígono de la región; para conformado, el círculo de diseño con un
   * pequeño margen.
   */
  private maskGainMap(map: GainMap, sat: Vec3, frame: AntennaFrame, s: SimState, active: Beam | null) {
    const size = map.size;
    const poly = s.mode === 'cellular' ? regionPolygon(s.region) : null;
    const shapedLat = s.shapedCenter.lat * DEG;
    const shapedLon = s.shapedCenter.lon * DEG;
    const shapedRadius = (s.shapedRadiusKm * 1.06) / R_EARTH;
    let spotLat = s.spotTarget.lat * DEG;
    let spotLon = s.spotTarget.lon * DEG;
    let spotRadius = 0;
    if (s.mode === 'spot' && active) {
      if (s.spotFixed && active.target) {
        spotLat = active.target.lat * DEG;
        spotLon = active.target.lon * DEG;
      } else {
        const gp = beamGroundPoint(sat, frame, active);
        if (!gp) {
          map.data.fill(0);
          map.rgba.fill(0);
          map.max = 0;
          return;
        }
        const g = ecefToGeodetic(gp);
        spotLat = g.lat;
        spotLon = g.lon;
      }
      const ring = footprintRing(sat, frame, active, (this.baseMetrics.hpbwDeg * DEG) / 2, 64);
      for (const p of ring) {
        const g = ecefToGeodetic(p);
        const cosD = Math.sin(g.lat) * Math.sin(spotLat)
          + Math.cos(g.lat) * Math.cos(spotLat) * Math.cos(g.lon - spotLon);
        spotRadius = Math.max(spotRadius, Math.acos(Math.max(-1, Math.min(1, cosD))));
      }
      spotRadius = Math.min(Math.PI, spotRadius * 1.08 + 0.005);
    }
    for (let iv = 0; iv < size; iv++) {
      const v = -1 + (2 * (iv + 0.5)) / size;
      for (let iu = 0; iu < size; iu++) {
        const u = -1 + (2 * (iu + 0.5)) / size;
        const idx = iv * size + iu;
        if (u * u + v * v > 1) {
          map.data[idx] = 0;
          map.rgba[idx * 4 + 3] = 0;
          continue;
        }
        const pt = beamGroundPoint(sat, frame, { id: 0, u, v, amp: 1, color: 0 });
        if (!pt) {
          map.data[idx] = 0;
          map.rgba[idx * 4 + 3] = 0;
          continue;
        }
        const geo = ecefToGeodetic(pt);
        let inside = true;
        if (poly) {
          inside = pointInPolygon(geo.lat / DEG, geo.lon / DEG, poly);
        } else if (s.mode === 'shaped') {
          const cosD = Math.sin(geo.lat) * Math.sin(shapedLat)
            + Math.cos(geo.lat) * Math.cos(shapedLat) * Math.cos(geo.lon - shapedLon);
          inside = Math.acos(Math.max(-1, Math.min(1, cosD))) <= shapedRadius;
        } else if (s.mode === 'spot' && active) {
          const cosD = Math.sin(geo.lat) * Math.sin(spotLat)
            + Math.cos(geo.lat) * Math.cos(spotLat) * Math.cos(geo.lon - spotLon);
          inside = spotRadius > 0
            ? Math.acos(Math.max(-1, Math.min(1, cosD))) <= spotRadius
            : true;
        }
        if (!inside) {
          map.data[idx] = 0;
          map.rgba[idx * 4 + 3] = 0;
        }
      }
    }
    let anyPositive = false;
    for (let i = 0; i < map.data.length; i++) {
      if (map.data[i] > 0) {
        anyPositive = true;
        break;
      }
    }
    if (!anyPositive) map.max = 0;
  }
}
