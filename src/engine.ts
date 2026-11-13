import {
  type ArrayConfig,
  type ArrayMetrics,
  type Beam,
  type GainMap,
  type PatternGrid,
  beamPhaseMap,
  compositePower,
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
import {
  anglesForGroundPoint,
  beamGroundPoint,
  type AntennaFrame,
} from './core/geometry';
import { linkBudget } from './core/link';
import { quantizedBeamWeights, quantizedComplexWeights } from './core/quantization';
import {
  antennaBasis,
  ecefToGeodetic,
  elevationAngle,
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
} from './core/coverage';
import {
  buildGroundCells,
  regionAreaKm2,
  regionPolygon,
  type DirectionSample,
  type GroundCell,
} from './core/regions';
import { synthesizeCoverage, type SynthesisResult } from './core/synthesis';
import type { Derived, Mode, PhaseView, QuantInfo, ShapedInfo, SimState, SystemInfo } from './state';

const ZERO_BEAM: Beam = { id: 0, u: 0, v: 0, amp: 1, color: 0 };
const SHAPED_BEAM: Beam = { id: 0, u: 0, v: 0, amp: 1, color: 1 };
const EMPTY_GAIN: GainMap = { size: 1, data: new Float32Array([0]), max: 0, rgba: new Uint8Array([0, 0, 0, 0]) };
/** En GEO una bocina de 17° cubre el disco; en LEO hace falta ~134°. */
const GLOBAL_HPBW = 134;

export class Engine {
  state: SimState;
  derived: Derived;

  private baseGrid: PatternGrid;
  private baseMetrics: ArrayMetrics;
  private hornGrid: PatternGrid;
  private hornMetrics: ArrayMetrics;
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
  private beamsDirty = true;
  private gainDirty = true;
  private lastBeamMs = 0;
  private lastGainMs = 0;
  private lastBeamSat = { x: Infinity, y: Infinity, z: Infinity };
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
      q: qForHpbw(GLOBAL_HPBW),
      efficiency: 0.65,
    };
    this.hornGrid = computeBasePattern(this.hornCfg);
    this.hornMetrics = computeMetrics(this.hornCfg, this.hornGrid, ZERO_BEAM);
    this.baseGrid = computeBasePattern(state.antenna);
    this.baseMetrics = computeMetrics(state.antenna, this.baseGrid, ZERO_BEAM);
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
      this.hornMetrics = computeMetrics(this.hornCfg, this.hornGrid, ZERO_BEAM);
      this.patternDirty = false;
      this.beamsDirty = true;
      this.gainDirty = true;
      this.cachedPhase = null;
    }
    if (this.cachedPhase && this.cachedPhase.n !== s.antenna.n) this.cachedPhase = null;

    let beams = initial ? [] : this.derived.beams;
    let beamSet = initial ? null : this.derived.beamSet;
    let beamsChanged = initial;

    const spotInterval = 110;
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
        const size = s.quant.mode === 'analysis' ? 257 : 65;
        const qw = quantizedBeamWeights(s.antenna, active, s.quant);
        const qp = patternFromWeights(s.antenna, qw.re, qw.im, size, 1.35);
        const idealWeights = quantizedBeamWeights(s.antenna, active, {
          phaseBits: 0, ampBits: 0, phaseRmsDeg: 0, ampRmsDb: 0, seed: 0,
        });
        const idealPattern = patternFromWeights(s.antenna, idealWeights.re, idealWeights.im, size, 1.35);
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

    let gainMap = initial ? EMPTY_GAIN : this.derived.gainMap;
    const gainInterval = s.mode === 'cellular' ? 850 : 160;
    if (this.gainDirty && (now - this.lastGainMs > gainInterval || initial)) {
      const count = beams.length;
      const size = count > 1600 ? 128 : count > 800 ? 160 : count > 400 ? 192 : count > 180 ? 224 : count > 80 ? 256 : count > 30 ? 320 : 384;
      if (source === 'synthesis') {
        gainMap = computeGainMap(pattern, [SHAPED_BEAM], patternQ, size);
      } else if (quantEnabled && s.mode !== 'cellular' && activePattern !== pattern && activePattern) {
        gainMap = computeGainMap(activePattern, [SHAPED_BEAM], patternQ, size);
      } else {
        gainMap = computeGainMap(pattern, beams.length ? beams : [ZERO_BEAM], patternQ, size, s.mode === 'cellular' ? 'max' : 'sum');
      }
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

    const link = active
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
        })
      : null;

    const colors = s.mode === 'cellular' ? s.reuse : 1;
    const system: SystemInfo = {
      activeBeams: beams.length,
      rfPowerW: beams.length * s.ptxW,
      spectrumMHz: colors * s.bandwidthMHz,
      capacityMbps: colors * (link?.throughputMbps ?? 0),
      perUserMbps: link?.userThroughputMbps ?? 0,
      coverageFraction: beamSet?.coverageFraction ?? (s.mode === 'shaped' ? (this.synthInfo?.coverage ?? null) : null),
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
        ? Math.min(1, (this.cells.length * Math.PI * footRadius * footRadius) / area)
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

  /** Diseña la fase/amplitud para iluminar la zona circular seleccionada. */
  synthesizeShaped(): ShapedInfo {
    const s = this.state;
    const t0 = performance.now();
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
    this.synth = null;
    this.synthKey = '';
    this.synthInfo = null;

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

    const maxR = Math.min(0.94, totalKm / Math.max(1, center.range));
    const farStep = 0.12;
    for (let u = -0.9; u <= 0.9 + 1e-9; u += farStep) {
      for (let v = -0.9; v <= 0.9 + 1e-9; v += farStep) {
        if (u * u + v * v > 0.9) continue;
        const du = u - center.u;
        const dv = v - center.v;
        if (Math.hypot(du, dv) <= maxR) continue;
        outside.push({ u, v, desired: 0, inside: false, lat: 0, lon: 0, weight: 0.28 });
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

    const result = synthesizeCoverage(s.antenna, thin(inside, 900), thin(outside, 500), 1e-2);
    const centerBeam: Beam = { id: 0, u: center.u, v: center.v, amp: 1, color: 0 };
    const span = Math.min(60, Math.max(20, this.baseMetrics.hpbwDeg * 4));
    const idealCut = cutFromWeights(s.antenna, result.re, result.im, centerBeam, s.antenna.q, span, 481);
    this.synthIdealPattern = result.grid;
    this.synthIdealCut = idealCut;
    this.synthIdealMetrics = this.metricsFromCut(idealCut, gridDirectivity(result.grid, s.antenna.q));
    this.synthCut = idealCut;
    this.synthMetrics = this.synthIdealMetrics;
    let finalResult = result;
    if (s.quant.mode !== 'ideal') {
      const qw = quantizedComplexWeights(s.antenna, result.re, result.im, s.quant);
      const qgrid = patternFromWeights(s.antenna, qw.re, qw.im);
      const measured = this.measureSynthesis(qgrid, inside, outside, s.antenna.q);
      const qCut = cutFromWeights(s.antenna, qw.re, qw.im, centerBeam, s.antenna.q, span, 481);
      this.synthMetrics = this.metricsFromCut(qCut, gridDirectivity(qgrid, s.antenna.q));
      this.synthCut = qCut;
      finalResult = {
        ...result,
        re: qw.re,
        im: qw.im,
        grid: qgrid,
        insideCoverage: measured.coverage,
        insideMeanDb: measured.mean,
        outsideMaxDb: measured.spill,
        conditionNote: `${result.conditionNote} · cuantizado`,
      };
    }
    const directivity = gridDirectivity(finalResult.grid, s.antenna.q);
    const dMax =
      10 * Math.log10(4 * Math.PI * (s.antenna.n * s.antenna.dx) * (s.antenna.n * s.antenna.dy));
    if (directivity > dMax + 1.5) {
      throw new Error('La síntesis no converge para esta geometría. Prueba otro radio o vuelve a intentar.');
    }
    if (finalResult.insideCoverage < 0.25) {
      throw new Error('No se logró cubrir la zona. Reduce el radio o aumenta el número de elementos.');
    }
    this.synth = finalResult;
    this.synthComputeMs = performance.now() - t0;
    this.synthKey = this.synthesisKey();
    const info: ShapedInfo = {
      coverage: finalResult.insideCoverage,
      spillDb: finalResult.outsideMaxDb,
      directivityDb: directivity,
      radiusKm: s.shapedRadiusKm,
      meanDb: finalResult.insideMeanDb,
    };
    this.synthInfo = info;
    this.beamsDirty = true;
    this.gainDirty = true;
    this.cachedPhase = null;
    this.cachedMetrics = null;
    return info;
  }

  private measureSynthesis(
    grid: PatternGrid,
    inside: DirectionSample[],
    outside: DirectionSample[],
    q: number,
  ): { coverage: number; mean: number; spill: number } {
    const beam: Beam = { id: 0, u: 0, v: 0, amp: 1, color: 0 };
    let covered = 0;
    let count = 0;
    let sum = 0;
    for (const p of inside) {
      if (!p.inside) continue;
      count++;
      const power = compositePower(grid, [beam], p.u, p.v, q);
      const db = 10 * Math.log10(Math.max(power, 1e-12));
      if (db >= -3) covered++;
      sum += db;
    }
    let spill = -Infinity;
    for (const p of outside) {
      const power = compositePower(grid, [beam], p.u, p.v, q);
      spill = Math.max(spill, 10 * Math.log10(Math.max(power, 1e-12)));
    }
    return {
      coverage: covered / Math.max(1, count),
      mean: sum / Math.max(1, count),
      spill,
    };
  }
}
