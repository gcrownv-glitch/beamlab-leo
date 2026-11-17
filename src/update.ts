/**
 * Aviso de versión nueva.
 *
 * Consulta el manifiesto de GitHub Pages y muestra un panel, pero no instala
 * nada por su cuenta. La decisión de actualizar sigue siendo del usuario.
 */
import { APP_VERSION } from './version';

export interface VersionEntry {
  version: string;
  date?: string;
  notes?: string;
  html?: string;
  zip?: string;
  sha256?: string;
}

export interface VersionManifest {
  schema: number;
  latest: string;
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
  const latest = manifest.latest;
  if (!latest || compare(latest, APP_VERSION) <= 0) return null;
  try {
    if (localStorage.getItem(SKIP_KEY) === latest) return null;
  } catch {
    // sin almacenamiento
  }
  const entry = manifest.versions.find((v) => v.version === latest) ?? { version: latest };
  return {
    current: APP_VERSION,
    latest,
    notes: entry.notes ?? 'Hay una nueva versión disponible.',
    page: PAGE_URL,
    entry,
  };
}

export function skipVersion(version: string): void {
  try { localStorage.setItem(SKIP_KEY, version); } catch { /* sin almacenamiento */ }
}

export function compare(a: string, b: string): number {
  const pa = a.split('.').map((x) => parseInt(x, 10) || 0);
  const pb = b.split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  }
  return 0;
}
