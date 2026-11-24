/**
 * Modelo de datos del laboratorio.
 *
 * Una sesión es el cuaderno de la práctica; una muestra es una foto del estado
 * de la simulación. Guardo la configuración completa en cada muestra para que
 * se pueda repetir sin depender de la sesión actual. El hash no es
 * criptográfico: solo sirve para reconocer configuraciones iguales.
 */
import type { ArrayConfig } from './array';
import type { LinkResult } from './link';
import type { Derived, LinkDirection, SimState } from '../state';
import { APP_VERSION } from '../version';

export const LAB_SCHEMA = 1;

export interface LabSession {
  schema: number;
  id: string;
  title: string;
  course: string;
  author: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  appVersion: string;
  samples: LabSample[];
}

export interface LinkSnapshot {
  cn0DbHz: number;
  cnDb: number;
  modcod: string;
  marginDb: number;
  throughputMbps: number;
  eirpDbW: number;
  freqGHz: number;
  outage: boolean;
}

export interface LabSample {
  schema: number;
  id: string;
  timestamp: string;
  appVersion: string;
  mode: string;
  target: { lat: number; lon: number; label: string } | null;
  orbit: {
    altKm: number;
    incDeg: number;
    raanDeg: number;
    subLatDeg: number;
    subLonDeg: number;
    speedKmS: number;
  };
  array: ArrayConfig;
  quant: SimState['quant'];
  metrics: {
    directivityDbi: number;
    gainDbi: number;
    hpbwDeg: number;
    sllDb: number;
    pointingDeg: number | null;
    note: string | null;
  };
  links: {
    downlink: LinkSnapshot | null;
    uplink: LinkSnapshot | null;
    selected: LinkDirection;
    limiting: LinkDirection | null;
  };
  system: {
    beams: number;
    rfPowerW: number;
    spectrumMHz: number;
    capacityMbps: number;
    perUserMbps: number;
    coverage: number | null;
  };
  shaped: { coverage: number; spillDb: number; directivityDbi: number } | null;
  notes: string;
  configHash: string;
}

const round = (v: number, decimals = 3): number => {
  const f = Math.pow(10, decimals);
  return Math.round(v * f) / f;
};

const linkSnapshot = (l: LinkResult | null): LinkSnapshot | null => l ? {
  cn0DbHz: round(l.cn0DbHz, 2),
  cnDb: round(l.cnDb, 2),
  modcod: l.modcod,
  marginDb: round(l.marginDb, 2),
  throughputMbps: round(l.throughputMbps, 2),
  eirpDbW: round(l.eirpDbW, 2),
  freqGHz: l.freqGHz,
  outage: l.outage,
} : null;

