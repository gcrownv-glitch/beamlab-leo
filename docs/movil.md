# BeamLab LEO en web, Android e iOS

**Fecha:** 2026-11-14  
**Estado:** plan técnico, no implementado todavía  
**Objetivo:** que la misma app funcione en navegador, Android e iOS sin reescribir la simulación.

---

## 1. Punto de partida

BeamLab LEO ya es una **SPA de Vite + TypeScript + Three.js**:

- No tiene backend.
- Todo ocurre en el cliente: órbita, arreglo, síntesis, enlace y WebGL.
- Se publica como sitio estático en GitHub Pages.
- No usa APIs de Node en tiempo de ejecución.
- El PDF y la guía son documentos aparte, no parte de la app.

Eso la hace **casi ideal para un contenedor nativo**. No hay que reescribir la lógica en Kotlin/Swift: se conserva el mismo `dist/` y se envuelve.

---

## 2. Recomendación

**Web + PWA + Capacitor.**

| Opción | Reutiliza la app | Android | iOS | Esfuerzo | Veredicto |
|---|---|---:|---:|---:|---|
| **PWA** | 100 % | Instalable | Limitado | Bajo | Complemento, no reemplazo de tiendas |
| **Capacitor** | ~95 % | APK/AAB | Xcode | Medio | **Recomendado** |
| Tauri móvil | ~95 % | Sí | Sí | Medio-alto | Más pequeño, ecosistema menos maduro |
| React Native | 0 % | Sí | Sí | Muy alto | Reescribir UI/3D; no conviene |
| Flutter | 0 % | Sí | Sí | Muy alto | Reescribir todo; no conviene |

La ruta recomendada es:

1. **Web/PWA** para acceso inmediato y respaldo en clase.
2. **Capacitor Android** para APK de prueba y AAB para Google Play.
3. **Capacitor iOS** para TestFlight/App Store, compilado en macOS.

---

## 3. Lo que hay que adaptar antes de empaquetar

### 3.1 Responsive real

Hoy la app está pensada para escritorio 1600×900:

- Panel de órbita a la izquierda.
- Panel de antena a la derecha.
- Dock inferior con tres tarjetas.

En móvil hay que convertir eso en:

- **Landscape:** órbita y antena como drawers; dock en pestañas “Patrón / Enlace / Cobertura”.
- **Portrait:** escena arriba; panel inferior con pestañas; controles táctiles grandes.
- **Safe areas:** notch, barra de gestos y bordes redondeados.
- **Tipografía:** mínimo 11–12 px en móvil; el link card actual es demasiado denso incluso a 8–9 px.
- **Controles:** sliders con `touch-action: none` solo en la escena; botones ≥44 px.
- **Cámara:** arrastrar con un dedo, pinza para zoom, doble toque para reset.
- **Calidad automática:** detectar `devicePixelRatio`, memoria y FPS; bajar texturas/resolución en gama baja.

### 3.2 PWA

Añadir:

- `manifest.webmanifest` con nombre, iconos 192/512, `display: standalone`, tema.
- Service worker (por ejemplo `vite-plugin-pwa`) para cachear el bundle y arrancar sin red.
- Icono maskable y splash.
- Página de “sin conexión” o mensaje claro.

La app no necesita datos en vivo, así que el modo offline es viable casi al 100 %.

### 3.3 Activos externos

Revisar que texturas, fuentes y KaTeX estén **empaquetados**, no traídos de un CDN. Si algo viene de fuera, cachearlo o descargarlo en el build. En un APK/iOS no quieres depender de red para la primera pantalla.

### 3.4 Identidad

Definir antes de generar proyectos:

- **App ID:** por ejemplo `com.gcrownv.beamlab` o `com.jhorelc.beamlab`.
- **Nombre:** BeamLab LEO.
- **Icono:** 1024×1024, adaptable.
- **Splash:** fondo oscuro con el logo.
- **Versión:** empezar en `2.1.0` y subir con cada release.
- **Privacidad:** la app no recoge datos; aun así hace falta una política de privacidad para las tiendas.

---

## 4. Android

### 4.1 Requisitos en Windows

- Node.js y pnpm/npm (ya están).
- **Android Studio** con Android SDK.
- **JDK 17** (el que trae Android Studio suele servir).
- Un dispositivo Android o emulador.

### 4.2 Pasos

```bash
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init "BeamLab LEO" "com.gcrownv.beamlab" --web-dir=dist
npm run build
npx cap add android
npx cap sync android
npx cap open android
```

En Android Studio:

- `Build > Build Bundle(s) / APK(s) > Build APK(s)` para el APK de prueba.
- `Build > Generate Signed Bundle / APK` para el AAB de Google Play.

### 4.3 APK vs AAB

- **APK:** instalar directo, compartir por WhatsApp/Drive, probar en el aula.
- **AAB:** obligatorio para Google Play; la tienda genera los APK por dispositivo.

### 4.4 Google Play

- Cuenta de desarrollador: **25 USD pago único**.
- Ficha: descripción, capturas, icono, política de privacidad.
- **Data safety:** declarar que no se recogen datos (si es el caso).
- Revisión típica: horas o pocos días.
- La app no puede ser solo “una web envuelta”: conviene que tenga valor offline, pantalla completa, orientación, compartir, exportar captura, etc.

### 4.5 Firma

- Guardar el keystore **fuera del repositorio**.
- Variables de entorno o GitHub Secrets:
  - `ANDROID_KEYSTORE_BASE64`
  - `ANDROID_KEYSTORE_PASSWORD`
  - `ANDROID_KEY_ALIAS`
  - `ANDROID_KEY_PASSWORD`

