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
  peakDirection,
  qForHpbw,
} from './core/array';
import { DEG } from './core/constants';
import {
  anglesForGroundPoint,
  beamGroundPoint,
  type AntennaFrame,
} from './core/geometry';
import { linkBudget } from './core/link';
import { antennaBasis, ecefToGeodetic, propagate, slantRange, type OrbitElements, type OrbitState } from './core/orbit';
import {
  beamsForGroundCells,
  beamsVisibleLattice,
  beamToTarget,
  cellSpacingKm,
} from './core/coverage';
import {
  buildGroundCells,
  regionPolygon,
  type DirectionSample,
  type GroundCell,
} from './core/regions';
import { synthesizeCoverage, type SynthesisResult } from './core/synthesis';
import type { Derived, Mode, PhaseView, ShapedInfo, SimState } from './state';

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

  private cells: GroundCell[] = [];
  private cellKey = '';

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
    this.beamsDirty = true;
    this.gainDirty = true;
    if (mode === 'spot' && this.bodyBeam) {
      // conserva la última dirección apuntada
    }
  }

  setAntenna(patch: Partial<ArrayConfig>) {
    Object.assign(this.state.antenna, patch);
    this.synth = null;
    this.synthKey = '';
    this.synthInfo = null;
    this.cellKey = '';
    this.patternDirty = true;
  }

  setFrequency(freqGHz: number) {
    this.state.antenna.freqGHz = freqGHz;
    this.hornCfg = { ...this.hornCfg, freqGHz };
    this.synth = null;
    this.synthKey = '';
    this.synthInfo = null;
    this.patternDirty = true;
  }

  setOrbit(orbit: OrbitElements, presetId?: string) {
    this.state.orbit = orbit;
    if (presetId) this.state.presetId = presetId;
    this.cellKey = '';
    this.beamsDirty = true;
  }

  setSpotTarget(lat: number, lon: number) {
    this.state.spotTarget = { lat, lon };
    this.state.spotFixed = true;
    this.bodyBeam = null;
    this.beamsDirty = true;
  }

  setSpotFixed(fixed: boolean) {
    if (!fixed && this.derived.activeBeam) {
      this.bodyBeam = { u: this.derived.activeBeam.u, v: this.derived.activeBeam.v };
    }
    this.state.spotFixed = fixed;
    this.beamsDirty = true;
  }

  setShapedCenter(lat: number, lon: number) {
    this.state.shapedCenter = { lat, lon };
    this.synth = null;
    this.synthKey = '';
    this.synthInfo = null;
    this.beamsDirty = true;
    this.gainDirty = true;
  }

  setShapedRadius(km: number) {
    this.state.shapedRadiusKm = km;
    this.synth = null;
    this.synthKey = '';
    this.synthInfo = null;
    this.beamsDirty = true;
    this.gainDirty = true;
  }

  setRegion(region: SimState['region']) {
    this.state.region = region;
    this.cellKey = '';
    this.beamsDirty = true;
    this.gainDirty = true;
  }

  setReuse(reuse: number) {
    this.state.reuse = reuse;
    this.beamsDirty = true;
    this.gainDirty = true;
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
        this.cachedMetrics = this.synthesisMetrics(pattern, patternQ);
      } else {
        const cfg = source === 'horn' ? this.hornCfg : s.antenna;
        this.cachedMetrics = computeMetrics(cfg, pattern, active ?? ZERO_BEAM);
      }
      this.cachedActive = active;
      this.cachedPhase = null;
    }
    const metrics = this.cachedMetrics;
    if (!metrics) throw new Error('sin métricas');

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
      const size = count > 180 ? 192 : count > 80 ? 256 : count > 30 ? 320 : 384;
      if (source === 'synthesis') {
        gainMap = computeGainMap(pattern, [SHAPED_BEAM], patternQ, size);
      } else {
        gainMap = computeGainMap(pattern, beams.length ? beams : [ZERO_BEAM], patternQ, size, s.mode === 'cellular' ? 'max' : 'sum');
      }
      this.gainDirty = false;
      this.lastGainMs = now;
    }

    let rangeKm = sat.alt;
    if (active) {
      if (active.target) {
        rangeKm = slantRange(sat.rEcef, active.target.lat * DEG, active.target.lon * DEG);
      } else if (s.mode === 'shaped') {
        rangeKm = slantRange(sat.rEcef, s.shapedCenter.lat * DEG, s.shapedCenter.lon * DEG);
      } else {
        const pt = beamGroundPoint(sat.rEcef, frame, active);
        if (pt) {
          const geo = ecefToGeodetic(pt);
          rangeKm = slantRange(sat.rEcef, geo.lat, geo.lon);
        }
      }
    }

    const link = linkBudget({
      slantKm: rangeKm,
      freqGHz: this.state.antenna.freqGHz,
      txPowerW: s.ptxW,
      txGainDbi: metrics.gainDb,
      rxGainDbi: s.rxGainDbi,
      noiseFigureDb: s.noiseFigureDb,
      bandwidthMHz: s.bandwidthMHz,
    });

    return {
      sat,
      frame,
      pattern,
      patternQ,
      metrics,
      beams,
      activeBeam: active,
      gainMap,
      phase: this.cachedPhase,
      link,
      beamSet,
      shaped: this.synthInfo,
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
        const beams = beamsVisibleLattice(sat.rEcef, frame, this.baseMetrics.hpbwDeg, s.reuse, 380);
        return { beams, beamSet: null };
      }
      this.rebuildCells(sat);
      const res = beamsForGroundCells(this.cells, sat.rEcef, frame, s.reuse, 10, 0.98);
      return {
        beams: res.beams,
        beamSet: { visibleCells: res.visibleCells, totalCells: res.totalCells },
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
    const key = `${s.region}|${spacing.toFixed(1)}|320`;
    if (key === this.cellKey) return;
    this.cellKey = key;
    this.cells = buildGroundCells(poly, spacing, 320);
  }

  private pickActive(beams: Beam[]): number {
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

  private synthesisMetrics(pattern: PatternGrid, q: number): ArrayMetrics {
    const peak = peakDirection(pattern);
    const cut = patternCutAt(pattern, peak.u, peak.v, q, 60, 481);
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

  private synthesisKey(): string {
    const s = this.state;
    const a = s.antenna;
    return `${s.shapedCenter.lat.toFixed(2)}|${s.shapedCenter.lon.toFixed(2)}|${s.shapedRadiusKm}|${a.n}|${a.dx}|${a.freqGHz}|${a.taper}|${a.q}`;
  }

  /** Diseña la fase/amplitud para iluminar la zona circular seleccionada. */
  synthesizeShaped(): ShapedInfo {
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
    this.synth = null;
    this.synthKey = '';
    this.synthInfo = null;
    const hpbw = Math.max(1.2, this.baseMetrics.hpbwDeg) * DEG;
    const core = Math.max(0.004, s.shapedRadiusKm / center.range);
    const edge = core + Math.max(0.55 * hpbw, 0.012);
    const maxR = Math.min(0.94, edge + 4 * hpbw);
    const step = Math.max(hpbw / 5, 0.0035);
    const inside: DirectionSample[] = [];
    const outside: DirectionSample[] = [];

    for (let du = -maxR; du <= maxR + 1e-9; du += step) {
      for (let dv = -maxR; dv <= maxR + 1e-9; dv += step) {
        const r = Math.hypot(du, dv);
        const u = center.u + du;
        const v = center.v + dv;
        if (u * u + v * v > 0.92) continue;
        if (r <= edge) {
          const desired = r <= core ? 1 : 0.5 * (1 + Math.cos((Math.PI * (r - core)) / (edge - core)));
          inside.push({
            u, v, desired, inside: r <= core, lat: 0, lon: 0,
            weight: r <= core ? 4 : 2,
          });
        } else if (r <= maxR) {
          inside.push({ u, v, desired: 0, inside: false, lat: 0, lon: 0, weight: 0.8 });
        }
      }
    }

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

    const result = synthesizeCoverage(s.antenna, thin(inside, 720), thin(outside, 420), 1e-2);
    const directivity = gridDirectivity(result.grid, s.antenna.q);
    const dMax =
      10 * Math.log10(4 * Math.PI * (s.antenna.n * s.antenna.dx) * (s.antenna.n * s.antenna.dy));
    if (directivity > dMax + 1.5) {
      throw new Error('La síntesis no converge para esta geometría. Prueba otro radio o vuelve a intentar.');
    }
    if (result.insideCoverage < 0.25) {
      throw new Error('No se logró cubrir la zona. Reduce el radio o aumenta el número de elementos.');
    }
    this.synth = result;
    this.synthKey = this.synthesisKey();
    const info: ShapedInfo = {
      coverage: result.insideCoverage,
      spillDb: result.outsideMaxDb,
      directivityDb: directivity,
      radiusKm: s.shapedRadiusKm,
      meanDb: result.insideMeanDb,
    };
    this.synthInfo = info;
    this.beamsDirty = true;
    this.gainDirty = true;
    this.cachedPhase = null;
    this.cachedMetrics = null;
    return info;
  }
}
