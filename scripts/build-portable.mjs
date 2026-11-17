import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, copyFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { createHash } from 'node:crypto';

const root = process.cwd();
const dist = join(root, 'dist');
const outDir = join(root, 'release', 'portable');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const version = pkg.version;

const mime = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.css': 'text/css', '.js': 'text/javascript',
};
const dataUrl = (file) => {
  const ext = extname(file).toLowerCase();
  return `data:${mime[ext] ?? 'application/octet-stream'};base64,${readFileSync(file).toString('base64')}`;
};

let html = readFileSync(join(dist, 'index.html'), 'utf8');

// CSS inline, incluyendo las fuentes KaTeX.
const cssMatch = html.match(/<link rel="stylesheet"[^>]*href="\.\/assets\/([^"]+\.css)"[^>]*>/);
if (!cssMatch) throw new Error('No se encontró el CSS del build');
let css = readFileSync(join(dist, 'assets', cssMatch[1]), 'utf8');
css = css.replace(/url\((?:"|')?(?:\.\/)?([^)"']+)(?:"|')?\)/g, (_, name) => {
  const file = join(dist, 'assets', name);
  return existsSync(file) ? `url(${dataUrl(file)})` : `url(${name})`;
});
html = html.replace(cssMatch[0], () => `<style>${css}</style>`);

// JS inline.
const jsMatch = html.match(/<script type="module"[^>]*src="\.\/assets\/([^"]+\.js)"[^>]*><\/script>/);
if (!jsMatch) throw new Error('No se encontró el JS del build');
let js = readFileSync(join(dist, 'assets', jsMatch[1]), 'utf8');
// Texturas: el bundle usa los nombres de archivo; se reemplazan por data URLs.
for (const name of ['earth_day.jpg', 'earth_specular.jpg', 'earth_clouds.png']) {
  const file = join(dist, 'assets', name);
  if (!existsSync(file)) throw new Error(`Falta ${file}`);
  js = js.replaceAll(`"${name}"`, JSON.stringify(dataUrl(file)));
}
js = js.replaceAll('</script', '<\\/script');
html = html.replace(jsMatch[0], () => `<script type="module">${js}</script>`);

// Icono embebido; el manifest no aplica a un archivo local.
const icon = readFileSync(join(root, 'public', 'favicon.svg'));
html = html.replace(/<link rel="icon"[^>]*>/, () => `<link rel="icon" href="data:image/svg+xml;base64,${icon.toString('base64')}" />`);
html = html.replace(/<link rel="manifest"[^>]*>/, '');
html = html.replace(
  '<title>',
  () => `<!-- BeamLab LEO ${version} · archivo portable autónomo · Jhorel Kennedy Cornejo Cruz -->\n    <title>`,
);

mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, `BeamLabLEO-${version}.html`);
writeFileSync(outFile, html, 'utf8');

// Archivo histórico: permite descargar versiones anteriores desde Pages.
const archiveDir = join(root, 'docs', 'portable');
mkdirSync(archiveDir, { recursive: true });
writeFileSync(join(archiveDir, `BeamLabLEO-${version}.html`), html, 'utf8');

