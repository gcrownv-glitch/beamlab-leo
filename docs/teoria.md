# Teoría y modelo del simulador

Este documento explica la física y las decisiones numéricas de BeamLab LEO. No pretende sustituir a un libro de antenas o de astrodinámica; busca que cada número de la pantalla se pueda justificar y reproducir.

---

## 0. Convenciones y constantes

| Símbolo | Valor | Unidad |
|---|---|---|
| $R_\oplus$ | 6378.137 | km |
| $\mu_\oplus$ | 398600.4418 | km³/s² |
| $J_2$ | $1.08262668\times10^{-3}$ | — |
| $c$ | 299792458 | m/s |

- Ángulos internos en radianes; la interfaz los muestra en grados.
- Posiciones en ECI/ECEF en km; en Three.js **1 unidad = 1000 km**.
- Eje $Z$ hacia el polo norte; $X$ hacia el equinoccio vernal en ECI y hacia el meridiano de Greenwich en ECEF.
- “Nadir” es la dirección del centro de la Tierra vista desde el satélite.

---

## 1. Órbita

### 1.1 Elementos y ecuación de Kepler

Una órbita kepleriana queda descrita por

$$
a,\; e,\; i,\; \Omega,\; \omega,\; M_0,
$$

semieje mayor, excentricidad, inclinación, ascensión recta del nodo ascendente, argumento del perigeo y anomalía media en la época. La anomalía media evoluciona como

$$
M(t)=M_0+n(t-t_0),\qquad n=\sqrt{\frac{\mu}{a^3}}.
$$

La ecuación de Kepler

$$
M=E-e\sin E
$$

se resuelve por Newton–Raphson. Con $E$ se obtienen la anomalía verdadera $\nu$ y el radio

$$
r=a(1-e\cos E),\qquad \nu=\operatorname{atan2}\!\left(\sqrt{1-e^2}\sin E,\;\cos E-e\right).
$$

En el plano perifocal:

$$
\mathbf r_p=\begin{pmatrix}r\cos\nu\\ r\sin\nu\\0\end{pmatrix},\qquad
\mathbf v_p=\sqrt{\frac{\mu}{p}}\begin{pmatrix}-\sin\nu\\ e+\cos\nu\\0\end{pmatrix},\quad p=a(1-e^2).
$$

La rotación a ECI es $R_z(\Omega)R_x(i)R_z(\omega)$:

$$
\begin{aligned}
x &= (\cos\Omega\cos\omega-\sin\Omega\sin\omega\cos i)\,x_p
   +(-\cos\Omega\sin\omega-\sin\Omega\cos\omega\cos i)\,y_p,\\
y &= (\sin\Omega\cos\omega+\cos\Omega\sin\omega\cos i)\,x_p
   +(-\sin\Omega\sin\omega+\cos\Omega\cos\omega\cos i)\,y_p,\\
z &= (\sin\omega\sin i)\,x_p+(\cos\omega\sin i)\,y_p.
\end{aligned}
$$

### 1.2 Deriva secular por J2

El achatamiento terrestre produce precesión secular:

$$
\dot\Omega=-\frac{3}{2}nJ_2\left(\frac{R_\oplus}{p}\right)^2\cos i,
$$

$$
\dot\omega=\frac{3}{4}nJ_2\left(\frac{R_\oplus}{p}\right)^2(5\cos^2 i-1),
$$

$$
\dot M=n+\frac{3}{4}nJ_2\left(\frac{R_\oplus}{p}\right)^2\sqrt{1-e^2}(3\cos^2 i-1).
$$

El simulador aplica estas tasas de forma lineal en el tiempo (modelo secular de primer orden). Es suficiente para una demostración de una o varias órbitas; no sustituye a SGP4.

### 1.3 ECI → ECEF y tiempo sidéreo

El tiempo sidéreo de Greenwich se calcula con la fórmula IAU 1982:

$$
\theta_G=280.46061837+360.98564736629\,(JD-2451545)+0.000387933\,T^2-\frac{T^3}{38710000},
$$

con $T=(JD-2451545)/36525$ y $JD$ el día juliano UTC. La posición ECEF es

$$
\mathbf r_{\text{ECEF}}=R_z(-\theta_G)\,\mathbf r_{\text{ECI}}.
$$

La longitud geocéntrica es $\lambda=\operatorname{atan2}(y,x)$ y la latitud $\phi=\arcsin(z/r)$. La altitud se mide sobre la esfera: $h=r-R_\oplus$.

