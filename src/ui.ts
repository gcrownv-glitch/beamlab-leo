import katex from 'katex';
import {
  patternCut,
  patternCutAt,
  peakDirection,
  type ArrayConfig,
} from './core/array';
import { DEG, R_EARTH } from './core/constants';
import { apogeeAlt, meanMotion, orbitalPeriod, perigeeAlt, type OrbitElements } from './core/orbit';
import { ORBIT_PRESETS } from './core/presets';
import type { RegionId } from './core/regions';
import { drawPatternChart, drawPhaseMap, type PatternPoint } from './charts';
import { BEAM_HEX, REUSE_LABELS } from './palette';
import type { CameraMode, Derived, Mode, PhaseView, SimState } from './state';

export type ToggleKey =
  | 'showOrbit'
  | 'showTrack'
  | 'showFootprint'
  | 'showGain'
  | 'showCones'
  | 'showGrid';

export interface UIHandlers {
  setMode(mode: Mode): void;
  setAntenna(patch: Partial<ArrayConfig>): void;
  setFrequency(freqGHz: number): void;
  setPreset(id: string): void;
  setOrbit(patch: Partial<OrbitElements>): void;
  setEpoch(ms: number): void;
  now(): void;
  setToggle(key: ToggleKey, value: boolean): void;
  setCamera(mode: CameraMode): void;
  play(): void;
  setSpeed(speed: number): void;
  setTime(ms: number): void;
  setSpotTarget(lat: number, lon: number): void;
  setSpotFixed(v: boolean): void;
  setRegion(id: RegionId): void;
  setReuse(n: number): void;
  regenerate(): void;
  setShapedCenter(lat: number, lon: number): void;
  setShapedRadius(km: number): void;
  synthesize(): void;
  setPtx(w: number): void;
  screenshot(): void;
}

interface TourStep {
  title: string;
  text: string;
  apply: (h: UIHandlers) => void;
}

const MODE_LABEL: Record<Mode, string> = {
  global: 'global',
  spot: 'puntual',
  cellular: 'celular',
  shaped: 'conformada',
};

const fmtLat = (v: number) => `${Math.abs(v).toFixed(2)}°${v >= 0 ? 'N' : 'S'}`;
const fmtLon = (v: number) => `${Math.abs(v).toFixed(2)}°${v >= 0 ? 'E' : 'O'}`;
const fmtLatLon = (lat: number, lon: number) => `${fmtLat(lat)} ${fmtLon(lon)}`;
const fmtTime = (ms: number) => `${new Date(ms).toISOString().slice(11, 19)} UTC`;
const fmtPeriod = (min: number) => `${min.toFixed(1)} min`;

export class UI {
  private state: SimState;
  private h: UIHandlers;
  private tourIndex = 0;
  private toastTimer = 0;
  private syncing = false;
  private lastPhaseObj: PhaseView | null = null;
  private lastReuseKey = '';
  private lastPatternKey = '';

