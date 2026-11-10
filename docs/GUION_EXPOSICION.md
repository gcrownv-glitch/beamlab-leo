# Guion de exposición — BeamLab LEO

**Duración objetivo: 10–12 minutos.** La demo está pensada para hacerse en vivo, con la guía integrada. Si algo falla, hay capturas de respaldo en `docs/img/`.

---

## Antes de entrar

1. Ejecuta `npm install` una vez y luego `npm run dev`.
2. Abre `http://localhost:5173` en Edge o Chrome, a pantalla completa (F11), zoom 100 %.
3. Comprueba que se ve el globo, el satélite y el panel de la derecha.
4. Pulsa **Guía** una vez para verificar que aparece la tarjeta; ciérrala con la ✕.
5. Ten a mano `docs/GUION_EXPOSICION.md` y las capturas de `docs/img/` por si el proyector o la red fallan.

> El simulador arranca a **10×**. Al entrar a **Celular** o **Conformada** se pausa y reposiciona el satélite sobre la región: es intencional, para que el diseño sea reproducible.

---

## Guion minuto a minuto

### 0:00–0:40 · Gancho

> “Un satélite LEO a 550 km se mueve a 7,6 km/s. Desde ahí no puede iluminar toda la Tierra con una sola antena: tiene que repartir su potencia en haces que apuntan a zonas concretas. Este simulador muestra cómo se hace, desde la órbita hasta la fase de cada elemento del arreglo.”

Señala la pantalla:

- Globo 3D, órbita cian, traza amarilla.
- Panel izquierdo: órbita y parámetros.
- Panel derecho: antena y modos.
- Abajo: corte del patrón, enlace y número de haces.

### 0:40–2:00 · Órbita y geometría

**Haz:** clic en **Guía → Siguiente** (paso 1), o manualmente:

1. En **Constelación**, elige **Starlink**.
2. Muestra **Altitud 550 km**, **Inclinación 53°**, **Período 95,6 min**, **Velocidad 7,59 km/s**.
3. Activa **Trazar** y **Huella**.
4. Pulsa **Seguir** o **Satélite** para ver de cerca el satélite y su panel de antena.

> “La órbita es kepleriana con corrección J2. La línea cian es la órbita; la traza es su paso sobre el suelo. El anillo azul es el horizonte: desde 550 km se ve hasta 67° de nadir, un disco de 4.500 km de radio. Todo lo que está fuera de ese disco no se puede iluminar.”

**Si el satélite ya se movió:** pulsa **Ahora** (vuelve a pasar sobre Lima) o cambia de modo; el simulador lo reposiciona.

### 2:00–4:00 · Global vs puntual

**Paso 2 de la guía.** Modo **Global**.

> “Con una sola bocina ancha cubrimos casi todo el disco, pero la ganancia es de apenas 5 dBi y el C/N₀ baja a ~50 dBHz. Además, la bocina de 17° del apunte cubre todo el disco **desde GEO**, a 35.786 km; desde LEO ese mismo haz solo ilumina 160 km. Por eso LEO necesita dividir el disco en haces.”

Cambia a **Puntual**. El haz se coloca sobre Lima.

> “Ahora un arreglo de 16×16. La ganancia sube a ~26 dBi y el haz baja a ~8°. El satélite sigue moviéndose y la fase se recalcula para no soltar Lima.”

Abre **Satélite** y muestra la textura de fase del panel.

> “Cada elemento recibe una fase distinta. Esa rampa inclina el frente de onda: no se mueve la antena, se mueve el haz. Eso es beamforming.”

**Señala el mapa de fase** del panel derecho (si está visible; si no, desplázate) y el corte del patrón: HPBW, SLL, lóbulos.

### 4:00–6:00 · El arreglo manda

**Pasos 4 y 5 de la guía.**

1. Pulsa **4×4**. Observa: HPBW ~25°, huella enorme, ganancia baja.
2. Pulsa **16×16**. Observa: HPBW ~7–9°, ganancia ~29 dBi, huella pequeña.
3. Mueve **Separación** a 0,8 λ. Aparece el aviso de lóbulos de difracción y el corte muestra lóbulos adicionales.
4. Cambia **Taper** de Uniforme a Kaiser −30 dB. El SLL baja, el haz se ensancha y la ganancia baja un poco.

> “La regla es θ ≈ 0,886 λ/L: si duplico la apertura, el haz se estrecha a la mitad. El taper es el primer compromiso: menos lóbulos laterales, pero menos ganancia y un haz más ancho. Y si separo más de 0,5 λ, aparecen lóbulos de difracción: por eso los arreglos reales usan ~0,5 λ.”

**Frase para conectar:** “Hasta aquí un haz. Una constelación necesita cientos.”

### 6:00–7:30 · Cobertura celular

**Paso 6 de la guía.** Modo **Celular**, región **Perú**, 3 colores.

> “Para cubrir Perú se despliegan ~287 celdas, como en la diapositiva de constelaciones LEO. Cada celda tiene su propio haz y su color de reutilización: celdas del mismo color comparten canal. El satélite recalcula la fase de cada celda mientras la ve, y las que caen bajo el horizonte se apagan.”

Señala:

- **Haces activos: 287**.
- **Celdas visibles: 287/287**.
- La mancha de cobertura sobre Perú.
- La leyenda A/B/C.
- El **C/N₀** del enlace.

