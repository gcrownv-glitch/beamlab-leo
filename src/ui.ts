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
import type { CameraMode, Derived, LinkDirection, Mode, PhaseView, Quality, QuantMode, QuantState, SimState, TerminalId } from './state';
import { buildSample, type LabSample, type LabSession } from './core/lab';
import { LabStore } from './lab-store';
import { checkForUpdate, skipVersion, type UpdateInfo } from './update';
import type { SheetFormat } from './lab-sheet';
import type { SaveResult } from './save';
import { APP_VERSION } from './version';

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
  setCellularCi(enabled: boolean): void;
  regenerate(): void;
  setShapedCenter(lat: number, lon: number): void;
  setShapedRadius(km: number): void;
  synthesize(): void;
  setPtx(w: number): void;
  setUplinkPower(w: number): void;
  setLinkDirection(dir: LinkDirection): void;
  setBandwidth(mhz: number): void;
  setTerminal(id: TerminalId): void;
  setRainMargin(db: number): void;
  setUsers(n: number): void;
  setCellTarget(lat: number, lon: number): void;
  setQuant(patch: Partial<QuantState>): void;
  exportLabSheet(format: SheetFormat, session: LabSession, sample: LabSample | null): Promise<SaveResult>;
  exportScene(): Promise<SaveResult>;
  setFpsCap(cap: number): void;
  setQuality(quality: Quality): void;
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
const fmtPeriod = (min: number) => (min >= 180 ? `${(min / 60).toFixed(2)} h` : `${min.toFixed(1)} min`);

