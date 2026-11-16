# Laboratorio y datos

**Versión:** 2.3.0  
**Estado:** implementado en la app web/Tauri; almacenamiento local.

## 1. Qué resuelve

La app permite crear una sesión de laboratorio, tomar muestras de la simulación y exportarlas para el informe. Cada muestra guarda la configuración y los resultados, de modo que la práctica se pueda reproducir y comparar.

Casos de uso:

- Comparar 4×4 vs 16×16, taper, separación y frecuencia.
- Medir el efecto de cuantización (bits, errores residuales, semilla).
- Comparar bajada/subida, lluvia, potencia del terminal y MODCOD.
- Comparar modos puntual, celular y conformado.
- Generar tablas/gráficas para el informe.
- Crear un banco de prácticas para las siguientes promociones.

## 2. Sesión

Campos:

- `title`, `course`, `author`, `notes`.
- `createdAt`, `updatedAt`.
- `appVersion`.
- `id`.
- `samples[]`.

La sesión se guarda en `localStorage` (`beamlab:lab:session:v1`). Para respaldarla se exporta como JSON.

## 3. Muestra

Cada muestra incluye:

- Timestamp UTC e ID.
- Modo y objetivo.
- Órbita: altitud, inclinación, RAAN, subpunto, velocidad.
- Arreglo: N, dx/dy, frecuencia, taper, q, eficiencia.
- Cuantización: modo, bits, RMS, semilla.
- Patrón: D, G, HPBW, SLL, apuntamiento y nota.
- Enlace DL/UL: C/N0, C/N, MODCOD, margen, throughput, EIRP, frecuencia.
- Sistema: haces, RF, espectro, capacidad, usuarios, cobertura.
- Haz conformado: cobertura, derrame, D.
- Notas y hash de configuración.

## 4. CSV

Un archivo con una fila por muestra. Columnas principales:

```text
sample_id,timestamp,session_id,app_version,mode,target_lat,target_lon,
orbit_alt_km,orbit_inc_deg,orbit_raan_deg,sub_lat_deg,sub_lon_deg,speed_km_s,
array_n,array_dx,array_dy,array_freq_ghz,array_taper,array_q,array_eff,
quant_mode,phase_bits,amp_bits,phase_rms_deg,amp_rms_db,seed,
directivity_dbi,gain_dbi,hpbw_deg,sll_db,pointing_deg,
dl_cn0,dl_cn,dl_modcod,dl_margin,dl_throughput,dl_eirp,dl_freq,
ul_cn0,ul_cn,ul_modcod,ul_margin,ul_throughput,ul_eirp,ul_freq,
limiting_link,beams,rf_power_w,spectrum_mhz,capacity_mbps,per_user_mbps,
coverage,shaped_spill_db,notes,config_hash
```

Se abre directamente en Excel/LibreOffice, Python, Origin o R. Es el formato recomendado para el informe.

## 5. JSON

Guarda la sesión completa con todas las muestras y metadatos. Sirve para:

- Backup.
- Cargar la sesión en otra máquina.
- Reproducir una práctica.
- Migrar a SQLite en el futuro.

No incluye las capturas PNG; estas se exportan aparte con la ficha.

## 6. Ficha de laboratorio

Un solo PNG o PDF con:

- Escena 3D.
- Paneles de órbita, arreglo, cuantización, patrón, enlace y sistema.
- Metadatos de sesión, muestra, versión y UTC.

También se puede exportar **solo la escena** para diapositivas. La ficha compuesta es la opción principal para el informe.

## 7. Backup

- **Guardar sesión (JSON)**: respaldo completo de datos.
- **Exportar CSV**: datos tabulares.
- **Ficha PNG/PDF**: evidencia visual.
- **Cargar**: recupera un JSON.

El respaldo es local; no hay telemetría ni nube. Para llevarlo a otra máquina, copia el JSON y las fichas.

## 8. Base de datos: decisión actual

Para el alcance del curso, **JSON + CSV** es suficiente:

- No requiere servidor.
- Funciona en web y Tauri.
- Es portable y legible.
- No añade dependencias nativas.

Si el historial crece, el siguiente paso es **SQLite** en Tauri y **IndexedDB** en web, con el mismo esquema lógico. No se implementa ahora para no complicar el laboratorio.

## 9. Limitaciones

- localStorage puede llenarse con muchísimas muestras; para un laboratorio típico (decenas) es suficiente.
- Las capturas no se guardan dentro del JSON; se exportan aparte.
- No hay multiusuario ni sincronización.
- El CSV no conserva jerarquía; para eso está el JSON.