  private tourSteps: TourStep[] = [
    {
      title: '1 · Una órbita baja, muy cerca',
      text: 'El satélite está a 550 km: da una vuelta cada ~95 minutos a 7,6 km/s. Desde ahí solo ve un disco de la Tierra. La línea cian es la órbita y la traza marca su paso por el suelo.',
      apply: (h) => {
        h.setPreset('starlink');
        h.setCamera('earth');
        h.setMode('global');
        h.setToggle('showOrbit', true);
        h.setToggle('showTrack', true);
        h.setToggle('showFootprint', true);
        h.setToggle('showGain', true);
      },
    },
    {
      title: '2 · La huella visible',
      text: 'El anillo azul es el horizonte geométrico: desde 550 km se ve hasta 67° de nadir, un disco de ~4.500 km de radio. Un haz ancho (~134° en LEO) cubre casi todo el disco pero reparte poca potencia; la bocina de 17° del apunte cubre todo el disco solo desde GEO. Por eso LEO divide el disco en haces.',
      apply: (h) => {
        h.setMode('global');
        h.setToggle('showFootprint', true);
        h.setToggle('showGain', true);
      },
    },
    {
      title: '3 · Un haz puntual que sigue a Lima',
      text: 'Cambiamos a un arreglo de 16×16. Cada elemento recibe una fase distinta: esa rampa de fase inclina el frente de onda y coloca el haz sobre Lima. El satélite sigue moviéndose y la fase se recalcula para no soltar el objetivo.',
      apply: (h) => {
        h.setMode('spot');
        h.setAntenna({ n: 16 });
        h.setSpotTarget(-12.05, -77.04);
        h.setCamera('earth');
        h.setToggle('showGain', true);
      },
    },
    {
      title: '4 · Menos elementos, haz más ancho',
      text: 'Con 4×4 el haz mide ~25° y la huella es enorme; la ganancia baja. La regla es θ₃dB ≈ 0,886 λ/L: si duplicas la apertura, el haz se estrecha a la mitad. Prueba también separaciones mayores a 0,5 λ y verás lóbulos de difracción.',
      apply: (h) => {
        h.setAntenna({ n: 4 });
        h.setToggle('showGain', true);
      },
    },
    {
      title: '5 · Más elementos, más ganancia',
      text: 'Volvemos a 16×16: el haz baja a ~6° y la directividad sube a ~29 dBi. Ese es el intercambio: concentrar potencia en una zona pequeña. El mapa de fase muestra la rampa que apunta el haz.',
      apply: (h) => {
        h.setAntenna({ n: 16 });
        h.setMode('spot');
      },
    },
    {
      title: '6 · Cobertura celular y reutilización',
      text: 'Para cubrir Perú se despliegan cientos de haces pequeños, como celdas. Los colores son la reutilización de frecuencia: celdas del mismo color usan el mismo canal. El satélite recalcula la fase de cada celda mientras la ve.',
      apply: (h) => {
        h.setMode('cellular');
        h.setRegion('peru');
        h.setReuse(3);
        h.setToggle('showGain', true);
        h.setToggle('showCones', false);
      },
    },
    {
      title: '7 · Un haz conformado sobre Lima',
      text: 'Ahora no iluminamos un punto sino una zona. La síntesis resuelve (AᴴA+λI)w=Aᴴd para que el campo valga 1 dentro y 0 fuera: ajusta amplitud y fase de los 256 elementos. Es la versión digital de un reflector con múltiples alimentadores.',
      apply: (h) => {
        h.setMode('shaped');
        h.setShapedCenter(-12.05, -77.04);
        h.setShapedRadius(100);
        h.setToggle('showGain', true);
        h.synthesize();
      },
    },
    {
      title: '8 · Del patrón al enlace',
      text: 'La ganancia del haz entra en el EIRP y la distancia oblicua en la pérdida de espacio libre. Un haz más estrecho da más C/N₀ pero cubre menos: ese es el compromiso de diseño. Revisa el presupuesto de enlace abajo.',
      apply: (h) => {
        h.setToggle('showGain', true);
      },
    },
  ];

  constructor(state: SimState, handlers: UIHandlers) {
    this.state = state;
    this.h = handlers;
    this.bind();
    this.renderMath();
    this.syncControls(state);
  }

  private el<T extends HTMLElement>(id: string): T {
    const e = document.getElementById(id);
    if (!e) throw new Error(`Falta #${id} en el HTML`);
    return e as T;
  }

