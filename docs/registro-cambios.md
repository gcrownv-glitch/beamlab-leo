# Registro Técnico de Cambios y Auditoría Ejecutada — BeamLab LEO

Documento de trazabilidad diseñado para que cualquier persona o agente de IA pueda retomar el proyecto sabiendo exactamente **qué se cambió, por qué se cambió, cuándo se aplicó (marcas de tiempo ISO-8601), qué invariantes deben preservarse y qué queda pendiente**.

## Metadatos del estado actual

| Campo | Valor |
|---|---|
| **Repositorio** | `beamlab-leo` |
| **Commit base auditado** | `25ce657` (`main`, v2.3.4) |
| **Versión declarada en manifiestos** | `2.4.0-beta.2` *(canal pre-release beta desplegado en web antes de portar instaladores; la versión estable `2.3.4` se conserva intacta en `stable/v2.3.4-orig` y `checkpoint-tramo-2`)* |
| **Puntos de recuperación estables** | `stable/v2.3.4-orig` (`25ce657`, v2.3.4 original) · `stable/v2.3.4-tramo2` y tag `checkpoint-tramo-2` (`62d3b68`, Tramos 0–2) · tag/Release `v2.3.4` intacto en GitHub |
| **Rama activa** | `main` / `beta` / `rel/tramo-6-devops-beta` (`2.4.0-beta.2`) |
| **Última actualización** | `2026-11-24T20:01:07-05:00` (`2026-11-25T01:01:07Z`) |
| **Estado de verificación** | `bump-version.mjs --check` + `tsc --noEmit` + `vite build` + `build-portable.mjs` en verde · `vitest run`: **15 archivos / 67 pruebas aprobadas** |

---

## Cronología de commits

| Tramo | Commit | Marca de tiempo (Local `-05:00` / UTC) | Rama | Descripción |
|---|---|---|---|---|
| **Tramo 0** | `91455ff` | `2026-11-24T17:19:32-05:00` (`22:19:32Z`) | `fix/tramo-1-beamforming-3d` | Activar `noUnusedLocals` y `noUnusedParameters` en TypeScript y eliminar código muerto |
| **Tramo 1** | `3648784` | `2026-11-24T17:22:28-05:00` (`22:22:28Z`) | `fix/tramo-1-beamforming-3d` | Eliminar rayos X en cara trasera, deslizamiento de huellas, haces fantasma y bugs de los 4 modos |
| **Tramo 1** | `d084261` | `2026-11-24T17:22:29-05:00` (`22:22:29Z`) | `fix/tramo-1-beamforming-3d` | Agregar pruebas unitarias de regresión 3D, snapshots y coloreado hexagonal |
| **Tramo 2** | `94b9d13` | `2026-11-24T17:54:00-05:00` (`22:54:00Z`) | `fix/tramo-2-rf-physics` | Rigor físico RF/enlace: directividad con *scan loss*, VGA en dB, receptor satelital 290 K, pérdidas atmosféricas, capacidad celular y órbita excéntrica |
| **Tramo 2** | `803adc3` | `2026-11-24T17:54:37-05:00` (`22:54:37Z`) | `fix/tramo-2-rf-physics` | Crear registro técnico de cambios con marcas de tiempo |
| **Tramo 2** | `28599b1` | `2026-11-24T17:58:49-05:00` (`22:58:49Z`) | `fix/tramo-2-rf-physics` | Agregar conmutador de modelo C/I co-canal celular y SINR `C/(N+I)` manteniendo Cap. clúster y Cap. agregada separadas |
| **Tramo 2** | `62d3b68` | `2026-11-24T17:59:27-05:00` (`22:59:27Z`) | `fix/tramo-2-rf-physics` | Documentar conmutador C/I y preferencias de trabajo local/versionado *(punto estable `checkpoint-tramo-2`)* |
| **Tramo 3** | `791afdf` | `2026-11-24T18:09:11-05:00` (`23:09:11Z`) | `sec/tramo-3-tauri-xss` | Hardening de seguridad: `save_export` en Rust, permisos Tauri mínimos, CSP web/desktop, DOM sin `innerHTML`, validador `LabStore`, CSV injection y `Actualizar.ps1` *fail-closed* |
| **Tramo 3** | `6342a30` | `2026-11-24T18:09:53-05:00` (`23:09:53Z`) | `sec/tramo-3-tauri-xss` | Registrar checkpoint estable `checkpoint-tramo-2`, política beta y Tramo 3 |
| **Tramo 4** | `b795140` | `2026-11-24T18:28:21-05:00` (`23:28:21Z`) | `perf/tramo-4-worker-render` | Factorizar `patternFromWeights`, mover síntesis conformada a Web Worker, omitir `gainMap` oculto, quitar `preserveDrawingBuffer` y completar `SceneView.dispose()` |
| **Tramo 4** | `1808e62` | `2026-11-24T18:29:00-05:00` (`23:29:00Z`) | `perf/tramo-4-worker-render` | Actualizar registro técnico con Tramo 4 |
| **Tramo 5** | `0eba8b9` | `2026-11-24T19:13:10-05:00` (`00:13:10Z`) | `ux/tramo-5-mobile-lab` | Renderizar KaTeX inline, diferenciar 3 modos de cámara, cierre global con `Escape`, `#btn-shot` PNG real, trazabilidad de `LabSample` y *drawers* móviles (`≤ 760 px`) |
| **Tramo 5** | `a774846` | `2026-11-24T19:14:14-05:00` (`00:14:14Z`) | `ux/tramo-5-mobile-lab` | Actualizar registro técnico con Tramo 5 |
| **Tramo 6** | `f6ac5d7` | `2026-11-24T19:32:18-05:00` (`00:32:18Z`) | `rel/tramo-6-devops-beta` (`beta`) | Aligerar `docs/portable/`, script `bump-version.mjs`, soporte SemVer/beta en lanzador y updater, hardening CI y bump a `2.4.0-beta.1` |
| **Tramo 6** | `6dbc374` | `2026-11-24T19:33:37-05:00` (`00:33:37Z`) | `rel/tramo-6-devops-beta` (`v2.4.0-beta.1`) | Actualizar registro técnico con Tramo 6 y respaldo local |
| **Fix Conformada** | `f9ad6f6` | `2026-11-24T19:58:18-05:00` (`00:58:18Z`) | `rel/tramo-6-devops-beta` | Cerrar brecha `(u, v)` en campo lejano para radios 60–80 km, normalizar contra pico radiado real, respaldo síncrono de Web Worker y aviso 32×32 |

