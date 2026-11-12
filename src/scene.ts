import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { DEG, EARTH_UNITS, R_EARTH } from './core/constants';
import type { Derived, Quality, SimState } from './state';
import { footprintRing, type AntennaFrame } from './core/geometry';
import { groundTrack, maxCentralAngle, orbitPathEci } from './core/orbit';
import type { Vec3 } from './core/vec';
import { BEAM_NUM } from './palette';

const KM = 1 / 1000;
const Z_AXIS = new THREE.Vector3(0, 0, 1);

export interface Textures {
  day: THREE.Texture;
  spec: THREE.Texture;
  clouds: THREE.Texture;
}

const BEAM_COLORS = BEAM_NUM;

function sunDirection(ms: number): THREE.Vector3 {
  const n = (ms - Date.UTC(2000, 0, 1, 12)) / 86400000;
  const L = (280.46 + 0.9856474 * n) * DEG;
  const g = (357.528 + 0.9856003 * n) * DEG;
  const lambda = L + (1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * DEG;
  const eps = 23.439 * DEG;
  return new THREE.Vector3(
    Math.cos(lambda),
    Math.cos(eps) * Math.sin(lambda),
    Math.sin(eps) * Math.sin(lambda),
  ).normalize();
}

function makeSolarTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#071226';
  ctx.fillRect(0, 0, 256, 128);
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 10; x++) {
      const g = ctx.createLinearGradient(x * 25, y * 32, x * 25 + 24, y * 32 + 31);
      g.addColorStop(0, '#123a6b');
      g.addColorStop(0.5, '#1d5ea0');
      g.addColorStop(1, '#0a2547');
      ctx.fillStyle = g;
      ctx.fillRect(x * 25.6 + 1, y * 32 + 1, 23.6, 30);
    }
  }
  ctx.strokeStyle = 'rgba(180,200,220,0.18)';
  ctx.lineWidth = 1;
  for (let y = 0; y <= 4; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * 32);
    ctx.lineTo(256, y * 32);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class SceneView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;

  private earthGroup = new THREE.Group();
  private earth!: THREE.Mesh;
  private clouds!: THREE.Mesh;
  private atmosphere!: THREE.Mesh;
  private satGroup = new THREE.Group();
  private phaseTexture!: THREE.CanvasTexture;
  private gainTexture!: THREE.DataTexture;
  private earthMat!: THREE.ShaderMaterial;

  private orbitLine!: THREE.Line;
  private trackPast!: THREE.Line;
  private trackFuture!: THREE.Line;
  private horizonRing!: THREE.LineLoop;
  private graticule = new THREE.Group();
  private beamLines!: THREE.LineSegments;
  private activeRing!: THREE.LineLoop;
  private activeDisc!: THREE.Mesh;
  private beamCone!: THREE.Mesh;
  private regionLine!: THREE.LineLoop;

  private beamPos!: Float32Array;
  private beamCol!: Float32Array;
  private maxBeamVerts = 600 * 56 * 2;

  private labels: { sat: HTMLDivElement; target: HTMLDivElement };
  private tooltip: HTMLDivElement;
  private ray = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private hoverQueued = 0;
  private downPos = new THREE.Vector2();
  private lastOrbit: unknown = null;
  private lastGain: unknown = null;
  private lastPhase: unknown = null;
  private lastRegionKey = '';
  private prevSat = new THREE.Vector3();
  private lastCamMode = '';

  private onPick: (lat: number, lon: number) => void;
  private onHover: (lat: number | null, lon: number | null, x: number, y: number) => void;

  constructor(
    canvas: HTMLCanvasElement,
    textures: Textures,
    onPick: (lat: number, lon: number) => void,
    onHover: (lat: number | null, lon: number | null, x: number, y: number) => void,
  ) {
    this.onPick = onPick;
    this.onHover = onHover;
    const w = window.innerWidth;
    const h = window.innerHeight;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x03060c);
    this.camera = new THREE.PerspectiveCamera(42, w / h, 0.01, 600);
    this.camera.up.set(0, 0, 1);
    this.camera.position.set(0, -16.5, 8.6);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.065;
    this.controls.rotateSpeed = 0.55;
    this.controls.zoomSpeed = 0.85;
    this.controls.enablePan = false;
    this.controls.minDistance = 7.02;
    this.controls.maxDistance = 46;
    this.controls.target.set(0, 0, 0);
    this.controls.update();

    this.scene.add(this.earthGroup);
    this.buildEarth(textures);
    this.buildGraticule();
    this.buildStars();
    this.buildSatellite();
    this.buildOrbit();
    this.buildBeams();

    this.labels = {
      sat: this.makeLabel('sat'),
      target: this.makeLabel('target'),
    };
    this.tooltip = document.getElementById('tooltip') as HTMLDivElement;
    this.applyTextures(textures);

    const composer = new EffectComposer(this.renderer);
    composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.55, 0.45, 0.82);
    composer.addPass(this.bloom);
    composer.addPass(new OutputPass());
    this.composer = composer;

    window.addEventListener('resize', () => this.onResize());
    canvas.addEventListener('pointerdown', (e) => {
      this.downPos.set(e.clientX, e.clientY);
    });
    canvas.addEventListener('pointerup', (e) => {
      if (Math.hypot(e.clientX - this.downPos.x, e.clientY - this.downPos.y) > 5) return;
      const hit = this.pick(e.clientX, e.clientY);
      if (hit) this.onPick(hit.lat, hit.lon);
    });
    canvas.addEventListener('pointermove', (e) => {
      const now = performance.now();
      if (now - this.hoverQueued < 45) return;
      this.hoverQueued = now;
      const hit = this.pick(e.clientX, e.clientY);
      if (hit) this.onHover(hit.lat, hit.lon, e.clientX, e.clientY);
      else this.onHover(null, null, e.clientX, e.clientY);
    });
    canvas.addEventListener('pointerleave', () => this.onHover(null, null, 0, 0));
  }

  private makeLabel(kind: 'sat' | 'target'): HTMLDivElement {
    const div = document.createElement('div');
    div.className = `label ${kind}`;
    div.style.opacity = '0';
    (document.getElementById('labels') as HTMLDivElement).appendChild(div);
    return div;
  }

  private buildEarth(t: Textures) {
    const geo = new THREE.SphereGeometry(EARTH_UNITS, 160, 80);
    geo.rotateX(Math.PI / 2);

    this.gainTexture = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    this.gainTexture.needsUpdate = true;

    this.earthMat = new THREE.ShaderMaterial({
      uniforms: {
        uDay: { value: t.day },
        uSpec: { value: t.spec },
        uGain: { value: this.gainTexture },
        uSun: { value: new THREE.Vector3(1, 0, 0) },
        uSat: { value: new THREE.Vector3() },
        uAntX: { value: new THREE.Vector3(1, 0, 0) },
        uAntY: { value: new THREE.Vector3(0, 1, 0) },
        uAntZ: { value: new THREE.Vector3(0, 0, 1) },
        uShowGain: { value: 1 },
        uGainOpacity: { value: 0.9 },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vWorld;
        varying vec3 vNormal;
        void main() {
          vUv = uv;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          vNormal = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform sampler2D uDay;
        uniform sampler2D uSpec;
        uniform sampler2D uGain;
        uniform vec3 uSun;
        uniform vec3 uSat;
        uniform vec3 uAntX;
        uniform vec3 uAntY;
        uniform vec3 uAntZ;
        uniform float uShowGain;
        uniform float uGainOpacity;
        varying vec2 vUv;
        varying vec3 vWorld;
        varying vec3 vNormal;

        void main() {
          vec3 N = normalize(vNormal);
          vec3 L = normalize(uSun);
          vec3 V = normalize(cameraPosition - vWorld);
          vec3 base = texture2D(uDay, vUv).rgb;
          float diff = max(dot(N, L), 0.0);
          float day = smoothstep(-0.08, 0.35, diff);
          vec3 col = base * (0.08 + 0.95 * diff);
          col += base * 0.018;
          float ocean = texture2D(uSpec, vUv).r;
          vec3 H = normalize(L + V);
          float spec = pow(max(dot(N, H), 0.0), 48.0) * ocean * 0.75;
          col += vec3(0.55, 0.75, 0.95) * spec * day;

          float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
          col += vec3(0.08, 0.28, 0.6) * rim * 0.65;

          if (uShowGain > 0.5) {
            vec3 d = normalize(vWorld - uSat);
            float u = dot(d, uAntX);
            float v = dot(d, uAntY);
            float w = dot(d, uAntZ);
            if (w > 0.0) {
              vec2 guv = vec2(u, v) * 0.5 + 0.5;
              vec4 g = texture2D(uGain, guv);
              float db = g.a * 40.0 - 40.0;
              float t = smoothstep(-7.0, -1.5, db);
              float core = smoothstep(-3.0, -0.3, db);
              vec3 beamCol = g.rgb;
              float contour = smoothstep(0.43, 0.5, abs(fract(db / 6.0) - 0.5));
              col += beamCol * t * 0.72 * uGainOpacity;
              col += vec3(1.0, 0.98, 0.94) * core * 0.06 * uGainOpacity;
              col += vec3(0.7, 0.95, 1.0) * contour * t * 0.08 * uGainOpacity;
            }
          }

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.earth = new THREE.Mesh(geo, this.earthMat);
    this.earthGroup.add(this.earth);

    const cloudGeo = new THREE.SphereGeometry(EARTH_UNITS * 1.006, 96, 48);
    cloudGeo.rotateX(Math.PI / 2);
    this.clouds = new THREE.Mesh(
      cloudGeo,
      new THREE.MeshBasicMaterial({
        map: t.clouds,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.earthGroup.add(this.clouds);

    const atmoGeo = new THREE.SphereGeometry(EARTH_UNITS * 1.035, 64, 32);
    const atmoMat = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vNormal = normalize(normalMatrix * normal);
          vView = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          float f = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 3.2);
          gl_FragColor = vec4(0.12, 0.45, 1.0, 1.0) * f * 0.55;
        }
      `,
    });
    this.atmosphere = new THREE.Mesh(atmoGeo, atmoMat);
    this.earthGroup.add(this.atmosphere);
  }

  private applyTextures(t: Textures) {
    t.day.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    t.spec.anisotropy = 4;
  }

  private buildGraticule() {
    const mat = new THREE.LineBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.13, depthWrite: false });
    const r = EARTH_UNITS * 1.002;
    for (let lat = -60; lat <= 60; lat += 30) {
      const la = lat * DEG;
      const pts: number[] = [];
      for (let i = 0; i <= 96; i++) {
        const lo = (2 * Math.PI * i) / 96;
        pts.push(Math.cos(la) * Math.cos(lo) * r, Math.cos(la) * Math.sin(lo) * r, Math.sin(la) * r);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      this.graticule.add(new THREE.Line(g, mat));
    }
    for (let lon = -180; lon < 180; lon += 30) {
      const lo = lon * DEG;
      const pts: number[] = [];
      for (let i = 0; i <= 48; i++) {
        const la = -Math.PI / 2 + (Math.PI * i) / 48;
        pts.push(Math.cos(la) * Math.cos(lo) * r, Math.cos(la) * Math.sin(lo) * r, Math.sin(la) * r);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      this.graticule.add(new THREE.Line(g, mat));
    }
    this.earthGroup.add(this.graticule);
  }

  private buildStars() {
    const count = 3200;
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const u = Math.random() * 2 - 1;
      const th = Math.random() * Math.PI * 2;
      const r = 260 + Math.random() * 80;
      const s = Math.sqrt(1 - u * u);
      pos[i * 3] = r * s * Math.cos(th);
      pos[i * 3 + 1] = r * s * Math.sin(th);
      pos[i * 3 + 2] = r * u;
      const warm = Math.random();
      const c = new THREE.Color().setHSL(0.56 + warm * 0.08, 0.25 * warm, 0.72 + Math.random() * 0.25);
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.PointsMaterial({
      size: 1.3,
      sizeAttenuation: false,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    this.scene.add(new THREE.Points(g, m));
  }

  private buildSatellite() {
    const dark = new THREE.MeshStandardMaterial({ color: 0x1a2332, metalness: 0.75, roughness: 0.32 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xb98a3e, metalness: 0.9, roughness: 0.28 });
    const white = new THREE.MeshStandardMaterial({ color: 0xcfd8e3, metalness: 0.35, roughness: 0.5 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.075, 0.13), dark);
    this.satGroup.add(body);

    const foil = new THREE.Mesh(new THREE.BoxGeometry(0.077, 0.077, 0.045), gold);
    foil.position.z = -0.045;
    this.satGroup.add(foil);

    const panelMat = new THREE.MeshStandardMaterial({
      map: makeSolarTexture(),
      metalness: 0.45,
      roughness: 0.35,
      emissive: 0x081a33,
      emissiveIntensity: 0.7,
    });
    for (const s of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.008, 0.008), white);
      arm.position.set(s * 0.065, 0, 0);
      this.satGroup.add(arm);
      const panel = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.006, 0.12), panelMat);
      panel.position.set(s * 0.235, 0, 0);
      this.satGroup.add(panel);
    }

    const caseMesh = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.095, 0.012), dark);
    caseMesh.position.z = 0.066;
    this.satGroup.add(caseMesh);

    const phaseCanvas = document.createElement('canvas');
    phaseCanvas.width = phaseCanvas.height = 256;
    this.phaseTexture = new THREE.CanvasTexture(phaseCanvas);
    this.phaseTexture.colorSpace = THREE.SRGBColorSpace;
    const antenna = new THREE.Mesh(
      new THREE.PlaneGeometry(0.078, 0.078),
      new THREE.MeshBasicMaterial({ map: this.phaseTexture, toneMapped: false }),
    );
    antenna.position.z = 0.073;
    this.satGroup.add(antenna);

    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.004, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0x67e8f9, toneMapped: false }),
    );
    beacon.position.set(0, 0, 0.082);
    this.satGroup.add(beacon);

    this.scene.add(this.satGroup);
  }

  private buildOrbit() {
    const mkLine = (color: number, opacity: number) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(512 * 3), 3));
      const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
      return new THREE.Line(g, m);
    };
    this.orbitLine = mkLine(0x38bdf8, 0.5);
    this.orbitLine.geometry.setDrawRange(0, 0);
    this.scene.add(this.orbitLine);

    this.trackPast = mkLine(0x22d3ee, 0.55);
    this.trackFuture = mkLine(0xfbbf24, 0.75);
    this.earthGroup.add(this.trackPast, this.trackFuture);

    const hg = new THREE.BufferGeometry();
    hg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(160 * 3), 3));
    this.horizonRing = new THREE.LineLoop(
      hg,
      new THREE.LineBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.32 }),
    );
    this.horizonRing.visible = false;
    this.earthGroup.add(this.horizonRing);
  }

  private buildBeams() {
    const g = new THREE.BufferGeometry();
    this.beamPos = new Float32Array(this.maxBeamVerts * 3);
    this.beamCol = new Float32Array(this.maxBeamVerts * 3);
    g.setAttribute('position', new THREE.BufferAttribute(this.beamPos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.beamCol, 3).setUsage(THREE.DynamicDrawUsage));
    const m = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.beamLines = new THREE.LineSegments(g, m);
    this.beamLines.frustumCulled = false;
    this.earthGroup.add(this.beamLines);

    const ar = new THREE.BufferGeometry();
    ar.setAttribute('position', new THREE.BufferAttribute(new Float32Array(96 * 3), 3));
    this.activeRing = new THREE.LineLoop(
      ar,
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending }),
    );
    this.earthGroup.add(this.activeRing);

    const discGeo = new THREE.CircleGeometry(1, 56);
    this.activeDisc = new THREE.Mesh(
      discGeo,
      new THREE.MeshBasicMaterial({
        color: 0x22d3ee,
        transparent: true,
        opacity: 0.16,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.activeDisc.visible = false;
    this.earthGroup.add(this.activeDisc);

    const coneGeo = new THREE.BufferGeometry();
    const segs = 40;
    const verts: number[] = [0, 0, 0];
    const idx: number[] = [];
    for (let i = 0; i < segs; i++) {
      const a = (2 * Math.PI * i) / segs;
      verts.push(Math.cos(a), Math.sin(a), -1);
    }
    for (let i = 0; i < segs; i++) {
      idx.push(0, 1 + i, 1 + ((i + 1) % segs));
    }
    coneGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    coneGeo.setIndex(idx);
    coneGeo.computeVertexNormals();
    this.beamCone = new THREE.Mesh(
      coneGeo,
      new THREE.MeshBasicMaterial({
        color: 0x22d3ee,
        transparent: true,
        opacity: 0.075,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.beamCone.visible = false;
    this.scene.add(this.beamCone);

    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(160 * 3), 3));
    this.regionLine = new THREE.LineLoop(
      rg,
      new THREE.LineBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending }),
    );
    this.regionLine.visible = false;
    this.earthGroup.add(this.regionLine);
  }

  /** Actualiza la escena con el estado y los datos derivados. */
  update(state: SimState, d: Derived, dt: number) {
    const satPos = new THREE.Vector3(d.sat.r.x, d.sat.r.y, d.sat.r.z).multiplyScalar(KM);
    this.satGroup.position.copy(satPos);

    const zAxis = satPos.clone().negate().normalize();
    const vDir = new THREE.Vector3(d.sat.v.x, d.sat.v.y, d.sat.v.z).normalize();
    const xAxis = vDir.clone().addScaledVector(zAxis, -vDir.dot(zAxis)).normalize();
    const yAxis = new THREE.Vector3().crossVectors(zAxis, xAxis);
    const basis = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
    this.satGroup.quaternion.setFromRotationMatrix(basis);

    this.earthGroup.rotation.z = d.sat.gmst;
    this.clouds.rotation.z += dt * 0.0018;

    const sun = sunDirection(state.simTime);
    const u = this.earthMat.uniforms;
    // La base de la antena del motor está en ECEF (este/norte/nadir); el shader
    // trabaja en ECI, así que se rota por GMST. No debe confundirse con la base
    // del modelo 3D, que sigue la velocidad (a lo largo de la traza).
    const antX = new THREE.Vector3(d.frame.x.x, d.frame.x.y, d.frame.x.z).applyAxisAngle(Z_AXIS, d.sat.gmst);
    const antY = new THREE.Vector3(d.frame.y.x, d.frame.y.y, d.frame.y.z).applyAxisAngle(Z_AXIS, d.sat.gmst);
    const antZ = new THREE.Vector3(d.frame.z.x, d.frame.z.y, d.frame.z.z).applyAxisAngle(Z_AXIS, d.sat.gmst);
    u.uSun.value.copy(sun);
    u.uSat.value.copy(satPos);
    u.uAntX.value.copy(antX);
    u.uAntY.value.copy(antY);
    u.uAntZ.value.copy(antZ);
    u.uShowGain.value = state.showGain ? 1 : 0;
    u.uGainOpacity.value = state.mode === 'global' ? 0.22 : 0.9;

    if (this.lastOrbit !== state.orbit || this.trackPast.geometry.drawRange.count === 0) {
      this.lastOrbit = state.orbit;
      this.rebuildOrbit(state);
    }

    if (this.lastGain !== d.gainMap) {
      this.lastGain = d.gainMap;
      this.updateGainTexture(d);
    }
    if (this.lastPhase !== d.phase) {
      this.lastPhase = d.phase;
      this.drawPhaseTexture(d);
    }

    this.updateCoverageRing(d, state);
    this.updateBeams(d, state);
    this.updateRegion(state);
    this.updateCamera(dt, satPos, state);
    this.updateLabels(d, satPos);

    this.orbitLine.visible = state.showOrbit;
    this.trackPast.visible = state.showTrack;
    this.trackFuture.visible = state.showTrack;
    this.horizonRing.visible = state.showFootprint;
    this.graticule.visible = state.showGrid;
    this.beamCone.visible = state.showCones && !!d.activeBeam;
    this.regionLine.visible = state.mode === 'shaped';
    this.beamLines.visible = true;
    this.controls.update();
    this.composer.render();
  }

  private rebuildOrbit(state: SimState) {
    const path = orbitPathEci(state.orbit, state.simTime, 480);
    const pos = this.orbitLine.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < path.length; i++) {
      pos.setXYZ(i, path[i].x * KM, path[i].y * KM, path[i].z * KM);
    }
    pos.needsUpdate = true;
    this.orbitLine.geometry.setDrawRange(0, path.length);
    this.orbitLine.geometry.computeBoundingSphere();

    const T = (2 * Math.PI) / Math.sqrt(398600.4418 / Math.pow(state.orbit.a, 3)) * 1000;
    const trk = groundTrack(state.orbit, state.simTime, T * 1.05, 360);
    const n = trk.length;
    const half = Math.floor(n / 2);
    const past = this.trackPast.geometry.getAttribute('position') as THREE.BufferAttribute;
    const future = this.trackFuture.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < half; i++) {
      const p = trk[i];
      past.setXYZ(i, Math.cos(p.lat) * Math.cos(p.lon) * R_EARTH * 1.001 * KM,
        Math.cos(p.lat) * Math.sin(p.lon) * R_EARTH * 1.001 * KM,
        Math.sin(p.lat) * R_EARTH * 1.001 * KM);
    }
    for (let i = half; i < n; i++) {
      const p = trk[i];
      future.setXYZ(i - half, Math.cos(p.lat) * Math.cos(p.lon) * R_EARTH * 1.001 * KM,
        Math.cos(p.lat) * Math.sin(p.lon) * R_EARTH * 1.001 * KM,
        Math.sin(p.lat) * R_EARTH * 1.001 * KM);
    }
    past.needsUpdate = true;
    future.needsUpdate = true;
    this.trackPast.geometry.setDrawRange(0, half);
    this.trackFuture.geometry.setDrawRange(0, n - half);
    this.trackPast.geometry.computeBoundingSphere();
    this.trackFuture.geometry.computeBoundingSphere();
  }

  private updateGainTexture(d: Derived) {
    const map = d.gainMap;
    const data = map.rgba;
    if (this.gainTexture.image.width !== map.size) {
      this.gainTexture.dispose();
      this.gainTexture = new THREE.DataTexture(data, map.size, map.size, THREE.RGBAFormat);
      this.gainTexture.minFilter = THREE.LinearFilter;
      this.gainTexture.magFilter = THREE.LinearFilter;
      this.gainTexture.wrapS = THREE.ClampToEdgeWrapping;
      this.gainTexture.wrapT = THREE.ClampToEdgeWrapping;
      this.gainTexture.colorSpace = THREE.SRGBColorSpace;
      this.earthMat.uniforms.uGain.value = this.gainTexture;
    } else {
      (this.gainTexture.image.data as Uint8Array).set(data);
    }
    this.gainTexture.needsUpdate = true;
  }

  private drawPhaseTexture(d: Derived) {
    const c = this.phaseTexture.image as HTMLCanvasElement;
    const ctx = c.getContext('2d')!;
    const phases = d.phase?.phases ?? null;
    const amps = d.phase?.amps ?? null;
    if (!phases || !amps || !d.phase.n) return;
    const N = d.phase.n;
    const size = c.width;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#040a13';
    ctx.fillRect(0, 0, size, size);
    const cell = size / N;
    let maxAmp = 0;
    for (const a of amps) maxAmp = Math.max(maxAmp, a);
    for (let iy = 0; iy < N; iy++) {
      for (let ix = 0; ix < N; ix++) {
        const idx = iy * N + ix;
        const hue = ((phases[idx] + Math.PI) / (2 * Math.PI)) * 360;
        const l = 32 + 30 * (amps[idx] / Math.max(maxAmp, 1e-9));
        ctx.fillStyle = `hsl(${hue}, 88%, ${l}%)`;
        ctx.fillRect(ix * cell + 0.6, iy * cell + 0.6, cell - 1.2, cell - 1.2);
      }
    }
  }

  private updateCoverageRing(d: Derived, state: SimState) {
    if (!state.showFootprint) return;
    const alt = Math.max(10, d.sat.alt);
    const gamma = maxCentralAngle(alt);
    const lat = d.sat.lat;
    const lon = d.sat.lon;
    const pos = this.horizonRing.geometry.getAttribute('position') as THREE.BufferAttribute;
    const N = pos.count;
    for (let i = 0; i < N; i++) {
      const brg = (2 * Math.PI * i) / N;
      const la2 = Math.asin(Math.sin(lat) * Math.cos(gamma) + Math.cos(lat) * Math.sin(gamma) * Math.cos(brg));
      const lo2 = lon + Math.atan2(Math.sin(brg) * Math.sin(gamma) * Math.cos(lat), Math.cos(gamma) - Math.sin(lat) * Math.sin(la2));
      pos.setXYZ(i, Math.cos(la2) * Math.cos(lo2) * R_EARTH * 1.003 * KM,
        Math.cos(la2) * Math.sin(lo2) * R_EARTH * 1.003 * KM,
        Math.sin(la2) * R_EARTH * 1.003 * KM);
    }
    pos.needsUpdate = true;
    this.horizonRing.geometry.computeBoundingSphere();
  }

  private updateBeams(d: Derived, state: SimState) {
    const beams = d.beams;
    const satEcef: Vec3 = d.sat.rEcef;
    const frame: AntennaFrame = d.frame;
    const nSamples = 48;
    let count = 0;
    const col = new THREE.Color();
    (this.beamLines.material as THREE.LineBasicMaterial).opacity = state.mode === 'cellular' ? 0.38 : 0.9;
    const stride = beams.length > 160 ? 2 : 1;
    const ringCount = state.mode === 'cellular' ? 0 : beams.length;

    for (let bi = 0; bi < ringCount; bi += stride) {
      const b = beams[bi];
      const ring = footprintRing(satEcef, frame, b, (d.metrics.hpbwDeg * DEG) / 2, nSamples);
      if (ring.length < 3) continue;
      col.setHex(BEAM_COLORS[b.color % BEAM_COLORS.length]);
      for (let i = 0; i < ring.length; i++) {
        if (count + 2 > this.maxBeamVerts) break;
        const p1 = ring[i];
        const p2 = ring[(i + 1) % ring.length];
        const o = count * 3;
        this.beamPos[o] = p1.x * KM;
        this.beamPos[o + 1] = p1.y * KM;
        this.beamPos[o + 2] = p1.z * KM;
        this.beamPos[o + 3] = p2.x * KM;
        this.beamPos[o + 4] = p2.y * KM;
        this.beamPos[o + 5] = p2.z * KM;
        this.beamCol[o] = col.r;
        this.beamCol[o + 1] = col.g;
        this.beamCol[o + 2] = col.b;
        this.beamCol[o + 3] = col.r;
        this.beamCol[o + 4] = col.g;
        this.beamCol[o + 5] = col.b;
        count += 2;
      }
    }
    const g = this.beamLines.geometry;
    g.setDrawRange(0, count);
    (g.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;

    const active = d.activeBeam;
    if (active && beams.length > 0) {
      const ring = footprintRing(satEcef, frame, active, (d.metrics.hpbwDeg * DEG) / 2, 96);
      const ar = this.activeRing.geometry.getAttribute('position') as THREE.BufferAttribute;
      if (ring.length >= 3) {
        for (let i = 0; i < ar.count; i++) {
          const p = ring[Math.floor((i / ar.count) * ring.length)];
          ar.setXYZ(i, p.x * KM, p.y * KM, p.z * KM);
        }
        ar.needsUpdate = true;
        this.activeRing.geometry.computeBoundingSphere();
      }
      this.activeRing.visible = true;

      const pt = activeGroundPoint(d);
      if (pt) {
        const up = new THREE.Vector3(pt.x, pt.y, pt.z).normalize();
        const footKm = (d.link?.slantKm ?? d.sat.alt) * Math.tan((d.metrics.hpbwDeg * DEG) / 2);
        const rad = Math.max(0.004, footKm * KM * 1.05);
        this.activeDisc.position.copy(new THREE.Vector3(pt.x * KM, pt.y * KM, pt.z * KM)).addScaledVector(up, 0.002);
        this.activeDisc.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), up);
        this.activeDisc.scale.setScalar(rad);
        (this.activeDisc.material as THREE.MeshBasicMaterial).color.setHex(BEAM_COLORS[active.color % BEAM_COLORS.length]);
        this.activeDisc.visible = true;

        if (state.showCones) {
          const ground = new THREE.Vector3(pt.x * KM, pt.y * KM, pt.z * KM);
          ground.applyAxisAngle(Z_AXIS, d.sat.gmst);
          const satPos = new THREE.Vector3(d.sat.r.x, d.sat.r.y, d.sat.r.z).multiplyScalar(KM);
          const axis = ground.clone().sub(satPos);
          const dist = axis.length();
          axis.normalize();
          this.beamCone.position.copy(satPos);
          this.beamCone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), axis);
          this.beamCone.scale.set(rad * 2.1, rad * 2.1, dist);
          (this.beamCone.material as THREE.MeshBasicMaterial).color.setHex(BEAM_COLORS[active.color % BEAM_COLORS.length]);
        }
      }
    } else {
      this.activeRing.visible = false;
      this.activeDisc.visible = false;
      this.beamCone.visible = false;
    }
  }

  private updateRegion(state: SimState) {
    if (state.mode !== 'shaped') {
      this.regionLine.visible = false;
      return;
    }
    const lat = state.shapedCenter.lat * DEG;
    const lon = state.shapedCenter.lon * DEG;
    const gamma = state.shapedRadiusKm / R_EARTH;
    const pos = this.regionLine.geometry.getAttribute('position') as THREE.BufferAttribute;
    const N = pos.count;
    for (let i = 0; i < N; i++) {
      const brg = (2 * Math.PI * i) / N;
      const la2 = Math.asin(Math.sin(lat) * Math.cos(gamma) + Math.cos(lat) * Math.sin(gamma) * Math.cos(brg));
      const lo2 = lon + Math.atan2(Math.sin(brg) * Math.sin(gamma) * Math.cos(lat), Math.cos(gamma) - Math.sin(lat) * Math.sin(la2));
      pos.setXYZ(i, Math.cos(la2) * Math.cos(lo2) * R_EARTH * 1.004 * KM,
        Math.cos(la2) * Math.sin(lo2) * R_EARTH * 1.004 * KM,
        Math.sin(la2) * R_EARTH * 1.004 * KM);
    }
    pos.needsUpdate = true;
    this.regionLine.geometry.computeBoundingSphere();
    this.regionLine.visible = true;
  }

  private updateCamera(dt: number, satPos: THREE.Vector3, state: SimState) {
    if (state.cameraMode !== this.lastCamMode) {
      this.lastCamMode = state.cameraMode;
      if (state.cameraMode === 'earth') {
        this.controls.target.set(0, 0, 0);
      } else {
        this.controls.target.copy(satPos);
        const dir = satPos.clone().normalize();
        this.camera.position.copy(satPos).addScaledVector(dir, 0.9).add(new THREE.Vector3(0, -0.7, 0.5));
      }
      this.prevSat.copy(satPos);
    } else if (state.cameraMode !== 'earth') {
      const delta = satPos.clone().sub(this.prevSat);
      this.camera.position.add(delta);
      this.controls.target.copy(satPos);
      this.prevSat.copy(satPos);
    } else {
      this.prevSat.copy(satPos);
    }
    void dt;
  }

  private updateLabels(d: Derived, satPos: THREE.Vector3) {
    const cam = this.camera.position;
    const satVisible = !this.occluded(satPos, cam);
    const sp = satPos.clone().add(new THREE.Vector3(0, 0, 0.08)).project(this.camera);
    this.setLabel(this.labels.sat, sp, satVisible, `SAT · ${d.sat.alt.toFixed(0)} km · ${d.sat.speed.toFixed(2)} km/s`, -22);

    const pt = d.activeBeam ? activeGroundPoint(d) : null;
    if (pt) {
      const local = new THREE.Vector3(pt.x * KM, pt.y * KM, pt.z * KM);
      const world = this.earthGroup.localToWorld(local.clone());
      const up = local.clone().normalize();
      const visible = up.dot(cam.clone().sub(world).normalize()) > 0.02;
      const p = world.project(this.camera);
      const lat = d.activeBeam?.target?.lat ?? d.sat.lat / DEG;
      const lon = d.activeBeam?.target?.lon ?? d.sat.lon / DEG;
      this.setLabel(this.labels.target, p, visible, `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`, 16);
    } else {
      this.labels.target.style.opacity = '0';
    }
  }

  private setLabel(el: HTMLDivElement, p: THREE.Vector3, visible: boolean, text: string, offsetY = 0) {
    if (!visible || p.z > 1) {
      el.style.opacity = '0';
      return;
    }
    const x = (p.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-p.y * 0.5 + 0.5) * window.innerHeight + offsetY;
    el.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
    el.style.opacity = '1';
    el.textContent = text;
  }

  private occluded(point: THREE.Vector3, cam: THREE.Vector3): boolean {
    const dir = point.clone().sub(cam);
    const dist = dir.length();
    dir.normalize();
    const b = cam.dot(dir);
    const c = cam.dot(cam) - (EARTH_UNITS * 0.995) ** 2;
    const disc = b * b - c;
    if (disc < 0) return false;
    const t = -b - Math.sqrt(disc);
    return t > 0 && t < dist;
  }

  private pick(clientX: number, clientY: number): { lat: number; lon: number } | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.ray.setFromCamera(this.pointer, this.camera);
    const hits = this.ray.intersectObject(this.earth, false);
    if (!hits.length) return null;
    const local = this.earthGroup.worldToLocal(hits[0].point.clone());
    const r = local.length();
    return {
      lat: Math.asin(local.z / r) / DEG,
      lon: Math.atan2(local.y, local.x) / DEG,
    };
  }

  private onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.bloom.setSize(w, h);
  }

  setCamera(mode: SimState['cameraMode']) {
    this.lastCamMode = '';
    this.controls.target.set(0, 0, 0);
    if (mode === 'earth') {
      this.camera.position.set(0, -16.5, 8.6);
    }
  }

  /** Ajusta resolución de render y bloom según la potencia de la GPU. */
  setQuality(quality: Quality): void {
    const dpr = window.devicePixelRatio || 1;
    const ratio = quality === 'high' ? Math.min(dpr, 1.75) : quality === 'medium' ? Math.min(dpr, 1.25) : 1;
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.composer.setPixelRatio(ratio);
    this.composer.setSize(window.innerWidth, window.innerHeight);
    this.bloom.enabled = quality === 'high';
  }

  /** Centra la vista en el punto subsatelital (dirección ECI del satélite). */
  setViewToEci(r: Vec3): void {
    const dir = new THREE.Vector3(r.x, r.y, r.z).normalize();
    this.camera.position.copy(dir.multiplyScalar(19.2));
    this.camera.position.z += 4.2;
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  capture(): void {
    this.composer.render();
    this.renderer.domElement.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `beamlab-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    }, 'image/png');
  }

  dispose() {
    this.renderer.dispose();
    this.composer.dispose();
  }
}

export function activeGroundPoint(d: Derived): Vec3 | null {
  const b = d.activeBeam;
  if (!b) return null;
  const w = Math.sqrt(Math.max(0, 1 - b.u * b.u - b.v * b.v));
  const f = d.frame;
  const dir = {
    x: f.x.x * b.u + f.y.x * b.v + f.z.x * w,
    y: f.x.y * b.u + f.y.y * b.v + f.z.y * w,
    z: f.x.z * b.u + f.y.z * b.v + f.z.z * w,
  };
  const o = d.sat.rEcef;
  const bq = o.x * dir.x + o.y * dir.y + o.z * dir.z;
  const c = o.x * o.x + o.y * o.y + o.z * o.z - R_EARTH * R_EARTH;
  const disc = bq * bq - c;
  if (disc < 0) return null;
  const t = -bq - Math.sqrt(disc);
  if (t < 0) return null;
  return { x: o.x + dir.x * t, y: o.y + dir.y * t, z: o.z + dir.z * t };
}
