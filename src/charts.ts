import type { PhaseView } from './state';

interface Fit {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
}

function fit(canvas: HTMLCanvasElement): Fit | null {
  const rect = canvas.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return null;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(2, Math.round(rect.width * dpr));
  const h = Math.max(2, Math.round(rect.height * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: rect.width, h: rect.height };
}

export function drawPhaseMap(canvas: HTMLCanvasElement, phase: PhaseView | null): void {
  const f = fit(canvas);
  if (!f) return;
  const { ctx, w, h } = f;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#03080f';
  ctx.fillRect(0, 0, w, h);
  if (!phase || !phase.n) return;

  const n = phase.n;
  const pad = 2;
  const cell = (w - pad * 2) / n;
  let maxAmp = 0;
  for (let i = 0; i < phase.amps.length; i++) maxAmp = Math.max(maxAmp, phase.amps[i]);

  for (let iy = 0; iy < n; iy++) {
    for (let ix = 0; ix < n; ix++) {
      const idx = iy * n + ix;
      const p = phase.phases[idx] ?? 0;
      const a = maxAmp > 0 ? phase.amps[idx] / maxAmp : 1;
      const hue = ((p + Math.PI) / (2 * Math.PI)) * 360;
      const light = 34 + 26 * a;
      ctx.fillStyle = `hsl(${hue}, 88%, ${light}%)`;
      ctx.fillRect(pad + ix * cell + 0.4, pad + iy * cell + 0.4, Math.max(0.8, cell - 0.8), Math.max(0.8, cell - 0.8));
    }
  }

  if (n <= 4) {
    ctx.strokeStyle = 'rgba(3,8,15,0.7)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= n; i++) {
      ctx.beginPath();
      ctx.moveTo(pad + i * cell, pad);
      ctx.lineTo(pad + i * cell, h - pad);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(pad, pad + i * cell);
      ctx.lineTo(w - pad, pad + i * cell);
      ctx.stroke();
    }
  }
}

export interface PatternPoint {
  angle: number;
  db: number;
}

export function drawPatternChart(
  canvas: HTMLCanvasElement,
  cut: PatternPoint[] | null,
  hpbwDeg: number,
  label: string,
  idealCut?: PatternPoint[] | null,
): void {
  const f = fit(canvas);
  if (!f) return;
  const { ctx, w, h } = f;
  ctx.clearRect(0, 0, w, h);

  const ml = 30;
  const mr = 8;
  const mt = 10;
  const mb = 20;
  const pw = w - ml - mr;
  const ph = h - mt - mb;
  const yMin = -40;
  const yMax = 2;

  // Rejilla
  ctx.font = '9px "Cascadia Mono", Consolas, monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let db = 0; db >= -40; db -= 10) {
    const y = mt + ((yMax - db) / (yMax - yMin)) * ph;
    ctx.strokeStyle = db === 0 ? 'rgba(125,211,252,0.18)' : 'rgba(125,211,252,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ml, y);
    ctx.lineTo(w - mr, y);
    ctx.stroke();
    ctx.fillStyle = 'rgba(127,144,168,0.8)';
    ctx.fillText(`${db}`, ml - 5, y);
  }

  if (!cut || cut.length < 2) {
    ctx.fillStyle = 'rgba(127,144,168,0.7)';
    ctx.textAlign = 'center';
    ctx.font = '10px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('sin haz visible · gira la cámara o espera la órbita', w / 2, h / 2);
    return;
  }

  const a0 = cut[0].angle;
  const a1 = cut[cut.length - 1].angle;
  const xOf = (a: number) => ml + ((a - a0) / (a1 - a0)) * pw;
  const yOf = (db: number) => mt + ((yMax - Math.max(yMin, Math.min(yMax, db))) / (yMax - yMin)) * ph;

  // Marcas verticales
  const step = a1 - a0 > 50 ? 20 : a1 - a0 > 24 ? 10 : 5;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let a = Math.ceil(a0 / step) * step; a <= a1; a += step) {
    const x = xOf(a);
    ctx.strokeStyle = 'rgba(125,211,252,0.06)';
    ctx.beginPath();
    ctx.moveTo(x, mt);
    ctx.lineTo(x, mt + ph);
    ctx.stroke();
    ctx.fillStyle = 'rgba(127,144,168,0.7)';
    ctx.fillText(`${a}°`, x, mt + ph + 4);
  }
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(127,144,168,0.8)';
  ctx.fillText('dB', 4, 2);
  ctx.textAlign = 'right';
  ctx.fillText('ángulo', w - mr, mt + ph + 4);

  // Área bajo la curva
  const grad = ctx.createLinearGradient(0, mt, 0, mt + ph);
  grad.addColorStop(0, 'rgba(34,211,238,0.26)');
  grad.addColorStop(0.55, 'rgba(34,211,238,0.06)');
  grad.addColorStop(1, 'rgba(34,211,238,0)');
  ctx.beginPath();
  ctx.moveTo(xOf(cut[0].angle), yOf(yMin));
  for (const p of cut) ctx.lineTo(xOf(p.angle), yOf(p.db));
  ctx.lineTo(xOf(cut[cut.length - 1].angle), yOf(yMin));
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Curva
  ctx.beginPath();
  for (let i = 0; i < cut.length; i++) {
    const x = xOf(cut[i].angle);
    const y = yOf(cut[i].db);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = 'rgba(34,211,238,0.95)';
  ctx.lineWidth = 1.7;
  ctx.shadowColor = 'rgba(34,211,238,0.65)';
  ctx.shadowBlur = 8;
  ctx.stroke();
  ctx.shadowBlur = 0;

  if (idealCut && idealCut.length > 1) {
    ctx.beginPath();
    for (let i = 0; i < idealCut.length; i++) {
      const x = xOf(idealCut[i].angle);
      const y = yOf(idealCut[i].db);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = 'rgba(251,191,36,0.8)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Línea -3 dB
  const y3 = yOf(-3);
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = 'rgba(251,191,36,0.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(ml, y3);
  ctx.lineTo(w - mr, y3);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(251,191,36,0.9)';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText('−3 dB', ml + 3, y3 - 2);

  // SLL
  let sll = -100;
  let sllAngle = 0;
  const guard = Math.max(hpbwDeg * 1.25, 5);
  for (const p of cut) {
    if (Math.abs(p.angle) < guard) continue;
    if (p.db > sll) {
      sll = p.db;
      sllAngle = p.angle;
    }
  }
  if (sll > -39 && sll < -1) {
    const x = xOf(sllAngle);
    const y = yOf(sll);
    ctx.fillStyle = 'rgba(251,191,36,0.95)';
    ctx.beginPath();
    ctx.arc(x, y, 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = '8.5px "Cascadia Mono", Consolas, monospace';
    ctx.textAlign = sllAngle > 0 ? 'right' : 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`${sll.toFixed(1)} dB`, x + (sllAngle > 0 ? -5 : 5), y - 5);
  }

  // Etiqueta de modo
  ctx.fillStyle = 'rgba(127,144,168,0.65)';
  ctx.font = '8.5px "Cascadia Mono", Consolas, monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText(label, w - mr, 2);
}