---

## Detalle técnico por tramo

### Tramo 0 — Saneamiento de línea base y tipado estricto

- **Commit:** `91455ff` (`2026-11-24T17:19:32-05:00`)
- **Por qué:** El compilador TypeScript permitía variables, campos privados e importaciones sin usar, ocultando restos de refactorizaciones previas.
- **Qué se hizo:**
  - Se activaron `"noUnusedLocals": true` y `"noUnusedParameters": true` en `tsconfig.json`.
  - Se eliminaron 8 elementos muertos detectados por `tsc --noEmit`:
    - `lambda` en `computeBasePattern` (`src/core/array.ts`)
    - `w` en `beamsVisibleLattice` (`src/core/coverage.ts`)
    - `r` en `propagate` (`src/core/orbit.ts`)
    - `z` en `elementsOverPoint` (`src/core/presets.ts`)
    - `hornMetrics` en `Engine` (`src/engine.ts`)
    - `LinkDirection` importado sin uso (`src/main.ts`)
    - `tooltip` y `lastRegionKey` sin uso inicial (`src/scene.ts`; `lastRegionKey` fue reintroducido con uso real en Tramo 1)
- **Verificación:** `npm ci`, `npm run build` y `npm test` (**9 archivos / 33 pruebas**).

---

### Tramo 1 — Corrección crítica de visualización 3D, snapshots y los 4 modos

- **Commits:** `3648784` (`2026-11-24T17:22:28-05:00`) y `d084261` (`2026-11-24T17:22:29-05:00`)

#### 1. Efecto "Rayos X" en la cara trasera del globo (los 4 modos)
- **Causa raíz:** En el *fragment shader* de la Tierra (`src/scene.ts`), todo punto de la esfera terrestre tiene $w = \mathbf{d} \cdot \texttt{uAntZ} \ge \cos(67^\circ) > 0$. Un mismo rayo $\mathbf{d}$ intersecta la cara visible y vuelve a salir por la cara oculta con idénticos $(u, v, w)$, proyectando el patrón de ganancia atravesando el planeta.
- **Corrección:** En `SceneView.buildEarth` (`src/scene.ts`), se añadió el chequeo de elevación positiva $\sin\varepsilon = \mathbf{N} \cdot (-\mathbf{d}_{\text{live}}) > 0$ con `smoothstep(0.0, 0.025, sinElev)` multiplicando `t` y `core`. En modo con snapshot fijo a Tierra también se valida `sinElevSnap` en espacio local `vLocal`.

#### 2. Deslizamiento de huellas al moverse el satélite (`60×` / `300×`) y parpadeo de cuantización
- **Causa raíz:** `uSat`/`uAntX/Y/Z` se actualizan a 60–120 FPS, mientras `beams` (110–150 ms), `quantPattern` (220–900 ms, sin marcar `gainDirty = true`) y `gainMap` (160–850 ms) corrían desacoplados. A `300×` la huella patinaba hasta ~1.940 km fuera de Perú/Lima antes de saltar de regreso.
- **Corrección:**
  - Se añadió `GainMapSnapshot` (`{ satEcef, frame, groundFixed }`) en `src/core/array.ts` y `GainMap.snapshot`.
  - `Engine` (`src/engine.ts`) almacena los snapshots de cálculo (`lastBeamSat`/`lastBeamFrame`, `quantSatEcef`/`quantFrame`, `synthSatEcef`/`synthFrame`), reduce `spotInterval` a `16 ms`, marca `gainDirty = true` y `quantUpdated = true` al recalcular `quantPattern`, y adjunta el snapshot exacto a cada `gainMap`.
  - El shader de `src/scene.ts` usa los uniforms `uGainSat`, `uGainAntX/Y/Z` y `vLocal` (espacio ECEF local) cuando `uUseGainSnap > 0.5`, manteniendo el corte de horizonte en tiempo real con `uSat`.

#### 3. Haz fantasma en el nadir cuando `beams.length === 0`
- **Causa raíz:** `Engine.compute` hacía fallback a `[ZERO_BEAM]` y `maskGainMap` dejaba `inside = true` cuando `active === null`.
- **Corrección:** En `src/engine.ts`, si `(beams.length === 0 && s.mode !== 'global') || (s.mode === 'shaped' && !synthActive)`, se asigna `EMPTY_GAIN` (`max = 0`, alfa 0) inmediatamente.