> **Modelo esférico.** No se usa el elipsoide WGS-84 ni el geoide. El error de latitud es menor que ~0,2° y no afecta la demostración.

### 1.4 Horizonte, distancia oblicua y huella

Sea $\alpha$ el ángulo de nadir (off-nadir) de un rayo. El ángulo central Tierra $\gamma$ del punto de impacto cumple

$$
\tan\alpha=\frac{R_\oplus\sin\gamma}{r-R_\oplus\cos\gamma}
\quad\Longleftrightarrow\quad
\gamma=\arcsin\!\left(\frac{r}{R_\oplus}\sin\alpha\right)-\alpha.
$$

La distancia oblicua es

$$
d=\sqrt{r^2+R_\oplus^2-2rR_\oplus\cos\gamma}.
$$

El horizonte está en

$$
\alpha_h=\arcsin\!\left(\frac{R_\oplus}{r}\right),
\qquad
\gamma_h=\arccos\!\left(\frac{R_\oplus}{r}\right).
$$

Para $h=550$ km: $\alpha_h\approx67{,}0°$, $\gamma_h\approx23{,}0°$, radio superficial $\approx2.560$ km y diámetro $\approx5.100$ km. Esa es la razón por la que LEO necesita **muchos haces pequeños**: un solo haz tendría que cubrir un ángulo enorme con muy poca ganancia.

---

## 2. Arreglo en fase

### 2.1 Factor de arreglo

Un arreglo plano con $M\times N$ elementos en $(x_m,y_n)$ y excitaciones complejas $a_{mn}$ produce, en la dirección de cosenos directores $(u,v)=(\sin\theta\cos\phi,\sin\theta\sin\phi)$:

$$
AF(u,v)=\sum_{m=0}^{M-1}\sum_{n=0}^{N-1}a_{mn}\,
e^{\,j k(x_m u+y_n v)},\qquad k=\frac{2\pi}{\lambda}.
$$

El patrón de potencia del elemento se modela como

$$
g_e(\theta)=\cos^q\theta,\qquad P_e(\theta)=g_e^2(\theta)=\cos^{2q}\theta,
$$

con $q$ ajustable. Para una bocina, $q$ se elige a partir del HPBW:

$$
q=\frac{\ln(1/2)}{2\ln\cos(\theta_{3\text{dB}}/2)}.
$$

La directividad de ese elemento sobre el hemisferio frontal es $D_e=4q+2$. Para 17° resulta $D_e\approx21$ dBi; para 134° (haz global LEO) resulta $\approx5{,}4$ dBi.

La potencia total en una dirección es $P=|AF|^2P_e(\theta)$.

### 2.2 Apuntamiento por fase

Para dirigir el máximo a $(u_0,v_0)$ se elige

$$
a_{mn}=w_m w_n\,e^{-jk(x_m u_0+y_n v_0)}.
$$

Entonces

$$
AF(u,v)=\sum w_m w_n\,e^{jk[x_m(u-u_0)+y_n(v-v_0)]},
$$

que vale $\sum w_m w_n$ en el centro del haz. La fase por elemento es

$$
\boxed{\;\varphi_{mn}=-k(x_m u_0+y_n v_0)\;}
$$

y se envuelve a $[-\pi,\pi]$ para el mapa de fase. No hay partes móviles: se cambia el frente de onda, no la antena.

### 2.3 Taper

Los pesos $w_m,w_n$ permiten controlar los lóbulos laterales. El simulador implementa:

- **Uniforme:** máxima directividad, SLL teórico ≈ −13,2 dB en un arreglo grande.
- **Kaiser** con $A=-25,-30,-40$ dB:
  $$
  w_i=\frac{I_0\!\left(\beta\sqrt{1-\left(\frac{2i}{N-1}-1\right)^2}\right)}{I_0(\beta)},
  $$
  con $\beta\approx0.1102(A-8.7)$ para $A>50$ y la aproximación habitual para $21\le A\le50$.
- **Hann:** $w_i=\tfrac12[1-\cos(2\pi i/(N-1))]$.

El taper reduce los lóbulos a costa de ensanchar el haz y perder ganancia. Es el primer compromiso de diseño que se ve en la app.

### 2.4 Directividad y métricas

La directividad se calcula integrando numéricamente sobre el hemisferio:

$$
D=\frac{4\pi\,|AF|^2_{\max}}{\displaystyle\int_0^{2\pi}\!\!\int_0^{\pi/2}|AF(\theta,\phi)|^2P_e(\theta)\sin\theta\,d\theta\,d\phi}.
$$

