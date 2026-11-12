# Despliegue

BeamLab LEO es una aplicación **estática**: `npm run build` genera `dist/` con HTML, JS, CSS, texturas y fuentes. No necesita backend ni base de datos.

## Demo pública

- **Aplicación:** <https://gcrownv-glitch.github.io/beamlab-leo/>
- **Repositorio:** <https://github.com/gcrownv-glitch/beamlab-leo>
- **Workflow:** [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml)

Cada `push` a `main` instala dependencias, ejecuta las 22 pruebas, compila y publica en GitHub Pages.

## GitHub Pages

1. El repositorio debe ser **público** para usar Pages gratis en una cuenta personal.
2. En **Settings → Pages → Build and deployment**, selecciona **Source: GitHub Actions**.
3. El workflow se dispara con cada push a `main`.
4. La primera publicación tarda 1–3 minutos.

La URL queda como:

```text
https://TU_USUARIO.github.io/beamlab-leo/
```

## Desarrollo local

```bash
npm install
npm run dev
```

Abre `http://localhost:5173`. Para probar la versión de producción:

```bash
npm run build
npm run preview
```

La app necesita HTTP; no abras `dist/index.html` con `file://`, porque las texturas y el manifiesto no cargarían.

## Dominio propio

1. Compra el dominio en un registrador.
2. Para GitHub Pages, configura:

| Tipo | Nombre | Valor |
|---|---|---|
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |
| CNAME | `www` | `TU_USUARIO.github.io` |

3. Crea `public/CNAME` con el dominio:

```text
www.tudominio.com
```

4. En **Settings → Pages → Custom domain**, escribe el dominio y activa **Enforce HTTPS**.
5. Espera la propagación DNS (puede tardar hasta 24 h).

## Solución de problemas

| Síntoma | Causa probable | Solución |
|---|---|---|
| 404 en la raíz | Pages no está en “GitHub Actions” o el deploy falló | Revisar **Actions** y **Settings → Pages** |
| Texturas 404 | Se abrió con `file://` o falta `base` | Usar `npm run preview` o el sitio publicado |
| El workflow falla en `npm ci` | `package-lock.json` desincronizado | Ejecutar `npm install` y commitear el lock |
| La app va lenta | GPU integrada o resolución alta | **FPS máx. 30**, **Calidad Baja** |
| Pantalla en blanco | Error de JS | Abrir consola del navegador y revisar el primer error |

## Estructura del build

```text
dist/
  index.html
  assets/          JS, CSS, fuentes KaTeX y texturas de la Tierra
  favicon.svg
  site.webmanifest
  .nojekyll
```

La carpeta `dist/` no se versiona; se genera en CI.