#### 4. Correcciones específicas por modo y etiquetas 3D
- **`spot` (`src/engine.ts`):** `maskGainMap` ahora obtiene el centro real del haz mediante `beamGroundPoint` cuando `spotFixed = false` (antes recortaba contra `spotTarget` borrando el haz al moverse el satélite) y limpia `map.max = 0` si ningún píxel sobrevive a la máscara.
- **`cellular` (`src/core/regions.ts`, `src/core/coverage.ts`, `src/engine.ts`, `src/scene.ts`):**
  - Se corrigió el paso vertical entre filas de `buildGroundCells` a $\sqrt{3}/2$ del paso horizontal en longitud corregida por $\cos(\text{lat}_{\text{med}})$ con desplazamiento `odd-r` (`(row & 1) * 0.5`).
  - Se implementó `cellColor(row, col, reuse)` en coordenadas axiales $(q, r) = (\text{col} - \lfloor\text{row}/2\rfloor, \text{row})$ sin colisiones entre vecinos para `reuse = 3, 4, 7`.
  - `coverageFraction` pasó a usar `res.visibleCells` en lugar de `this.cells.length`.
  - `SceneView.updateRegion` ahora dibuja el polígono de la región (`regionLine`) también en modo `cellular`.
- **`global` (`src/engine.ts`, `src/scene.ts`):** Se reemplazó `GLOBAL_HPBW = 134` por `globalHpbwDeg(altKm)` dependiente de la altitud, se acotó el semiángulo de `footprintRing` a `horizonOffNadir * 0.998` y se ocultó el disco plano tangente `activeDisc` cuando `mode === 'global'` o semiángulo `> 10°`.
- **`shaped` (`src/main.ts`, `src/ui.ts`, `src/scene.ts`):** Se distingue visualmente el estado *"Pendiente de sintetizar"* (`EMPTY_GAIN`, anillo ámbar tenue, sin cono falso) del estado *"Sintetizado"* (anillo verde, cono conformado real de 48 vértices sobre el círculo objetivo), y `setMode('shaped')` / `synthesize()` no ejecutan `snapToRegion` si el centro ya es visible dentro de `58°` de nadir.
- **Etiqueta 3D (`src/scene.ts`):** `updateLabels()` calcula `up = world.clone().normalize()` (en ECI, coherente con `cam - world`) y deriva `lat`/`lon` con `ecefToGeodetic` cuando `activeBeam.target` no existe.
- **Pruebas y verificación visual:** Se creó `tests/beamforming.test.ts` (**38/38 pruebas** en verde) y se verificó en navegador (`http://localhost:5173`) rotación 180° a cara trasera en los 4 modos, movimiento `60×`/`300×` y 0 errores de consola/WebGL.

---

### Tramo 2 — Rigor físico y matemático de RF y enlace

- **Commits:** `94b9d13` (`2026-11-24T17:54:00-05:00`) y `28599b1` (`2026-11-24T17:58:49-05:00`)

#### 1. Directividad exacta (`gridDirectivity`) y normalización sobre disco visible
- **Causa raíz:** `gridDirectivity(grid, q)` asumía pico unitario en el numerador sin multiplicar por $\cos^{2q}\theta_0$, reportando directividad cuantizada mayor que la ideal al escanear (p. ej. `26,9 dBi` vs `26,2 dBi` en el ejemplo por defecto sobre Lima). Además, `patternFromWeights` normalizaba sobre `[-2.2, 2.2]²` incluyendo la región no radiante $u^2+v^2 > 1$.
- **Corrección (`src/core/array.ts`, `src/engine.ts`):**
  - `patternFromWeights` normaliza exclusivamente por el máximo dentro del disco visible $u^2+v^2 \le 1$.
  - `gridDirectivity` calcula $\text{peak} = \max_{u^2+v^2 \le 1}(|AF(u,v)|^2 \cos^{2q}\theta)$ tanto sobre la malla esférica de integración como sobre los nodos visibles de `grid.power`.
  - En `Engine`, el modo cuantizado `realtime` pasó de `65×65` (`half = 1.35`) a `97×97` (`129×129` para `32×32`, `half = 1.05`) para evitar submuestrear el lóbulo principal.

#### 2. Orden de cuantización/residuales y VGA logarítmico en dB
- **Causa raíz:** `quantizedBeamWeights` y `quantizedComplexWeights` aplicaban primero los errores RMS continuos y luego cuantizaban, haciendo que la fase final quedara exactamente en la rejilla discreta sin reflejar jitter residual. Además, `quantizeAmplitude` cuantizaba en voltaje lineal en vez de pasos en dB como mostraba la UI.
- **Corrección (`src/core/quantization.ts`, `index.html`):**
  - Se exportó `ampStepDb(bits) = 32 / 2^bits` y se reescribió `quantizeAmplitude` en atenuación logarítmica en dB respecto al máximo.
  - Se invirtió el orden en `quantizedBeamWeights` y `quantizedComplexWeights`: **1.º** cuantización digital `(aq, pq)` sobre `(a0, p0)` y **2.º** perturbación residual continua `(ampRmsDb, phaseRmsDeg)`.
  - Se alinearon las etiquetas de `#quant-amp` y `#quant-mode` en `index.html` (`3 bits · 4 dB`, `4 bits · 2 dB`, `5 bits · 1 dB`, `6 bits · 0.5 dB`).