const sha256 = createHash('sha256').update(html).digest('hex');
const baseUrl = 'https://gcrownv-glitch.github.io/beamlab-leo';
const manifestFile = join(archiveDir, 'versions.json');
let manifest = { schema: 1, latest: version, versions: [] };
if (existsSync(manifestFile)) {
  try { manifest = JSON.parse(readFileSync(manifestFile, 'utf8')); } catch { /* se regenera */ }
}
const entry = {
  version,
  date: new Date().toISOString().slice(0, 10),
  notes: process.env.PORTABLE_NOTES ?? 'Corrige el cono del haz y aclara la cobertura visible.',
  html: `${baseUrl}/BeamLabLEO-${version}.html`,
  zip: `${baseUrl}/BeamLabLEO-${version}-portable.zip`,
  release: `https://github.com/gcrownv-glitch/beamlab-leo/releases/tag/v${version}`,
  downloads: {
    windowsPortable: `https://github.com/gcrownv-glitch/beamlab-leo/releases/download/v${version}/beamlab-leo.exe`,
    windowsInstaller: `https://github.com/gcrownv-glitch/beamlab-leo/releases/download/v${version}/BeamLab.LEO_${version}_x64-setup.exe`,
    linuxAppImage: `https://github.com/gcrownv-glitch/beamlab-leo/releases/download/v${version}/BeamLab.LEO_${version}_amd64.AppImage`,
    linuxDeb: `https://github.com/gcrownv-glitch/beamlab-leo/releases/download/v${version}/BeamLab.LEO_${version}_amd64.deb`,
    macDmg: `https://github.com/gcrownv-glitch/beamlab-leo/releases/download/v${version}/BeamLab.LEO_${version}_aarch64.dmg`,
  },
  size: Buffer.byteLength(html),
  sha256,
};
const versions = (manifest.versions ?? []).filter((v) => v.version !== version);
versions.push(entry);
versions.sort((a, b) => {
  const pa = a.version.split('.').map(Number);
  const pb = b.version.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pb[i] ?? 0) - (pa[i] ?? 0);
  return 0;
});
manifest = { schema: 1, latest: versions[0]?.version ?? version, versions };
writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
writeFileSync(join(outDir, 'versions.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');

// Lanzador local de versiones: no requiere servidor ni instalación.
const files = readdirSync(outDir)
  .filter((f) => /^BeamLabLEO-\d+\.\d+\.\d+\.html$/.test(f))
  .sort()
  .reverse();
const cards = files.map((f) => {
  const v = f.match(/BeamLabLEO-(.+)\.html/)?.[1] ?? f;
  return `<a class="v" href="./${f}"><b>${v}</b><span>${v === version ? 'versión actual' : 'versión anterior'}</span></a>`;
}).join('\n');
const launcher = `<!doctype html>
<html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>BeamLab LEO · versiones portables</title>
<style>
body{margin:0;background:#04070d;color:#dffaff;font:15px/1.5 system-ui,sans-serif;display:grid;place-items:center;min-height:100vh}
main{width:min(760px,92vw);padding:32px;border:1px solid #164e63;border-radius:16px;background:#06111e}
h1{margin:0 0 4px;font-size:26px}small{color:#7f90a8}p{color:#9fb3c8}
.v{display:flex;justify-content:space-between;gap:12px;padding:12px 14px;margin:8px 0;border:1px solid #164e63;border-radius:9px;background:#081827;color:#bff8ff;text-decoration:none}
.v:hover{border-color:#22d3ee;background:#0b2033}.v span{color:#7f90a8;font-size:12px}
footer{margin-top:18px;color:#7f90a8;font-size:12px}
</style>
<main><h1>BeamLab LEO</h1><small>Versiones portables · sin instalación</small>
<p>Elige una versión. Cada archivo es independiente: las versiones anteriores se conservan.</p>
${cards || '<p>No hay versiones.</p>'}
<p style="margin-top:18px">Para descargar otra versión ejecuta <b>Actualizar.cmd</b> o abre <a href="https://gcrownv-glitch.github.io/beamlab-leo/versiones.html" style="color:#67e8f9">versiones.html</a>.</p>
<footer>Elaborado por Jhorel Kennedy Cornejo Cruz · IET UCSP · <a href="https://github.com/gcrownv-glitch/beamlab-leo" style="color:#67e8f9">GitHub</a></footer>
</main></html>`;
writeFileSync(join(outDir, 'index.html'), launcher, 'utf8');
for (const f of ['Actualizar.cmd', 'Actualizar.ps1', 'LEEME.txt']) {
  const src = join(root, 'portable', f);
  if (existsSync(src)) copyFileSync(src, join(outDir, f));
}

console.log(`Portable HTML: ${outFile}`);
console.log(`Versions launcher: ${join(outDir, 'index.html')}`);
console.log(`Size: ${(html.length / 1024 / 1024).toFixed(2)} MB`);
