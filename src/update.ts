/**
 * Aviso de versión nueva.
 *
 * Consulta el manifiesto de GitHub Pages y muestra un panel, pero no instala
 * nada por su cuenta. La decisión de actualizar sigue siendo del usuario.
 */
import { APP_VERSION } from './version';

export interface VersionEntry {
  version: string;
  channel?: 'stable' | 'beta';
  date?: string;
  notes?: string;
  html?: string;
  zip?: string;
  sha256?: string;
}

export interface VersionManifest {
  schema: number;
  latest: string;
  latestBeta?: string | null;
  versions: VersionEntry[];
}

export interface UpdateInfo {
  current: string;
  latest: string;
  notes: string;
  page: string;
  entry: VersionEntry;
}

const MANIFEST_URL = 'https://gcrownv-glitch.github.io/beamlab-leo/versions.json';
const PAGE_URL = 'https://gcrownv-glitch.github.io/beamlab-leo/versiones.html';
const SKIP_KEY = 'beamlab:skip-update';

export function currentVersion(): string {
  return APP_VERSION;
}

export async function checkForUpdate(): Promise<UpdateInfo | null> {
  if (!/^\d+\.\d+\.\d+/.test(APP_VERSION)) return null;
  const res = await fetch(MANIFEST_URL, { cache: 'no-store', mode: 'cors' });
  if (!res.ok) return null;
  const manifest = await res.json() as VersionManifest;
  const onBeta = APP_VERSION.includes('-');
  const candidate = onBeta && manifest.latestBeta && compare(manifest.latestBeta, manifest.latest) > 0
    ? manifest.latestBeta
    : manifest.latest;
  if (!candidate || compare(candidate, APP_VERSION) <= 0) return null;
  try {
    if (localStorage.getItem(SKIP_KEY) === candidate) return null;
  } catch {
    // sin almacenamiento
  }
  const entry = manifest.versions.find((v) => v.version === candidate) ?? { version: candidate };
  return {
    current: APP_VERSION,
    latest: candidate,
    notes: entry.notes ?? 'Hay una nueva versión disponible.',
    page: PAGE_URL,
    entry,
  };
}

export function skipVersion(version: string): void {
  try { localStorage.setItem(SKIP_KEY, version); } catch { /* sin almacenamiento */ }
}

interface ParsedSemver {
  major: number;
  minor: number;
  patch: number;
  pre: string[] | null;
}

function parseSemver(ver: string): ParsedSemver {
  const m = String(ver || '').trim().match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
  if (!m) return { major: 0, minor: 0, patch: 0, pre: null };
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    pre: m[4] ? m[4].split('.') : null,
  };
}

/** Compara versiones SemVer 2.0.0 incluyendo sufijos prerelease (-beta.1, etc.). */
export function compare(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (pa.major !== pb.major) return pa.major - pb.major;
  if (pa.minor !== pb.minor) return pa.minor - pb.minor;
  if (pa.patch !== pb.patch) return pa.patch - pb.patch;
  if (pa.pre === null && pb.pre === null) return 0;
  if (pa.pre === null) return 1;
  if (pb.pre === null) return -1;

  const len = Math.max(pa.pre.length, pb.pre.length);
  for (let i = 0; i < len; i++) {
    const ia = pa.pre[i];
    const ib = pb.pre[i];
    if (ia === undefined) return -1;
    if (ib === undefined) return 1;
    const na = /^\d+$/.test(ia) ? Number(ia) : null;
    const nb = /^\d+$/.test(ib) ? Number(ib) : null;
    if (na !== null && nb !== null) {
      if (na !== nb) return na - nb;
    } else if (na !== null) {
      return -1;
    } else if (nb !== null) {
      return 1;
    } else if (ia !== ib) {
      return ia < ib ? -1 : 1;
    }
  }
  return 0;
}
