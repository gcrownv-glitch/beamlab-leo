# Publicar BeamLab LEO en internet

La app es **100 % estática**: `npm run build` genera una carpeta `dist/` con HTML, JS, CSS, texturas y fuentes. No hay backend ni base de datos, así que se puede servir desde cualquier hosting estático.

Hay dos piezas que conviene separar:

1. **Hosting**: el servidor que entrega los archivos (`dist/`).
2. **DNS**: el nombre (“beamlab.tudominio.com”) que apunta a ese hosting.

No necesitas comprar nada para empezar: Netlify, GitHub Pages y Vercel te dan un **subdominio gratis**. El dominio propio se compra aparte y se conecta después con registros DNS.

---

## Opciones

| Opción | URL que obtienes | Costo | Tiempo | Cuándo usarla |
|---|---|---|---|---|
| **Netlify Drop** | `beamlab-leo.netlify.app` | Gratis | ~5 min | Si la clase es pronto y no quieres tocar Git. |
| **GitHub Pages** | `tu-usuario.github.io/beamlab-leo` | Gratis | ~10 min | Recomendada: ya tienes el repo y se actualiza con `git push`. |
| **Vercel** | `beamlab-leo.vercel.app` | Gratis | ~10 min | Si prefieres un panel sencillo y dominio propio fácil. |
| **Cloudflare Pages** | `beamlab-leo.pages.dev` | Gratis | ~10 min | Si ya usas Cloudflare para tu dominio. |
| **Dominio propio** | `beamlab.tudominio.com` | ~US$ 10–15/año | +20 min | Cuando quieras un nombre memorable para la exposición. |
| **VPS con nginx** | Tu dominio | ~US$ 5/mes | +1 h | Solo si necesitas control total o backend. |

**Recomendación:** empieza con **Netlify Drop** si quieres el enlace hoy, o con **GitHub Pages** si quieres que el repositorio y la web vivan juntos. El dominio propio lo agregas cuando la URL gratuita ya funcione.

---

## 1. Construir la carpeta `dist`

En `D:\Satelitales`:

```bash
npm ci
npm test
npm run build
```

Se genera `dist/`. Esa carpeta es la que se publica, **no** el repositorio completo. Debe contener:

```text
dist/
  index.html
  assets/            ← JS, CSS, fuentes de KaTeX
  assets/earth_day.jpg
  assets/earth_specular.jpg
  assets/earth_clouds.png
  favicon.svg
  site.webmanifest
  robots.txt
```

> `vite.config.ts` usa `base: './'`. Eso hace que los archivos se referencien de forma relativa y funcionen tanto en la raíz (`https://beamlab.com/`) como en un subdirectorio (`https://usuario.github.io/beamlab-leo/`). No cambies `base` a `/` si vas a usar GitHub Pages de proyecto.

---

## 2. Netlify Drop (la vía más rápida)

1. Ejecuta `npm run build`.
2. Abre <https://app.netlify.com/drop>.
3. Arrastra la carpeta **`dist`** (no el repo, no un ZIP con todo el proyecto).
4. Netlify te da una URL tipo `https://random-name-123.netlify.app`.
5. Crea una cuenta gratuita para conservar el sitio.
6. En **Site configuration → Change site name**, pon `beamlab-leo`.
   - Queda `https://beamlab-leo.netlify.app`.
7. Para actualizar: vuelve a arrastrar un `dist` nuevo, o conecta el repositorio de GitHub (Netlify detecta `netlify.toml` y reconstruye en cada push).

**Ventaja:** no necesitas Git ni dominio. **Limitación:** si no creas cuenta, el sitio es temporal.

---

## 3. GitHub Pages (recomendada)

Ya tienes el repositorio local con la rama `main`. Falta crear el repositorio remoto y subirlo.

### 3.1 Crear el repositorio

En GitHub: **New repository** → nombre `beamlab-leo` → **Public** → *no* marques “Add a README”, “.gitignore” ni “license” (el repo local ya los tiene).

### 3.2 Subir el proyecto

```bash
cd D:\Satelitales
git remote add origin https://github.com/TU_USUARIO/beamlab-leo.git
git branch -M main
git push -u origin main
```

Si ya existe un `origin`, cámbialo con:

```bash
git remote set-url origin https://github.com/TU_USUARIO/beamlab-leo.git
```

### 3.3 Activar Pages

En el repositorio: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

El workflow ya está en `.github/workflows/deploy.yml`. En cada push a `main`:

1. Instala dependencias con `npm ci`.
2. Corre `npm test` (16 pruebas).
3. Compila con `npm run build`.
4. Publica `dist` como artifact de Pages.
5. Despliega.

