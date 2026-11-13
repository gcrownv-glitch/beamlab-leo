import './styles.css';
import 'katex/dist/katex.min.css';
import * as THREE from 'three';
import { Engine } from './engine';
import { SceneView, type Textures } from './scene';
import { UI, type ToggleKey, type UIHandlers } from './ui';
import { defaultState, type CameraMode, type Mode, type Quality, type SimState } from './state';
import { elementsOverPoint, presetById } from './core/presets';
import { DEG, R_EARTH } from './core/constants';
import { anglesForGroundPoint } from './core/geometry';
import type { OrbitElements } from './core/orbit';
import type { RegionId } from './core/regions';
import { regionCenter } from './core/regions';
import type { ArrayConfig } from './core/array';

const fmtLat = (v: number) => `${Math.abs(v).toFixed(2)}°${v >= 0 ? 'N' : 'S'}`;
const fmtLon = (v: number) => `${Math.abs(v).toFixed(2)}°${v >= 0 ? 'E' : 'O'}`;

class App {
  state: SimState;
  engine: Engine;
  ui: UI;
  scene: SceneView | null = null;

  private lastTick = 0;
  private fps = 60;
  private fpsFrames = 0;
  private fpsWindowStart = 0;
  private uiAccum = 0;
  private nextFrame = 0;
  renderedFrames = 0;

  constructor() {
    this.state = defaultState();
    this.engine = new Engine(this.state);
    this.ui = new UI(this.state, this.handlers);
    (window as unknown as { __beamlab: App }).__beamlab = this;
    void this.boot();
  }