#### 3. Presupuesto de enlace coherente, subida satelital y capacidad celular
- **Causas raíz:** `marginDb` no descontaba `implementationMarginDb` (podía mostrar `"sin enlace"` con margen positivo); la subida usaba `T_ant = 50 K` y la figura de ruido del terminal terrestre; la pérdida atmosférica era `0.25 dB` fija sin depender de elevación ni frecuencia; y en modo celular solo se mostraba capacidad de un clúster.
- **Corrección (`src/core/link.ts`, `src/state.ts`, `src/engine.ts`, `src/ui.ts`, `index.html`):**
  - `marginDb` ahora se evalúa respecto a `effectiveCnDb = cnDb - implementationMarginDb`, garantizando `outage === true` si y solo si `marginDb < 0`.
  - Se exportaron `GROUND_ANTENNA_TEMP_K = 50`, `SAT_ANTENNA_TEMP_K = 290` y `SAT_NOISE_FIGURE_DB = 2.5`; la subida en `Engine` usa `290 K` y `2.5 dB` NF ($T_{\text{sys}} \approx 515{,}7\text{ K}$) de forma independiente al terminal terrestre.
  - Se añadió `atmosphericLossDb(freqGHz, elevationDeg)` con tabla cenital ITU-R P.676 aproximada escalada por $1/\sin(\max(5^\circ, \varepsilon))$.
  - En `SystemInfo` y la tarjeta *Sistema* (`index.html`, `src/ui.ts`) se diferencia **Cap. clúster** ($K \cdot C_{\text{haz}}$) y **Cap. agregada** (`aggregateCapacityMbps` $= N_{\text{vis}} \cdot C_{\text{haz}}$, cota ideal sin C/I co-canal).

#### 4. Órbita excéntrica y estabilidad numérica
- **Corrección (`src/core/presets.ts`, `src/core/orbit.ts`):**
  - `elementsOverPoint` convierte la anomalía verdadera $\nu = u$ a anomalía excéntrica $E$ y anomalía media $M_0 = E - e\sin E$ para $e > 0$.
  - `ecefToGeodetic` acota `r.z / rho` en `[-1, 1]` antes de `Math.asin`.

#### 5. Conmutador de interferencia co-canal C/I y SINR `C/(N+I)` (`28599b1`)
- **Motivación:** El usuario solicitó mantener **Cap. clúster** y **Cap. agregada** visibles por separado, añadiendo además un botón para alternar entre cota ideal sin interferencia y un modelo con **C/I co-canal**.
- **Corrección (`src/core/coverage.ts`, `src/core/link.ts`, `src/state.ts`, `src/engine.ts`, `index.html`, `src/ui.ts`, `src/main.ts`):**
  - Se implementó `coChannelCiDb(grid, beams, active)` sumando la interferencia de todos los haces visibles del mismo color (`b.id !== active.id && b.color === active.color`) evaluados en $(u_{\text{activo}} - u_b, v_{\text{activo}} - v_b)$ sobre `baseGrid`.
  - `linkBudget` acepta `coChannelCiDb` opcional, calcula `sinrDb` $= -10\log_{10}(10^{-C/N/10} + 10^{-C/I/10})$ y selecciona MODCOD y `marginDb` sobre `sinrDb - implementationMarginDb`.
  - Se añadió `SimState.cellularCi` (`false` por defecto), `Engine.setCellularCi()`, y el selector `#cell-ci-mode` (*Sin C/I (cota)* / *Con C/I co-canal*) en el bloque celular. Cuando está activo, la tarjeta de enlace cambia la etiqueta `C/N` a `C/(N+I)`, muestra el `C/I` en el balance y en `#cell-info`, y recalcula tanto **Cap. clúster** como **Cap. agregada**.
- **Documentación y pruebas:** Se actualizó `docs/teoria.md` (§2.4, §2.7, §3.3, §5.1–§5.3, §6), se ajustó `tests/quantization.test.ts` y se creó `tests/physics.test.ts` (**11 archivos / 48 pruebas aprobadas**).

---

### Tramo 3 — Hardening de seguridad (Tauri + Web + Portable + CSV)

- **Commit:** `791afdf` (`2026-11-24T18:09:11-05:00`)

#### 1. Escritura arbitraria y apertura de rutas en Tauri
- **Causa raíz:** `save_binary(path, data)` aceptaba cualquier ruta desde JavaScript; combinado con el permiso `opener:allow-open-path`, un XSS en frontend podía escribir y ejecutar archivos en disco.
- **Corrección (`src-tauri/src/lib.rs`, `src-tauri/capabilities/default.json`, `src/save.ts`):**
  - Se reemplazó `save_binary` por `save_export(app, filename, data, open_after)` en Rust: abre el diálogo nativo desde Rust (`blocking_save_file`), restringe extensiones a lista blanca (`png`, `pdf`, `csv`, `json`), sanea el nombre (`sanitize_filename`), limita tamaño a 50 MB y solo abre (`open_path`) el mismo archivo `.png`/`.pdf` recién guardado.
  - Se eliminaron `"dialog:default"` y `"opener:allow-open-path"` de `capabilities/default.json`.