La ganancia incluye la eficiencia $\eta$: $G=\eta D$. En la app, $\eta$ es ajustable (65 % por defecto).

El **HPBW** se obtiene barriendo $\pm\delta$ alrededor del centro del haz e interpolando el cruce de −3 dB. El **SLL** es el máximo fuera de $1{,}25\times$HPBW. Para una apertura uniforme de longitud $L$:

$$
\theta_{3\text{dB}}\approx0{,}886\,\frac{\lambda}{L}.
$$

Un $16\times16$ con $d=0{,}5\lambda$ tiene $L=8\lambda$: HPBW ≈ 6,3° y $D\approx29$ dBi a nadir. Al escanear, el HPBW aparente crece y la ganancia baja (scan loss).

### 2.5 Lóbulos de difracción

Para una separación $d$, los lóbulos de difracción aparecen en

$$
\sin\theta_g=\sin\theta_0\pm\frac{\lambda}{d}.
$$

Para un barrido amplio, $d=0{,}5\lambda$ ya puede acercar un lóbulo de difracción al espacio visible; por eso la app advierte cuando $d>0{,}5\lambda$. Con $d=0{,}9\lambda$ el patrón muestra lóbulos adicionales muy claros.

### 2.6 Implementación eficiente

Para pesos separables $a_{mn}=w_mw_n$:

$$
AF(u,v)=f_x(u)\,f_y(v),
$$

de modo que se calculan dos sumas 1D y se hace un producto externo. La grilla base se guarda en $[-1{,}35,1{,}35]^2$ con 801 muestras por lado; ese recorte evita incluir la imagen periódica del arreglo ($u\pm2$) y es clave para que el mapa de celdas no se alias.

---

## 3. De la dirección a la Tierra

### 3.1 Intersección rayo–esfera

Dado el satélite $\mathbf r_s$ y una dirección unitaria $\mathbf d$:

$$
|\mathbf r_s+t\mathbf d|^2=R_\oplus^2
\;\Longrightarrow\;
t^2+2(\mathbf r_s\cdot\mathbf d)t+(|\mathbf r_s|^2-R_\oplus^2)=0.
$$

Se toma la raíz menor positiva:

$$
t=-(\mathbf r_s\cdot\mathbf d)-\sqrt{(\mathbf r_s\cdot\mathbf d)^2-(|\mathbf r_s|^2-R_\oplus^2)}.
$$

Si el discriminante es negativo, el rayo no corta la Tierra.

### 3.2 Base de antena

La base local que usa el motor es

$$
\mathbf z=-\frac{\mathbf r_s}{|\mathbf r_s|}\ \text{(nadir)},\qquad
\mathbf x=\frac{\mathbf z_{\text{polo}}\times\mathbf z}{|\mathbf z_{\text{polo}}\times\mathbf z|}\ \text{(este)},\qquad
\mathbf y=\mathbf z\times\mathbf x\ \text{(norte)}.
$$

Los cosenos directores de un punto de la superficie son

$$
u=\mathbf d\cdot\mathbf x,\qquad v=\mathbf d\cdot\mathbf y,\qquad w=\mathbf d\cdot\mathbf z,
$$

y el ángulo de nadir es $\alpha=\arccos w$.

> **Cuidado con las bases.** El modelo 3D del satélite se orienta con la **velocidad** (a lo largo de la traza), pero el patrón se define en la base **este/norte** anterior. El shader del globo debe usar la base de la antena rotada por GMST, no la base del modelo. Mezclarlas rota el patrón y fue un bug real durante el desarrollo.

### 3.3 Huella y celdas

La huella a −3 dB se aproxima muestreando un cono de semiángulo HPBW/2 alrededor de la dirección del haz e intersectando cada rayo con la esfera. A nadir:

$$
r_{-3\text{dB}}\approx h\tan\!\left(\frac{\theta_{3\text{dB}}}{2}\right).
$$

Para cobertura celular se genera una retícula hexagonal de celdas sobre el polígono de la región, con separación

$$
s\approx 2h\tan\!\left(\frac{\theta_{3\text{dB}}}{2}\right)\times0{,}9,
$$

de modo que celdas vecinas se solapan cerca de −3 dB. Cada celda guarda su lat/lon y se le asigna un color de reutilización $c=((\text{col}-\text{row})\bmod R+R)\bmod R$, con $R=3,4$ o $7$. Las celdas son **fijas a Tierra**: a medida que el satélite se mueve, se recalcula la fase de cada celda visible y las que caen bajo el horizonte o por debajo de 10° de elevación se retiran.

