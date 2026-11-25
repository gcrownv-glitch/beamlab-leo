/**
 * Ficha de laboratorio.
 *
 * La compongo en un canvas aparte para no depender de una captura del DOM:
 * escena a la izquierda, datos a la derecha y pie con la trazabilidad. El PDF
 * usa la misma imagen, así que ambos formatos cuentan la misma historia.
 */
import type { Derived, LinkDirection, SimState } from './state';
import type { LabSample, LabSession } from './core/lab';
import { APP_VERSION } from './version';
import { jsPDF } from 'jspdf';
import { saveBlob, type SaveResult } from './save';

export type SheetFormat = 'png' | 'pdf';

export interface LabSheetData {
  orbit: {
    altKm: number;
    incDeg: number;
    raanDeg: number;
    subLatDeg: number;
    subLonDeg: number;
    speedKmS: number;
  };
  array: {
    n: number;
    freqGHz: number;
    dx: number;
    taper: string;
    efficiency: number;
  };
  pattern: {
    directivityDbi: number;
    gainDbi: number;
    hpbwDeg: number;
    sllDb: number;
    phaseBits: number;
    ampBits: number;
    phaseRmsDeg: number;
    ampRmsDb: number;
    seed: number;
    pointingDeg: number | null;
  };
  links: {
    downlink: { cnDb: number; modcod: string; throughputMbps: number } | null;
    uplink: { cnDb: number; modcod: string; throughputMbps: number } | null;
    limiting: LinkDirection | null;
    capacityMbps: number;
    coverage: number | null;
  };
  shaped: { coverage: number; spillDb: number; directivityDbi: number } | null;
}