  private handlers: UIHandlers = {
    setMode: (m: Mode) => this.setMode(m),
    setAntenna: (p: Partial<ArrayConfig>) => {
      this.engine.setAntenna(p);
      this.refresh();
      if (p.n && p.n > 20 && this.state.mode === 'shaped') {
        this.ui.toast('La síntesis está limitada a 20×20 elementos.', true);
      }
    },
    setFrequency: (f) => {
      this.engine.setFrequency(f);
      this.refresh();
    },
    setPreset: (id) => this.setPreset(id),
    setOrbit: (p: Partial<OrbitElements>) => {
      this.state.presetId = 'custom';
      this.engine.setOrbit({ ...this.state.orbit, ...p }, 'custom');
      this.refresh();
      if (this.state.mode === 'shaped') {
        this.ui.toast('Órbita modificada: vuelve a sintetizar el haz conformado.', true);
      }
    },
    setEpoch: (ms) => {
      if (!Number.isFinite(ms)) return;
      if (this.state.mode === 'shaped') {
        this.ui.toast('Tiempo congelado en modo conformada. Vuelve a Puntual/Global para cambiar la época.', true);
        return;
      }
      this.state.simTime = ms;
      this.engine.setOrbit({ ...this.state.orbit, epoch: ms }, this.state.presetId);
      this.refresh();
    },
    now: () => this.now(),
    setToggle: (key: ToggleKey, value: boolean) => {
      (this.state as unknown as Record<string, unknown>)[key] = value;
      this.ui.syncControls(this.state);
    },
    setCamera: (m: CameraMode) => {
      this.state.cameraMode = m;
      this.scene?.setCamera(m);
      if (m === 'earth') this.scene?.setViewToEci(this.engine.derived.sat.r);
      this.ui.syncControls(this.state);
    },
    play: () => {
      if (this.state.mode === 'shaped') {
        this.ui.toast('El haz conformado es un diseño estático: el tiempo está congelado.', true);
        return;
      }
      this.state.playing = !this.state.playing;
      this.ui.syncControls(this.state);
    },
    setSpeed: (s) => {
      if (this.state.mode === 'shaped') return;
      this.state.speed = s;
      this.ui.syncControls(this.state);
    },
    setTime: (ms) => {
      if (this.state.mode === 'shaped') return;
      this.state.simTime = ms;
      this.state.playing = false;
      this.engine.invalidateBeams();
      this.refresh();
    },
    setSpotTarget: (lat, lon) => {
      this.engine.setMode('spot');
      const der = this.engine.derived;
      const ang = anglesForGroundPoint(der.sat.rEcef, der.frame, lat * DEG, lon * DEG);
      if (ang.w < 0.06) this.snapToRegion(lat, lon, false);
      this.engine.setSpotTarget(lat, lon);
      this.refresh();
      const visible = this.engine.derived.beams.length > 0;
      this.ui.toast(
        visible
          ? `Haz apuntado a ${fmtLat(lat)} ${fmtLon(lon)}`
          : `Objetivo fuera de la huella visible (${fmtLat(lat)} ${fmtLon(lon)})`,
        !visible,
      );
    },
    setSpotFixed: (v) => {
      this.engine.setSpotFixed(v);
      this.refresh();
    },
    setRegion: (id: RegionId) => {
      this.engine.setRegion(id);
      if (this.state.mode === 'cellular') {
        const [lat, lon] = id === 'visible' ? [-12.05, -77.04] : regionCenter(id);
        this.snapToRegion(lat, lon, false);
      } else {
        this.refresh();
      }
    },
    setReuse: (n) => {
      this.engine.setReuse(n);
      this.refresh();
    },
    regenerate: () => {
      this.engine.setRegion(this.state.region);
      this.engine.invalidateBeams();
      this.refresh();
      this.ui.toast('Rejilla de celdas regenerada.');
    },
    setShapedCenter: (lat, lon) => {
      this.engine.setMode('shaped');
      const der = this.engine.derived;
      const ang = anglesForGroundPoint(der.sat.rEcef, der.frame, lat * DEG, lon * DEG);
      if (ang.w < 0.06) this.snapToRegion(lat, lon, false);
      this.engine.setShapedCenter(lat, lon);
      this.refresh();
      this.ui.toast(`Zona conformada centrada en ${fmtLat(lat)} ${fmtLon(lon)}`);
    },
    setShapedRadius: (km) => {
      this.engine.setShapedRadius(km);
      this.refresh();
    },
    synthesize: () => this.synthesize(),
    setPtx: (w) => {
      this.state.ptxW = w;
      this.engine.update();
      this.ui.syncControls(this.state);
      this.ui.update(this.state, this.engine.derived);
    },
    setBandwidth: (mhz) => {
      this.state.bandwidthMHz = mhz;
      this.engine.update();
      this.ui.syncControls(this.state);
      this.ui.update(this.state, this.engine.derived);
    },
    setTerminal: (id) => {
      const presets = {
        vsat60: { gain: 34, nf: 1.5 },
        vsat45: { gain: 32, nf: 1.6 },
        isotropic: { gain: 0, nf: 2 },
      };
      this.state.terminalId = id;
      this.state.rxGainDbi = presets[id].gain;
      this.state.noiseFigureDb = presets[id].nf;
      this.engine.update();
      this.ui.syncControls(this.state);
      this.ui.update(this.state, this.engine.derived);
    },
    setRainMargin: (db) => {
      this.state.rainMarginDb = db;
      this.engine.update();
      this.ui.syncControls(this.state);
      this.ui.update(this.state, this.engine.derived);
    },
    setUsers: (n) => {
      this.state.usersPerBeam = Math.max(1, Math.min(50, Math.round(n)));
      this.engine.update();
      this.ui.syncControls(this.state);
      this.ui.update(this.state, this.engine.derived);
    },
    setCellTarget: (lat, lon) => {
      this.engine.setCellTarget(lat, lon);
      this.refresh();
      this.ui.toast(`Celda seleccionada a ${fmtLat(lat)} ${fmtLon(lon)}`);
    },
    setQuant: (patch) => {
      this.engine.setQuant(patch);
      this.engine.update();
      this.ui.syncControls(this.state);
      this.ui.update(this.state, this.engine.derived);
    },
    screenshot: () => {
      this.scene?.capture();
      this.ui.toast('Captura guardada.');
    },
    setFpsCap: (cap) => this.setFpsCap(cap),
    setQuality: (q) => this.setQuality(q),
  };

  private setFpsCap(cap: number) {
    this.state.fpsCap = cap;
    this.nextFrame = 0;
    this.persistPerf();
    this.ui.syncControls(this.state);
  }

  private setQuality(quality: Quality) {
    this.state.quality = quality;
    this.scene?.setQuality(quality);
    this.persistPerf();
    this.ui.syncControls(this.state);
    const label = quality === 'high' ? 'alta' : quality === 'medium' ? 'media' : 'baja';
    this.ui.toast(`Calidad ${label} · ${quality === 'high' ? 'bloom activo' : 'sin bloom'}`);
  }

  private persistPerf() {
    try {
      localStorage.setItem('beamlab:fpsCap', String(this.state.fpsCap));
      localStorage.setItem('beamlab:quality', this.state.quality);
    } catch {
      // almacenamiento no disponible (modo privado, etc.)
    }
  }

  private setMode(mode: Mode) {    const prev = this.state.mode;
    this.engine.setMode(mode);
    if (prev !== mode && (mode === 'cellular' || mode === 'shaped')) {
      if (mode === 'cellular') {
        const [lat, lon] = this.state.region === 'visible' ? [-12.05, -77.04] : regionCenter(this.state.region);
        this.snapToRegion(lat, lon, false);
      } else {
        this.snapToRegion(this.state.shapedCenter.lat, this.state.shapedCenter.lon, false);
      }
    }
    this.refresh();
    if (mode === 'shaped') {
      this.state.playing = false;
      this.ui.syncControls(this.state);
      this.ui.toast('Satélite colocado sobre la zona. Ajusta el radio y pulsa «Sintetizar cobertura».');
    }
  }