---

## 5. iOS

### 5.1 Requisito duro: macOS

**No se puede compilar ni firmar una app iOS en Windows.** Se necesita:

- Un Mac (o un servicio macOS en la nube).
- **Xcode** actual.
- **Apple Developer Program:** 99 USD/año.
- Un dispositivo iPhone/iPad o TestFlight.

### 5.2 Pasos

```bash
npm install @capacitor/ios
npx cap add ios
npx cap sync ios
npx cap open ios
```

En Xcode:

- Configurar `Bundle Identifier`, equipo y firma automática.
- `Product > Archive`.
- Distribuir a **TestFlight** o **App Store Connect**.

### 5.3 Sin Mac físico

Opciones:

- **GitHub Actions macOS runner** (minutos gratuitos limitados en repos públicos; de pago en privados).
- **MacinCloud / MacStadium / AWS EC2 Mac** por horas.
- Un Mac mini de segunda mano puede ser más barato a mediano plazo.

El flujo de CI:

1. `npm ci`
2. `npm run build`
3. `npx cap sync ios`
4. `xcodebuild archive`
5. `xcrun altool`/`notarytool` o App Store Connect API key
6. Subida a TestFlight.

### 5.4 App Store

- Revisión más estricta que Google.
- Riesgo de rechazo por **4.2 Minimum Functionality** si la app parece solo una web.
- Mitigación: offline real, controles táctiles, guardar/exportar capturas, orientación, integración con compartir, sin dependencia de Safari.
- Privacy labels: declarar que no se recogen datos.
- Capturas para 6,7" y 12,9" (iPhone/iPad).
- TestFlight primero; App Store después.

---

## 6. Web

La web ya está publicada en:

**https://gcrownv-glitch.github.io/beamlab-leo/**

Ventajas:

- Actualización instantánea.
- Sin tiendas.
- Funciona en Windows, Linux, Mac, Android e iOS.
- Se puede proyectar en clase desde cualquier navegador.

Para PWA:

```bash
npm install -D vite-plugin-pwa
```

Configurar `VitePWA` con `registerType: 'autoUpdate'`, `manifest` e iconos. En iOS, “Añadir a pantalla de inicio” da una experiencia casi nativa, pero sin todas las APIs.

---

## 7. CI/CD propuesto

### Web

- Workflow actual de GitHub Pages.
- Se dispara con `main`.
- Build + deploy.

### Android

- Workflow en `ubuntu-latest` con JDK 17 y Android SDK.
- `npm ci`, `npm run build`, `npx cap sync android`, `./gradlew assembleDebug` y `bundleRelease`.
- Artefactos: APK debug y AAB release.
- Firma con secrets.

### iOS

- Workflow en `macos-latest`.
- `npm ci`, `npm run build`, `npx cap sync ios`, `xcodebuild archive`.
- Firma con certificados/provisioning profiles o App Store Connect API.
- Subida a TestFlight.
- Requiere cuenta Apple y secretos.

---

## 8. Fases y tiempos realistas

| Fase | Entregable | Tiempo estimado | Depende de |
|---|---|---:|---|
| 0 | Decisiones: app ID, cuentas, Mac/CI | 1 día | Tú |
| 1 | Responsive móvil + PWA + iconos | 1–2 semanas | Nada |
| 2 | APK debug Android | 2–4 días | Android Studio |
| 3 | AAB firmado + ficha Play | 3–5 días | Cuenta Google |
| 4 | Proyecto iOS + TestFlight | 1–2 semanas | Mac/Xcode + Apple |
| 5 | App Store | 1–2 semanas más | Revisión Apple |

No es necesario esperar a iOS para tener APK. Se puede publicar Android y web primero.

---

## 9. Costos

| Concepto | Costo |
|---|---:|
| GitHub Pages | Gratis |
| Google Play (una vez) | 25 USD |
| Apple Developer (año) | 99 USD |
| Mac físico | Desde ~500 USD usado |
| Mac en la nube | ~30–100 USD/mes según uso |
| GitHub Actions macOS | Incluido con límites; extra si se pasa |

---

## 10. Decisiones que necesito de ti

1. **¿Tienes Mac o acceso a uno?** Si no, ¿prefieres CI macOS o alquiler por horas?
2. **¿Ya tienes cuenta Google Play y Apple Developer?** Sin Apple no hay TestFlight/App Store.
3. **¿El objetivo es APK para instalar en el aula o publicación en tiendas?** Son caminos distintos.
4. **¿App ID definitivo?** `com.gcrownv.beamlab` es una propuesta; se puede cambiar antes de publicar.
5. **¿Quieres PWA ya o esperamos al rediseño móvil?** La PWA se puede hacer ahora y no estorba.
6. **¿La app debe funcionar sin internet?** Si sí, el offline entra en la fase 1.

---

## 11. Recomendación concreta

**Ahora:**

- Cerrar uplink/downlink y la guía 2.1.0.
- Añadir PWA y responsive móvil.
- Generar APK debug para probar en un Android real.

**Después:**

- Publicar AAB en Google Play.
- Preparar iOS con Mac/CI y TestFlight.
- Decidir App Store según la acogida.

**No recomiendo** reescribir en React Native/Flutter: perderías la simulación WebGL y la ventaja de tener una sola base de código.

---

## 12. Enlaces útiles

- Capacitor: <https://capacitorjs.com/docs>
- Vite PWA: <https://vite-pwa-org.netlify.app/>
- Google Play Console: <https://play.google.com/console>
- Apple Developer: <https://developer.apple.com/programs/>
- App Store Review Guidelines: <https://developer.apple.com/app-store/review/guidelines/>