#### 2. CSP de producción/desarrollo y cabeceras HTTP
- **Corrección (`src-tauri/tauri.conf.json`, `netlify.toml`, `vercel.json`):**
  - En Tauri se separó `csp` de producción (sin `127.0.0.1:5173`, añadiendo `object-src 'none'; base-uri 'self'; frame-ancestors 'none'`) de `devCsp` (solo desarrollo).
  - En `netlify.toml` y `vercel.json` se añadieron `Content-Security-Policy`, `X-Frame-Options: DENY` y `Permissions-Policy`.

#### 3. Eliminación de `innerHTML`, validación estricta de sesiones y CSV injection
- **Corrección (`src/ui.ts`, `public/versiones.html`, `public/versiones.js`, `src/core/lab.ts`, `src/lab-store.ts`):**
  - Se eliminó todo `innerHTML` en `src/` (`renderLab`, `renderReuse`, `showTour`) y `public/versiones.html` (moviendo su script a `public/versiones.js` con nodos DOM seguros, `safeUrl()` y soporte de ordenamiento semver con `beta`).
  - Se implementó `validateLabSession` en `src/core/lab.ts`, aplicado en `LabStore.load()` e `importJson()` (límite 5 MB, rechazo de claves extrañas y tipos inválidos).
  - `csvCell` en `src/core/lab.ts` antepone `'` a cadenas que inicien con `=`, `+`, `-` o `@` (con espacios/tabs previos opcionales) manteniendo intactos los valores numéricos negativos.

#### 4. Actualizador portable *fail-closed*
- **Corrección (`portable/Actualizar.ps1`):** Se exige regex semver/beta, URL HTTPS limitada a `gcrownv-glitch.github.io/beamlab-leo/` o `github.com/gcrownv-glitch/beamlab-leo/releases/download/`, destino contenido dentro de `$root` y **SHA-256 obligatorio de 64 hex** (*fail-closed*).
- **Pruebas (`tests/security.test.ts`):** 5 nuevas pruebas verificando CSV injection, `validateLabSession`, ausencia total de `innerHTML`, endurecimiento de Rust/Tauri/CSP y reglas de `Actualizar.ps1` (**12 archivos / 53 pruebas aprobadas**).

---

### Tramo 4 — Rendimiento y arquitectura asíncrona (Web Worker + Three.js)

- **Commit:** `b795140` (`2026-11-24T18:28:21-05:00`)

#### 1. Factorización de `patternFromWeights` y trigonometría 1D en síntesis
- **Causa raíz:** `patternFromWeights` evaluaba $O(\text{size}^2 \cdot n^2)$ operaciones y `size²·n` llamadas trigonométricas dentro del bucle 2D, y `synthesizeCoverage` evaluaba `n²` pares `cos/sin` por muestra.
- **Corrección (`src/core/array.ts`, `src/core/synthesis.ts`):**
  - `patternFromWeights` se factorizó en dos pasos 1D ($O(\text{size}\cdot n^2 + \text{size}^2\cdot n)$), reduciendo drásticamente llamadas trigonométricas (p. ej. ~128× menos en `257×257` con `16×16`) y manteniendo idéntica la normalización sobre el disco visible $u^2+v^2 \le 1$.
  - `synthesizeCoverage` precalcula bases 1D `(cx, sx)` y `(cy, sy)` por muestra.

#### 2. Web Worker para síntesis conformada sin bloquear el hilo principal
- **Corrección (`src/core/synthesis.ts`, `src/workers/synth.worker.ts`, `src/engine.ts`, `src/main.ts`, `src-tauri/tauri.conf.json`):**
  - Se extrajo `runShapedSynthesisJob()` en `src/core/synthesis.ts` y se dividió `Engine` en `prepareShapedSynthesis()` + `applyShapedSynthesis()` (manteniendo `synthesizeShaped()` síncrono para tests/fallback).
  - `src/workers/synth.worker.ts` (empaquetado inline por Vite con `?worker&inline` para compatibilidad portable) ejecuta la síntesis con transferencia de `ArrayBuffer`s sin copiar ni congelar la UI a 60 FPS; `App.synthesize()` descarta respuestas obsoletas por `synthReqId`.
  - Se añadió `worker-src 'self' blob:;` a `csp` y `devCsp` en `src-tauri/tauri.conf.json`.

#### 3. Omisión de `gainMap` oculto, eliminación de `preserveDrawingBuffer` y `dispose()` completo
- **Corrección (`src/engine.ts`, `src/scene.ts`):**
  - `Engine.compute()` omite `computeGainMap` y `maskGainMap` mientras `state.showGain === false`, y fuerza recálculo inmediato en el tick en que vuelve a activarse.
  - Se eliminó `preserveDrawingBuffer: true` de `WebGLRenderer` (las capturas renderizan explícitamente vía `captureCanvas()`), se preasignaron vectores/matrices reutilizables en `SceneView` para evitar presión de GC por frame, y `SceneView.dispose()` remueve todos los listeners DOM, libera `controls`, geometrías, materiales, texturas, composer/bloom y etiquetas DOM.
- **Pruebas (`tests/performance.test.ts`):** 4 nuevas pruebas validando exactitud `< 1e-5` de `patternFromWeights`, omisión de `computeGainMap` con `showGain = false`, equivalencia del pipeline asíncrono y limpieza en `SceneView` (**13 archivos / 57 pruebas aprobadas**).

---

### Tramo 5 — UX, Laboratorio, Móvil y Accesibilidad

- **Commit:** `0eba8b9` (`2026-11-24T19:13:10-05:00` / `2026-11-25T00:13:10Z`)