  /** Reposiciona la órbita para pasar sobre (lat,lon) y pausa la simulación. */
  private snapToRegion(lat: number, lon: number, announce = true) {
    const alt = this.state.orbit.a - R_EARTH;
    const inc = this.state.orbit.i / DEG;
    const orbit = elementsOverPoint(alt, inc, lat, lon, this.state.orbit.epoch, 2.5, this.state.orbit.e);
    this.state.simTime = orbit.epoch;
    this.state.playing = false;
    this.engine.setOrbit(orbit, this.state.presetId);
    this.engine.invalidateBeams();
    this.refresh();
    this.scene?.setViewToEci(this.engine.derived.sat.r);
    if (announce) {
      this.ui.toast(`Satélite reposicionado sobre ${fmtLat(lat)} ${fmtLon(lon)} · pausa para diseñar.`);
    }
  }

  private setPreset(id: string) {
    const p = presetById(id);
    this.state.presetId = id;
    if (p.id !== 'custom') {
      const epoch = this.state.orbit.epoch;
      const orbit = elementsOverPoint(p.altKm, p.incDeg, -12.05, -77.04, epoch, p.alongDeg, p.ecc);
      this.state.simTime = epoch;
      this.engine.setOrbit(orbit, id);
    }
    this.refresh();
    this.scene?.setViewToEci(this.engine.derived.sat.r);
  }

  private now() {
    if (this.state.mode === 'shaped') {
      this.ui.toast('Tiempo congelado en modo conformada. Vuelve a Puntual/Global para usar «Ahora».', true);
      return;
    }
    const ms = Date.now();
    const p = presetById(this.state.presetId);
    let orbit: OrbitElements;
    if (p.id !== 'custom') {
      orbit = elementsOverPoint(p.altKm, p.incDeg, -12.05, -77.04, ms, p.alongDeg, p.ecc);
    } else {
      orbit = { ...this.state.orbit, epoch: ms };
    }
    this.state.simTime = ms;
    this.engine.setOrbit(orbit, this.state.presetId);
    this.refresh();
    this.scene?.setViewToEci(this.engine.derived.sat.r);
    this.ui.toast('Tiempo actual · el satélite vuelve a pasar sobre Lima.');
  }

  private synthesize() {
    this.state.playing = false;
    this.snapToRegion(this.state.shapedCenter.lat, this.state.shapedCenter.lon, false);
    if (this.state.mode !== 'shaped') {
      this.engine.setMode('shaped');
      this.refresh();
    }
    this.ui.setSynthesisBusy(true, 'Resolviendo (AᴴA+λI)w = Aᴴd …');
    window.setTimeout(() => {
      const t0 = performance.now();
      try {
        const info = this.engine.synthesizeShaped();
        this.engine.update();
        this.ui.syncControls(this.state);
        this.ui.update(this.state, this.engine.derived);
        const ms = performance.now() - t0;
        this.ui.toast(
          `Cobertura ${(info.coverage * 100).toFixed(0)} % · derrame ${info.spillDb.toFixed(1)} dB · ${ms.toFixed(0)} ms`,
        );
      } catch (e) {
        this.ui.toast((e as Error).message, true);
        this.ui.setSynthesisBusy(false, 'No se pudo sintetizar. Prueba con otro radio o centro.');
      } finally {
        this.ui.setSynthesisBusy(false);
      }
    }, 80);
  }

  private refresh() {
    this.engine.update();
    this.ui.syncControls(this.state);
    this.ui.update(this.state, this.engine.derived);
  }

  private pick(lat: number, lon: number) {
    if (this.state.mode === 'shaped') {
      this.handlers.setShapedCenter(lat, lon);
    } else if (this.state.mode === 'cellular') {
      this.handlers.setCellTarget(lat, lon);
    } else {
      this.handlers.setSpotTarget(lat, lon);
    }
  }

  private hover(lat: number | null, lon: number | null, x: number, y: number) {
    const tip = document.getElementById('tooltip') as HTMLDivElement;
    if (lat == null || lon == null) {
      tip.hidden = true;
      return;
    }
    tip.hidden = false;
    tip.textContent = `${fmtLat(lat)} ${fmtLon(lon)}`;
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
  }

