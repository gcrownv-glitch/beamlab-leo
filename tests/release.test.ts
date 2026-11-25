import { describe, expect, it } from 'vitest';
import { compare } from '../src/update';

const nodeFs = (globalThis as {
  process?: { getBuiltinModule?: (id: string) => { readFileSync: (p: URL, enc: string) => string } };
}).process?.getBuiltinModule?.('node:fs');

const readRepo = (rel: string): string => {
  if (!nodeFs) throw new Error('node:fs no disponible en el entorno de pruebas');
  return nodeFs.readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
};

describe('Tramo 6 — Versionado, empaquetado portable y CI/CD', () => {
  it('compare() ordena correctamente versiones SemVer con prereleases beta', () => {
    expect(compare('2.4.0', '2.4.0-beta.1')).toBeGreaterThan(0);
    expect(compare('2.4.0-beta.1', '2.4.0')).toBeLessThan(0);
    expect(compare('2.4.0-beta.2', '2.4.0-beta.1')).toBeGreaterThan(0);
    expect(compare('2.4.0-beta.10', '2.4.0-beta.2')).toBeGreaterThan(0);
    expect(compare('2.4.0-beta.1', '2.3.4')).toBeGreaterThan(0);
    expect(compare('2.3.4', '2.4.0-beta.1')).toBeLessThan(0);
    expect(compare('2.4.0-beta.1', '2.4.0-beta.1')).toBe(0);
  });

  it('mantiene sincronizada la versión en package.json, Cargo.toml, tauri.conf.json y CITATION.cff', () => {
    const pkg = JSON.parse(readRepo('package.json')) as { version: string };
    const tauri = JSON.parse(readRepo('src-tauri/tauri.conf.json')) as { version: string };
    const cargo = readRepo('src-tauri/Cargo.toml');
    const cff = readRepo('CITATION.cff');

    const cargoVer = cargo.match(/^\s*version\s*=\s*"([^"]+)"/m)?.[1];
    const cffVer = cff.match(/^version:\s*([^\s#]+)/m)?.[1];

    expect(pkg.version).toBe('2.4.0-beta.1');
    expect(tauri.version).toBe(pkg.version);
    expect(cargoVer).toBe(pkg.version);
    expect(cffVer).toBe(pkg.version);
  });

  it('BeamLabLEO.cs prioriza BeamLabLEO-*.html y soporta sufijos prerelease (-beta)', () => {
    const cs = readRepo('portable/BeamLabLEO.cs');
    const findIdx = cs.indexOf('FindTarget');
    const htmlIdx = cs.indexOf('Directory.GetFiles(root, "BeamLabLEO-*.html")', findIdx);
    const fallbackIdx = cs.indexOf('Path.Combine(root, "index.html")', findIdx);

    expect(findIdx).toBeGreaterThan(-1);
    expect(htmlIdx).toBeGreaterThan(findIdx);
    expect(fallbackIdx).toBeGreaterThan(htmlIdx);
    expect(cs).toContain('class SemVer');
    expect(cs).toContain("raw.IndexOf('-')");
  });

  it('workflows desktop.yml y deploy.yml validan versiones, pruebas y marcan betas como prerelease', () => {
    const desktop = readRepo('.github/workflows/desktop.yml');
    const deploy = readRepo('.github/workflows/deploy.yml');

    expect(desktop).toContain('node scripts/bump-version.mjs --check');
    expect(desktop).toContain('npm test');
    expect(desktop).toContain('prerelease: ${{ contains(github.ref_name, \'-\') }}');
    expect(desktop).toContain('make_latest:');
    expect(desktop).toContain('src-tauri/target/release/beamlab-leo.exe');
    expect(desktop).toContain('src-tauri/target/release/bundle/nsis/*.exe');
    expect(desktop).toContain('src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/*.dmg');
    expect(desktop).toContain('src-tauri/target/release/bundle/appimage/*.AppImage');
    expect(desktop).toContain('src-tauri/target/release/bundle/deb/*.deb');

    expect(deploy).toContain('node scripts/bump-version.mjs --check');
    expect(deploy).toContain('npm test');
  });

  it('docs/portable/versions.json registra latest estable 2.3.4 y latestBeta 2.4.0-beta.1 con SHA-256 válido', () => {
    const manifest = JSON.parse(readRepo('docs/portable/versions.json')) as {
      latest: string;
      latestBeta: string | null;
      versions: Array<{
        version: string;
        channel?: string;
        sha256: string;
        html: string;
        zip: string;
        downloads: Record<string, string>;
      }>;
    };

    expect(manifest.latest).toBe('2.3.4');
    expect(manifest.latestBeta).toBe('2.4.0-beta.1');

    const beta = manifest.versions.find((v) => v.version === '2.4.0-beta.1');
    expect(beta).toBeDefined();
    expect(beta!.channel).toBe('beta');
    expect(beta!.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(beta!.html).toMatch(/^https:\/\/github\.com\/gcrownv-glitch\/beamlab-leo\/releases\/download\/v2\.4\.0-beta\.1\//);
    expect(beta!.downloads.windowsPortable).toMatch(/beamlab-leo\.exe$/);
    expect(beta!.downloads.windowsInstaller).toMatch(/setup\.exe$/);
    expect(beta!.downloads.macDmg).toMatch(/\.dmg$/);
    expect(beta!.downloads.linuxAppImage).toMatch(/\.AppImage$/);
    expect(beta!.downloads.linuxDeb).toMatch(/\.deb$/);
  });
});