export class UI {
  private state: SimState;
  private h: UIHandlers;
  private tourIndex = 0;
  private toastTimer = 0;
  private syncing = false;
  private lastPhaseObj: PhaseView | null = null;
  private lastReuseKey = '';
  private lastPatternKey = '';
  private lab = new LabStore();
  private labSample: LabSample | null = null;
  private latestState: SimState | null = null;
  private latestDerived: Derived | null = null;

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
      text: 'El anillo azul es el horizonte geométrico: desde 550 km se ve hasta 67° de nadir; en la superficie, el casquete tiene ~23° de ángulo central, unos 2.560 km de radio (~5.100 km de diámetro). Un haz ancho (~134° en LEO) cubre casi todo el disco pero reparte poca potencia; la bocina de 17° del apunte cubre todo el disco solo desde GEO. Por eso LEO divide el disco en haces.',
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
      title: '6 · El panel real no es ideal',
      text: 'Un desfasador de 5 bits solo tiene 32 fases (paso 11,25°); el VGA de 4 bits, 16 niveles. Añadimos errores residuales de 2° y 0,2 dB y calculamos el patrón exacto del haz activo. Cambia a 3 bits o pulsa “Nueva semilla” y observa el apuntamiento y el corte; en el haz conformado la cobertura baja de 100 % a 98 %.',
      apply: (h) => {
        h.setMode('spot');
        h.setQuant({ mode: 'realtime', phaseBits: 5, ampBits: 4, phaseRmsDeg: 2, ampRmsDb: 0.2 });
        h.setToggle('showGain', true);
      },
    },
    {
      title: '7 · Cobertura celular y reutilización',
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
      title: '8 · Un haz conformado sobre Lima',
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
      title: '9 · Del patrón al enlace',
      text: 'La ganancia del haz entra en el EIRP y la distancia oblicua en la pérdida de espacio libre. Un haz más estrecho da más C/N₀ pero cubre menos: ese es el compromiso de diseño. Revisa el presupuesto de enlace abajo.',
      apply: (h) => {
        h.setMode('spot');
        h.setToggle('showGain', true);
      },
    },
    {
      title: '10 · Bajada y subida',
      text: 'Bajada: satélite → VSAT, 12 GHz, 20 W y G/T del terminal. Subida: VSAT → satélite, 14 GHz, 4 W y G/T del satélite. El balance muestra ambos C/N y qué lado limita; la capacidad de sistema usa el mínimo. Baja la potencia del terminal a 1 W y verás cómo la subida pasa a 32APSK y recorta la capacidad.',
      apply: (h) => {
        h.setMode('spot');
        h.setLinkDirection('downlink');
        h.setUplinkPower(4);
        h.setToggle('showGain', true);
      },
    },
  ];

  constructor(state: SimState, handlers: UIHandlers) {
    this.state = state;
    this.h = handlers;
    this.el('app-version').textContent = `v${APP_VERSION}`;
    this.bind();
    this.renderMath();
    this.syncControls(state);
    window.setTimeout(() => void this.checkUpdate(), 3200);
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
    bindRange('uplink-power', (v) => this.h.setUplinkPower(v));
    bindRange('bandwidth', (v) => this.h.setBandwidth(v));
    bindRange('users-beam', (v) => {
      $('users-val').textContent = String(v);
      this.h.setUsers(v);
    });
    bindRange('shape-radius', (v) => this.h.setShapedRadius(v));

    ($('terminal-preset') as HTMLSelectElement).addEventListener('change', (e) => {
      this.h.setTerminal((e.target as HTMLSelectElement).value as TerminalId);
    });
    ($('rain-margin') as HTMLSelectElement).addEventListener('change', (e) => {
      this.h.setRainMargin(Number((e.target as HTMLSelectElement).value));
    });
    for (const btn of document.querySelectorAll<HTMLButtonElement>('#link-direction button')) {
      btn.addEventListener('click', () => {
        this.h.setLinkDirection((btn.dataset.link as LinkDirection) ?? 'downlink');
      });
    }
    ($('quant-mode') as HTMLSelectElement).addEventListener('change', (e) => {
      this.h.setQuant({ mode: (e.target as HTMLSelectElement).value as QuantMode });
    });
    ($('quant-phase') as HTMLSelectElement).addEventListener('change', (e) => {
      this.h.setQuant({ phaseBits: Number((e.target as HTMLSelectElement).value) });
    });
    ($('quant-amp') as HTMLSelectElement).addEventListener('change', (e) => {
      this.h.setQuant({ ampBits: Number((e.target as HTMLSelectElement).value) });
    });
    ($('quant-phase-rms') as HTMLSelectElement).addEventListener('change', (e) => {
      this.h.setQuant({ phaseRmsDeg: Number((e.target as HTMLSelectElement).value) });
    });
    ($('quant-amp-rms') as HTMLSelectElement).addEventListener('change', (e) => {
      this.h.setQuant({ ampRmsDb: Number((e.target as HTMLSelectElement).value) });
    });
    $('quant-seed').addEventListener('click', () => {
      this.h.setQuant({ seed: Math.floor(Math.random() * 2147483647) });
    });

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

    ($('fps-cap') as HTMLSelectElement).addEventListener('change', (e) => {
      this.h.setFpsCap(Number((e.target as HTMLSelectElement).value));
    });
    ($('quality') as HTMLSelectElement).addEventListener('change', (e) => {
      this.h.setQuality((e.target as HTMLSelectElement).value as Quality);
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
    for (const btn of document.querySelectorAll<HTMLButtonElement>('#cell-ci-mode button')) {
      btn.addEventListener('click', () => {
        this.h.setCellularCi(btn.dataset.ci === '1');
      });
    }
    $('cell-generate').addEventListener('click', () => this.h.regenerate());

    $('shape-lima').addEventListener('click', () => this.h.setShapedCenter(-12.05, -77.04));
    $('shape-run').addEventListener('click', () => this.h.synthesize());

    $('btn-shot').addEventListener('click', () => void this.exportScene());
    $('btn-lab').addEventListener('click', () => this.openLab());
    $('lab-close').addEventListener('click', () => this.closeLab());
    $('lab').addEventListener('click', (e) => {
      if (e.target === $('lab')) this.closeLab();
    });
    $('lab-sample').addEventListener('click', () => this.takeSample());
    $('lab-png').addEventListener('click', () => void this.exportSheet('png'));
    $('lab-pdf').addEventListener('click', () => void this.exportSheet('pdf'));
    $('lab-scene').addEventListener('click', () => void this.exportScene());
    $('lab-csv').addEventListener('click', () => void this.exportCsv());
    $('lab-json').addEventListener('click', () => void this.exportJson());
    $('lab-reset').addEventListener('click', () => this.resetLab());
    ($('lab-import') as HTMLInputElement).addEventListener('change', (e) => this.importLab(e));
    for (const el of ['lab-title', 'lab-course', 'lab-author', 'lab-notes']) {
      $(el).addEventListener('input', () => this.saveLabFields());
    }
    $('update-close').addEventListener('click', () => this.hideUpdate());
    $('update-continue').addEventListener('click', () => this.hideUpdate());
    $('update').addEventListener('click', (e) => {
      if (e.target === $('update')) this.hideUpdate();
    });
    $('update-skip').addEventListener('click', () => {
      const modal = this.el('update');
      const version = modal.dataset.version;
      if (version) skipVersion(version);
      this.hideUpdate();
    });
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
    if (window.innerWidth <= 760) {
      $('panel-orbit').classList.add('collapsed');
      $('panel-antenna').classList.add('collapsed');
    }
    $('btn-mobile-orbit').addEventListener('click', () => this.togglePanel('panel-orbit'));
    $('btn-mobile-antenna').addEventListener('click', () => this.togglePanel('panel-antenna'));
    for (const b of document.querySelectorAll<HTMLButtonElement>('.collapse')) {
      b.addEventListener('click', () => {
        const target = b.dataset.target ?? '';
        if (target) this.togglePanel(target);
      });
    }
    for (const id of ['tab-orbit', 'tab-antenna']) {
      const tab = document.getElementById(id);
      tab?.addEventListener('click', () => {
        const target = tab.getAttribute('aria-controls') ?? '';
        if (target) this.togglePanel(target);
      });
    }
    this.syncPanelTabs();

    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  /** Muestra las pestañas de borde solo para los paneles contraídos y sincroniza los toggles móviles. */
  private syncPanelTabs() {
    const pairs: [string, string, string][] = [
      ['panel-orbit', 'tab-orbit', 'btn-mobile-orbit'],
      ['panel-antenna', 'tab-antenna', 'btn-mobile-antenna'],
    ];
    for (const [panelId, tabId, mobId] of pairs) {
      const panel = document.getElementById(panelId);
      const tab = document.getElementById(tabId);
      const mob = document.getElementById(mobId);
      if (!panel) continue;
      const collapsed = panel.classList.contains('collapsed');
      if (tab) {
        tab.classList.toggle('visible', collapsed);
        tab.setAttribute('aria-expanded', String(!collapsed));
      }
      if (mob) {
        mob.classList.toggle('active', !collapsed);
        mob.setAttribute('aria-expanded', String(!collapsed));
      }
    }
  }

  private togglePanel(panelId: string) {
    const panel = document.getElementById(panelId);
    if (!panel) return;
    const willOpen = panel.classList.contains('collapsed');
    if (willOpen && window.innerWidth <= 760) {
      const otherId = panelId === 'panel-orbit' ? 'panel-antenna' : 'panel-orbit';
      document.getElementById(otherId)?.classList.add('collapsed');
    }
    panel.classList.toggle('collapsed');
    this.syncPanelTabs();
  }

  private onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      this.toggleHelp(false);
      this.closeLab();
      this.hideUpdate();
      this.closeTour();
      return;
    }
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
    else if (e.key.toLowerCase() === 'p') this.openLab();
    else if (e.key === '[') this.togglePanel('panel-orbit');
    else if (e.key === ']') this.togglePanel('panel-antenna');
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
    document.querySelectorAll<HTMLElement>('.math-inline[data-tex]').forEach((el) => {
      try {
        katex.render(el.dataset.tex ?? '', el, {
          displayMode: false,
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
      ($('uplink-power') as HTMLInputElement).value = String(s.uplinkPowerW);
      $('uplink-power-val').textContent = `${s.uplinkPowerW} W`;
      for (const btn of document.querySelectorAll<HTMLButtonElement>('#link-direction button')) {
        btn.classList.toggle('active', btn.dataset.link === s.linkDirection);
      }
      ($('bandwidth') as HTMLInputElement).value = String(s.bandwidthMHz);
      $('bw-val').textContent = `${s.bandwidthMHz} MHz`;
      ($('terminal-preset') as HTMLSelectElement).value = s.terminalId;
      ($('rain-margin') as HTMLSelectElement).value = String(s.rainMarginDb);
      ($('users-beam') as HTMLInputElement).value = String(s.usersPerBeam);
      $('users-val').textContent = String(s.usersPerBeam);
      ($('quant-mode') as HTMLSelectElement).value = s.quant.mode;
      ($('quant-phase') as HTMLSelectElement).value = String(s.quant.phaseBits);
      ($('quant-amp') as HTMLSelectElement).value = String(s.quant.ampBits);
      ($('quant-phase-rms') as HTMLSelectElement).value = String(s.quant.phaseRmsDeg);
      ($('quant-amp-rms') as HTMLSelectElement).value = String(s.quant.ampRmsDb);

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
      for (const btn of document.querySelectorAll<HTMLButtonElement>('#cell-ci-mode button')) {
        btn.classList.toggle('active', (btn.dataset.ci === '1') === s.cellularCi);
      }
      ($('fps-cap') as HTMLSelectElement).value = String(s.fpsCap);
      ($('quality') as HTMLSelectElement).value = s.quality;

      $('block-spot').hidden = s.mode !== 'spot';
      $('block-cellular').hidden = s.mode !== 'cellular';
      $('block-shaped').hidden = s.mode !== 'shaped';

      $('btn-play').classList.toggle('playing', s.playing);
      for (const b of document.querySelectorAll<HTMLButtonElement>('#speeds button')) {
        b.classList.toggle('active', Number(b.dataset.speed) === s.speed);
      }
      const timeLocked = s.mode === 'shaped';
      ($('btn-play') as HTMLButtonElement).disabled = timeLocked;
      ($('timeline') as HTMLInputElement).disabled = timeLocked;
      for (const b of document.querySelectorAll<HTMLButtonElement>('#speeds button')) b.disabled = timeLocked;
      $('status-text').textContent = timeLocked ? 'diseño estático' : s.playing ? 'simulando' : 'en pausa';
      $('status-dot').classList.toggle('paused', timeLocked || !s.playing);
      $('shape-lock').hidden = !timeLocked;
      $('cell-selected').textContent = s.cellTarget
        ? `Celda seleccionada: ${fmtLatLon(s.cellTarget.lat, s.cellTarget.lon)}`
        : 'Haz clic en el globo para inspeccionar una celda.';
    } finally {
      this.syncing = false;
    }
  }

  update(s: SimState, d: Derived) {
    const $ = <T extends HTMLElement>(id: string) => this.el<T>(id);
    this.latestState = s;
    this.latestDerived = d;

    $('mission-name').textContent = `${ORBIT_PRESETS.find((p) => p.id === s.presetId)?.name ?? 'Personalizada'} · ${(s.orbit.a - R_EARTH).toFixed(0)} km · ${(s.orbit.i / DEG).toFixed(1)}°`;
    $('ro-apogee').textContent = `${apogeeAlt(s.orbit).toFixed(0)} km`;
    $('ro-perigee').textContent = `${perigeeAlt(s.orbit).toFixed(0)} km`;
    $('ro-alt').textContent = `${d.sat.alt.toFixed(0)} km`;
    $('ro-speed').textContent = `${d.sat.speed.toFixed(2)} km/s`;
    $('ro-period').textContent = fmtPeriod(orbitalPeriod(s.orbit.a) / 60);
    $('ro-inc').textContent = `${(s.orbit.i / DEG).toFixed(1)}°`;
    $('ro-ecc').textContent = s.orbit.e.toFixed(4);
    $('ro-raan').textContent = `${((((s.orbit.raan / DEG) % 360) + 360) % 360).toFixed(0)}°`;

    const m = d.activeMetrics;
    $('ant-d').textContent = `${m.directivityDb.toFixed(1)} dBi`;
    $('ant-g').textContent = `${m.gainDb.toFixed(1)} dBi`;
    $('ant-hpbw').textContent = `${m.hpbwDeg.toFixed(1)}°`;
    $('ant-sll').textContent = d.source === 'synthesis'
      ? '—'
      : m.sllDb < -90 ? '—' : `${m.sllDb.toFixed(1)} dB`;
    $('ant-ap').textContent = m.apertureM < 1e-3
      ? '—'
      : m.apertureM >= 1
        ? `${m.apertureM.toFixed(2)} m`
        : `${(m.apertureM * 100).toFixed(0)} cm`;
    $('grating-warn').hidden = !m.grating;

    const sourceLabel = d.source === 'horn' ? 'bocina' : d.source === 'synthesis' ? 'síntesis' : 'arreglo';
    $('phase-caption').textContent = `${d.phase.n}×${d.phase.n} · ${sourceLabel} · ${m.hpbwDeg.toFixed(1)}°${d.quant ? ' · cuantizado' : ''}`;

    this.drawPhaseIfNeeded(d);
    this.updatePattern(d);
    this.updateLink(s, d);
    this.updateBeams(s, d);
    this.updateQuant(d);

    $('cell-info').textContent = d.beamSet
      ? `${d.beamSet.totalCells} celdas · ${d.beamSet.visibleCells} visibles${s.cellularCi && d.link?.ciDb != null ? ` · C/I ${d.link.ciDb.toFixed(1)} dB` : ''}`
      : s.mode === 'cellular'
        ? `${d.beams.length} haces sobre el disco visible`
        : '—';
    $('shape-info').textContent = d.shaped
      ? `Sintetizado · Cobertura ${(d.shaped.coverage * 100).toFixed(0)} % · derrame ${d.shaped.spillDb.toFixed(1)} dB · D ${d.shaped.directivityDb.toFixed(1)} dBi`
      : s.antenna.n > 20
        ? `Arreglo ${s.antenna.n}×${s.antenna.n} supera el límite de síntesis (máx. 20×20). Cambia a 8×8 o 16×16 para sintetizar.`
        : 'Pendiente de sintetizar · ajusta centro/radio y pulsa «Sintetizar cobertura».';

    const phase = ((((d.sat.M % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI)) * 1000;
    const timeline = $('timeline') as HTMLInputElement;
    if (document.activeElement !== timeline) timeline.value = String(Math.round(phase));
    $('utc-clock').textContent = fmtTime(s.simTime);
    $('orbit-phase').textContent = `fase orbital ${(phase / 10).toFixed(0)} %`;
    const timeLocked = s.mode === 'shaped';
    $('status-dot').classList.toggle('paused', timeLocked || !s.playing);
    $('status-text').textContent = timeLocked ? 'diseño estático' : s.playing ? 'simulando' : 'en pausa';
    $('btn-play').classList.toggle('playing', s.playing);
  }

  private drawPhaseIfNeeded(d: Derived) {
    if (this.lastPhaseObj === d.phase) return;
    this.lastPhaseObj = d.phase;
    drawPhaseMap(this.el<HTMLCanvasElement>('phase-canvas'), d.phase);
  }

  private updatePattern(d: Derived) {
    const m = d.activeMetrics;
    const pattern = d.activePattern;
    const span = Math.min(110, Math.max(14, m.hpbwDeg * (d.source === 'horn' ? 0.95 : 3)));
    let cut: PatternPoint[] | null = null;
    let idealCut: PatternPoint[] | null = null;
    let label = 'elevación · haz';
    if (d.quant?.activeCut) {
      cut = d.quant.activeCut;
      idealCut = d.quant.idealCut;
      label = d.source === 'synthesis' ? 'síntesis · cuantizado' : 'cuantizado vs ideal';
    } else if (d.source === 'synthesis') {
      const peak = peakDirection(pattern);
      cut = patternCutAt(pattern, peak.u, peak.v, d.patternQ, span, 361);
      label = 'síntesis · pico';
    } else if (d.activeBeam) {
      cut = patternCut(pattern, d.activeBeam, d.patternQ, span, 361);
      label = d.source === 'horn' ? 'bocina global' : 'elevación · haz';
    }
    this.el('cut-badge').textContent = label;
    const key = `${label}|${span.toFixed(1)}|${cut?.length ?? 0}|${cut?.[0]?.db.toFixed(2) ?? ''}|${cut?.[cut.length - 1]?.db.toFixed(2) ?? ''}|${m.hpbwDeg.toFixed(1)}|${d.quant?.resolution ?? 0}|${d.quant?.stale ? 1 : 0}`;
    if (key === this.lastPatternKey) return;
    this.lastPatternKey = key;
    drawPatternChart(this.el<HTMLCanvasElement>('pattern-canvas'), cut, m.hpbwDeg, label, idealCut);
  }

  private updateLink(s: SimState, d: Derived) {
    const $ = <T extends HTMLElement>(id: string) => this.el<T>(id);
    const l = d.link;
    const uplink = s.linkDirection === 'uplink';
    const dirLabel = uplink ? 'Subida' : 'Bajada';
    $('lk-eirp-label').textContent = uplink ? 'EIRP VSAT' : 'EIRP sat';
    $('lk-prx-label').textContent = uplink ? 'P_rx sat' : 'P_rx VSAT';
    $('lk-gt-label').textContent = uplink ? 'G/T sat' : 'G/T VSAT';
    if (!l) {
      $('link-badge').textContent = 'sin haz';
      $('lk-cn-label').textContent = 'C/N';
      for (const id of ['lk-eirp', 'lk-fspl', 'lk-prx', 'lk-cn0', 'lk-cn', 'lk-modcod', 'lk-margin', 'lk-gt', 'lk-elev', 'lk-slant']) {
        $(id).textContent = '—';
      }
      $('lk-throughput').textContent = 'sin enlace · no hay haz activo';
      $('link-balance').textContent = 'Sin haz activo: no hay balance DL/UL.';
      $('lk-range').textContent = '—';
      $('cn0-meter').style.width = '0%';
      $('cn0-meter').classList.remove('outage');
      $('sys-power').textContent = '—';
      $('sys-spectrum').textContent = '—';
      $('sys-cap-label').textContent = s.mode === 'cellular' ? 'Cap. clúster' : 'Cap. sistema';
      $('sys-capacity').textContent = '—';
      $('sys-coverage').textContent = '—';
      $('sys-agg-row').hidden = s.mode !== 'cellular';
      $('sys-aggregate').textContent = '—';
      return;
    }
    $('link-badge').textContent = `${dirLabel} · ${l.freqGHz.toFixed(0)} GHz · ${s.bandwidthMHz} MHz`;
    $('lk-eirp').textContent = `${l.eirpDbW.toFixed(1)} dBW`;
    $('lk-fspl').textContent = `${l.fsplDb.toFixed(1)} dB`;
    $('lk-prx').textContent = `${l.rxPowerDbm.toFixed(1)} dBm`;
    $('lk-cn0').textContent = `${l.cn0DbHz.toFixed(1)} dBHz`;
    if (l.ciDb !== null) {
      $('lk-cn-label').textContent = 'C/(N+I)';
      $('lk-cn').textContent = `${l.sinrDb.toFixed(1)} dB`;
    } else {
      $('lk-cn-label').textContent = 'C/N';
      $('lk-cn').textContent = `${l.cnDb.toFixed(1)} dB`;
    }
    $('lk-modcod').textContent = l.modcod;
    $('lk-margin').textContent = `${l.marginDb >= 0 ? '+' : ''}${l.marginDb.toFixed(1)} dB`;
    $('lk-gt').textContent = `${l.gtDbK.toFixed(1)} dB/K`;
    $('lk-elev').textContent = `${l.elevationDeg.toFixed(0)}°`;
    $('lk-slant').textContent = `${l.slantKm.toFixed(0)} km`;
    const margin = l.outage ? -8 : Math.max(-8, Math.min(20, l.marginDb));
    const pct = Math.max(0, Math.min(100, ((margin + 8) / 28) * 100));
    $('cn0-meter').style.width = `${pct}%`;
    $('cn0-meter').classList.toggle('outage', l.outage);
    $('lk-throughput').textContent = l.outage
      ? 'sin enlace · C/N bajo el umbral'
      : `≈ ${l.throughputMbps.toFixed(0)} Mbps/haz · ${l.userThroughputMbps.toFixed(1)} Mbps/usuario`;
    $('lk-range').textContent = d.activeBeam?.target
      ? fmtLatLon(d.activeBeam.target.lat, d.activeBeam.target.lon)
      : `${l.slantKm.toFixed(0)} km`;

    const dl = d.links.downlink;
    const ul = d.links.uplink;
    if (dl && ul) {
      const limit = d.system.limitingLink === 'uplink' ? 'subida' : d.system.limitingLink === 'downlink' ? 'bajada' : '—';
      const ciPart = dl.ciDb !== null ? `   |   C/I ${dl.ciDb.toFixed(1)} dB` : '';
      const dlVal = dl.ciDb !== null ? dl.sinrDb : dl.cnDb;
      const ulVal = ul.ciDb !== null ? ul.sinrDb : ul.cnDb;
      const metricTag = dl.ciDb !== null ? 'SINR ' : '';
      $('link-balance').textContent = `DL ${metricTag}${dlVal.toFixed(1)} dB · ${dl.throughputMbps.toFixed(0)} Mbps   |   UL ${metricTag}${ulVal.toFixed(1)} dB · ${ul.throughputMbps.toFixed(0)} Mbps${ciPart}   |   limita ${limit}`;
    } else {
      $('link-balance').textContent = 'Balance DL/UL no disponible.';
    }

    const sys = d.system;
    const fmtCap = (mbps: number) => mbps >= 1000
      ? `${(mbps / 1000).toFixed(2)} Gbps`
      : `${mbps.toFixed(0)} Mbps`;
    $('sys-power').textContent = sys.rfPowerW >= 1000 ? `${(sys.rfPowerW / 1000).toFixed(1)} kW` : `${sys.rfPowerW.toFixed(0)} W`;
    $('sys-power').classList.toggle('warn', sys.rfPowerW > 6000);
    $('sys-spectrum').textContent = `${sys.spectrumMHz.toFixed(0)} MHz`;
    $('sys-cap-label').textContent = s.mode === 'cellular' ? 'Cap. clúster' : 'Cap. sistema';
    $('sys-capacity').textContent = fmtCap(sys.capacityMbps);
    $('sys-coverage').textContent = sys.coverageFraction == null ? '—' : `${(sys.coverageFraction * 100).toFixed(0)} %`;
    const aggRow = $('sys-agg-row');
    aggRow.hidden = s.mode !== 'cellular';
    aggRow.title = s.cellularCi
      ? 'Capacidad agregada de los haces visibles (N_vis × C_haz) con degradación C/I co-canal'
      : 'Cota agregada ideal de los haces visibles (N_vis × C_haz), sin degradación C/I co-canal';
    $('sys-aggregate').textContent = fmtCap(sys.aggregateCapacityMbps);
  }

  private openLab() {
    const s = this.lab.session;
    (this.el('lab-title') as HTMLInputElement).value = s.title;
    (this.el('lab-course') as HTMLInputElement).value = s.course;
    (this.el('lab-author') as HTMLInputElement).value = s.author;
    (this.el('lab-notes') as HTMLTextAreaElement).value = s.notes;
    this.renderLab();
    this.el('lab').hidden = false;
  }

  private closeLab() {
    this.el('lab').hidden = true;
  }

  private renderLab() {
    const s = this.lab.session;
    this.el('lab-session-id').textContent = `${s.id} · v${s.appVersion}`;
    this.el('lab-count').textContent = `${s.samples.length} muestra${s.samples.length === 1 ? '' : 's'}`;
    const box = this.el('lab-samples');
    if (!s.samples.length) {
      const empty = document.createElement('div');
      empty.className = 'lab-empty';
      empty.textContent = 'Aún no hay muestras. Configura la simulación y pulsa “Tomar muestra”.';
      box.replaceChildren(empty);
      return;
    }
    const rows = s.samples.slice().reverse().map((m) => {
      const dl = m.links.downlink;
      const time = m.timestamp.slice(11, 19);
      const row = document.createElement('div');
      row.className = 'lab-row';
      row.dataset.id = m.id;

      const title = document.createElement('b');
      title.textContent = `${time} UTC · ${m.mode} · ${m.array.n}×${m.array.n}`;

      const info = document.createElement('span');
      info.textContent = `${m.id} · ${m.quant.phaseBits}/${m.quant.ampBits} bits · C/N ${dl ? dl.cnDb.toFixed(1) : '—'} dB · SLL ${m.metrics.sllDb.toFixed(1)} dB`;

      const del = document.createElement('button');
      del.className = 'lab-del';
      del.title = 'Eliminar muestra';
      del.textContent = '✕';
      del.addEventListener('click', () => {
        this.lab.removeSample(m.id);
        if (this.labSample?.id === m.id) this.labSample = null;
        this.renderLab();
      });

      row.append(title, info, del);
      return row;
    });
    box.replaceChildren(...rows);
  }

  private saveLabFields() {
    this.lab.updateFields({
      title: (this.el('lab-title') as HTMLInputElement).value,
      course: (this.el('lab-course') as HTMLInputElement).value,
      author: (this.el('lab-author') as HTMLInputElement).value,
      notes: (this.el('lab-notes') as HTMLTextAreaElement).value,
    });
  }

  private takeSample() {
    if (!this.latestState || !this.latestDerived) return;
    this.saveLabFields();
    const sample = buildSample(this.latestState, this.latestDerived, this.lab.session.notes);
    this.lab.addSample(sample);
    this.labSample = sample;
    this.renderLab();
    this.toast(`Muestra ${sample.id} guardada`);
  }

  private async exportSheet(format: SheetFormat) {
    if (!this.latestState || !this.latestDerived) return;
    const current = buildSample(this.latestState, this.latestDerived, this.lab.session.notes);
    if (!this.labSample || this.labSample.configHash !== current.configHash) {
      this.lab.addSample(current);
      this.renderLab();
    }
    this.labSample = current;
    const result = await this.h.exportLabSheet(format, this.lab.session, current);
    this.notifySave(result, format === 'pdf' ? 'Ficha PDF' : 'Ficha PNG');
  }

  private async exportScene() {
    const result = await this.h.exportScene();
    this.notifySave(result, 'Escena PNG');
  }

  private async exportCsv() {
    const result = await this.lab.exportCsv();
    this.notifySave(result, 'CSV');
  }

  private async exportJson() {
    const result = await this.lab.exportJson();
    this.notifySave(result, 'Sesión JSON');
  }

  private notifySave(result: SaveResult, label: string) {
    if (result.saved) {
      const where = result.path && result.path !== 'Descargas' ? ` en ${result.path}` : ' en Descargas';
      this.toast(`${label} guardado${where}`);
    } else if (result.error) {
      this.toast(`${label}: ${result.error}`, true);
    } else {
      this.toast(`${label}: exportación cancelada`);
    }
  }

  private resetLab() {
    if (!confirm('¿Crear una sesión nueva? Las muestras actuales quedarán solo en el archivo que hayas exportado.')) return;
    this.lab.reset();
    this.labSample = null;
    this.openLab();
    this.toast('Sesión nueva creada');
  }

  private async importLab(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (this.lab.session.samples.length && !confirm('Cargar esta sesión reemplazará la sesión actual. ¿Continuar?')) {
      input.value = '';
      return;
    }
    try {
      const session = await this.lab.importJson(file);
      this.labSample = session.samples.at(-1) ?? null;
      this.openLab();
      this.toast('Sesión cargada');
    } catch (err) {
      this.toast(err instanceof Error ? err.message : 'No se pudo cargar la sesión', true);
    } finally {
      input.value = '';
    }
  }

  private async checkUpdate() {
    try {
      const info = await checkForUpdate();
      if (info) this.showUpdate(info);
    } catch {
      // sin conexión o sin manifiesto: no molestar
    }
  }

  private showUpdate(info: UpdateInfo) {
    const modal = this.el('update');
    modal.dataset.version = info.latest;
    this.el('update-current').textContent = `Usando v${info.current}`;
    this.el('update-latest').textContent = `Nueva v${info.latest}`;
    this.el('update-notes').textContent = info.notes;
    (this.el('update-download') as HTMLAnchorElement).href = info.page;
    modal.hidden = false;
  }

  private hideUpdate() {
    this.el('update').hidden = true;
  }

  private updateBeams(s: SimState, d: Derived) {
    const $ = <T extends HTMLElement>(id: string) => this.el<T>(id);
    $('beam-count').textContent = String(d.beams.length);
    $('beam-mode').textContent = MODE_LABEL[s.mode];
    $('beam-reuse').textContent = s.mode === 'cellular' ? `${s.reuse} colores` : '—';
    $('beam-visible').textContent = d.beamSet ? `${d.beamSet.visibleCells}/${d.beamSet.totalCells}` : '—';
    $('cell-region-note').textContent = s.region === 'visible'
      ? 'Disco visible: se cubre solo la cara visible; la cara oculta no recibe señal.'
      : 'El color se recorta a la región seleccionada; la cara oculta no recibe señal.';
    const key = `${s.mode}|${s.reuse}|${s.antenna.n}`;
    if (key !== this.lastReuseKey) {
      this.lastReuseKey = key;
      this.renderReuse(this.el('reuse-legend'), s.mode === 'cellular' ? s.reuse : 0);
      this.renderReuse(this.el('beam-colors'), s.mode === 'cellular' ? s.reuse : 0);
    }
    void d;
  }

  private updateQuant(d: Derived) {
    const el = this.el('quant-info');
    if (!d.quant) {
      el.textContent = 'Cuantización desactivada: patrón ideal.';
      return;
    }
    const ideal = d.quant.idealMetrics;
    const q = d.activeMetrics;
    const mode = d.source === 'synthesis' ? 'Síntesis' : d.quant.mode === 'analysis' ? 'Análisis' : 'Tiempo real';
    const stale = d.quant.stale ? ' · actualizando' : '';
    const deltaG = ideal ? q.gainDb - ideal.gainDb : 0;
    const deltaS = ideal ? q.sllDb - ideal.sllDb : 0;
    const idealTxt = ideal
      ? `ideal G ${ideal.gainDb.toFixed(1)} / SLL ${ideal.sllDb.toFixed(1)} dB`
      : 'ideal —';
    el.textContent = `${mode} ${d.quant.resolution}×${d.quant.resolution} · ${d.quant.computeMs.toFixed(0)} ms${stale}\n${idealTxt} · cuant. G ${q.gainDb.toFixed(1)} / SLL ${q.sllDb.toFixed(1)} dB (ΔG ${deltaG >= 0 ? '+' : ''}${deltaG.toFixed(2)} / ΔSLL ${deltaS >= 0 ? '+' : ''}${deltaS.toFixed(2)} dB) · apunt. ${d.quant.pointingErrorDeg?.toFixed(2) ?? '—'}°\n${d.quant.note}`;
  }

  private renderReuse(container: HTMLElement, count: number) {
    container.replaceChildren();
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
    this.el('fps').textContent = v > 0 ? `${v.toFixed(0)} fps` : '—';
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
    dots.replaceChildren();
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
