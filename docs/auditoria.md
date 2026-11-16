# Auditoría técnica y de producto — BeamLab LEO 2.3.0

**Fecha:** 2026-11-12  
**Auditor:** Jhorel Kennedy Cornejo Cruz — IET UCSP  
**Repositorio:** <https://github.com/gcrownv-glitch/beamlab-leo>  
**Demo:** <https://gcrownv-glitch.github.io/beamlab-leo/>

## 1. Alcance

Se audita el simulador completo: órbita, arreglo en fase, modos de cobertura, presupuesto de enlace, interfaz, rendimiento, documentación, repositorio y despliegue. El objetivo es determinar si **cumple con lo necesario para la exposición y el curso**, no si es un producto de vuelo certificado.

## 2. Método

- Revisión estática de `src/core` y de los flujos de `engine.ts`, `ui.ts` y `main.ts`.
- Ejecución de **33 pruebas** (`npm test`).
- Compilación de producción (`npm run build`).
- Verificación en navegador real (Edge headless) sobre la app publicada: carga 3D, texturas, modos, enlace, créditos y consola.
- Revisión del workflow de GitHub Actions y del estado HTTP del sitio.
- Contraste de los números de antena y enlace con fórmulas de espacio libre, directividad y umbrales DVB-S2X.

## 3. Veredicto

**APROBADO CON OBSERVACIONES** para el objetivo docente y de exposición.

- El sistema **cumple** los requisitos funcionales centrales: órbita, beamforming, cobertura, enlace, UI, despliegue y documentación.
- **No hay defectos bloqueantes** para presentarlo.
- Quedan limitaciones de alcance (interferencia, feeder link, handover, accesibilidad total y asignación térmica de potencia) que están **declaradas** y no forman parte del objetivo actual. La cuantización y el **enlace bidireccional** ya están implementados.

## 4. Matriz de requisitos

| # | Requisito | Estado | Evidencia |
|---|---|---|---|
| 1 | Parámetros orbitales: altitud, apogeo, perigeo, velocidad, período, inclinación, excentricidad, RAAN | **Cumple** | Panel de órbita y `orbit.ts` |
| 2 | Propagación Kepler + J2 + GMST + ECI/ECEF | **Cumple** | Pruebas de órbita y GMST |
| 3 | Traza, huella visible y distancia oblicua | **Cumple** | Anillo 3D, `maxCentralAngle`, `slantRange` |
| 4 | Arreglo en fase configurable (4×4 a 32×32, λ, frecuencia, taper, eficiencia) | **Cumple** | Panel de antena y `array.ts` |
| 5 | Apuntamiento por fase y mapa de fase | **Cumple** | `beamPhaseMap`, fase en UI |
| 6 | Directividad, ganancia, HPBW, SLL y grating lobes | **Cumple** | Métricas y advertencia de grating |
| 6b | Cuantización de fase/amplitud, errores residuales y patrón exacto | **Cumple** | 3–7 bits de fase, 3–5 de amplitud, corte directo; 26 pruebas |
| 7 | Modos global, puntual, celular y conformado | **Cumple** | Cuatro modos operativos |
| 8 | Celdas con reutilización 3/4/7, cobertura y selección de celda | **Cumple** | 404 celdas, 98 %, clic en celda |
| 9 | Haz conformado con muestreo en Tierra y control de derrame | **Cumple** | Cuantizado: 98 %, −7,4 dB, D 20,3 dBi; ideal: 100 %, −12,1 dB |
| 10 | Presupuesto de enlace: EIRP, FSPL, atmósfera, lluvia, G/T, C/N₀, C/N | **Cumple** | Panel de enlace |
| 10b | Enlace bidireccional bajada/subida, potencia de terminal y balance | **Cumple** | 12/14 GHz, 20 W/4 W, capacidad = mínimo DL/UL |
| 11 | MODCOD DVB-S2X, margen y outage | **Cumple** | 64APSK 5/6; isotrópica → outage |
| 12 | Capacidad por haz, por usuario y de sistema; potencia y espectro | **Cumple** | 500 Mbps/haz, 25/usuario, 1,5 Gbps, 8,1 kW |
| 13 | Estado “sin haz” y no mostrar cifras falsas | **Cumple** | Tarjeta “sin enlace” |
| 14 | Controles de rendimiento (FPS, calidad) | **Cumple** | 30–120/∞, Alta/Media/Baja |
| 15 | Teoría, guía, ayuda y atajos | **Cumple** | Modal de teoría, tour de 8 pasos |
| 16 | Créditos con nombre completo, IET UCSP y enlace a GitHub | **Cumple** | Esquina superior izquierda y PDF |
| 17 | Pruebas automatizadas y build | **Cumple** | 33/33 y build correcto |
| 18 | CI y despliegue público | **Cumple** | GitHub Actions y HTTP 200 |
| 19 | README, LICENSE, CHANGELOG, CITATION, docs | **Cumple** | Repositorio organizado |
| 20 | Guion y PDF de exposición | **Cumple** | 20 páginas, portada/contraportada |
| 21 | Asignación de potencia por haz y modelo térmico | **Parcial** | Se muestra el total y un aviso; no se reparte potencia |
| 22 | Interferencia co-canal / C/I por reutilización | **No incluido** | Declarado en Limitaciones |
| 23 | Polarización, Doppler y handover | **No incluido** | Declarado en Limitaciones |
| 24 | Fallos de elementos, acoplamiento mutuo y calibración perfecta | **No incluido** | El arreglo sigue siendo ideal en esos aspectos; cuantización y residuales sí están |
| 25 | Distribución sin tiendas: HTML, EXE launcher y actualización por versiones | **Cumple** | HTML verificado offline, launcher 48 KB, manifiesto SHA-256 y versiones conservadas |
| 26 | Tauri para Windows, Ubuntu y macOS ARM, sin Chromium embebido | **Cumple** | `src-tauri`, builds CI y release v2.3.0 con exe/AppImage/deb/dmg |
| 27 | Ficha de laboratorio PNG/PDF con escena y paneles | **Cumple** | Exportación compuesta verificada a 1600×1000 |
| 28 | Sesiones y muestras JSON/CSV con respaldo local | **Cumple** | LabStore, CSV de 56 columnas, importación JSON |
| 29 | Panel de nueva versión opcional | **Cumple** | Modal con continuar/no avisar/ver versiones |
| 25 | Accesibilidad completa del canvas 3D | **Parcial** | `aria-label` y panel textual; sin alternativa completa para lector de pantalla |
| 26 | Prueba E2E automatizada en CI | **Parcial** | Verificación manual con Playwright; el CI corre unitarias + build |