---

## 4. Haz conformado por síntesis

### 4.1 Planteamiento

Se quiere iluminar una zona $S$ (por ejemplo, un círculo de 100 km sobre Lima) y anular el exterior. Se muestrean direcciones $(u_k,v_k)$ dentro y fuera de la zona y se busca un vector de pesos complejos $\mathbf w\in\mathbb C^{L}$, $L=MN$, tal que

$$
AF_k=\sum_{\ell=1}^{L} w_\ell\,e^{jk(x_m u_k+y_n v_k)}
$$

se acerque a un objetivo $d_k$: $1$ dentro, $0$ fuera, con una transición suave en el borde para no pedir una discontinuidad que la apertura no puede reproducir.

El problema de mínimos cuadrados con regularización es

$$
\min_{\mathbf w}\;\sum_k \rho_k\,|AF_k-d_k|^2+\lambda\|\mathbf w\|^2,
$$

donde $\rho_k$ son pesos por muestra. La solución satisface las ecuaciones normales

$$
\boxed{\;(A^H A+\lambda I)\,\mathbf w=A^H\mathbf d\;}
$$

con $A_{k\ell}=e^{jk(x_m u_k+y_n v_k)}$.

### 4.2 Regularización y gradiente conjugado

$A^HA$ es hermítica semidefinida positiva; con $\lambda>0$ es definida positiva. Se resuelve por **gradiente conjugado** (hasta 600 iteraciones), que evita una factorización densa y es estable para $L\le400$.

La regularización es esencial: con $\lambda$ demasiado pequeño el sistema se vuelve mal condicionado y aparecen soluciones **superdirectivas** (un pico artificial más estrecho que el límite de difracción, con ganancia imposible). En la app se usa

$$
\lambda=10^{-2}\cdot\overline{\operatorname{diag}(A^HA)}.
$$

Además se comprueba que la directividad sintetizada no supere la cota de apertura

$$
D_{\max}\approx4\pi\,(M d_x)(N d_y)
$$

(en longitudes de onda) más 1,5 dB de tolerancia. Si se supera, se rechaza el diseño y se pide otro radio o más elementos.

### 4.3 Muestreo

- Núcleo: $r\le r_{\text{core}}$, $d=1$, peso 4.
- Transición coseno: $r_{\text{core}}<r<r_{\text{edge}}$, $d=\tfrac12[1+\cos(\pi(r-r_{\text{core}})/(r_{\text{edge}}-r_{\text{core}}))]$, peso 2.
- Guarda: $r_{\text{edge}}<r<r_{\text{edge}}+4\,\text{HPBW}$, $d=0$, peso 0,8.
- Fondo: resto del disco visible, $d=0$, peso 0,28.
- Se limitan las muestras a ~720 internas y ~420 externas para que el cálculo sea interactivo.

El resultado se evalúa con la cobertura a −3 dB de los puntos del núcleo y el derrame máximo fuera de la zona. Para Lima 100 km, $16\times16$, 12 GHz: cobertura ≈100 %, derrame ≈−12,1 dB, $D\approx20{,}3$ dBi. El haz se ensancha (~16,2° de HPBW) y pierde ganancia respecto del haz puntual: ese es el precio de cubrir una zona.

### 4.4 Por qué se ve una “cruz” en el mapa de ganancia

La solución de mínimos cuadrados con un objetivo separable y una apertura rectangular tiende a un patrón casi separable; sus lóbulos laterales se alinean con los ejes $u$ y $v$ y forman una cruz. En el globo se muestra solo el lóbulo principal (umbral −7 dB) para que la cobertura se lea; el dato de cobertura y el corte del patrón sí incluyen los lóbulos laterales. Es una limitación del diseño docente, no un error de visualización.

---

## 5. Presupuesto de enlace

Para una portadora de frecuencia $f$, longitud de onda $\lambda=c/f$ y distancia oblicua $d$:

$$
L_{fs}=20\log_{10}\!\left(\frac{4\pi d}{\lambda}\right),
$$

$$
\mathrm{EIRP}=P_{tx}G_{tx},\qquad
P_{rx}=\mathrm{EIRP}-L_{fs}-L_{atm}-L_{rain}+G_{rx},
$$

La temperatura de sistema incluye la antena y el receptor:

$$
T_{sys}=T_{ant}+(F-1)T_0,\qquad
N_0=-228{,}6+10\log_{10}(T_{sys})\ \text{dBW/Hz},
$$

