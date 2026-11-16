# Tauri: escritorio sin Chromium

**Versión:** 2.3.1  
**Objetivo:** Windows, Ubuntu y macOS Apple Silicon sin empaquetar Chromium.

## 1. Decisión

Se eligió **Tauri 2** porque:

- Usa el webview del sistema, no Chromium completo.
- Produce binarios pequeños.
- Permite ventana nativa, icono, instalador y DMG.
- El frontend sigue siendo el mismo Vite/Three.js.

No se elige Electron: funciona, pero pesa 100–340 MB y el usuario pidió evitar Chromium embebido.

## 2. Plataformas

| Plataforma | Target | Formato |
|---|---|---|
| Windows | `x86_64-pc-windows-msvc` | NSIS `.exe` + `.exe` |
| Ubuntu | `x86_64-unknown-linux-gnu` | `.deb` + `.AppImage` |
| macOS Apple Silicon | `aarch64-apple-darwin` | `.dmg` |

No se soporta macOS Intel por ahora; el binario se compila para `aarch64-apple-darwin` con target cruzado desde un runner macOS.

## 3. Webview por sistema

- **Windows:** WebView2 (Edge).
- **macOS:** WKWebView (Safari).
- **Ubuntu:** WebKitGTK 4.1.

Consecuencia: el render WebGL puede variar entre plataformas. Hay que probar la escena en Ubuntu y macOS, no solo en Windows.

## 4. Requisitos de build

### Windows

- Rust (rustup).
- Visual Studio Build Tools con MSVC y Windows SDK.
- WebView2 (Windows 10/11 lo trae).

### Ubuntu 22.04+

```bash
sudo apt update
sudo apt install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

### macOS Apple Silicon

- Xcode Command Line Tools.
- Rust con target `aarch64-apple-darwin`.

## 5. Comandos

```bash
npm install
npm run tauri:dev          # desarrollo
npm run tauri:build:win    # NSIS + exe
npm run tauri:build:linux  # deb + AppImage
npm run tauri:build:mac    # dmg Apple Silicon
```

Los artefactos quedan en `src-tauri/target/<target>/release/bundle/`.

## 6. CI

`.github/workflows/desktop.yml` compila en:

- `ubuntu-22.04` → `.deb` y `.AppImage`.
- `macos-latest` → `.dmg` ARM64 (target cruzado).
- `windows-latest` → NSIS y `.exe`.

Se dispara con un tag `v*` o manualmente. Los artefactos se descargan desde GitHub Actions y, en el tag, se publican en **GitHub Releases**.

Artefactos de v2.3.1:

- Windows: `beamlab-leo.exe` (directo) y `BeamLab.LEO_2.3.1_x64-setup.exe` (NSIS).
- Ubuntu: `BeamLab.LEO_2.3.1_amd64.deb` y `.AppImage`.
- macOS Apple Silicon: `BeamLab.LEO_2.3.1_aarch64.dmg`.

**No están firmados.** macOS mostrará “desarrollador no identificado”; se abre con clic derecho → Abrir. Windows puede mostrar SmartScreen. No se paga Apple Developer ni certificado Windows.

## 7. Actualizaciones

La app consulta `versions.json` y muestra un panel:

- Continuar con la versión actual.
- No avisar por esa versión.
- Ver versiones.

No hay auto-reemplazo silencioso. El panel es informativo y opcional.

La actualización en sitio se hace instalando la versión nueva sobre la anterior:

- Windows: el instalador NSIS reemplaza la app.
- Ubuntu: el `.deb` actualiza el paquete.
- macOS: el `.dmg` reemplaza la app en Aplicaciones.
- AppImage/EXE directo: se descarga el archivo nuevo y se reemplaza manualmente.

No se instalan dos versiones en paralelo. Para reproducir una práctica antigua, la muestra guarda versión/configuración y el release histórico queda descargable.

### Desinstalación

- **Windows instalador:** Configuración → Aplicaciones → BeamLab LEO → Desinstalar, o `uninstall.exe` en la carpeta de instalación.
- **Windows portable:** borrar el `.exe`.
- **Ubuntu .deb:** `sudo apt remove beamlab-leo`.
- **Ubuntu AppImage:** borrar el archivo.
- **macOS:** arrastrar `BeamLab LEO.app` a la Papelera.

El instalador NSIS de Tauri incluye el desinstalador. El EXE portable no instala nada y no deja desinstalador.

En una fase posterior se puede integrar el updater de Tauri con firma minisign (gratuita) para descargar e instalar automáticamente, conservando un rollback. No se implementa todavía.

## 8. Limitaciones actuales

- El build Tauri se valida en CI; este entorno de desarrollo no tiene Rust/MSVC.
- macOS solo ARM64.
- Linux solo Ubuntu 22.04+ (WebKitGTK 4.1).
- Sin firma ni notarización.
- Descargas de la ficha/CSV dentro de Tauri: la web usa descargas del navegador; si WebView2 no las permite, se añadirá el plugin de diálogo/FS en la siguiente iteración.
- No hay updater nativo todavía: el panel enlaza a la página de versiones.

## 9. Estructura

```text
src-tauri/
  Cargo.toml
  tauri.conf.json
  capabilities/default.json
  icons/
  src/main.rs
  src/lib.rs
```

- `frontendDist`: `../dist`.
- `devUrl`: `http://127.0.0.1:5173`.
- CSP permite el manifiesto de versiones en GitHub Pages.
- Ventana 1600×950, mínima 1100×700.
