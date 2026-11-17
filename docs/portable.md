# BeamLab LEO portable y actualizaciones por versiones

**Fecha:** 2026-11-15  
**Actualización 2.3:** la vía principal de escritorio es **Tauri** ([tauri.md](tauri.md)). El HTML autónomo y el ZIP quedan como respaldo universal y para equipos sin instalación; el ZIP no es la entrega principal.

**Objetivo:** distribuir la app sin Google Play, sin App Store y sin instalador.

---

## 1. Decisión

Para el aula y para compartir por USB/Drive no hacen falta tiendas.

Se entregan tres formatos:

| Formato | Tamaño | Requisitos | Uso |
|---|---:|---|---|
| **HTML autónomo** | ~4,4 MB | Navegador moderno | Windows, macOS, Linux, Android, iPhone |
| **Launcher `.exe`** | ~48 KB | Edge/Chrome instalado | Un doble clic en Windows |
| **ZIP portable** | ~9,2 MB | Descomprimir | Paquete completo con launcher, versiones y actualizador |

El HTML lleva **todo dentro**: JavaScript, CSS, texturas y fuentes. No necesita servidor, Node, Python ni internet.

Descargas:

- App: <https://gcrownv-glitch.github.io/beamlab-leo/BeamLabLEO-2.3.4.html>
- ZIP con launcher: <https://gcrownv-glitch.github.io/beamlab-leo/BeamLabLEO-2.3.4-portable.zip>
- Selector: <https://gcrownv-glitch.github.io/beamlab-leo/versiones.html>

El `.exe` **no es un navegador embebido**: es un lanzador mínimo que abre el HTML con Edge en modo app (`--app=...`). Si no encuentra Edge, prueba Chrome y, si tampoco, abre el navegador predeterminado. No instala nada.

---

## 2. Lo que ya está probado

- HTML autónomo abierto desde `file://` con Edge headless: `window.__beamlab` activo, canvas 1600×1000, texturas cargadas, **sin errores**.
- Tamaño: **4.564.387 bytes**.
- ZIP: **9.244.154 bytes** (incluye 2.1.0, 2.2.0 y 2.3.4).
- Launcher: **48 KB**, compilado con .NET Framework 4.8 (`csc`), sin runtime extra.
- 30 pruebas de la app pasan.
- El HTML funciona sin conexión después de descargarlo.

**No se pudo verificar visualmente el `.exe` dentro del entorno de desarrollo** porque la sesión no tiene escritorio interactivo; el launcher es un `Process.Start` de Edge en modo app. En un Windows normal con Edge debe abrir. Si falla, el HTML se abre igual con doble clic.

---

## 3. Estructura del paquete

```text
BeamLabLEO-portable/
  BeamLabLEO.exe              ← launcher opcional
  index.html                  ← selector de versiones
  BeamLabLEO-2.3.4.html       ← app completa
  BeamLabLEO-2.1.1.html       ← versión futura, se conserva
  Actualizar.cmd              ← buscar/descargar otra versión
  Actualizar.ps1
  LEEME.txt
  versions.json               ← manifiesto local
```

El launcher abre `index.html`; allí el usuario elige la versión. Cada versión es un archivo independiente: **actualizar no borra la anterior**.

---

## 4. Actualización remota sin backend

No hay servidor propio. Se usa GitHub Pages + un manifiesto JSON.

### Manifest

`https://gcrownv-glitch.github.io/beamlab-leo/versions.json`

```json
{
  "schema": 1,
  "latest": "2.3.4",
  "versions": [
    {
      "version": "2.3.4",
      "date": "2026-11-15",
      "notes": "Enlace bidireccional, cuantización y guía de 10 pasos.",
      "html": "https://gcrownv-glitch.github.io/beamlab-leo/BeamLabLEO-2.3.4.html",
      "size": 3574637,
      "sha256": "..."
    }
  ]
}
```

### Actualizador

`Actualizar.cmd`:

1. Descarga el manifiesto por HTTPS.
2. Lista versiones.
3. El usuario elige una.
4. Descarga el HTML a la carpeta.
5. Verifica **SHA-256**.
6. Lo abre.
7. **No elimina ninguna versión existente.**

No hay actualización silenciosa: el usuario decide cuándo y qué versión.

### Página de versiones

`https://gcrownv-glitch.github.io/beamlab-leo/versiones.html`

Muestra versiones, tamaño, notas, SHA-256 y descarga directa.

---

## 5. Publicar una versión nueva

1. Subir `version` en `package.json`.
2. `npm run build:portable`.
3. El script genera:
   - `release/portable/BeamLabLEO-<versión>.html`
   - `docs/portable/BeamLabLEO-<versión>.html` (archivo histórico)
   - `docs/portable/versions.json` (fusiona versiones)
4. Hacer commit de `docs/portable/` y `package.json`.
5. Push a `main`.
6. GitHub Pages publica el HTML y el manifiesto.
7. Los usuarios ejecutan `Actualizar.cmd` y eligen la versión.

El workflow `deploy.yml` copia `docs/portable/*.html`, `versions.json` y los scripts del actualizador al sitio.

---

## 6. Ventajas y límites

### Ventajas

- **Cero costo de tiendas.**
- **Cero instalación.**
- **Cero backend.**
- Funciona en Windows, macOS, Linux y móvil con navegador.
- Versiones anteriores conservadas.
- Actualización por HTTPS con checksum.
- No requiere admin.
- El HTML se puede enviar por USB, Drive, WhatsApp o correo.

### Límites

- El `.exe` no es un binario independiente: usa Edge/Chrome.
- Sin firma de código, Windows puede mostrar SmartScreen al abrir el `.exe`; el HTML no tiene ese problema.
- No hay actualización automática en segundo plano; el usuario ejecuta el actualizador.
- Las versiones online nuevas se publican en Pages; las antiguas quedan en el repositorio.
- En iOS no se puede distribuir un `.exe` ni una app nativa gratis a terceros; la ruta gratis es **Safari → Añadir a pantalla de inicio** con el HTML/PWA.
- En Android se puede compartir el HTML o un APK directo; Google Play es opcional.

---

## 7. Qué pasa con Android/iOS sin pagar

| Plataforma | Ruta gratis | Ruta con tienda |
|---|---|---|
| Windows | HTML o ZIP portable | No aplica |
| Android | HTML o APK directo | Google Play 25 USD |
| iOS | HTML/PWA en Safari | Apple 99 USD/año + Mac |

Para iPhone, la opción realista sin pagar es la **PWA**: se abre la URL en Safari, “Compartir → Añadir a pantalla de inicio”. No es App Store, pero funciona offline si se cachea.

---

## 8. Comandos

```bash
# HTML + launcher + ZIP local
npm run build:portable

# Solo web normal
npm run build
```

Salida:

```text
release/portable/BeamLabLEO-<versión>.html
release/portable/BeamLabLEO.exe
release/portable/index.html
release/portable/Actualizar.cmd
release/portable/versions.json
release/BeamLabLEO-<versión>-portable.zip
```

El ZIP no se versiona en git; se comparte aparte. El HTML histórico sí se versiona para que Pages conserve las versiones.

---

## 9. Recomendación

Para la clase:

1. Compartir el **HTML** o el **ZIP**.
2. Usar el **launcher** solo si quieren un acceso directo.
3. Mantener la web como respaldo.
4. Actualizar con `Actualizar.cmd` cuando haya una versión nueva.

No pagar tiendas por ahora. Si más adelante quieren Android en Play o iOS en App Store, se evalúa el costo y el valor.