## 5. Evidencia cuantitativa

### Enlace por defecto

| Parámetro | Valor |
|---|---|
| Terminal | VSAT 0,6 m, 34 dBi, NF 1,5 dB |
| EIRP | 39,2 dBW |
| FSPL a 611 km | 169,7 dB |
| P<sub>rx</sub> | −66,7 dBm |
| C/N₀ bajada | 110,3 dBHz |
| C/N bajada en 100 MHz | 30,3 dB |
| C/N₀ subida | 104,7 dBHz |
| C/N subida en 100 MHz | 24,7 dB |
| Capacidad por haz | min(DL, UL) = 500 Mbps |
| MODCOD | 64APSK 5/6 |
| Capacidad | ≈500 Mbps/haz · 25 Mbps/usuario con 20 usuarios |

Con antena isotrópica (0 dBi): C/N ≈ −8,6 dB, **outage** y 0 Mbps. Esto sustituye el antiguo resultado de 0–3 Mbps, que era un receptor isotrópico con Shannon sin umbral.

### Cobertura

- Perú: **404 celdas**, **98 %** de cobertura estimada, 3 colores.
- Sistema: **1,50 Gbps** agregados, **300 MHz** de espectro, **8,1 kW** de RF si los 404 haces transmiten a 20 W (aviso visible; no es un diseño térmico).

### Haz conformado

- Lima 100 km: **98 %** de cobertura con cuantización, derrame **−7,4 dB**, **D 20,3 dBi**, HPBW **16,2°**. Ideal: 100 % y −12,1 dB.
- Tiempo congelado: diseño estático, sin deriva del haz.

### Geometría

- A 550 km: **67,0°** de nadir, **23,0°** de ángulo central.
- Radio superficial **2.560 km**; diámetro **5.100 km**.

## 6. Hallazgos

### Bloqueantes

**Ninguno.**

### Observaciones

1. **Potencia y térmica:** se muestra la potencia RF total, pero no se reparte entre haces ni se modela el balance térmico. El aviso de 8,1 kW evita interpretarlo como diseño real.
2. **Interferencia:** la reutilización 3/4/7 se pinta, pero no se calcula C/I. La capacidad es una cota optimista.
3. **Arreglo:** cuantización y errores residuales implementados; faltan acoplamiento mutuo, fallos de elementos y calibración medida.
4. **Enlace:** con apertura fija y frecuencias emparejadas, sin duplexores, polarización, Doppler, feeder ni handover.
5. **Cobertura celular:** límite de 2.500 celdas; en regiones grandes se muestra la fracción cubierta.
6. **Accesibilidad:** el canvas 3D tiene etiqueta, pero no una descripción textual completa.
7. **E2E:** la verificación de navegador es manual; conviene automatizarla en CI.
8. **Dominio:** se usa `github.io`; un dominio propio es opcional.

## 7. Recomendaciones priorizadas

1. Añadir C/I y un margen de interferencia por reutilización.
2. Modelar asignación de potencia y un límite térmico simple.
3. Incorporar Playwright al CI para un smoke test de la app publicada.
4. Mejorar accesibilidad: resumen textual de métricas y navegación por teclado en el canvas.
5. Añadir Doppler, polarización y feeder link si el alcance crece.
6. Evaluar un dominio propio para la presentación.

## 8. Checklist de aceptación

- [x] La app carga en un navegador real sin errores de consola.
- [x] Los cuatro modos funcionan.
- [x] El enlace por defecto es realista y el caso isotrópico queda en outage.
- [x] Bajada y subida se calculan por separado y la capacidad usa el mínimo.
- [x] La geometría de 550 km está corregida.
- [x] La cobertura celular muestra celdas, reutilización y fracción.
- [x] El haz conformado cubre Lima y no deriva.
- [x] La cuantización 5/4 bits y los errores residuales se calculan con patrón exacto.
- [x] Los créditos con nombre completo y GitHub están visibles.
- [x] 33 pruebas pasan.
- [x] HTML portable de 3,6 MB abre sin servidor y conserva versiones.
- [x] Ficha de laboratorio PNG/PDF y muestras CSV/JSON exportadas.
- [x] Tauri configurado para Ubuntu, macOS ARM y Windows; builds en CI.
- [x] El build de producción compila.
- [x] GitHub Pages publica el sitio.
- [x] README, LICENSE, CHANGELOG, CITATION y PDF están actualizados.
- [x] Las limitaciones están documentadas.

## 9. Firma

**Jhorel Kennedy Cornejo Cruz**<br>
IET UCSP — Ingeniería Electrónica y Telecomunicaciones<br>
[github.com/gcrownv-glitch](https://github.com/gcrownv-glitch)