#### 1. KaTeX inline y sincronización física en el modal de Teoría
- **Causa raíz:** `UI.renderMath()` solo procesaba `.math[data-tex]` en modo bloque, dejando texto LaTeX crudo (`\(2^b\)`, `\(2^a\)`, `e^{jk(...)}`) visible en `#t-quant` y `#t-synth`, y las cifras de `#t-quant`/`#t-taper` seguían con los valores anteriores al Tramo 2 (`65×65`, `0,5 dB`).
- **Corrección (`index.html`, `src/ui.ts`, `src/styles.css`):**
  - Se extendió `UI.renderMath()` para renderizar `.math-inline[data-tex]` con `displayMode: false`.
  - Se reemplazaron las expresiones crudas por `.math-inline`, se actualizó la ecuación de directividad `D` incluyendo $P_e(\theta)$ y se sincronizó el texto de cuantización (`97×97`, `129×129` en `32×32`, paso de `2 dB` y aplicación posterior de residuales RMS).

#### 2. Tres modos de cámara realmente distintos (`earth`, `sat`, `follow`)
- **Causa raíz:** `SceneView.updateCamera()` trataba `'sat'` y `'follow'` de forma idéntica (ambos trasladaban cámara y pivote con `delta`).
- **Corrección (`src/scene.ts`):**
  - `'earth'`: órbita libre centrada en el origen terrestre (reencuadrando si se venía de zoom cercano al satélite).
  - `'sat'`: cámara embarcada detrás/sobre el satélite mirando hacia nadir y el subpunto/huella con horizonte alineado a la radial local (`controls.enabled = false`, vectores *scratch* sin alocaciones por frame).
  - `'follow'`: seguimiento libre que traslada el pivote sobre el satélite permitiendo rotar y hacer zoom a su alrededor.

#### 3. Modales (`Escape`/backdrop) y captura rápida real en `#btn-shot`
- **Corrección (`index.html`, `src/ui.ts`, `src/main.ts`):**
  - `#btn-shot` ejecuta `exportScene()` con notificación real (`Captura rápida PNG`), eliminando el handler muerto `screenshot`.
  - `#lab` y `#update` cierran al hacer clic en el fondo (*backdrop*), y `Escape` en `UI.onKey()` cierra `#help`, `#lab`, `#update` y `#tour` incluso cuando el foco está dentro de un `<input>`, `<select>` o `<textarea>`.

#### 4. Trazabilidad completa de muestras en Laboratorio
- **Corrección (`src/core/lab.ts`, `src/lab-sheet.ts`):**
  - `buildSample()` incluye `simTime` (resolución de 1 s), `region`, `reuse`, `cellularCi`, `spotFixed`, `shapedRadiusKm` y todos los parámetros del balance de enlace en `configHash`.
  - Se extrajo `buildLabSheetData(state, d, sample)` usada por `buildLabSheet()` para leer íntegramente órbita, arreglo, patrón exacto, enlace, sistema y haz conformado desde la muestra `sample` guardada (usando el estado vivo solo como respaldo cuando `sample === null`).

#### 5. *Drawers* responsivos en móvil (`≤ 760 px`)
- **Corrección (`index.html`, `src/styles.css`, `src/ui.ts`):**
  - Se reemplazó `.panel, .panel-tab { display: none; }` en `@media (max-width: 760px)` por paneles tipo *drawer* superpuestos (`z-index: 45`), botones de barra superior `#btn-mobile-orbit` / `#btn-mobile-antenna`, topbar compacta sin solapamiento del crédito y modales `#help`/`#lab` apilados en 1 columna.
  - En pantallas `≤ 760 px`, ambos paneles inician contraídos y abrir uno colapsa automáticamente el opuesto.
- **Pruebas y verificación (`tests/ux.test.ts`):** 4 nuevas pruebas automatizadas (**14 archivos / 61 pruebas aprobadas**), `npm run build` en verde y verificación visual en navegador (`1280×800` y `390×844`) con 0 errores de consola/WebGL.

---

### Tramo 6 — DevOps, aligeramiento del repositorio y lanzamiento Beta `v2.4.0-beta.1`

- **Commit:** `f6ac5d7` (`2026-11-24T19:32:18-05:00` / `2026-11-25T00:32:18Z`)