Puedes seguir el progreso en la pestaña **Actions**. La primera ejecución tarda 1–3 minutos.

### 3.4 URL

```text
https://TU_USUARIO.github.io/beamlab-leo/
```

Si el repositorio se llama `TU_USUARIO.github.io`, la URL es la raíz `https://TU_USUARIO.github.io/`.

### 3.5 Actualizar

```bash
git add .
git commit -m "mi cambio"
git push
```

GitHub Actions reconstruye y publica solo. Si una prueba falla, no se despliega: revisa el log de Actions.

### 3.6 Si sale 404

- **Settings → Pages** debe decir **Source: GitHub Actions**.
- El repositorio debe ser público (Pages gratis en cuentas personales).
- Espera 1–2 minutos después del primer deploy.
- Revisa que la URL incluya `/beamlab-leo/` si el repo no es `usuario.github.io`.
- En **Actions**, el job `deploy` debe estar en verde.

---

## 4. Vercel (alternativa)

1. Entra a <https://vercel.com/new> e importa el repositorio de GitHub.
2. Vercel detecta Vite. Confirma:
   - **Build command:** `npm run build`
   - **Output directory:** `dist`
   - **Node:** 22
3. Deploy. Obtienes `https://beamlab-leo.vercel.app`.
4. Cada push a `main` redepliega.
5. Dominio propio: **Settings → Domains → Add**, y sigue los registros que te muestre.

El archivo `vercel.json` ya define build, salida y cabeceras de seguridad.

### Cloudflare Pages (si prefieres Cloudflare)

1. **Workers & Pages → Create → Pages → Connect to Git**.
2. Build command: `npm run build`; output: `dist`; variable `NODE_VERSION=22`.
3. URL `https://beamlab-leo.pages.dev`.
4. Custom domain: **Custom domains → Set up a domain**.

---

## 5. Dominio propio y DNS

### 5.1 Qué es cada cosa

