# Changelog

Todas las modificaciones relevantes de BeamLab LEO.

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