/** Extrae todos los valores de la ficha desde la muestra guardada (o del estado vivo si no hay muestra). */
export function buildLabSheetData(state: SimState, d: Derived, sample: LabSample | null): LabSheetData {
  const arr = sample?.array ?? state.antenna;
  const qCfg = sample?.quant ?? state.quant;
  return {
    orbit: {
      altKm: sample?.orbit.altKm ?? d.sat.alt,
      incDeg: sample?.orbit.incDeg ?? (state.orbit.i * 180) / Math.PI,
      raanDeg: sample?.orbit.raanDeg ?? (state.orbit.raan * 180) / Math.PI,
      subLatDeg: sample?.orbit.subLatDeg ?? (d.sat.lat * 180) / Math.PI,
      subLonDeg: sample?.orbit.subLonDeg ?? (d.sat.lon * 180) / Math.PI,
      speedKmS: sample?.orbit.speedKmS ?? d.sat.speed,
    },
    array: {
      n: arr.n,
      freqGHz: arr.freqGHz,
      dx: arr.dx,
      taper: arr.taper,
      efficiency: arr.efficiency,
    },
    pattern: {
      directivityDbi: sample ? sample.metrics.directivityDbi : d.activeMetrics.directivityDb,
      gainDbi: sample ? sample.metrics.gainDbi : d.activeMetrics.gainDb,
      hpbwDeg: sample ? sample.metrics.hpbwDeg : d.activeMetrics.hpbwDeg,
      sllDb: sample ? sample.metrics.sllDb : d.activeMetrics.sllDb,
      phaseBits: qCfg.phaseBits,
      ampBits: qCfg.ampBits,
      phaseRmsDeg: qCfg.phaseRmsDeg,
      ampRmsDb: qCfg.ampRmsDb,
      seed: qCfg.seed,
      pointingDeg: sample ? sample.metrics.pointingDeg : (d.quant?.pointingErrorDeg ?? null),
    },
    links: {
      downlink: sample ? sample.links.downlink : d.links.downlink,
      uplink: sample ? sample.links.uplink : d.links.uplink,
      limiting: sample ? sample.links.limiting : d.system.limitingLink,
      capacityMbps: sample ? sample.system.capacityMbps : d.system.capacityMbps,
      coverage: sample ? sample.system.coverage : d.system.coverageFraction,
    },
    shaped: sample
      ? sample.shaped
      : d.shaped
        ? { coverage: d.shaped.coverage, spillDb: d.shaped.spillDb, directivityDbi: d.shaped.directivityDb }
        : null,
  };
}

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

  const data = buildLabSheetData(state, d, sample);

  section('Órbita y geometría');
  row('Altitud', fmt(data.orbit.altKm, 0, ' km'));
  row('Inclinación', fmt(data.orbit.incDeg, 1, '°'));
  row('RAAN', fmt(data.orbit.raanDeg, 1, '°'));
  row('Subpunto', `${fmt(data.orbit.subLatDeg, 2)} / ${fmt(data.orbit.subLonDeg, 2)}`);
  row('Velocidad', fmt(data.orbit.speedKmS, 2, ' km/s'));

  section('Arreglo');
  row('Elementos', `${data.array.n}×${data.array.n}`);
  row('Frecuencia', `${data.array.freqGHz} GHz`);
  row('Separación', `${data.array.dx.toFixed(2)} λ`);
  row('Taper', data.array.taper);
  row('Eficiencia', `${(data.array.efficiency * 100).toFixed(0)} %`);

  section('Patrón exacto');
  row('D / G', `${data.pattern.directivityDbi.toFixed(1)} / ${data.pattern.gainDbi.toFixed(1)} dBi`);
  row('HPBW / SLL', `${data.pattern.hpbwDeg.toFixed(1)}° / ${data.pattern.sllDb < -90 ? '—' : `${data.pattern.sllDb.toFixed(1)} dB`}`);
  row('Cuantización', `${data.pattern.phaseBits} b fase · ${data.pattern.ampBits ? `${data.pattern.ampBits} b amp` : 'amp fija'}`);
  row('Residuales', `${data.pattern.phaseRmsDeg}° / ${data.pattern.ampRmsDb} dB`);
  row('Semilla', String(data.pattern.seed));
  row('Apuntamiento', data.pattern.pointingDeg != null ? fmt(data.pattern.pointingDeg, 2, '°') : '—');

  section('Enlace');
  const dl = data.links.downlink;
  const ul = data.links.uplink;
  row('DL C/N · MODCOD', dl ? `${dl.cnDb.toFixed(1)} dB · ${dl.modcod}` : '—');
  row('UL C/N · MODCOD', ul ? `${ul.cnDb.toFixed(1)} dB · ${ul.modcod}` : '—');
  row('Throughput DL/UL', dl && ul ? `${dl.throughputMbps.toFixed(0)} / ${ul.throughputMbps.toFixed(0)} Mbps` : '—');
  row('Limita', data.links.limiting ?? '—', amber);
  row('Cap. sistema', `${fmt(data.links.capacityMbps, 0)} Mbps`);
  row('Cobertura', data.links.coverage != null ? `${(data.links.coverage * 100).toFixed(0)} %` : '—');

  if (data.shaped) {
    section('Haz conformado');
    row('Cobertura', `${(data.shaped.coverage * 100).toFixed(0)} %`);
    row('Derrame', `${data.shaped.spillDb.toFixed(1)} dB`);
    row('Diseño', `D ${data.shaped.directivityDbi.toFixed(1)} dBi`);
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

export function exportPng(canvas: HTMLCanvasElement, filename: string): Promise<SaveResult> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        resolve({ saved: false, error: 'No se pudo generar el PNG.' });
        return;
      }
      void saveBlob(blob, filename, true).then(resolve);
    }, 'image/png');
  });
}

export function exportPdf(canvas: HTMLCanvasElement, filename: string): Promise<SaveResult> {
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'px',
    format: [canvas.width, canvas.height],
    hotfixes: ['px_scaling'],
  });
  pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, canvas.width, canvas.height);
  return saveBlob(pdf.output('blob'), filename, true);
}

export function sheetFilename(prefix: string, ext: string): string {
  return `beamlab-${prefix}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${ext}`;
}