export function id(prefix: string): string {
  const c = globalThis.crypto;
  if (c && 'randomUUID' in c) return `${prefix}-${c.randomUUID().slice(0, 8)}`;
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function createSession(): LabSession {
  const now = new Date().toISOString();
  return {
    schema: LAB_SCHEMA,
    id: id('session'),
    title: 'Práctica de laboratorio',
    course: 'IET UCSP',
    author: 'Jhorel Kennedy Cornejo Cruz',
    notes: '',
    createdAt: now,
    updatedAt: now,
    appVersion: APP_VERSION,
    samples: [],
  };
}

export function buildSample(state: SimState, d: Derived, notes = ''): LabSample {
  const a = d.activeMetrics;
  const target = d.activeBeam?.target ?? (state.mode === 'spot' ? state.spotTarget : state.mode === 'shaped' ? state.shapedCenter : null);
  const q = d.quant;
  const configHash = hashString(JSON.stringify({
    mode: state.mode,
    array: state.antenna,
    quant: state.quant,
    orbit: state.orbit,
    target,
  }));
  return {
    schema: LAB_SCHEMA,
    id: id('sample'),
    timestamp: new Date().toISOString(),
    appVersion: APP_VERSION,
    mode: state.mode,
    target: target ? { lat: round(target.lat, 5), lon: round(target.lon, 5), label: 'target' } : null,
    orbit: {
      altKm: round(d.sat.alt, 2),
      incDeg: round(state.orbit.i * 180 / Math.PI, 3),
      raanDeg: round(state.orbit.raan * 180 / Math.PI, 3),
      subLatDeg: round(d.sat.lat * 180 / Math.PI, 4),
      subLonDeg: round(d.sat.lon * 180 / Math.PI, 4),
      speedKmS: round(d.sat.speed, 4),
    },
    array: { ...state.antenna },
    quant: { ...state.quant },
    metrics: {
      directivityDbi: round(a.directivityDb, 2),
      gainDbi: round(a.gainDb, 2),
      hpbwDeg: round(a.hpbwDeg, 3),
      sllDb: round(a.sllDb, 2),
      pointingDeg: q?.pointingErrorDeg != null ? round(q.pointingErrorDeg, 3) : null,
      note: q?.note ?? null,
    },
    links: {
      downlink: linkSnapshot(d.links.downlink),
      uplink: linkSnapshot(d.links.uplink),
      selected: state.linkDirection,
      limiting: d.system.limitingLink,
    },
    system: {
      beams: d.system.activeBeams,
      rfPowerW: round(d.system.rfPowerW, 2),
      spectrumMHz: round(d.system.spectrumMHz, 2),
      capacityMbps: round(d.system.capacityMbps, 2),
      perUserMbps: round(d.system.perUserMbps, 3),
      coverage: d.system.coverageFraction != null ? round(d.system.coverageFraction, 4) : null,
    },
    shaped: d.shaped ? {
      coverage: round(d.shaped.coverage, 4),
      spillDb: round(d.shaped.spillDb, 2),
      directivityDbi: round(d.shaped.directivityDb, 2),
    } : null,
    notes,
    configHash,
  };
}

function hashString(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export const csvCell = (v: unknown): string => {
  if (v == null) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  let s = String(v);
  if (/^[\t\r ]*[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

const MAX_STR = 512;
const MAX_NOTES = 4096;
const MAX_SAMPLES = 500;
const VALID_MODES = new Set(['global', 'spot', 'cellular', 'shaped']);
const VALID_TAPERS = new Set(['uniform', 'kaiser25', 'kaiser30', 'kaiser40', 'hann']);
const VALID_QUANT_MODES = new Set(['ideal', 'realtime', 'analysis']);
const VALID_LINK_DIRS = new Set(['downlink', 'uplink']);

function asRecord(v: unknown, label: string): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) {
    throw new Error(`${label}: formato inválido.`);
  }
  return v as Record<string, unknown>;
}

function asStr(v: unknown, label: string, maxLen = MAX_STR): string {
  if (typeof v !== 'string') throw new Error(`${label}: debe ser texto.`);
  if (v.length > maxLen) throw new Error(`${label}: excede longitud máxima.`);
  return v;
}

function asNum(v: unknown, label: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`${label}: número inválido.`);
  }
  return v;
}

function asNullableNum(v: unknown, label: string): number | null {
  return v === null ? null : asNum(v, label);
}

function asBool(v: unknown, label: string): boolean {
  if (typeof v !== 'boolean') throw new Error(`${label}: booleano inválido.`);
  return v;
}

function validateLinkSnapshot(v: unknown, label: string): LinkSnapshot | null {
  if (v === null) return null;
  const o = asRecord(v, label);
  return {
    cn0DbHz: asNum(o.cn0DbHz, `${label}.cn0DbHz`),
    cnDb: asNum(o.cnDb, `${label}.cnDb`),
    modcod: asStr(o.modcod, `${label}.modcod`, 64),
    marginDb: asNum(o.marginDb, `${label}.marginDb`),
    throughputMbps: asNum(o.throughputMbps, `${label}.throughputMbps`),
    eirpDbW: asNum(o.eirpDbW, `${label}.eirpDbW`),
    freqGHz: asNum(o.freqGHz, `${label}.freqGHz`),
    outage: asBool(o.outage, `${label}.outage`),
  };
}

function validateSample(raw: unknown, idx: number): LabSample {
  const prefix = `samples[${idx}]`;
  const o = asRecord(raw, prefix);
  const schema = asNum(o.schema, `${prefix}.schema`);
  if (schema !== LAB_SCHEMA) throw new Error(`${prefix}: esquema no soportado.`);
  const mode = asStr(o.mode, `${prefix}.mode`, 32);
  if (!VALID_MODES.has(mode)) throw new Error(`${prefix}.mode: modo inválido.`);

  let target: LabSample['target'] = null;
  if (o.target !== null) {
    const t = asRecord(o.target, `${prefix}.target`);
    target = {
      lat: asNum(t.lat, `${prefix}.target.lat`),
      lon: asNum(t.lon, `${prefix}.target.lon`),
      label: asStr(t.label, `${prefix}.target.label`, 64),
    };
  }

  const orb = asRecord(o.orbit, `${prefix}.orbit`);
  const arr = asRecord(o.array, `${prefix}.array`);
  const taper = asStr(arr.taper, `${prefix}.array.taper`, 32);
  if (!VALID_TAPERS.has(taper)) throw new Error(`${prefix}.array.taper: taper inválido.`);

  const q = asRecord(o.quant, `${prefix}.quant`);
  const qMode = asStr(q.mode, `${prefix}.quant.mode`, 32);
  if (!VALID_QUANT_MODES.has(qMode)) throw new Error(`${prefix}.quant.mode: modo inválido.`);

  const met = asRecord(o.metrics, `${prefix}.metrics`);
  const lnk = asRecord(o.links, `${prefix}.links`);
  const selected = asStr(lnk.selected, `${prefix}.links.selected`, 16);
  if (!VALID_LINK_DIRS.has(selected)) throw new Error(`${prefix}.links.selected: dirección inválida.`);
  let limiting: LinkDirection | null = null;
  if (lnk.limiting !== null) {
    const lim = asStr(lnk.limiting, `${prefix}.links.limiting`, 16);
    if (!VALID_LINK_DIRS.has(lim)) throw new Error(`${prefix}.links.limiting: dirección inválida.`);
    limiting = lim as LinkDirection;
  }

  const sys = asRecord(o.system, `${prefix}.system`);
  let shaped: LabSample['shaped'] = null;
  if (o.shaped !== null) {
    const sh = asRecord(o.shaped, `${prefix}.shaped`);
    shaped = {
      coverage: asNum(sh.coverage, `${prefix}.shaped.coverage`),
      spillDb: asNum(sh.spillDb, `${prefix}.shaped.spillDb`),
      directivityDbi: asNum(sh.directivityDbi, `${prefix}.shaped.directivityDbi`),
    };
  }

  return {
    schema: LAB_SCHEMA,
    id: asStr(o.id, `${prefix}.id`, 64),
    timestamp: asStr(o.timestamp, `${prefix}.timestamp`, 64),
    appVersion: asStr(o.appVersion, `${prefix}.appVersion`, 32),
    mode,
    target,
    orbit: {
      altKm: asNum(orb.altKm, `${prefix}.orbit.altKm`),
      incDeg: asNum(orb.incDeg, `${prefix}.orbit.incDeg`),
      raanDeg: asNum(orb.raanDeg, `${prefix}.orbit.raanDeg`),
      subLatDeg: asNum(orb.subLatDeg, `${prefix}.orbit.subLatDeg`),
      subLonDeg: asNum(orb.subLonDeg, `${prefix}.orbit.subLonDeg`),
      speedKmS: asNum(orb.speedKmS, `${prefix}.orbit.speedKmS`),
    },
    array: {
      n: asNum(arr.n, `${prefix}.array.n`),
      dx: asNum(arr.dx, `${prefix}.array.dx`),
      dy: asNum(arr.dy, `${prefix}.array.dy`),
      freqGHz: asNum(arr.freqGHz, `${prefix}.array.freqGHz`),
      taper: taper as ArrayConfig['taper'],
      q: asNum(arr.q, `${prefix}.array.q`),
      efficiency: asNum(arr.efficiency, `${prefix}.array.efficiency`),
    },
    quant: {
      mode: qMode as SimState['quant']['mode'],
      phaseBits: asNum(q.phaseBits, `${prefix}.quant.phaseBits`),
      ampBits: asNum(q.ampBits, `${prefix}.quant.ampBits`),
      phaseRmsDeg: asNum(q.phaseRmsDeg, `${prefix}.quant.phaseRmsDeg`),
      ampRmsDb: asNum(q.ampRmsDb, `${prefix}.quant.ampRmsDb`),
      seed: asNum(q.seed, `${prefix}.quant.seed`),
    },
    metrics: {
      directivityDbi: asNum(met.directivityDbi, `${prefix}.metrics.directivityDbi`),
      gainDbi: asNum(met.gainDbi, `${prefix}.metrics.gainDbi`),
      hpbwDeg: asNum(met.hpbwDeg, `${prefix}.metrics.hpbwDeg`),
      sllDb: asNum(met.sllDb, `${prefix}.metrics.sllDb`),
      pointingDeg: asNullableNum(met.pointingDeg, `${prefix}.metrics.pointingDeg`),
      note: met.note === null ? null : asStr(met.note, `${prefix}.metrics.note`, 256),
    },
    links: {
      downlink: validateLinkSnapshot(lnk.downlink, `${prefix}.links.downlink`),
      uplink: validateLinkSnapshot(lnk.uplink, `${prefix}.links.uplink`),
      selected: selected as LinkDirection,
      limiting,
    },
    system: {
      beams: asNum(sys.beams, `${prefix}.system.beams`),
      rfPowerW: asNum(sys.rfPowerW, `${prefix}.system.rfPowerW`),
      spectrumMHz: asNum(sys.spectrumMHz, `${prefix}.system.spectrumMHz`),
      capacityMbps: asNum(sys.capacityMbps, `${prefix}.system.capacityMbps`),
      perUserMbps: asNum(sys.perUserMbps, `${prefix}.system.perUserMbps`),
      coverage: asNullableNum(sys.coverage, `${prefix}.system.coverage`),
    },
    shaped,
    notes: asStr(o.notes, `${prefix}.notes`, MAX_NOTES),
    configHash: asStr(o.configHash, `${prefix}.configHash`, 64),
  };
}

/** Valida y reconstruye una sesión de laboratorio importada o leída de disco. */
export function validateLabSession(raw: unknown): LabSession {
  const o = asRecord(raw, 'session');
  if (o.schema !== LAB_SCHEMA) {
    throw new Error('El archivo no es una sesión BeamLab válida.');
  }
  if (!Array.isArray(o.samples) || o.samples.length > MAX_SAMPLES) {
    throw new Error(`Lista de muestras inválida (máximo ${MAX_SAMPLES}).`);
  }
  return {
    schema: LAB_SCHEMA,
    id: asStr(o.id, 'id', 64),
    title: asStr(o.title, 'title', MAX_STR),
    course: asStr(o.course, 'course', MAX_STR),
    author: asStr(o.author, 'author', MAX_STR),
    notes: asStr(o.notes, 'notes', MAX_NOTES),
    createdAt: asStr(o.createdAt, 'createdAt', 64),
    updatedAt: asStr(o.updatedAt, 'updatedAt', 64),
    appVersion: asStr(o.appVersion, 'appVersion', 32),
    samples: o.samples.map((s, i) => validateSample(s, i)),
  };
}

export const CSV_COLUMNS = [
  'sample_id', 'timestamp', 'session_id', 'app_version', 'mode',
  'target_lat', 'target_lon', 'orbit_alt_km', 'orbit_inc_deg', 'orbit_raan_deg', 'sub_lat_deg', 'sub_lon_deg', 'speed_km_s',
  'array_n', 'array_dx', 'array_dy', 'array_freq_ghz', 'array_taper', 'array_q', 'array_eff',
  'quant_mode', 'phase_bits', 'amp_bits', 'phase_rms_deg', 'amp_rms_db', 'seed',
  'directivity_dbi', 'gain_dbi', 'hpbw_deg', 'sll_db', 'pointing_deg',
  'dl_cn0', 'dl_cn', 'dl_modcod', 'dl_margin', 'dl_throughput', 'dl_eirp', 'dl_freq',
  'ul_cn0', 'ul_cn', 'ul_modcod', 'ul_margin', 'ul_throughput', 'ul_eirp', 'ul_freq',
  'limiting_link', 'beams', 'rf_power_w', 'spectrum_mhz', 'capacity_mbps', 'per_user_mbps',
  'coverage', 'shaped_spill_db', 'notes', 'config_hash',
] as const;

export function samplesToCsv(session: LabSession): string {
  const rows = [CSV_COLUMNS.join(',')];
  for (const s of session.samples) {
    const dl = s.links.downlink;
    const ul = s.links.uplink;
    const row = [
      s.id, s.timestamp, session.id, s.appVersion, s.mode,
      s.target?.lat, s.target?.lon, s.orbit.altKm, s.orbit.incDeg, s.orbit.raanDeg, s.orbit.subLatDeg, s.orbit.subLonDeg, s.orbit.speedKmS,
      s.array.n, s.array.dx, s.array.dy, s.array.freqGHz, s.array.taper, s.array.q, s.array.efficiency,
      s.quant.mode, s.quant.phaseBits, s.quant.ampBits, s.quant.phaseRmsDeg, s.quant.ampRmsDb, s.quant.seed,
      s.metrics.directivityDbi, s.metrics.gainDbi, s.metrics.hpbwDeg, s.metrics.sllDb, s.metrics.pointingDeg,
      dl?.cn0DbHz, dl?.cnDb, dl?.modcod, dl?.marginDb, dl?.throughputMbps, dl?.eirpDbW, dl?.freqGHz,
      ul?.cn0DbHz, ul?.cnDb, ul?.modcod, ul?.marginDb, ul?.throughputMbps, ul?.eirpDbW, ul?.freqGHz,
      s.links.limiting, s.system.beams, s.system.rfPowerW, s.system.spectrumMHz, s.system.capacityMbps, s.system.perUserMbps,
      s.system.coverage, s.shaped?.spillDb, s.notes, s.configHash,
    ];
    rows.push(row.map(csvCell).join(','));
  }
  return rows.join('\n') + '\n';
}
