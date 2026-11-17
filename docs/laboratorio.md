# Laboratorio y datos

El laboratorio nació de una pregunta práctica: si la simulación sirve para una clase, debería poder dejar registro de lo que se probó. Esta parte de la app guarda una sesión, toma muestras del estado actual y las exporta para el informe o para comparar configuraciones.

## Cómo se usa

1. Abre **Lab** en la barra superior.
2. Escribe un título, el curso y una observación. No son obligatorios, pero dentro de un semestre ayudan a saber qué se estaba probando.
3. Configura la simulación en los paneles de la app.
4. Pulsa **Tomar muestra**. Se guarda la hora UTC, la órbita, el arreglo, la cuantización, el enlace y la cobertura.
5. Exporta **Ficha PNG** o **Ficha PDF**. Si no habías tomado una muestra con esa configuración, la app la crea antes de exportar.
6. Usa **Guardar sesión** para bajar un JSON de respaldo y **Cargar** para recuperarlo en otra máquina.
7. **Nueva sesión** deja el laboratorio vacío.

La ficha reúne la escena, los paneles y los metadatos en una sola imagen. **Solo escena** exporta únicamente el render 3D, sin paneles.

## Sesión y muestra

Una **sesión** es el cuaderno de una práctica. Contiene título, curso, autor, notas, fecha, versión de la app y una lista de muestras.

Una **muestra** es una foto del estado en un instante:

- órbita: altitud, inclinación, RAAN, subpunto y velocidad;
- arreglo: número de elementos, separación, frecuencia, taper, q y eficiencia;
- cuantización: modo, bits de fase y amplitud, errores RMS y semilla;
- patrón: directividad, ganancia, HPBW, SLL, apuntamiento;
- enlace: C/N0, C/N, MODCOD, margen, throughput y EIRP de bajada y subida;
- sistema: haces, potencia, espectro, capacidad, usuarios y cobertura;
- haz conformado: cobertura, derrame y directividad;
- notas y un hash de configuración.

El hash permite saber si dos muestras corresponden a la misma configuración, aunque se hayan tomado en momentos distintos.

## Dónde se guarda

La sesión se guarda en el almacenamiento local del navegador o de la app Tauri. No hay nube ni telemetría.

La web y la app Tauri tienen almacenamientos separados. Si tomas muestras en la web, no aparecen en el EXE, y viceversa. Para pasarlas de un lado a otro:

1. **Guardar sesión** en el origen.
2. Copiar el JSON.
3. **Cargar** en el destino.

Si el contador dice “0 muestras”, la sesión está nueva o vacía. No es un error.

## Formatos

### JSON

Es el respaldo completo. Sirve para recuperar la sesión, moverla entre equipos y conservar la configuración exacta. No incluye las imágenes de las fichas; esas se exportan aparte.

### CSV

Una fila por muestra. Se abre en Excel, LibreOffice, Origin, Python o R. Las columnas principales son:

```text
sample_id, timestamp, session_id, app_version, mode
target_lat, target_lon
orbit_alt_km, orbit_inc_deg, orbit_raan_deg, sub_lat_deg, sub_lon_deg, speed_km_s
array_n, array_dx, array_dy, array_freq_ghz, array_taper, array_q, array_eff
quant_mode, phase_bits, amp_bits, phase_rms_deg, amp_rms_db, seed
directivity_dbi, gain_dbi, hpbw_deg, sll_db, pointing_deg
dl_cn0, dl_cn, dl_modcod, dl_margin, dl_throughput, dl_eirp, dl_freq
ul_cn0, ul_cn, ul_modcod, ul_margin, ul_throughput, ul_eirp, ul_freq
limiting_link, beams, rf_power_w, spectrum_mhz, capacity_mbps, per_user_mbps
coverage, shaped_spill_db, notes, config_hash
```

El CSV no guarda imágenes ni jerarquía. Para eso está el JSON.

### Ficha

PNG o PDF. La ficha principal es compuesta; la escena sola se usa para diapositivas. En la web se descarga y se abre una vista previa; en Tauri se elige la carpeta con el diálogo del sistema y se abre el archivo al terminar.

## Para qué sirve la data

- Comparar 4×4 con 16×16, uniforme con Kaiser, 4 con 5 bits.
- Ver cómo cambia el SLL y el apuntamiento al cuantizar.
- Comparar bajada y subida, con y sin lluvia.
- Revisar qué enlace limita la capacidad.
- Preparar tablas y gráficas para el informe.
- Repetir una práctica con la misma configuración.
- Dejar un banco de laboratorio para las siguientes promociones.

No pretendo que estos datos sean una certificación. Son mediciones de un modelo docente, útiles para comparar y discutir.

## Lo que no hace

- No sincroniza entre usuarios ni entre web y Tauri.
- No guarda las capturas dentro del JSON.
- No reemplaza una base de datos de laboratorio; para decenas de muestras, JSON y CSV alcanzan.
- No incluye interferencia, handover ni propagación atmosférica completa.

Si el historial crece, el siguiente paso sería SQLite en Tauri e IndexedDB en web, con el mismo esquema lógico. Por ahora no hace falta.
