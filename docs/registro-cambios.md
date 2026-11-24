# Registro Técnico de Cambios y Auditoría Ejecutada — BeamLab LEO

Documento de trazabilidad diseñado para que cualquier persona o agente de IA pueda retomar el proyecto sabiendo exactamente **qué se cambió, por qué se cambió, cuándo se aplicó (marcas de tiempo ISO-8601), qué invariantes deben preservarse y qué queda pendiente**.

## Metadatos del estado actual

| Campo | Valor |
|---|---|
| **Repositorio** | `beamlab-leo` |
| **Commit base auditado** | `25ce657` (`main`, v2.3.4) |
| **Versión declarada en manifiestos** | `2.3.4` *(bump de versión diferido hasta completar todos los tramos)* |
| **Rama activa** | `fix/tramo-2-rf-physics` (construida sobre `fix/tramo-1-beamforming-3d`) |
| **Última actualización** | `2026-11-24T17:54:00-05:00` (`2026-11-24T22:54:00Z`) |
| **Estado de verificación** | `tsc --noEmit` + `vite build` en verde · `vitest run`: **11 archivos / 46 pruebas aprobadas** |

---

## Cronología de commits

| Tramo | Commit | Marca de tiempo (Local `-05:00` / UTC) | Rama | Descripción |
|---|---|---|---|---|
| **Tramo 0** | `91455ff` | `2026-11-24T17:19:32-05:00` (`22:19:32Z`) | `fix/tramo-1-beamforming-3d` | Activar `noUnusedLocals` y `noUnusedParameters` en TypeScript y eliminar código muerto |
| **Tramo 1** | `3648784` | `2026-11-24T17:22:28-05:00` (`22:22:28Z`) | `fix/tramo-1-beamforming-3d` | Eliminar rayos X en cara trasera, deslizamiento de huellas, haces fantasma y bugs de los 4 modos |
| **Tramo 1** | `d084261` | `2026-11-24T17:22:29-05:00` (`22:22:29Z`) | `fix/tramo-1-beamforming-3d` | Agregar pruebas unitarias de regresión 3D, snapshots y coloreado hexagonal |
| **Tramo 2** | `94b9d13` | `2026-11-24T17:54:00-05:00` (`22:54:00Z`) | `fix/tramo-2-rf-physics` | Rigor físico RF/enlace: directividad con *scan loss*, VGA en dB, receptor satelital 290 K, pérdidas atmosféricas, capacidad celular y órbita excéntrica |

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

- **Commit:** `94b9d13` (`2026-11-24T17:54:00-05:00`)

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
  - `elementsOverPoint` convierte la anomalía verdadera $\nu = u$ a anomalía excéntrica $E$ y anomalía media $M_0 = E - e\sin E$ cuando $e > 0$.
  - `ecefToGeodetic` acota `r.z / rho` en `[-1, 1]` antes de `Math.asin`.
- **Documentación y pruebas:** Se actualizó `docs/teoria.md` (§2.4, §2.7, §3.3, §5.1–§5.3, §6), se ajustó `tests/quantization.test.ts` y se creó `tests/physics.test.ts` (**11 archivos / 46 pruebas aprobadas**).

---

## Invariantes que cualquier cambio futuro debe respetar

1. **Oclusión terrestre en dos capas coherentes:** La visibilidad de superficie se evalúa con $\mathbf{N} \cdot (\mathbf{S} - \mathbf{P}) > 0$ tanto en `src/core/orbit.ts` (`elevationAngle`, `raySphere`) como en el *fragment shader* de `src/scene.ts`. Nunca usar máscaras CPU para tapar errores de proyección del shader.
2. **Snapshots inmutables en `GainMap`:** Todo `GainMap` fijo a Tierra debe portar `snapshot` con el `(satEcef, frame)` usado al generarlo para que la escena pueda interpolar a 60–120 FPS sin deslizamiento de huellas.
3. **Ausencia de haz = `EMPTY_GAIN`:** Con `beams.length === 0` (salvo `global`) o `shaped` sin sintetizar, `gainMap` debe ser `EMPTY_GAIN` (`max = 0`).
4. **Invariantes RF:** `quantize*` aplica cuantización discreta antes de residuales continuos; `gridDirectivity` incluye $\cos^{2q}\theta$ en numerador y denominador sobre el disco visible; `marginDb < 0` equivale exactamente a `outage === true`.

---

## Hoja de ruta restante (pendiente)

| Tramo | Alcance resumido | Estado |
|---|---|---|
| **Tramo 3** | Seguridad: diálogo nativo en Rust (`save_binary`), CSP producción vs `devCsp`, eliminar `innerHTML` en `ui.ts` y `versiones.html`, SHA-256 *fail-closed* en `Actualizar.ps1`, neutralizar CSV injection | Pendiente |
| **Tramo 4** | Rendimiento: quitar `preserveDrawingBuffer`, saltar `computeGainMap` si `!showGain`, precomputar `cx/sx` en `patternFromWeights`, Web Worker para `synthesizeCoverage`, `SceneView.dispose()` completo | Pendiente |
| **Tramo 5** | UX, Laboratorio y Móvil: arreglar LaTeX crudo en `index.html`, diferenciar cámaras `Satélite`/`Seguir`, cerrar todos los modales con `Escape`, `configHash` completo, *drawers* móviles (`≤ 760 px`) | Pendiente |
| **Tramo 6** | DevOps/CI y Releases: corregir `build-launcher.ps1` y `BeamLabLEO.cs`, decidir política de `docs/portable/`, script único `bump-version.mjs`, pruebas en `desktop.yml` y `deploy.yml` | Pendiente |

### Decisiones pendientes del usuario
- **Subida de versión:** Se acordó definir el bump de versión al concluir todos los tramos.
- **Política de `docs/portable/` (para Tramo 6):** Pendiente confirmar entre *migrar binarios a GitHub Releases* vs *conservar solo la última versión*.