> “Esto es lo que hace Starlink o OneWeb: no un haz global, sino una malla de haces que se reutiliza en frecuencia. La cobertura se convierte en capacidad.”

**Prueba:** cambia la reutilización a 4 colores y observa cómo cambia el mosaico y el número de canales.

### 7:30–9:30 · Haz conformado

**Paso 7 de la guía.** Modo **Conformada**, centro **Lima**, radio **100 km**, pulsa **Sintetizar cobertura**.

> “Ahora no queremos un punto, queremos una zona. La síntesis resuelve (AᴴA+λI)w = Aᴴd para que el campo valga 1 dentro y 0 fuera, ajustando amplitud y fase de los 256 elementos. Es la versión digital de un reflector con múltiples alimentadores.”

Espera ~1 s. Lee:

- **Cobertura 98 %**, **derrame −18,8 dB**, **D 21,7 dBi**.
- **HPBW ~20,8°**: el haz se ensanchó para cubrir los 100 km.
- Compara con el haz puntual: más cobertura, menos ganancia. Ese es el compromiso.

> “Si aumento el radio a 200 km, la cobertura baja y la ganancia también: una apertura de 19 cm no puede hacer magia. Para zonas más grandes se usan más celdas o un reflector más grande.”

**Demo opcional:** sube el radio a 200 km y vuelve a sintetizar; muestra la caída de cobertura. Luego vuelve a 100 km.

### 9:30–11:00 · Enlace y cierre

Señala la tarjeta **Presupuesto**:

> “La ganancia del haz entra en el EIRP; la distancia oblicua en la pérdida de espacio libre. Con 20 W y 26 dBi, el EIRP es ~40 dBW, la pérdida ~169 dB y el C/N₀ ~73 dBHz. En modo global, con 3,5 dBi, el C/N₀ cae a ~50 dBHz. Misma potencia, distinta concentración.”

Cierre:

> “El diseño satelital es un triángulo: **ganancia**, **cobertura** y **capacidad**. No se pueden maximizar los tres a la vez. El beamforming es la herramienta que permite mover ese compromiso haz por haz, celda por celda, en tiempo real. El simulador está en GitHub; el motor orbital, el de antenas y la síntesis tienen pruebas automáticas.”

---

## Preguntas previsibles

**¿Por qué 0,5 λ?**
Es el espaciado estándar para evitar lóbulos de difracción en un barrido amplio y mantener el lóbulo principal limpio. Al aumentar la separación, el patrón se estrecha, pero aparecen lóbulos de difracción (grating lobes) que roban potencia y crean falsos objetivos.

**¿Por qué no usar un haz más ancho y listo?**
Porque la ganancia de una apertura cae al ensanchar el haz. Un haz de 134° da ~5 dBi; uno de 7° da ~29 dBi. Para la misma potencia, la diferencia en C/N₀ es ~24 dB.

**¿Cómo sabe el satélite dónde está la celda?**
Con su efeméride (posición y orientación) y el modelo de Tierra. El haz se apunta por fase; en sistemas reales se añade calibración, seguimiento y handover entre satélites.

**¿Esto es un modelo real o didáctico?**
Didáctico, con números realistas. Usa esfera, órbita kepleriana con J2 secular, arreglo ideal sin acoplamiento mutuo ni errores de fase, y enlace de espacio libre. Sirve para entender los compromisos, no para certificar un enlace.

**¿Por qué la bocina del apunte dice 17° y aquí uso 134°?**
Porque 17° es el haz global de un satélite **GEO**. A 35.786 km, 17° cubre el disco terrestre. A 550 km, 17° solo cubre ~160 km; para el disco visible de LEO hace falta ~134°, con muy poca ganancia. Es una de las ideas que más se malinterpretan y que el simulador deja ver.

**¿Qué diferencia hay con el beamforming de 5G?**
La física es la misma (arreglo en fase, fase por elemento); cambian la escala, la geometría (Tierra curvada, órbita), la cobertura celular y el presupuesto de enlace. En 5G el “haz” cubre usuarios; aquí cubre celdas de decenas de km.

**¿Por qué el mapa de fase tiene tantos colores?**
Porque la fase se envuelve en $[-\pi,\pi]$. Varios ciclos completos se ven como un arcoíris; lo importante es la **dirección de la rampa**, no el color absoluto. Al apuntar más lejos, la rampa es más rápida y hay más ciclos.

---

## Si algo falla

| Problema | Solución |
|---|---|
| El satélite ya no ve Lima | Pulsa **Ahora**, o cambia a **Celular/Conformada** (se reposiciona y pausa). |
| La síntesis da error de cobertura | Baja el radio a 80–100 km, o sube a 20×20/32×32. |
| La app se ve lenta | Baja a 4×4 u 8×8, desactiva **Ganancia**, cierra otras pestañas. |
| Oculté un panel y no sé cómo volver | Pestaña lateral **Órbita** / **Antena**, o teclas `[` / `]`. |
| No hay texturas (globo azul) | Ocurre si se abre `dist/index.html` con `file://`; usa `npm run preview` o `npm run dev`. |
| El proyector no muestra el 3D | Ten las capturas de `docs/img/` como respaldo y explica con ellas. |

---

## Cierre de 30 segundos

> “BeamLab LEO convierte una diapositiva de cobertura en algo que se puede tocar: órbita, huella, fase, celdas y enlace. La conclusión es simple: en LEO no se cubre con un haz, se cubre con muchos; y cada haz es un compromiso entre ganancia, cobertura y capacidad.”
