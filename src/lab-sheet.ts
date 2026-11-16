import type { Derived, SimState } from './state';
import type { LabSample, LabSession } from './core/lab';
import { APP_VERSION } from './version';
import { jsPDF } from 'jspdf';

export type SheetFormat = 'png' | 'pdf';

const W = 1600;
const H = 1000;
const PAD = 26;

const fmt = (v: number | null | undefined, d = 1, unit = ''): string =>
  v == null || !Number.isFinite(v) ? '—' : `${v.toFixed(d)}${unit}`;

export function buildLabSheet(
  state: SimState,
  d: Derived,
  session: LabSession,
  scene: HTMLCanvasElement,
  sample: LabSample | null,
): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  if (!ctx) return c;

  const bg = '#04070d';
  const panel = '#071421';
  const line = 'rgba(125, 211, 252, 0.18)';
  const teal = '#22d3ee';
  const amber = '#fbbf24';
  const text = '#dffaff';
  const muted = '#8aa0b8';

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Encabezado
  ctx.fillStyle = text;
  ctx.font = '600 34px "Segoe UI", system-ui, sans-serif';
  ctx.fillText('BeamLab LEO', PAD, 46);
  ctx.fillStyle = teal;
  ctx.font = '600 20px "Segoe UI", system-ui, sans-serif';
  ctx.fillText('Ficha de laboratorio', PAD + 250, 46);
  ctx.textAlign = 'right';
  ctx.fillStyle = muted;
  ctx.font = '13px "Cascadia Mono", Consolas, monospace';
  ctx.fillText(`v${APP_VERSION} · ${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC`, W - PAD, 44);
  ctx.textAlign = 'left';

  const sceneX = PAD;
  const sceneY = 72;
  const sceneW = 1040;
  const sceneH = 820;
  ctx.fillStyle = '#02050a';
  ctx.strokeStyle = line;
  ctx.lineWidth = 1;
  ctx.fillRect(sceneX, sceneY, sceneW, sceneH);
  ctx.strokeRect(sceneX + 0.5, sceneY + 0.5, sceneW, sceneH);
  drawContain(ctx, scene, sceneX, sceneY, sceneW, sceneH);

  const px = 1092;
  const py = 72;
  const pw = W - px - PAD;
  const ph = 820;
  ctx.fillStyle = panel;
  ctx.fillRect(px, py, pw, ph);
  ctx.strokeRect(px + 0.5, py + 0.5, pw, ph);

  let y = py + 26;
  const section = (title: string): void => {
    ctx.fillStyle = teal;
    ctx.font = '600 11px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(title.toUpperCase(), px + 18, y);
    ctx.strokeStyle = line;
    ctx.beginPath();
    ctx.moveTo(px + 18, y + 6);
    ctx.lineTo(px + pw - 18, y + 6);
    ctx.stroke();
    y += 24;
  };
  const row = (label: string, value: string, color = text): void => {
    ctx.fillStyle = muted;
    ctx.font = '11px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(label, px + 18, y);
    ctx.fillStyle = color;
    ctx.font = '600 11px "Cascadia Mono", Consolas, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(fitText(ctx, value, pw - 150), px + pw - 18, y);
    ctx.textAlign = 'left';
    y += 17;
  };
  section('Sesión');
  y = textLine(ctx, fitText(ctx, session.title || 'Sin título', pw - 36, '600 14px "Segoe UI", system-ui, sans-serif'), px + 18, y, 20, text, '600 14px "Segoe UI", system-ui, sans-serif');
  y = textLine(ctx, fitText(ctx, `${session.course || '—'} · ${session.author || '—'}`, pw - 36, '12px "Segoe UI", system-ui, sans-serif'), px + 18, y, 15, muted);
  y = textLine(ctx, `${session.samples.length} ${session.samples.length === 1 ? 'muestra' : 'muestras'} · v${session.appVersion}`, px + 18, y, 15, muted, '11px "Cascadia Mono", Consolas, monospace');
  if (sample) y = textLine(ctx, `Muestra ${sample.id}`, px + 18, y, 16, amber, '11px "Cascadia Mono", Consolas, monospace');
  y += 4;

  section('Órbita y geometría');
  row('Altitud', fmt(sample?.orbit.altKm ?? d.sat.alt, 0, ' km'));
  row('Inclinación', fmt((sample?.orbit.incDeg ?? state.orbit.i * 180 / Math.PI), 1, '°'));
  row('RAAN', fmt((sample?.orbit.raanDeg ?? state.orbit.raan * 180 / Math.PI), 1, '°'));
  row('Subpunto', `${fmt(sample?.orbit.subLatDeg ?? d.sat.lat * 180 / Math.PI, 2)} / ${fmt(sample?.orbit.subLonDeg ?? d.sat.lon * 180 / Math.PI, 2)}`);
  row('Velocidad', fmt(sample?.orbit.speedKmS ?? d.sat.speed, 2, ' km/s'));

  section('Arreglo');
  row('Elementos', `${state.antenna.n}×${state.antenna.n}`);
  row('Frecuencia', `${state.antenna.freqGHz} GHz`);
  row('Separación', `${state.antenna.dx.toFixed(2)} λ`);
  row('Taper', state.antenna.taper);
  row('Eficiencia', `${(state.antenna.efficiency * 100).toFixed(0)} %`);

  const m = d.activeMetrics;
  section('Patrón exacto');
  row('D / G', `${m.directivityDb.toFixed(1)} / ${m.gainDb.toFixed(1)} dBi`);
  row('HPBW / SLL', `${m.hpbwDeg.toFixed(1)}° / ${m.sllDb.toFixed(1)} dB`);
  row('Cuantización', `${state.quant.phaseBits} b fase · ${state.quant.ampBits ? `${state.quant.ampBits} b amp` : 'amp fija'}`);
  row('Residuales', `${state.quant.phaseRmsDeg}° / ${state.quant.ampRmsDb} dB`);
  row('Semilla', String(state.quant.seed));
  row('Apuntamiento', d.quant?.pointingErrorDeg != null ? fmt(d.quant.pointingErrorDeg, 2, '°') : '—');

  section('Enlace');
  const dl = sample?.links.downlink ?? d.links.downlink;
  const ul = sample?.links.uplink ?? d.links.uplink;
  row('DL C/N · MODCOD', dl ? `${dl.cnDb.toFixed(1)} dB · ${dl.modcod}` : '—');
  row('UL C/N · MODCOD', ul ? `${ul.cnDb.toFixed(1)} dB · ${ul.modcod}` : '—');
  row('Throughput DL/UL', dl && ul ? `${dl.throughputMbps.toFixed(0)} / ${ul.throughputMbps.toFixed(0)} Mbps` : '—');
  row('Limita', d.system.limitingLink ?? '—', amber);
  row('Cap. sistema', `${fmt(d.system.capacityMbps, 0)} Mbps`);
  row('Cobertura', d.system.coverageFraction != null ? `${(d.system.coverageFraction * 100).toFixed(0)} %` : '—');

  if (d.shaped) {
    section('Haz conformado');
    row('Cobertura', `${(d.shaped.coverage * 100).toFixed(0)} %`);
    row('Derrame', `${d.shaped.spillDb.toFixed(1)} dB`);
    row('Diseño', `D ${d.shaped.directivityDb.toFixed(1)} dBi`);
  }

  // Pie
  ctx.strokeStyle = line;
  ctx.beginPath();
  ctx.moveTo(PAD, H - 42.5);
  ctx.lineTo(W - PAD, H - 42.5);
  ctx.stroke();
  ctx.fillStyle = muted;
  ctx.font = '11px "Segoe UI", system-ui, sans-serif';
  ctx.fillText('BeamLab LEO · IET UCSP · Jhorel Kennedy Cornejo Cruz', PAD, H - 20);
  ctx.textAlign = 'right';
  ctx.fillText('Datos locales · sin telemetría', W - PAD, H - 20);
  ctx.textAlign = 'left';

  return c;
}