- **Registrador:** donde compras el dominio (Cloudflare Registrar, Namecheap, Porkbun, GoDaddy; para `.pe`, un registrador local).
- **Zona DNS:** la tabla de registros del dominio.
- **Registro A:** nombre → dirección IPv4.
- **Registro AAAA:** nombre → IPv6.
- **Registro CNAME:** nombre → otro nombre (alias).
- **TTL:** cuánto tiempo pueden cachear los resolvedores. 300–3600 s es normal.
- **HTTPS:** el hosting emite el certificado (Let's Encrypt) automáticamente; no lo compras aparte.

Un dominio `.com` cuesta ~US$ 10–15 al año. Un `.pe` suele ser más caro y requiere registrador local. Para la clase, un subdominio gratis es suficiente; el dominio propio es un extra.

### 5.2 GitHub Pages + dominio propio

Supongamos `beamlab.tudominio.com`.

**En el DNS del registrador:**

| Tipo | Nombre | Valor | TTL |
|---|---|---|---|
| CNAME | `www` | `TU_USUARIO.github.io` | 3600 |
| A | `@` | `185.199.108.153` | 3600 |
| A | `@` | `185.199.109.153` | 3600 |
| A | `@` | `185.199.110.153` | 3600 |
| A | `@` | `185.199.111.153` | 3600 |

- `www` es el subdominio; `@` es el dominio raíz.
- GitHub recomienda usar `www` y redirigir el apex; puedes hacerlo desde el registrador o con GitHub Pages.

**En el repositorio:**

1. **Settings → Pages → Custom domain**: escribe `www.tudominio.com` y guarda.
2. Espera la verificación DNS (minutos a horas).
3. Activa **Enforce HTTPS**.
4. GitHub crea/actualiza un archivo `CNAME` en la rama de Pages. Si usas el workflow de Actions, conviene tenerlo en `public/CNAME` para que viaje en el artifact:

```bash
echo "www.tudominio.com" > public/CNAME
npm run build
git add public/CNAME
git commit -m "chore: custom domain"
git push
```

**Comprobar DNS:**

```powershell
nslookup www.tudominio.com
nslookup tudominio.com
```

Debe aparecer `TU_USUARIO.github.io` o las IPs de GitHub. La propagación puede tardar; baja el TTL antes si planeas cambios.

### 5.3 Netlify + dominio propio

1. **Domain management → Add a domain** → escribe tu dominio.
2. Dos caminos:
   - **Netlify DNS (recomendado):** cambia los *nameservers* del dominio en el registrador por los que te da Netlify. Netlify gestiona todos los registros.
   - **DNS externo:** crea un `CNAME` para `www` apuntando a `beamlab-leo.netlify.app`. Para el apex, usa el registro A que indique el panel de Netlify (no copies una IP de un blog; puede cambiar).
3. Activa **HTTPS** (Let's Encrypt) y **Force HTTPS**.

### 5.4 Vercel + dominio propio

1. **Settings → Domains → Add**.
2. Para `www`, crea un `CNAME` hacia `cname.vercel-dns.com`.
3. Para el apex, Vercel te muestra el registro A a usar; cópialo del panel.
4. Verifica y espera el certificado.

### 5.5 Reglas prácticas

- No cambies nameservers y registros A al mismo tiempo; hazlo en dos pasos y espera.
- Antes de una exposición, prueba el dominio en **modo incógnito** y desde otro dispositivo/red.
- Si el dominio carga sin HTTPS, espera la emisión del certificado y revisa que el DNS ya resuelva.
- El `CNAME` solo se usa en subdominios; el apex necesita A/AAAA o un proveedor con ALIAS/ANAME.

---

## 6. Sin internet: red local (plan B para clase)

Si el aula no tiene internet pero hay un router:

```bash
npm run dev -- --host 0.0.0.0
```

Vite imprime una línea **Network** con algo como `http://192.168.1.23:5173/`. Abre esa URL desde el celular u otra laptop conectada al mismo Wi-Fi. Permite el acceso en el Firewall de Windows para redes privadas.

Para probar la versión de producción en la red local:

```bash
npm run build
npm run preview:lan
```

No es un dominio público: solo funciona dentro de la misma red. Para la exposición suele ser suficiente y no depende de la nube.

---

## 7. Actualizar el sitio

| Hosting | Cómo actualizar |
|---|---|
| Netlify Drop | Arrastra un `dist` nuevo. |
| Netlify conectado a Git | `git push`; Netlify reconstruye. |
| GitHub Pages | `git push`; el workflow reconstruye y despliega. |
| Vercel | `git push`; despliegue automático. |
| Cloudflare Pages | `git push`; despliegue automático. |

Después de actualizar, recarga con `Ctrl + F5` para evitar caché del navegador.

---

## 8. Problemas frecuentes

| Síntoma | Causa probable | Solución |
|---|---|---|
| Página en blanco | Error de JS o assets 404 | Abre DevTools → Console/Network. Verifica que publicaste `dist`, no la raíz del repo. |
| 404 en `/assets/...` | `base` mal configurado | Deja `base: './'` en `vite.config.ts`; reconstruye. |
| 404 en GitHub Pages | Pages no está en “GitHub Actions” o el repo es privado | Settings → Pages; repo público; revisa Actions. |
| El dominio no carga | DNS sin propagar o registros mal | `nslookup`; espera; revisa CNAME/A en el panel del hosting. |
| “Not secure” en el dominio | Certificado aún no emitido | Espera; verifica el dominio en el hosting; activa Enforce HTTPS. |
| Texturas no cargan | Falta `public/assets` en el build | `npm run build`; revisa `dist/assets/earth_day.jpg`. |
| Se ve lento | GPU/CPU limitada | FPS máx. 30, Calidad Baja, arreglo 4×4/8×8, desactiva Ganancia. |
| `npm ci` falla en CI | Versión de Node o lockfile | Usa Node 22 (`.nvmrc`), commit de `package-lock.json`. |

> **No abras `dist/index.html` con doble clic (`file://`)**: los módulos y texturas necesitan HTTP. Usa `npm run preview` o un hosting.

---

## 9. Costos y seguridad

- **Hosting estático gratis** en Netlify, GitHub Pages, Vercel y Cloudflare Pages para un proyecto de clase.
- **Dominio:** único costo recurrente (~US$ 10–15/año en `.com`).
- **HTTPS:** incluido por el hosting.
- **Datos:** la app no envía nada a un servidor. FPS y calidad se guardan en `localStorage` del navegador, por origen. No hay secretos ni API keys.
- **Repositorio:** si lo haces público, cualquiera puede ver el código; no hay credenciales dentro.

---

## 10. Checklist de publicación

- [ ] `npm test` pasa (16/16).
- [ ] `npm run build` termina sin errores.
- [ ] `dist/` incluye `assets/earth_day.jpg`, `assets/earth_specular.jpg`, `assets/earth_clouds.png`.
- [ ] El sitio carga en una ventana de incógnito.
- [ ] El globo 3D, la guía y la síntesis funcionan en la URL publicada.
- [ ] Si hay dominio propio: DNS resuelve, HTTPS activo y `www` redirige.
- [ ] URL compartida con el profesor/compañeros.

Con esto puedes pasar de `http://localhost:5173` a `https://beamlab-leo.netlify.app` o `https://tu-usuario.github.io/beamlab-leo/` sin tocar el código.