  private bind() {
    const $ = <T extends HTMLElement>(id: string) => this.el<T>(id);

    $('orbit-preset').addEventListener('change', (e) => {
      this.h.setPreset((e.target as HTMLSelectElement).value);
    });

    const bindRange = (id: string, fn: (v: number) => void) => {
      const input = $(id) as HTMLInputElement;
      input.addEventListener('input', () => fn(Number(input.value)));
    };
    bindRange('altitude', (v) => this.h.setOrbit({ a: R_EARTH + v }));
    bindRange('inclination', (v) => this.h.setOrbit({ i: v * DEG }));
    bindRange('eccentricity', (v) => this.h.setOrbit({ e: v }));
    bindRange('raan', (v) => this.h.setOrbit({ raan: v * DEG }));
    bindRange('spacing', (v) => this.h.setAntenna({ dx: v, dy: v }));
    bindRange('efficiency', (v) => this.h.setAntenna({ efficiency: v }));
    bindRange('ptx', (v) => this.h.setPtx(v));
    bindRange('shape-radius', (v) => this.h.setShapedRadius(v));

    $('epoch').addEventListener('change', () => {
      const v = ($('epoch') as HTMLInputElement).value;
      if (!v) return;
      this.h.setEpoch(Date.parse(v + 'Z'));
    });
    $('btn-now').addEventListener('click', () => this.h.now());

    $('btn-play').addEventListener('click', () => this.h.play());
    for (const b of document.querySelectorAll<HTMLButtonElement>('#speeds button')) {
      b.addEventListener('click', () => this.h.setSpeed(Number(b.dataset.speed)));
    }
    const timeline = $('timeline') as HTMLInputElement;
    timeline.addEventListener('input', () => {
      const phase = Number(timeline.value) / 1000;
      const T = orbitalPeriod(this.state.orbit.a) * 1000;
      const n = meanMotion(this.state.orbit.a);
      const targetM = phase * 2 * Math.PI;
      const dt = (targetM - this.state.orbit.M0) / n;
      const base = this.state.orbit.epoch + dt * 1000;
      const cur = this.state.simTime;
      const k = Math.round((cur - base) / T);
      this.h.setTime(base + k * T);
    });

    for (const b of document.querySelectorAll<HTMLButtonElement>('#modes [data-mode]')) {
      b.addEventListener('click', () => this.h.setMode(b.dataset.mode as Mode));
    }
    for (const b of document.querySelectorAll<HTMLButtonElement>('#array-sizes button')) {
      b.addEventListener('click', () => this.h.setAntenna({ n: Number(b.dataset.n) }));
    }
    ($('freq') as HTMLSelectElement).addEventListener('change', (e) => {
      this.h.setFrequency(Number((e.target as HTMLSelectElement).value));
    });
    ($('taper') as HTMLSelectElement).addEventListener('change', (e) => {
      this.h.setAntenna({ taper: (e.target as HTMLSelectElement).value as ArrayConfig['taper'] });
    });

    const toggles: [string, ToggleKey][] = [
      ['tg-orbit', 'showOrbit'],
      ['tg-track', 'showTrack'],
      ['tg-footprint', 'showFootprint'],
      ['tg-gain', 'showGain'],
      ['tg-cones', 'showCones'],
      ['tg-grid', 'showGrid'],
    ];
    for (const [id, key] of toggles) {
      ($(id) as HTMLInputElement).addEventListener('change', (e) => {
        this.h.setToggle(key, (e.target as HTMLInputElement).checked);
      });
    }

    for (const b of document.querySelectorAll<HTMLButtonElement>('#camera-modes button')) {
      b.addEventListener('click', () => this.h.setCamera(b.dataset.cam as CameraMode));
    }

    $('spot-lima').addEventListener('click', () => this.h.setSpotTarget(-12.05, -77.04));
    ($('spot-fixed') as HTMLInputElement).addEventListener('change', (e) => {
      this.h.setSpotFixed((e.target as HTMLInputElement).checked);
    });
    ($('cell-region') as HTMLSelectElement).addEventListener('change', (e) => {
      this.h.setRegion((e.target as HTMLSelectElement).value as RegionId);
    });
    ($('cell-reuse') as HTMLSelectElement).addEventListener('change', (e) => {
      this.h.setReuse(Number((e.target as HTMLSelectElement).value));
    });
    $('cell-generate').addEventListener('click', () => this.h.regenerate());

    $('shape-lima').addEventListener('click', () => this.h.setShapedCenter(-12.05, -77.04));
    $('shape-run').addEventListener('click', () => this.h.synthesize());

    $('btn-shot').addEventListener('click', () => this.h.screenshot());
    $('btn-help').addEventListener('click', () => this.toggleHelp());
    $('help-close').addEventListener('click', () => this.toggleHelp(false));
    $('help').addEventListener('click', (e) => {
      if (e.target === $('help')) this.toggleHelp(false);
    });

    $('btn-tour').addEventListener('click', () => this.startTour());
    $('tour-close').addEventListener('click', () => this.closeTour());
    $('tour-prev').addEventListener('click', () => this.stepTour(-1));
    $('tour-next').addEventListener('click', () => this.stepTour(1));

    $('dock-toggle').addEventListener('click', () => {
      $('dock').classList.toggle('collapsed');
    });
    for (const b of document.querySelectorAll<HTMLButtonElement>('.collapse')) {
      b.addEventListener('click', () => {
        const panel = document.getElementById(b.dataset.target ?? '');
        panel?.classList.toggle('collapsed');
        this.syncPanelTabs();
      });
    }
    for (const id of ['tab-orbit', 'tab-antenna']) {
      const tab = document.getElementById(id);
      tab?.addEventListener('click', () => {
        const panel = document.getElementById(tab.getAttribute('aria-controls') ?? '');
        panel?.classList.toggle('collapsed');
        this.syncPanelTabs();
      });
    }
    this.syncPanelTabs();

    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  /** Muestra las pestañas de borde solo para los paneles contraídos. */
  private syncPanelTabs() {
    const pairs: [string, string][] = [
      ['panel-orbit', 'tab-orbit'],
      ['panel-antenna', 'tab-antenna'],
    ];
    for (const [panelId, tabId] of pairs) {
      const panel = document.getElementById(panelId);
      const tab = document.getElementById(tabId);
      if (!panel || !tab) continue;
      const collapsed = panel.classList.contains('collapsed');
      tab.classList.toggle('visible', collapsed);
      tab.setAttribute('aria-expanded', String(!collapsed));
    }
  }

  private togglePanel(panelId: string) {
    const panel = document.getElementById(panelId);
    panel?.classList.toggle('collapsed');
    this.syncPanelTabs();
  }

  private onKey(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
    if (e.code === 'Space') {
      e.preventDefault();
      this.h.play();
    } else if (e.key === '1') this.h.setMode('global');
    else if (e.key === '2') this.h.setMode('spot');
    else if (e.key === '3') this.h.setMode('cellular');
    else if (e.key === '4') this.h.setMode('shaped');
    else if (e.key.toLowerCase() === 'g') this.h.setToggle('showGain', !this.state.showGain);
    else if (e.key.toLowerCase() === 't') this.startTour();
    else if (e.key.toLowerCase() === 'h') this.toggleHelp();
    else if (e.key.toLowerCase() === 'p') this.h.screenshot();
    else if (e.key === '[') this.togglePanel('panel-orbit');
    else if (e.key === ']') this.togglePanel('panel-antenna');
    else if (e.key === 'Escape') {
      this.toggleHelp(false);
      this.closeTour();
    }
  }

  private renderMath() {
    document.querySelectorAll<HTMLElement>('.math[data-tex]').forEach((el) => {
      try {
        katex.render(el.dataset.tex ?? '', el, {
          displayMode: true,
          throwOnError: false,
          strict: 'ignore',
        });
      } catch {
        el.textContent = el.dataset.tex ?? '';
      }
    });
  }

  syncControls(s: SimState) {
    if (this.syncing) return;
    this.syncing = true;
    const $ = <T extends HTMLElement>(id: string) => this.el<T>(id);
    try {
      ($('orbit-preset') as HTMLSelectElement).value = s.presetId;
      const preset = ORBIT_PRESETS.find((p) => p.id === s.presetId);
      $('preset-note').textContent = preset?.note ?? 'Parámetros personalizados.';

      const alt = s.orbit.a - R_EARTH;
      ($('altitude') as HTMLInputElement).value = String(Math.round(alt));
      $('alt-val').textContent = `${alt.toFixed(0)} km`;
      ($('inclination') as HTMLInputElement).value = String(s.orbit.i / DEG);
      $('inc-val').textContent = `${(s.orbit.i / DEG).toFixed(1)}°`;
      ($('eccentricity') as HTMLInputElement).value = String(s.orbit.e);
      $('ecc-val').textContent = s.orbit.e.toFixed(4);
      ($('raan') as HTMLInputElement).value = String(s.orbit.raan / DEG);
      $('raan-val').textContent = `${((((s.orbit.raan / DEG) % 360) + 360) % 360).toFixed(0)}°`;

      if (document.activeElement !== $('epoch')) {
        ($('epoch') as HTMLInputElement).value = new Date(s.orbit.epoch).toISOString().slice(0, 19);
      }

      for (const b of document.querySelectorAll<HTMLButtonElement>('#modes [data-mode]')) {
        b.classList.toggle('active', b.dataset.mode === s.mode);
      }
      for (const b of document.querySelectorAll<HTMLButtonElement>('#array-sizes button')) {
        b.classList.toggle('active', Number(b.dataset.n) === s.antenna.n);
      }
      ($('freq') as HTMLSelectElement).value = String(s.antenna.freqGHz);
      ($('taper') as HTMLSelectElement).value = s.antenna.taper;
      ($('spacing') as HTMLInputElement).value = String(s.antenna.dx);
      $('spacing-val').textContent = `${s.antenna.dx.toFixed(2)} λ`;
      ($('efficiency') as HTMLInputElement).value = String(s.antenna.efficiency);
      $('eff-val').textContent = `${Math.round(s.antenna.efficiency * 100)} %`;
      ($('ptx') as HTMLInputElement).value = String(s.ptxW);
      $('ptx-val').textContent = `${s.ptxW} W`;

      const cfgs: [string, boolean][] = [
        ['tg-orbit', s.showOrbit],
        ['tg-track', s.showTrack],
        ['tg-footprint', s.showFootprint],
        ['tg-gain', s.showGain],
        ['tg-cones', s.showCones],
        ['tg-grid', s.showGrid],
      ];
      for (const [id, v] of cfgs) ($(id) as HTMLInputElement).checked = v;

      for (const b of document.querySelectorAll<HTMLButtonElement>('#camera-modes button')) {
        b.classList.toggle('active', b.dataset.cam === s.cameraMode);
      }

      $('spot-target').textContent = fmtLatLon(s.spotTarget.lat, s.spotTarget.lon);
      $('shape-center').textContent = fmtLatLon(s.shapedCenter.lat, s.shapedCenter.lon);
      ($('spot-fixed') as HTMLInputElement).checked = s.spotFixed;
      ($('shape-radius') as HTMLInputElement).value = String(s.shapedRadiusKm);
      $('shape-radius-val').textContent = `${s.shapedRadiusKm} km`;
      ($('cell-region') as HTMLSelectElement).value = s.region;
      ($('cell-reuse') as HTMLSelectElement).value = String(s.reuse);

      $('block-spot').hidden = s.mode !== 'spot';
      $('block-cellular').hidden = s.mode !== 'cellular';
      $('block-shaped').hidden = s.mode !== 'shaped';

      $('btn-play').classList.toggle('playing', s.playing);
      for (const b of document.querySelectorAll<HTMLButtonElement>('#speeds button')) {
        b.classList.toggle('active', Number(b.dataset.speed) === s.speed);
      }
      $('status-text').textContent = s.playing ? 'simulando' : 'en pausa';
      $('status-dot').classList.toggle('paused', !s.playing);
    } finally {
      this.syncing = false;
    }
  }

  update(s: SimState, d: Derived) {
    const $ = <T extends HTMLElement>(id: string) => this.el<T>(id);

    $('mission-name').textContent = `${ORBIT_PRESETS.find((p) => p.id === s.presetId)?.name ?? 'Personalizada'} · ${(s.orbit.a - R_EARTH).toFixed(0)} km · ${(s.orbit.i / DEG).toFixed(1)}°`;
    $('ro-apogee').textContent = `${apogeeAlt(s.orbit).toFixed(0)} km`;
    $('ro-perigee').textContent = `${perigeeAlt(s.orbit).toFixed(0)} km`;
    $('ro-alt').textContent = `${d.sat.alt.toFixed(0)} km`;
    $('ro-speed').textContent = `${d.sat.speed.toFixed(2)} km/s`;
    $('ro-period').textContent = fmtPeriod(orbitalPeriod(s.orbit.a) / 60);
    $('ro-inc').textContent = `${(s.orbit.i / DEG).toFixed(1)}°`;
    $('ro-ecc').textContent = s.orbit.e.toFixed(4);
    $('ro-raan').textContent = `${((((s.orbit.raan / DEG) % 360) + 360) % 360).toFixed(0)}°`;

    $('ant-d').textContent = `${d.metrics.directivityDb.toFixed(1)} dBi`;
    $('ant-g').textContent = `${d.metrics.gainDb.toFixed(1)} dBi`;
    $('ant-hpbw').textContent = `${d.metrics.hpbwDeg.toFixed(1)}°`;
    $('ant-sll').textContent = d.metrics.sllDb < -90 ? '—' : `${d.metrics.sllDb.toFixed(1)} dB`;
    $('ant-ap').textContent = d.metrics.apertureM < 1e-3
      ? '—'
      : d.metrics.apertureM >= 1
        ? `${d.metrics.apertureM.toFixed(2)} m`
        : `${(d.metrics.apertureM * 100).toFixed(0)} cm`;
    $('grating-warn').hidden = !d.metrics.grating;

    const sourceLabel = d.source === 'horn' ? 'bocina' : d.source === 'synthesis' ? 'síntesis' : 'arreglo';
    $('phase-caption').textContent = `${d.phase.n}×${d.phase.n} · ${sourceLabel} · ${d.metrics.hpbwDeg.toFixed(1)}°`;

    this.drawPhaseIfNeeded(d);
    this.updatePattern(d);
    this.updateLink(s, d);
    this.updateBeams(s, d);

    $('cell-info').textContent = d.beamSet
      ? `${d.beamSet.totalCells} celdas · ${d.beamSet.visibleCells} visibles`
      : s.mode === 'cellular'
        ? `${d.beams.length} haces sobre el disco visible`
        : '—';
    $('shape-info').textContent = d.shaped
      ? `Cobertura ${(d.shaped.coverage * 100).toFixed(0)} % · derrame ${d.shaped.spillDb.toFixed(1)} dB · D ${d.shaped.directivityDb.toFixed(1)} dBi`
      : 'Diseña la fase para iluminar la zona y anular el exterior.';

    const phase = ((((d.sat.M % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI)) * 1000;
    const timeline = $('timeline') as HTMLInputElement;
    if (document.activeElement !== timeline) timeline.value = String(Math.round(phase));
    $('utc-clock').textContent = fmtTime(s.simTime);
    $('orbit-phase').textContent = `fase orbital ${(phase / 10).toFixed(0)} %`;
    $('status-dot').classList.toggle('paused', !s.playing);
    $('status-text').textContent = s.playing ? 'simulando' : 'en pausa';
    $('btn-play').classList.toggle('playing', s.playing);
  }

  private drawPhaseIfNeeded(d: Derived) {
    if (this.lastPhaseObj === d.phase) return;
    this.lastPhaseObj = d.phase;
    drawPhaseMap(this.el<HTMLCanvasElement>('phase-canvas'), d.phase);
  }

  private updatePattern(d: Derived) {
    const span = Math.min(110, Math.max(14, d.metrics.hpbwDeg * (d.source === 'horn' ? 0.95 : 3)));
    let cut: PatternPoint[] | null = null;
    let label = 'elevación · haz';
    if (d.source === 'synthesis') {
      const peak = peakDirection(d.pattern);
      cut = patternCutAt(d.pattern, peak.u, peak.v, d.patternQ, span, 361);
      label = 'síntesis · pico';
    } else if (d.activeBeam) {
      cut = patternCut(d.pattern, d.activeBeam, d.patternQ, span, 361);
      label = d.source === 'horn' ? 'bocina global' : 'elevación · haz';
    }
    this.el('cut-badge').textContent = label;
    const key = `${label}|${span.toFixed(1)}|${cut?.length ?? 0}|${cut?.[0]?.db.toFixed(2) ?? ''}|${cut?.[cut.length - 1]?.db.toFixed(2) ?? ''}|${d.metrics.hpbwDeg.toFixed(1)}`;
    if (key === this.lastPatternKey) return;
    this.lastPatternKey = key;
    drawPatternChart(this.el<HTMLCanvasElement>('pattern-canvas'), cut, d.metrics.hpbwDeg, label);
  }

  private updateLink(s: SimState, d: Derived) {
    const $ = <T extends HTMLElement>(id: string) => this.el<T>(id);
    $('link-badge').textContent = `${s.antenna.freqGHz} GHz · ${s.bandwidthMHz} MHz`;
    const l = d.link;
    if (!l) return;
    $('lk-eirp').textContent = `${l.eirpDbW.toFixed(1)} dBW`;
    $('lk-fspl').textContent = `${l.fsplDb.toFixed(1)} dB`;
    $('lk-prx').textContent = `${l.rxPowerDbm.toFixed(1)} dBm`;
    $('lk-cn0').textContent = `${l.cn0DbHz.toFixed(1)} dBHz`;
    const pct = Math.max(0, Math.min(100, ((l.cn0DbHz - 25) / 45) * 100));
    $('cn0-meter').style.width = `${pct}%`;
    $('lk-throughput').textContent = `≈ ${l.throughputMbps.toFixed(0)} Mbps · ${s.bandwidthMHz} MHz`;
    $('lk-range').textContent = d.activeBeam?.target
      ? `${fmtLatLon(d.activeBeam.target.lat, d.activeBeam.target.lon)}`
      : `${l.slantKm.toFixed(0)} km`;
  }

  private updateBeams(s: SimState, d: Derived) {
    const $ = <T extends HTMLElement>(id: string) => this.el<T>(id);
    $('beam-count').textContent = String(d.beams.length);
    $('beam-mode').textContent = MODE_LABEL[s.mode];
    $('beam-reuse').textContent = s.mode === 'cellular' ? `${s.reuse} colores` : '—';
    $('beam-visible').textContent = d.beamSet ? `${d.beamSet.visibleCells}/${d.beamSet.totalCells}` : '—';
    const key = `${s.mode}|${s.reuse}|${s.antenna.n}`;
    if (key !== this.lastReuseKey) {
      this.lastReuseKey = key;
      this.renderReuse(this.el('reuse-legend'), s.mode === 'cellular' ? s.reuse : 0);
      this.renderReuse(this.el('beam-colors'), s.mode === 'cellular' ? s.reuse : 0);
    }
    void d;
  }

  private renderReuse(container: HTMLElement, count: number) {
    container.innerHTML = '';
    for (let i = 0; i < count; i++) {
      const span = document.createElement('span');
      const dot = document.createElement('i');
      dot.style.background = BEAM_HEX[i % BEAM_HEX.length];
      span.appendChild(dot);
      span.appendChild(document.createTextNode(`${REUSE_LABELS[i % REUSE_LABELS.length]} · canal ${i + 1}`));
      container.appendChild(span);
    }
  }

  setFps(v: number) {
    this.el('fps').textContent = `${v.toFixed(0)} fps`;
  }

  toast(msg: string, error = false) {
    const el = this.el('toast');
    el.textContent = msg;
    el.className = `toast show${error ? ' error' : ''}`;
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      el.className = 'toast';
    }, 3200);
  }

  setSynthesisBusy(busy: boolean, text = '') {
    const btn = this.el<HTMLButtonElement>('shape-run');
    btn.disabled = busy;
    btn.textContent = busy ? 'Sintetizando…' : 'Sintetizar cobertura';
    if (text) this.el('shape-info').textContent = text;
  }

  toggleHelp(force?: boolean) {
    const el = this.el('help');
    const show = force ?? el.hidden;
    el.hidden = !show;
  }

  startTour() {
    this.tourIndex = 0;
    this.showTour();
    this.applyTour();
  }

  closeTour() {
    this.el('tour').hidden = true;
  }

  private stepTour(dir: number) {
    const next = this.tourIndex + dir;
    if (next >= this.tourSteps.length) {
      this.closeTour();
      return;
    }
    this.tourIndex = Math.max(0, next);
    this.showTour();
    this.applyTour();
  }

  private showTour() {
    const el = this.el('tour');
    el.hidden = false;
    const step = this.tourSteps[this.tourIndex];
    this.el('tour-title').textContent = step.title;
    this.el('tour-text').textContent = step.text;
    const dots = this.el('tour-dots');
    dots.innerHTML = '';
    for (let i = 0; i < this.tourSteps.length; i++) {
      const d = document.createElement('i');
      if (i === this.tourIndex) d.className = 'on';
      dots.appendChild(d);
    }
    this.el<HTMLButtonElement>('tour-prev').disabled = this.tourIndex === 0;
    this.el('tour-next').textContent = this.tourIndex === this.tourSteps.length - 1 ? 'Cerrar' : 'Siguiente';
  }

  private applyTour() {
    this.tourSteps[this.tourIndex].apply(this.h);
  }
}