function fitText(ctx: CanvasRenderingContext2D, str: string, maxWidth: number, font?: string): string {
  if (font) ctx.font = font;
  if (ctx.measureText(str).width <= maxWidth) return str;
  let out = str;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) out = out.slice(0, -1);
  return `${out}…`;
}

function textLine(
  ctx: CanvasRenderingContext2D,
  str: string,
  x: number,
  y: number,
  gap: number,
  color: string,
  font = '12px "Segoe UI", system-ui, sans-serif',
): number {
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.fillText(str, x, y);
  return y + gap;
}

function drawContain(
  ctx: CanvasRenderingContext2D,
  img: HTMLCanvasElement,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  if (!img.width || !img.height) return;
  const scale = Math.min(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

export function exportPng(canvas: HTMLCanvasElement, filename: string): void {
  canvas.toBlob((blob) => {
    if (!blob) return;
    download(blob, filename);
  }, 'image/png');
}

export function exportPdf(canvas: HTMLCanvasElement, filename: string): void {
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'px',
    format: [canvas.width, canvas.height],
    hotfixes: ['px_scaling'],
  });
  pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, canvas.width, canvas.height);
  pdf.save(filename);
}

export function download(blob: Blob, filename: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export function sheetFilename(prefix: string, ext: string): string {
  return `beamlab-${prefix}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${ext}`;
}