$$
\frac{G}{T}=G_{rx}-10\log_{10}(T_{sys}),\qquad
\frac{C}{N_0}=P_{rx}-N_0,\qquad
\frac{C}{N}=\frac{C/N_0}{B}.
$$

### 5.1 MODCOD y umbral

No se usa Shannon como si fuera un módem real. El simulador elige el **MODCOD DVB-S2X** más alto cuyo umbral de C/N se cumple, con 1 dB de margen de implementación. La tabla es orientativa:

| MODCOD | C/N mínimo | Eficiencia espectral |
|---|---:|---:|
| QPSK 1/4 | −2,4 dB | 0,49 bit/s/Hz |
| QPSK 1/2 | +1,0 dB | 0,99 |
| QPSK 3/4 | +3,8 dB | 1,49 |
| 8PSK 2/3 | +5,5 dB | 1,98 |
| 8PSK 3/4 | +6,8 dB | 2,22 |
| 16APSK 2/3 | +8,5 dB | 2,64 |
| 16APSK 3/4 | +10,5 dB | 3,03 |
| 32APSK 3/4 | +12,8 dB | 3,50 |
| 32APSK 4/5 | +14,5 dB | 4,00 |
| 64APSK 5/6 | +19,5 dB | 5,00 |

Si ningún MODCOD cumple, el enlace queda en **outage**: capacidad cero y “sin enlace” en la interfaz. La capacidad es agregada por haz: `C = B · η_espectral`; por usuario se divide entre el número de usuarios del haz.

### 5.2 Ejemplo con la configuración por defecto

Con 20 W por haz, $G=26{,}2$ dBi, terminal VSAT de 0,6 m ($G_{rx}=34$ dBi, NF 1,5 dB), 550 km y 12 GHz:

- EIRP ≈ 39,2 dBW.
- $L_{fs}\approx169{,}7$ dB a 611 km.
- $P_{rx}\approx-66{,}5$ dBm.
- $C/N_0\approx109{,}6$ dBHz; $C/N\approx29{,}6$ dB en 100 MHz.
- 64APSK 5/6; ≈500 Mbps por haz; ≈25 Mbps por usuario con 20 usuarios.

Con una antena isotrópica de 0 dBi, el mismo enlace queda en $C/N\approx-8{,}6$ dB y **outage**. Ese era el origen de los “0–3 Mbps” de la versión anterior: no era un throughput realista, era un receptor isotrópico.

El modo global, con $G\approx3{,}5$ dBi, baja mucho el C/N₀: la misma potencia, mucho menos concentrada. La capacidad de sistema se estima como `n_colores × capacidad_por_canal`; la potencia RF total como `n_haces × P_tx`, y se muestra para evidenciar que no todos los haces transmiten a plena potencia a la vez.

---

## 6. Validación

Las 22 pruebas de `npm test` comprueban, entre otras cosas:

| Prueba | Resultado esperado |
|---|---|
| GMST en J2000 | 280,4606° |
| ISS a 420 km | $v\approx7{,}66$ km/s, $T\approx92{,}6$ min |
| `elementsOverPoint` | lat/lon de Lima con error < $10^{-6}$° |
| Horizonte a 550 km | 67,0° de nadir; 23,0° central; radio 2.559 km |
| Base de antena | +X este, +Z nadir |
| Bocina 17° | HPBW 17°, $D\approx21{,}05$ dBi |
| 16×16 uniforme, 0,5λ | $D\approx29{,}1$ dBi, HPBW 6,35°, SLL ≈−13 dB |
| Kaiser −30 dB | SLL al menos 5 dB menor que uniforme, haz más ancho |
| Fase de apuntamiento | rampa lineal $-\!2\pi d_x u$ |
| Enlace VSAT 34 dBi | 64APSK 5/6, 500 Mbps/haz, 25 Mbps/usuario |
| Enlace isotrópico 0 dBi | outage, 0 Mbps |
| Síntesis real Lima 100 km | cobertura >90 %, derrame <−12 dB, $16<D<28$ dBi |

---

## 7. Referencias

1. Balanis, C. A. *Antenna Theory: Analysis and Design*. Wiley.
2. Mailloux, R. J. *Phased Array Antenna Handbook*. Artech House.
3. Maral, G. y Bousquet, M. *Satellite Communications Systems*. Wiley.
4. Vallado, D. A. *Fundamentals of Astrodynamics and Applications*. Microcosm.
5. ITU-R S.580 y S.465: patrones de referencia de antenas de satélite.
6. Three.js, documentación de `SphereGeometry`, `ShaderMaterial` y `EffectComposer`.
