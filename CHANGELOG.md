# Changelog

Todas las modificaciones relevantes de BeamLab LEO.

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
