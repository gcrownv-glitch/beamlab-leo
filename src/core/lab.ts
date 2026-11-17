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

const csvCell = (v: unknown): string => {
  if (v == null) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

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