  private async boot() {
    const bar = document.getElementById('boot-bar') as HTMLElement;
    const text = document.getElementById('boot-text') as HTMLElement;
    const setProgress = (p: number, msg: string) => {
      bar.style.width = `${p}%`;
      text.textContent = msg;
    };
    setProgress(12, 'Cargando texturas de la Tierra…');

    let textures: Textures;
    try {
      textures = await this.loadTextures(setProgress);
    } catch {
      setProgress(55, 'Texturas no disponibles · generando mapa de respaldo…');
      textures = this.fallbackTextures();
    }

    setProgress(82, 'Construyendo escena orbital…');
    const canvas = document.getElementById('scene') as HTMLCanvasElement;
    this.scene = new SceneView(canvas, textures, (lat, lon) => this.pick(lat, lon), (lat, lon, x, y) => this.hover(lat, lon, x, y));
    this.scene.setCamera('earth');
    this.scene.setViewToEci(this.engine.derived.sat.r);
    this.scene.setQuality(this.state.quality);
    setProgress(100, 'Listo · iniciando simulación');

    this.engine.update();
    this.ui.syncControls(this.state);
    this.ui.update(this.state, this.engine.derived);

    requestAnimationFrame(() => {
      const boot = document.getElementById('boot');
      boot?.classList.add('done');
      window.setTimeout(() => boot?.remove(), 900);
    });

    document.addEventListener('visibilitychange', () => {
      this.nextFrame = 0;
      this.lastTick = performance.now();
      this.fpsWindowStart = performance.now();
      this.fpsFrames = 0;
    });
    this.lastTick = performance.now();
    this.fpsWindowStart = performance.now();
    requestAnimationFrame(this.loop);
  }

  private async loadTextures(setProgress: (p: number, m: string) => void): Promise<Textures> {
    const loader = new THREE.TextureLoader();
    const base = import.meta.env.BASE_URL;
    const load = (file: string): Promise<THREE.Texture> =>
      new Promise((resolve, reject) => {
        loader.load(
          `${base}assets/${file}`,
          (t) => resolve(t),
          undefined,
          () => reject(new Error(`No se pudo cargar ${file}`)),
        );
      });
    const day = await load('earth_day.jpg');
    setProgress(40, 'Textura diurna lista…');
    const [spec, clouds] = await Promise.all([load('earth_specular.jpg'), load('earth_clouds.png')]);
    setProgress(72, 'Atmósfera y nubes listas…');
    day.colorSpace = THREE.SRGBColorSpace;
    spec.colorSpace = THREE.NoColorSpace;
    clouds.colorSpace = THREE.SRGBColorSpace;
    day.anisotropy = 8;
    clouds.anisotropy = 4;
    return { day, spec, clouds };
  }

  private fallbackTextures(): Textures {
    const make = (draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, w = 1024, h = 512) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d')!;
      draw(ctx, w, h);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    const day = make((ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#071a30');
      g.addColorStop(0.5, '#0a3050');
      g.addColorStop(1, '#071a30');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(90,180,220,0.18)';
      ctx.lineWidth = 1;
      for (let i = 0; i <= 24; i++) {
        ctx.beginPath();
        ctx.moveTo((i * w) / 24, 0);
        ctx.lineTo((i * w) / 24, h);
        ctx.stroke();
      }
      for (let j = 0; j <= 12; j++) {
        ctx.beginPath();
        ctx.moveTo(0, (j * h) / 12);
        ctx.lineTo(w, (j * h) / 12);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(200,240,255,0.55)';
      ctx.font = '20px monospace';
      ctx.fillText('BEAMLAB · MAPA DE RESPALDO', 30, 40);
    });
    const spec = make((ctx, w, h) => {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
    }, 8, 8);
    const clouds = make((ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
    }, 8, 8);
    return { day, spec, clouds };
  }

  private loop = (t: number) => {
    const cap = this.state.fpsCap;
    if (cap > 0) {
      const interval = 1000 / cap;
      if (t + 1.0 < this.nextFrame) {
        requestAnimationFrame(this.loop);
        return;
      }
      this.nextFrame = t + interval;
    }

    const dt = Math.min(0.06, Math.max(0, (t - this.lastTick) / 1000));
    this.lastTick = t;

    if (this.state.playing && dt > 0) {
      this.state.simTime += dt * 1000 * this.state.speed;
    }
    this.engine.update(t);
    this.scene?.update(this.state, this.engine.derived, dt);
    this.renderedFrames++;

    // FPS reales en ventana de 500 ms (no depende del dt limitado).
    this.fpsFrames++;
    if (t - this.fpsWindowStart >= 500) {
      this.fps = (this.fpsFrames * 1000) / Math.max(1, t - this.fpsWindowStart);
      this.fpsFrames = 0;
      this.fpsWindowStart = t;
    }

    this.uiAccum += dt;
    if (this.uiAccum >= 0.12) {
      this.uiAccum = 0;
      this.ui.update(this.state, this.engine.derived);
      this.ui.setFps(this.fps);
    }
    requestAnimationFrame(this.loop);
  };
}

new App();
