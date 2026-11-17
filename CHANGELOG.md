# Changelog

Todas las modificaciones relevantes de BeamLab LEO.

## [2.3.1] — 2026-11-16

Esta versión corrige problemas que aparecieron al probar la app fuera del navegador.

- El pinch del trackpad en Tauri ya no hace zoom de página: acerca la cámara.
- Tauri arranca con calidad media, 45 FPS y un pixel ratio menor. La primera vez migra la configuración anterior; después se puede subir la calidad a mano.
- La cobertura celular se recorta a la región y la conformada al círculo de diseño. Antes el color se extendía fuera de la huella.
- La ficha PNG/PDF toma la configuración actual y crea una muestra si no existe. Al terminar avisa la ruta y abre el archivo.
- En Tauri, PNG, PDF, CSV y JSON pasan por el diálogo nativo de guardado.
- La página de versiones separa instalador, portable, AppImage, .deb y .dmg, e indica cómo desinstalar cada uno.
- 33 pruebas.

## [2.3.0] — 2026-11-16

Añadí el laboratorio y el empaquetado de escritorio.

- Tauri 2 para Windows, Ubuntu (deb/AppImage) y macOS Apple Silicon (dmg), sin Chromium embebido.
- Ficha de laboratorio compuesta: escena, paneles y metadatos en PNG o PDF.
- Sesiones locales con título, curso, autor, notas y muestras de configuración.
- Exportación CSV y JSON, carga de sesión y respaldo.
- Panel de nueva versión no bloqueante: continuar, no avisar o ver versiones.
- Workflow de escritorio para Linux, macOS ARM y Windows.
- 30 pruebas; el empaquetado Tauri se valida en CI.

## [2.2.0] — 2026-11-15

- HTML autónomo de ~4,4 MB, sin servidor ni instalación, con texturas, CSS, JS y fuentes embebidas.
- Launcher `.exe` de ~48 KB que abre la versión elegida con Edge o Chrome en modo app.
- ZIP portable con app, launcher, selector de versiones y actualizador.
- Actualizador `Actualizar.cmd` por HTTPS con verificación SHA-256.
- Manifiesto `versions.json`, página `/versiones.html` y archivo histórico de versiones.
- Sin Google Play ni App Store; iOS queda cubierto por HTML/PWA.
- 30 pruebas de la app; el empaquetado se valida aparte.

## [2.1.0] — 2026-11-14

### Enlace bidireccional

- **Bajada:** satélite → VSAT, 12 GHz Ku (20 GHz K), potencia de satélite y G/T del terminal.
- **Subida:** VSAT → satélite, 14 GHz Ku (30 GHz K), potencia del terminal y G/T del satélite.
- Selector de dirección, potencia de terminal (1–20 W) y balance DL/UL.
- Capacidad de sistema limitada por `min(bajada, subida)` y aviso de qué lado limita.
- Frecuencias emparejadas y ganancia de apertura fija; modelo declarado sin duplexores.
- Guía, tour de 10 pasos, ayuda y PDF actualizados.
- **26 pruebas** (4 nuevas de enlace bidireccional).

## [2.0.0] — 2026-11-12

### Cuantización y patrones exactos

- Desfasadores digitales de 3–7 bits y VGA de 3–5 bits (o taper fijo).
- Errores residuales gaussianos de fase y amplitud, deterministas por semilla.
- Patrón exacto del haz activo calculado desde los pesos cuantizados.
- Corte exacto directo (481 puntos) para HPBW/SLL, sin artefactos de interpolación 2D.
- Modo **Tiempo real**: patrón 2D 65×65 y corte exacto a ~4 Hz.
- Modo **Análisis**: patrón 257×257 bajo demanda.
- Comparación ideal vs cuantizado, ΔG/ΔSLL, error de apuntamiento y tiempo de cálculo.
- Comparación visual en el corte del patrón.
- Cuantización aplicada también a la síntesis conformada, con cobertura/derrame recalculados.
- **26 pruebas** (4 nuevas de cuantización).

## [1.1.1] — 2026-11-12

- Créditos con nombre completo: **Jhorel Kennedy Cornejo Cruz · IET UCSP**.
- El nombre enlaza al perfil de GitHub <https://github.com/gcrownv-glitch>.
- Actualización de README, LICENSE, package.json, CITATION.cff y PDF.
- Nuevo informe de auditoría técnica y de producto en [`docs/auditoria.md`](docs/auditoria.md).
- Sin cambios de comportamiento en el motor.

## [1.1.0] — 2026-11-12

### Enlace

- Terminal de usuario realista por defecto: VSAT 0.6 m, 34 dBi, NF 1.5 dB.
- Presupuesto con atmósfera, margen de lluvia, temperatura de sistema y G/T.
- Selección de MODCOD DVB-S2X con umbral y estado de outage; se elimina el Shannon con 10 dB fijos.
- Capacidad por haz, por usuario y agregada del sistema; potencia RF total y espectro.
- Selector de terminal, ancho de canal, lluvia y usuarios por haz.
- Estado “sin enlace” cuando no hay haz activo.
- Medidor basado en margen al umbral, no en C/N₀ crudo.

### Geometría y cobertura

- Corrección del disco visible: 2.560 km de radio y 5.100 km de diámetro a 550 km.
- Base de antena con +X al este y +Z al nadir.
- Celdas hasta 2.500, fracción de cobertura y aviso de potencia RF.
- Selección de celda en modo celular y enlace de la celda elegida.
- Síntesis conformada muestreada sobre la superficie terrestre.
- Tiempo congelado en conformada para evitar que el haz se despegue de la zona.
- Reinicio de la síntesis al cambiar órbita, tiempo, frecuencia o geometría.

### Interfaz y documentación

- Créditos “Elaborado por Jhorel Cornejo” en la interfaz, el README y el PDF.
- Panel de enlace ampliado: C/N, MODCOD, margen, G/T, elevación, oblicua y sistema.
- README reescrito como documentación de proyecto.
- Guía, teoría, checklist y PDF actualizados con los números corregidos.
- 22 pruebas (antes 16).

## [1.0.0] — 2026-11-10

- Versión inicial: órbita LEO, arreglo en fase, cobertura global/puntual/celular/conformada, enlace, 3D y despliegue en GitHub Pages.