#### 1. Sincronización única de versiones (`scripts/bump-version.mjs`)
- **Corrección (`scripts/bump-version.mjs`, `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `CITATION.cff`):**
  - Se creó `scripts/bump-version.mjs` con modos `--check` y `<version>` (soporte SemVer completo con sufijos `-beta.*`), sincronizando los 4 manifiestos (+ `Cargo.lock` si existe) y actualizando `date-released` en `CITATION.cff`.
  - Se agregaron los scripts `version:check` y `version:bump` en `package.json` y se sincronizó el proyecto a **`2.4.0-beta.1`**.

#### 2. Empaquetado portable limpio, lanzador C# compatible con beta y soporte SemVer en cliente
- **Corrección (`scripts/build-portable.mjs`, `scripts/build-launcher.ps1`, `portable/BeamLabLEO.cs`, `src/update.ts`, `public/versiones.js`, `public/versiones.html`):**
  - `build-portable.mjs` limpia `release/portable/` antes de construir, elimina la copia de HTML pesados a `docs/portable/`, soporta orden SemVer con prereleases (`2.4.0 > 2.4.0-beta.2 > 2.4.0-beta.1 > 2.3.4`), distingue `latest` (última estable `2.3.4`) y `latestBeta` (`2.4.0-beta.1`) en `docs/portable/versions.json`, y apunta las descargas de HTML/ZIP/instaladores a GitHub Releases.
  - `build-launcher.ps1` silencia `Write-Progress` en `Compress-Archive` para ejecuciones no interactivas en CI/consola y deja el ZIP en `release/` (fuera de git).
  - `portable/BeamLabLEO.cs` prioriza el archivo `BeamLabLEO-*.html` de versión SemVer más alta (incluyendo `-beta.*`) y usa `index.html` solo como respaldo (compatible con C# 5 / .NET Framework 4.0 `csc.exe`).
  - `src/update.ts` implementa `compare()` SemVer 2.0.0 completo y evalúa `latestBeta` únicamente cuando la instancia instalada ya está en canal beta; `public/versiones.js`/`.html` muestran insignias diferenciadas `beta` / `estable`.

#### 3. Aligeramiento del repositorio y CI/CD multiplataforma
- **Corrección (`.gitignore`, `docs/portable/`, `.github/workflows/desktop.yml`, `.github/workflows/deploy.yml`):**
  - Se excluyeron `docs/portable/*.html` y `docs/portable/*.zip` en `.gitignore` y se removieron los binarios portables históricos del índice git (`git rm --sparse`), manteniendo únicamente el manifiesto ligero `docs/portable/versions.json`.
  - `desktop.yml` añade el job previo `verify` (`bump-version.mjs --check`, `npm test`, `npm run build`), genera el paquete portable HTML + `BeamLabLEO.exe` + ZIP junto con `beamlab-leo.exe` y el instalador NSIS en Windows, compila `.dmg` (macOS Apple Silicon) y `.AppImage` + `.deb` (Linux Ubuntu), y publica etiquetas `-beta.*` como **Pre-release** (`prerelease: true`, `make_latest: false`).
  - `deploy.yml` exige `bump-version.mjs --check` y `npm test`, tomando los artefactos portables generados en `release/` durante el build.
- **Pruebas y verificación (`tests/release.test.ts`):** 5 nuevas pruebas verificando orden SemVer con beta, sincronía exacta de los 4 manifiestos, `BeamLabLEO.cs`, workflows `desktop.yml`/`deploy.yml` y estructura de `docs/portable/versions.json` (**15 archivos / 66 pruebas aprobadas**), además de `npm run build:portable` ejecutado con éxito en local.

#### 4. Corrección de síntesis conformada y despliegue web `2.4.0-beta.2` (`f9ad6f6`)
- **Causa raíz detectada tras `v2.4.0-beta.1`:** En modo **Conformada**, `prepareShapedSynthesis()` mezclaba el muestreo cercano y lejano en un único `thin(outside, 500)` y dejaba una franja sin muestrear en `(u, v)` para radios de `60–80 km`, permitiendo lóbulos espurios y cobertura `0 %`; adicionalmente, `measureSynthesis()` comparaba contra el pico sin factor de elemento (`cos^{2q}θ`) rechazando haces anchos (`350–400 km`), y `worker.onerror` no degradaba a cálculo síncrono en entornos sin Worker `Blob`/`data:`.
- **Corrección (`src/engine.ts`, `src/core/synthesis.ts`, `src/main.ts`, `src/ui.ts`, `tests/shaped.test.ts`):** Muestreo separado en guarda cercano (`300`) + campo lejano (`400`, `farMinR = maxInUv + 0.03`), normalización contra `peakRadiatedPower()`, respaldo síncrono en `App.synthesize()` y aviso claro cuando `n > 20` (`32×32`).
- **Despliegue web previo:** Se respaldó `25ce657` en `stable/v2.3.4-orig`, se actualizó a `2.4.0-beta.2` y se desplegó primero en `main` (GitHub Pages) para validación web antes de etiquetar los instaladores desktop/portables.

---

## Constancia de respaldos, aligeramiento y artefactos en local

Para trazabilidad y recuperación inmediata ante cualquier eventualidad:
1. **Repositorio local (`C:\Users\Jhorel Cornejo\.gemini\antigravity\scratch\beamlab-leo`):**
   - **Versión estable original intacta:** rama `stable/v2.3.4-orig` en commit `25ce657` (`v2.3.4`), preservada en local y en GitHub junto con el tag/Release `v2.3.4`.
   - **Versión estable verificada (Tramos 0–2) intacta:** rama `stable/v2.3.4-tramo2` y tag `checkpoint-tramo-2` en commit `62d3b68`.
   - **Ramas por tramo preservadas localmente:** `fix/tramo-1-beamforming-3d` (`d084261`), `fix/tramo-2-rf-physics` (`62d3b68`), `sec/tramo-3-tauri-xss` (`6342a30`), `perf/tramo-4-worker-render` (`1808e62`), `ux/tramo-5-mobile-lab` (`a774846`) y `rel/tramo-6-devops-beta` / `beta` (`f6ac5d7` + commit de documentación).
   - **Historial previo de `docs/portable/`:** al aligerar la rama `beta` (`git rm --sparse` de los `.html` y `.zip` en `docs/portable/`), los commits históricos en `main` (`25ce657`) y `stable/v2.3.4-tramo2` (`62d3b68`) siguen conservando las referencias originales en local y en GitHub Releases (`v2.3.1`–`v2.3.4`).
2. **Artefactos portables compilados localmente (carpeta `release/`, excluida de git por `.gitignore`):**
   - `release/portable/BeamLabLEO-2.4.0-beta.1.html` (4,38 MB, SHA-256 registrado en `docs/portable/versions.json`).
   - `release/portable/BeamLabLEO.exe` (lanzador .NET Framework compilado localmente).
   - `release/BeamLabLEO-2.4.0-beta.1-portable.zip` (2,37 MB, paquete portable completo).

---

## Invariantes que cualquier cambio futuro debe respetar

1. **Oclusión terrestre en dos capas coherentes:** La visibilidad de superficie se evalúa con $\mathbf{N} \cdot (\mathbf{S} - \mathbf{P}) > 0$ tanto en `src/core/orbit.ts` (`elevationAngle`, `raySphere`) como en el *fragment shader* de `src/scene.ts`. Nunca usar máscaras CPU para tapar errores de proyección del shader.
2. **Snapshots inmutables en `GainMap`:** Todo `GainMap` fijo a Tierra debe portar `snapshot` con el `(satEcef, frame)` usado al generarlo para que la escena pueda interpolar a 60–120 FPS sin deslizamiento de huellas.
3. **Ausencia de haz = `EMPTY_GAIN`:** Con `beams.length === 0` (salvo `global`) o `shaped` sin sintetizar, `gainMap` debe ser `EMPTY_GAIN` (`max = 0`).
4. **Invariantes RF:** `quantize*` aplica cuantización discreta antes de residuales continuos; `gridDirectivity` incluye $\cos^{2q}\theta$ en numerador y denominador sobre el disco visible; `marginDb < 0` equivale exactamente a `outage === true`.
5. **Invariantes de seguridad:** Cero `innerHTML` en `src/` y `public/versiones.*`; Tauri usa `save_export` con diálogo en Rust y sin `opener:allow-open-path`; `LabStore` pasa siempre por `validateLabSession`; `Actualizar.ps1` aborta sin SHA-256 válido.
6. **Invariantes de rendimiento:** `patternFromWeights` se mantiene factorizado en 2 pasos 1D; `Engine.compute()` no ejecuta `computeGainMap` con `showGain === false`; `SceneView` no activa `preserveDrawingBuffer` y `dispose()` libera listeners, controles y recursos WebGL.
7. **Invariantes de UX y Laboratorio:** Toda expresión matemática en `index.html` usa `.math[data-tex]` o `.math-inline[data-tex]`; `buildLabSheetData` prioriza siempre los datos del `sample` histórico sobre el estado vivo; en `≤ 760 px` los paneles laterales permanecen accesibles como *drawers* mutuamente excluyentes.
8. **Invariantes de versionado y CI:** Los 4 manifiestos (`package.json`, `Cargo.toml`, `tauri.conf.json`, `CITATION.cff`) deben coincidir siempre (`node scripts/bump-version.mjs --check`); `docs/portable/` solo versiona `versions.json`; las etiquetas `-beta.*` deben publicarse como pre-release sin sobreescribir el release estable `v2.3.4`.

---

## Hoja de ruta ejecutada

| Tramo | Alcance resumido | Estado |
|---|---|---|
| **Tramo 0–2** | Tipado estricto, eliminación de código muerto, corrección 3D (`spot`, `cellular`, `global`, `shaped`), rigor RF/enlace y modelo C/I co-canal | Completado (`62d3b68`) |
| **Tramo 3** | Seguridad: diálogo nativo en Rust (`save_export`), CSP producción vs `devCsp`, eliminar `innerHTML` en `ui.ts` y `versiones.html`, SHA-256 *fail-closed* en `Actualizar.ps1`, neutralizar CSV injection | Completado (`791afdf`) |
| **Tramo 4** | Rendimiento: quitar `preserveDrawingBuffer`, saltar `computeGainMap` si `!showGain`, precomputar `cx/sx` en `patternFromWeights`, Web Worker para `synthesizeCoverage`, `SceneView.dispose()` completo | Completado (`b795140`) |
| **Tramo 5** | UX, Laboratorio y Móvil: KaTeX inline en `index.html`, diferenciar cámaras `Tierra`/`Satélite`/`Seguir`, cierre global con `Escape`, `#btn-shot` PNG real, `configHash` completo y `buildLabSheetData`, *drawers* móviles (`≤ 760 px`) | Completado (`0eba8b9`) |
| **Tramo 6** | DevOps/CI y Releases: `bump-version.mjs`, corrección de `build-launcher.ps1` y `BeamLabLEO.cs`, aligeramiento de `docs/portable/`, validación en `desktop.yml`/`deploy.yml`, publicación **beta** `v2.4.0-beta.1` | Completado (`f6ac5d7`) |

### Decisiones y preferencias aplicadas
- **Capacidad celular (Tramo 2):** Mostrar **Cap. clúster** y **Cap. agregada** por separado + conmutador para activar/desactivar el modelo de **C/I co-canal** (`28599b1`).
- **Estrategia de ramas y versiones:** Conservar `2.3.4` estable en `main` (`25ce657`) y `checkpoint-tramo-2` (`62d3b68`), y publicar la versión unificada como pre-release **`v2.4.0-beta.1`**.
- **Política de `docs/portable/` (Tramo 6):** Se aligeró la rama retirando los binarios `.html` y `.zip` hacia GitHub Releases, conservando `docs/portable/versions.json` en git y dejando constancia de los artefactos y puntos de recuperación en local.
