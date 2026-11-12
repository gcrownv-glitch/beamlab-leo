# BeamLab LEO

**Simulador interactivo de órbita, arreglos en fase y beamforming satelital.**

[![Demo](https://img.shields.io/badge/demo-online-22d3ee?style=flat-square)](https://gcrownv-glitch.github.io/beamlab-leo/)
[![Deploy](https://github.com/gcrownv-glitch/beamlab-leo/actions/workflows/deploy.yml/badge.svg)](https://github.com/gcrownv-glitch/beamlab-leo/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-3da639?style=flat-square)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20.19-339933?style=flat-square)](package.json)
[![Tests](https://img.shields.io/badge/tests-22%20passing-22d3ee?style=flat-square)](tests)

**Demo:** <https://gcrownv-glitch.github.io/beamlab-leo/><br>
**Repositorio:** <https://github.com/gcrownv-glitch/beamlab-leo>

![Vista general de BeamLab LEO](docs/img/01-general.jpg)

BeamLab LEO muestra, en un globo 3D, cómo un satélite en órbita baja (LEO) ilumina la Tierra con haces directivos: la órbita y la huella visible, la fase de cada elemento del arreglo, la cobertura celular de un país y el diseño de un haz con forma de una ciudad. El presupuesto de enlace traduce esas decisiones de antena a C/N, MODCOD y Mbps.

## Contenido

- **Órbita:** Kepler, corrección secular J2, GMST, ECI/ECEF, traza, huella y distancia oblicua.
- **Arreglo en fase:** 4×4 a 32×32, separación en λ, taper Uniforme/Kaiser/Hann, mapa de fase, HPBW, SLL, directividad, lóbulos de difracción.
- **Cobertura:** haz global, haz puntual, celdas fijas a Tierra con reutilización 3/4/7, selección de celda y fracción de cobertura.
- **Haz conformado:** síntesis por mínimos cuadrados complejos con regularización y gradiente conjugado; muestreo sobre la superficie terrestre.
- **Enlace:** EIRP, FSPL, atmósfera, margen de lluvia, G/T, C/N₀, C/N, tabla MODCOD DVB-S2X, outage, capacidad por haz, por usuario y agregada del sistema.
- **Rendimiento:** límite de FPS (30–120/∞), calidad Alta/Media/Baja, texturas reales y shader de ganancia en el globo.
- **Presentación:** guía de 8 pasos, teoría con ecuaciones y material de exposición.

## Inicio rápido

Requisitos: Node.js ≥ 20.19.

```bash
npm install
npm run dev
```

Abre `http://localhost:5173`. Para producción:

```bash
npm run build
npm run preview
```

La app es estática; necesita servirse por HTTP. No abras `dist/index.html` con `file://`.

## Uso

1. Elige una misión (Starlink, ISS, OneWeb, SSO) o ajusta altitud, inclinación, excentricidad y RAAN.
2. Selecciona el modo: **Global**, **Puntual**, **Celular** o **Conformada**.
3. Ajusta el arreglo (N×N, separación, frecuencia, taper, eficiencia) y la potencia por haz.
4. En **Puntual**, haz clic en el globo para mover el haz. En **Celular**, haz clic para inspeccionar una celda. En **Conformada**, elige centro y radio y pulsa **Sintetizar cobertura**.
5. Lee el presupuesto de enlace: EIRP, FSPL, C/N, MODCOD, margen, G/T, elevación y capacidad.

### Atajos

| Tecla | Acción |
|---|---|
| `Espacio` | Reproducir / pausar |
| `1`–`4` | Global / Puntual / Celular / Conformada |
| `T` | Guía de presentación |
| `H` | Teoría y ecuaciones |
| `P` | Captura PNG |
| `G` | Mostrar/ocultar ganancia |
| `[` / `]` | Contraer panel de órbita / antena |

## Modelo técnico

### Órbita

La posición se propaga con elementos keplerianos y deriva secular J2 de Ω, ω y M. La Tierra se modela como esfera de radio 6378,137 km. A 550 km:

- velocidad orbital ≈ 7,59 km/s;
- período ≈ 95,6 min;
- horizonte a 67,0° de nadir;
- casquete visible de 23,0° de ángulo central, **2.560 km de radio** (5.100 km de diámetro).

### Arreglo en fase

El factor de arreglo es

```text
AF(u,v) = Σ_m Σ_n a_mn · exp[j k (x_m u + y_n v)]
```

con `u = sinθ cosφ`, `v = sinθ sinφ`, `k = 2π/λ`. Para apuntar a `(u₀,v₀)`:

```text
a_mn = w_m w_n · exp[−j k (x_m u₀ + y_n v₀)]
```

El patrón del elemento es `g_e(θ) = cos^q θ` en campo y `cos^{2q} θ` en potencia. El simulador calcula directividad integrando el patrón en el hemisferio, HPBW por cruce de −3 dB, SLL y el aviso de grating lobes cuando `d > 0,5 λ`.

### Haz conformado

Se muestrea un círculo de radio `R` sobre la superficie terrestre, se mapea a direcciones `(u,v)` y se resuelve

```text
min_w ||A w − d||² + λ||w||²
```

con `d = 1` dentro de la zona y `0` fuera, transición coseno en el borde y gradiente conjugado. El tiempo se congela en este modo: es un **diseño estático**, no una simulación dinámica.

### Enlace

```text
EIRP = P_tx + G_tx
L_fs = 20 log10(4πd/λ)
P_rx = EIRP − L_fs − L_atm − L_rain + G_rx
C/N₀ = P_rx − N₀
C/N  = C/N₀ − 10 log10(B)
```

La temperatura de sistema incluye antena (50 K) y receptor; se muestra `G/T`. La capacidad no usa Shannon como si fuera un módem: se selecciona el **MODCOD DVB-S2X** más alto cuyo umbral de C/N se cumple, con 1 dB de margen. Si ninguno cumple, hay **outage** y capacidad cero.

Configuración por defecto:

| Parámetro | Valor |
|---|---|
| Órbita | Starlink 550 km, 53° |
| Arreglo | 16×16, 0,5 λ, Ku 12 GHz, Kaiser −30, η = 65 % |
| P<sub>tx</sub> | 20 W por haz |
| Canal | 100 MHz |
| Terminal | VSAT 0,6 m, 34 dBi, NF 1,5 dB |
| Usuarios/haz | 20 |
| Resultado típico | C/N ≈ 29,6 dB, 64APSK 5/6, ≈500 Mbps/haz, ≈25 Mbps/usuario |

Con la antena isotrópica (0 dBi) el mismo enlace queda en outage: sirve para comparar y entender por qué la antena del usuario importa.

## Estructura

```text
src/
  core/
    constants.ts   constantes físicas
    vec.ts         álgebra vectorial
    orbit.ts       Kepler, J2, GMST, horizonte, ECI/ECEF
    geometry.ts    cosenos directores, rayos, huellas
    array.ts       factor de arreglo, taper, directividad, HPBW/SLL
    synthesis.ts   mínimos cuadrados complejos + gradiente conjugado
    coverage.ts    celdas, haces visibles, apuntamiento
    regions.ts     polígonos, áreas, celdas, muestreo
    presets.ts     ISS, Starlink, OneWeb, SSO
    link.ts        EIRP, FSPL, G/T, MODCOD, capacidad
  scene.ts          globo 3D, satélite, órbitas, haces, shader
  engine.ts         estado → órbita → patrón → haces → enlace
  charts.ts         mapa de fase y corte de patrón
  ui.ts             controles, métricas, guía y teoría
  main.ts           texturas, bucle y manejadores
  state.ts          estado y tipos
public/assets/      texturas de la Tierra
tests/              22 pruebas
docs/               teoría, despliegue y presentación
```

## Pruebas

```bash
npm test
```

22 pruebas cubren tiempo/GMST, órbita y J2, geometría del horizonte, base de antena, arreglo/fase/taper, síntesis y presupuesto de enlace (VSAT, isotrópica, lluvia y ancho de banda).

## Despliegue

El repositorio publica en GitHub Pages con `.github/workflows/deploy.yml`: instala, prueba, compila y despliega en cada push a `main`. Guía completa, dominio propio y solución de problemas: **[docs/deploy.md](docs/deploy.md)**.

## Documentación

- **[Teoría y ecuaciones](docs/teoria.md)**
- **[Despliegue](docs/deploy.md)**
- **[Guion de exposición](docs/presentacion/guion.md)** · **[PDF](docs/presentacion/guion-beamlab-leo.pdf)** · **[Checklist](docs/presentacion/checklist.md)**
- **[Registro de cambios](CHANGELOG.md)** · **[Citación](CITATION.cff)**

## Limitaciones

Modelo docente, no certificado:

- Tierra esférica, sin elipsoide WGS-84 ni geoide.
- Arreglo ideal: sin acoplamiento mutuo, cuantización de fase/amplitud, fallos de elementos ni errores de calibración.
- Sin interferencia co-canal ni C/I por reutilización; la cobertura celular se limita a 2.500 celdas y muestra la fracción cubierta.
- Sin uplink, feeder link ni handover entre satélites.
- La lluvia es un margen seleccionable, no un modelo de disponibilidad.
- El haz conformado es estático y se calcula para una posición orbital concreta.

## Autor

**Jhorel Cornejo** — elaborado para el curso de Comunicaciones Móviles y Satelitales.

## Licencia

MIT. Ver [LICENSE](LICENSE).
