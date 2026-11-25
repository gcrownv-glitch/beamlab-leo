import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*)?$/;
const root = process.cwd();

function readVersions() {
  const pkgPath = join(root, 'package.json');
  const tauriPath = join(root, 'src-tauri', 'tauri.conf.json');
  const cargoPath = join(root, 'src-tauri', 'Cargo.toml');
  const cffPath = join(root, 'CITATION.cff');

  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const tauri = JSON.parse(readFileSync(tauriPath, 'utf8'));
  const cargoText = readFileSync(cargoPath, 'utf8');
  const cffText = readFileSync(cffPath, 'utf8');

  const cargoMatch = cargoText.match(/^(\s*version\s*=\s*")([^"]+)(")/m);
  const cffMatch = cffText.match(/^(version:\s*)([^\s#]+)/m);

  return [
    { file: 'package.json', version: String(pkg.version ?? '') },
    { file: 'src-tauri/tauri.conf.json', version: String(tauri.version ?? '') },
    { file: 'src-tauri/Cargo.toml', version: cargoMatch?.[2] ?? '' },
    { file: 'CITATION.cff', version: cffMatch?.[2] ?? '' },
  ];
}

function checkVersions() {
  const entries = readVersions();
  const invalid = entries.filter((e) => !SEMVER_RE.test(e.version));
  const unique = new Set(entries.map((e) => e.version));
  for (const e of entries) {
    console.log(`${e.file.padEnd(28)} ${e.version || '(missing)'}`);
  }
  if (invalid.length > 0) {
    console.error(`Versión inválida en: ${invalid.map((e) => e.file).join(', ')}`);
    process.exit(1);
  }
  if (unique.size !== 1) {
    console.error('Desincronización de versiones entre manifiestos.');
    process.exit(1);
  }
  console.log(`Versiones sincronizadas: ${entries[0].version}`);
}

function bumpVersions(nextVersion) {
  if (!SEMVER_RE.test(nextVersion)) {
    console.error(`Versión semver inválida: "${nextVersion}" (ej. 2.4.0 o 2.4.0-beta.1)`);
    process.exit(1);
  }

  const pkgPath = join(root, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  pkg.version = nextVersion;
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');

  const tauriPath = join(root, 'src-tauri', 'tauri.conf.json');
  const tauri = JSON.parse(readFileSync(tauriPath, 'utf8'));
  tauri.version = nextVersion;
  writeFileSync(tauriPath, `${JSON.stringify(tauri, null, 2)}\n`, 'utf8');

  const cargoPath = join(root, 'src-tauri', 'Cargo.toml');
  const cargoText = readFileSync(cargoPath, 'utf8');
  if (!/^(\s*version\s*=\s*")([^"]+)(")/m.test(cargoText)) {
    throw new Error('No se encontró version en src-tauri/Cargo.toml');
  }
  const nextCargo = cargoText.replace(/^(\s*version\s*=\s*")([^"]+)(")/m, `$1${nextVersion}$3`);
  writeFileSync(cargoPath, nextCargo, 'utf8');

  const cargoLockPath = join(root, 'src-tauri', 'Cargo.lock');
  if (existsSync(cargoLockPath)) {
    const lockText = readFileSync(cargoLockPath, 'utf8');
    const updatedLock = lockText.replace(
      /(name\s*=\s*"beamlab-leo"\r?\nversion\s*=\s*")([^"]+)(")/m,
      `$1${nextVersion}$3`,
    );
    if (updatedLock !== lockText) writeFileSync(cargoLockPath, updatedLock, 'utf8');
  }

  const cffPath = join(root, 'CITATION.cff');
  let cffText = readFileSync(cffPath, 'utf8');
  if (!/^(version:\s*)([^\s#]+)/m.test(cffText)) {
    throw new Error('No se encontró version en CITATION.cff');
  }
  const today = new Date().toISOString().slice(0, 10);
  cffText = cffText
    .replace(/^(version:\s*)([^\s#]+)/m, `$1${nextVersion}`)
    .replace(/^(date-released:\s*)"?[^"\r\n]+"?/m, `$1"${today}"`);
  writeFileSync(cffPath, cffText, 'utf8');

  checkVersions();
}

const arg = process.argv[2];
if (!arg || arg === '--check') {
  checkVersions();
} else {
  bumpVersions(arg.replace(/^v/, '').trim());
}
