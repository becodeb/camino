# 05 — Estilo visual

Guía del estilo "cuaderno de dibujo" de la app. La implementación de referencia es
[`demo-estilo/`](../demo-estilo/) (HTML, CSS y JS estáticos, sin build). Todos los
valores de esta guía están copiados del código; si el código cambia, esta guía se
actualiza con él.

| Archivo | Qué contiene |
|---|---|
| `demo-estilo/index.html` | Estructura, filtros SVG compartidos (`boil`, `rough`, `rough-lg`) y patrón `hatch` |
| `demo-estilo/style.css` | Tokens y componentes de interfaz (recortes de papel, pestañas, tira de programa) |
| `demo-estilo/js/ink.js` | Geometría "dibujada a mano": azar con semilla y formas imperfectas |
| `demo-estilo/js/anim.js` | Motor de interpolación por cuadros, curvas y resortes |
| `demo-estilo/js/characters.js` | Los 4 personajes: forma, render por cuadro y movimientos |
| `demo-estilo/js/app.js` | Tablero, generación, tira de programa, ejecución, vida en reposo, efectos |

## 1. Principios

**Qué hace que este estilo sea este estilo:**

1. **Un solo universo dibujado.** La interfaz también está dibujada: botones, tarjetas,
   pestañas, separadores y marcas parecen recortados del mismo cuaderno. No hay un
   componente "de sistema" que rompa la ilusión.
2. **Tinta casi negra e imperfecta.** Todo contorno es `#2b2622`, con bordes levemente
   irregulares (filtro de desplazamiento o trazos con curvatura aleatoria). En el
   tablero y en los personajes la línea además "hierve" (ver §3).
3. **Colores planos, cálidos y algo desaturados.** Naranja, rojo, rosa, azul y amarillo
   pastel sobre papel crema. El volumen se sugiere con **una faceta plana** de un tono
   más oscuro, nunca con degradé.
4. **Sombras planas.** Una forma desplazada, del mismo contorno, en marrón translúcido.
   En el tablero, un óvalo rayado (`hatch`).
5. **Anotaciones en tinta azul.** Líneas punteadas, flechas y círculos a mano
   (`#3d6ea5`) comunican relaciones y acciones: marcador de salida, pista, paso
   actual, éxito, foco de teclado.
6. **Minimalismo con personalidad.** Personajes de pocas formas. La personalidad se ve
   en **cómo se mueven** (anticipación, estiramiento, sobrepaso, arrastre), no en el
   detalle.
7. **Interacción moderna y legible.** Tipografía para primeros lectores (Andika),
   blancos de toque grandes, foco visible, jerarquía clara.

**Qué evitar:**

| Evitar | Por qué / en su lugar |
|---|---|
| Degradés, neón, glassmorphism, 3D realista | Rompen el papel. Usar una faceta plana más oscura |
| `box-shadow` genérico con desenfoque | Usar la sombra plana desplazada (§2) |
| Íconos vectoriales perfectos | Dibujar con `wobblyLine` / `wobblyPoly` y trazo redondeado |
| Colores muy saturados | Mantener la paleta de §2 |
| Personajes muy caricaturescos o recargados | Presupuesto de formas de §5 |
| Texto de instrucciones en la fuente manuscrita | Andika para instrucciones; Gochi Hand solo para exclamaciones y adornos |
| Movimiento interpolado lineal de interfaz | Anticipación, sobrepaso y asentamiento (§6) |
| Copiar la imagen de referencia (caja naranja enojada, caramelo, resorte) | Capturar el lenguaje, no los objetos |

## 2. Tokens

### Paleta base (`style.css`, `:root`)

| Token | Valor | Rol |
|---|---|---|
| `--paper` | `#f2e9d8` | Fondo del escritorio (con grano de papel) |
| `--sheet` | `#fbf7ee` | Hojas, tarjetas neutras, globos de diálogo |
| `--ink` | `#2b2622` | Toda línea de tinta y texto principal (en JS: `INK`) |
| `--ink-2` | `#5e554c` | Texto secundario ("hoja N") |
| `--orange` | `#de8a56` | Botón Probar, Brote, confeti |
| `--red` | `#c9574a` | Botón objetivo (el botón de costura), confeti |
| `--pink` | `#e7a3a0` | Goma de Mina, flor de Brote, ícono de borrar |
| `--blue` | `#7298c1` | Botón Otro, pestaña de Pliegue, aguja de Ovillo |
| `--blue-ink` | `#3d6ea5` | Anotaciones: foco, pista, círculos, marcador de salida, "z", hilo del botón |
| `--yellow` | `#f0d27a` | Estrella del mareo, centro de la flor |
| `--green` | `#a4b86d` | Hojas de Brote |
| `--shadow` | `rgba(84, 62, 38, 0.2)` | Sombra plana de todo recorte |
| `--tape` | `rgba(222, 204, 158, 0.8)` | Cinta de papel |

### Colores literales en uso

| Uso | Valor |
|---|---|
| Tarjeta ↑ / ↓ / ← / → | `#a9c3de` / `#f2d98c` / `#eeb3ac` / `#eeac7f` |
| Botón Borrar | `#f3cfc9` |
| Botón deshabilitado | `#e6dccb` |
| Cruz de error | `#c24a3c` |
| Blanco de ojos | `#fbf6ea` (`CREAM`) |
| Interior de boca | `#7b3129` |
| Piso del tablero | `#f6efdf` |
| Piedra (sombra / luz) | `#9f937f` / `#bdb09c` |
| Charco | `#9dbbd8` |
| Trazo de lápiz de Mina | `#47444c` |
| Hilo de Ovillo | `#c25a51` |
| Confeti | `['#de8a56', '#c9574a', '#e7a3a0', '#7298c1', '#f0d27a', '#a4b86d']` |

### Tipografía

Google Fonts: `Andika:wght@400;700` y `Gochi Hand`.

```css
--hand: 'Gochi Hand', 'Andika', cursive;
--body: 'Andika', system-ui, sans-serif;
```

| Elemento | Escritorio | ≤ 600 px | ≤ 440 px |
|---|---|---|---|
| Cuerpo | Andika 18px / 1.35 | 17px | — |
| Consigna `.task` | Andika 700 23px / 1.2 | 20px | 18px |
| Pestaña `.tab` | Andika 700 17px / 1 | — | 14px |
| Botón `.btn` | Andika 700 20px (Probar 22px) | — | — |
| Pista `.track-hint` | Gochi Hand 23px / 1.1, `--blue-ink` | 21px | — |
| Número de hoja `.page` | Gochi Hand 22px, rotado −4° | 18px | — |
| Globo de diálogo (SVG) | Gochi Hand 22 unidades | — | — |

Regla: los **dígitos** van siempre en Andika. En Gochi Hand el "1" se parece a un "7";
por eso `.page b { font: 700 0.8em var(--body); }`.

### Grosores de trazo

| Elemento | Grosor |
|---|---|
| Contorno de personaje (`SW`) | `3` |
| Borde de interfaz (CSS) | `2.6px` |
| Borde exterior del tablero | `3` |
| Grilla del tablero | `1.8`, opacidad `0.42` |
| Contorno de ojo / párpado y boca | `2.4` / `2.6` |
| Pliegues y facetas secundarias | `1.3`–`1.5`, opacidad `0.45`–`0.5` |
| Flecha en tarjeta (viewBox 48) | `4.6` |
| Cruz en tablero / en tarjeta (viewBox 100) | `5.2` / `7` |
| Círculo de éxito / anillo de tarjeta | `3.6` / `3.2` (`vector-effect: non-scaling-stroke`) |
| Marcador de salida | `2.6`, `stroke-dasharray: 2 7` |
| Pasto (3 trazos) | `2`, opacidad `0.8` |
| Trazo de Mina / hilo de Ovillo | `2.8` con `dasharray 9 7` / `3` |
| Casillero vacío `.slot` | `2.4px dashed rgba(43, 38, 34, 0.35)` |

Todos los trazos llevan `stroke-linecap: round` y `stroke-linejoin: round`.

### Radios (siempre asimétricos)

| Elemento | `border-radius` |
|---|---|
| Recorte genérico `--r-cut` | `14px 10px 15px 9px / 10px 15px 9px 14px` |
| Tarjetas de la paleta (alternan) | `13px 9px 15px 10px / 9px 14px 10px 15px` y `10px 15px 9px 13px / 14px 9px 15px 10px` |
| Pestaña | `18px 22px 0 0 / 16px 18px 0 0` |
| Hoja | `8px 12px 9px 14px / 12px 8px 14px 9px` |
| Tira de programa | `10px 6px 12px 7px / 7px 12px 6px 10px` |
| Casillero vacío | `12px 9px 13px 8px` |

### Sombras planas

| Elemento | Desplazamiento |
|---|---|
| Recorte `.cut` | `translate(3px, 4px)` |
| Recorte presionado | el elemento `translate(2px, 3px)`, la sombra `translate(1px, 1px)` |
| Hoja `.sheet` | `translate(7px, 9px)` |
| Tira `.program` | `translate(6px, 8px)` |
| Suelo en SVG | elipse con `fill="url(#hatch)"` (líneas a −35°, grosor 1.6, opacidad 0.55, cada 6) |

### Espaciado

| Elemento | Valor |
|---|---|
| `.desk` | `max-width: 1200px`, `padding: 12px 16px 28px`, `gap: 20px` |
| `.sheet` | `padding: 8px 14px 14px` |
| `.program` | `padding: 16px 20px 16px 30px`, `gap: 14px 20px` |
| Paleta / acciones | `gap: 10px` / `gap: 12px` |
| `.track` | `gap: 12px 20px`, `min-height: 78px` |
| Tarjeta paleta / en tira / tira larga (> 4) | `64px` / `56px` / `48px` |
| Botón `.btn` | `min-height: 62px` |

## 3. Técnica de tinta

### Filtros (`index.html`)

```html
<filter id="boil" x="-15%" y="-15%" width="130%" height="130%">
  <feTurbulence id="boil-noise" type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="1" result="n"/>
  <feDisplacementMap in="SourceGraphic" in2="n" scale="3.2" xChannelSelector="R" yChannelSelector="G"/>
</filter>
<filter id="rough" ...>    <!-- baseFrequency 0.028, numOctaves 2, seed 4, scale 3.6 -->
<filter id="rough-lg" ...> <!-- baseFrequency 0.012, numOctaves 2, seed 9, scale 6 -->
```

| Filtro | Dónde se usa | Anima |
|---|---|---|
| `boil` | Capas `floor`, `deco`, `obst`, `trail` del tablero; el `<g>` de tinta del personaje; el botón objetivo; órbita de mareo; globos, cruces, círculos, humo, "z" | Sí |
| `rough` | `::before`/`::after` de `.cut` y `.tab` (tarjetas, botones, pestañas) | No |
| `rough-lg` | `::before`/`::after` de `.sheet` y `.program` (superficies grandes) | No |

### Hervor de línea ("line boil")

`app.js` cambia la semilla del ruido cada **130 ms**, en un ciclo de **3 cuadros**
(semillas 1, 8, 15). Es a pasos, como animación cuadro a cuadro, no continuo:

```js
if (!REDUCED) {
  setInterval(() => {
    boilFrame = (boilFrame + 1) % 3;
    noise.setAttribute('seed', String(boilFrame * 7 + 1));
  }, 130);
}
```

- **Movimiento reducido:** si `matchMedia('(prefers-reduced-motion: reduce)')` coincide,
  el intervalo no se crea y la línea queda quieta en la semilla 1.
- **El ruido viaja con el personaje:** el filtro va en un `<g>` *dentro* del `<g>` que
  traslada al personaje. Si se pone en un ancestro sin transformación, el personaje
  "nada" a través de un ruido fijo al tablero.
- **El texto no hierve:** en los globos el filtro va solo en la forma, no en el `<text>`.
- La interfaz HTML no hierve (usa `rough`, estático): mantiene la legibilidad y el costo bajo.

### Grano de papel

`body` lleva un SVG en data URI de 240×240: `feTurbulence` `fractalNoise`,
`baseFrequency='.9'`, `numOctaves='3'`, y una `feColorMatrix` que convierte el canal R
en un alfa muy bajo (`.5 0 0 0 -.16`) teñido de marrón (`.36 .27 .17`).

### Ayudantes de `js/ink.js`

| Función | Qué hace | Uso típico |
|---|---|---|
| `rng(seed)` | Generador mulberry32 determinista, devuelve `() => [0,1)` | Toda variación: la misma semilla dibuja la misma forma |
| `smoothClosed(pts)` | Spline Catmull-Rom cerrada como Béziers cúbicas | Cuerpos, manchas de tinta |
| `smoothOpen(pts)` | Spline Catmull-Rom abierta | Trazos, rastros, hilo suelto |
| `blob(cx, cy, rx, ry, { wob = 0.04, n = 10, seed = 1, rot = 0 })` | Elipse con radio alterado ±`wob` en `n` puntos | Piedras, ovillo, pies, botón |
| `wobblyPoly(points, { wob = 1, bow = 1.4, seed = 1 })` | Polígono con esquinas corridas ±`wob` y lados curvados ±`bow` ("cortado con tijera") | Pliegue, lápiz, borde del tablero |
| `wobblyLine(x1, y1, x2, y2, { bow = 2, seed = 1, segs = 1, jit = 0.8 })` | Trazo único en `segs` tramos, curvado y con temblor | Grilla, flechas, cruces |
| `penLoop(cx, cy, rx, ry, { seed = 1, turns = 1.18, start = -2.2 })` | Círculo rápido de lapicera: 1.18 vueltas, 40 puntos, extremos que no cierran | Círculo de éxito, anillo del paso actual |
| `leaf(x0, y0, x1, y1, w)` | Hoja de dos curvas cuadráticas de base a punta | Brote |
| `spiral(cx, cy, r, turns = 2.2, seed = 1)` | Espiral chica aplanada al 80 % en Y | Ojos mareados, órbita de mareo |
| `el(tag, attrs, parent)` | Crea un nodo SVG con atributos y lo agrega | Todo el SVG del demo |

## 4. Componentes de interfaz

### Recorte de papel (`.cut`) — la primitiva

El elemento no tiene fondo propio. Dos pseudoelementos con la misma forma dibujan el
papel y su sombra; el filtro deforma solo el borde, no el texto:

```css
.cut { position: relative; isolation: isolate; border: 0; background: none; border-radius: var(--r-cut); }
.cut::before, .cut::after { content: ""; position: absolute; inset: 0; border-radius: var(--r-cut); filter: url(#rough); pointer-events: none; }
.cut::before { z-index: -1; background: var(--fill, var(--sheet)); border: 2.6px solid var(--ink); }
.cut::after  { z-index: -2; background: var(--shadow); transform: translate(3px, 4px); }
```

Receta: agregar `class="cut"` y definir `--fill`. Para variar el recorte, redefinir
`--r-cut` en el elemento (así lo hacen las tarjetas de la paleta).

### Cinta de papel (`.tape`)

`92px × 26px`, `background: var(--tape)`, extremos dentados con `clip-path: polygon(...)`
de 16 puntos, `z-index: 5`. Derecha: `top: -11px; right: -24px; rotate(9deg)`.
Izquierda: `bottom: -10px; left: -22px; rotate(-7deg)`. En ≤ 600 px: `70px × 22px` y
`right`/`left: -10px` (si no, genera desplazamiento horizontal a 390 px).

### Pestañas de cuaderno (`.tab`)

- Botones `role="tab"` con retrato SVG del personaje (`viewBox="-52 -100 104 104"`) y
  nombre. El color es `--tab: def.color`.
- `::before`: borde de 2.6px **sin borde inferior**, radio `18px 22px 0 0 / 16px 18px 0 0`, `rough`.
- Apilamiento: `.tabs { margin-bottom: -7px }`. Las no elegidas quedan detrás de la hoja
  (`z-index: 1`, `translateY(7px)`), la hoja tiene `z-index: 2`, la elegida va delante
  (`z-index: 3`, `translateY(1px)`). `.tabs` **no** debe crear contexto de apilamiento.
- Hover: `translateY(3px)`. Elegida: subrayado de lápiz (`::after`, SVG de trazo ondulado 2.2).
- Teclado: flechas ← → recorren y seleccionan; `tabIndex` 0 solo en la elegida.
- ≤ 440 px: columna (retrato arriba, nombre abajo), `padding-bottom: 17px` para que el
  nombre no quede tapado por la hoja.

### Hoja y tira de programa rayada

- `.sheet`: recorte grande con `rough-lg`, sombra `7px 9px`, cinta en dos esquinas.
- `.program`: hoja de cuaderno. Margen rojo y renglones azules con cortes duros
  (no son degradés visibles):

```css
background-image:
  linear-gradient(90deg, transparent 17px, rgba(201, 87, 74, 0.55) 17px, rgba(201, 87, 74, 0.55) 19px, transparent 19px),
  repeating-linear-gradient(180deg, transparent 0 27px, rgba(61, 110, 165, 0.18) 27px 29px);
```

### Tarjetas de flecha

- Paleta en orden `['left', 'up', 'down', 'right']`; `--fill` según `data-dir` (§2).
- Flecha: SVG `viewBox 0 0 48 48`, astil `wobblyLine(8, 25, 37, 23.5, { bow: 1.8 })` y
  cabeza `M27,12.5 Q33,18 38.5,23.5 Q32,29 26.5,35`, trazo 4.6, rotada según
  `DIRS[dir].rot` (−90, 0, 90, 180).
- En la tira cada tarjeta tiene inclinación al azar `--tilt` entre −2.5° y 2.5°.
- Entrada: vuela desde la paleta (WAAPI 380 ms, `cubic-bezier(.3,.6,.35,1)`, arco con
  `translate`, `scale` 1.12 → 1.08 → 1, `rotate` −8° → 4° → 0°).
- Reacomodo (FLIP): 220 ms `ease-out`. Quitar: 260 ms `ease-in` (sube, gira 28°, cae y se
  achica a 0.4). Borrar todo: 220 ms con 30 ms de escalonado.
- Se animan las propiedades individuales `translate`/`scale`/`rotate`, **no** `transform`,
  para no pisar la inclinación `--tilt` que vive en `transform`.
- Arrastre: umbral 10 px; fantasma `position: fixed` rotado hasta ±12° y `scale(1.1)`;
  cursor de inserción `.caret` (línea punteada azul de 58px). Soltar fuera de la tira
  (tolerancia 30 px en X, 40 px en Y) devuelve el fantasma a la paleta en 200 ms.
- Máximo 12 pasos (`MAX_STEPS`). Con más de 4 pasos, `.track.many` achica tarjetas a 48px.

### Conectores punteados

Entre tarjetas de la tira, `li.step-li:not(:last-of-type)::after`: SVG `17 × 12` con línea
`stroke-dasharray='.5 4'` y cabeza de flecha, a `right: -19px`, opacidad 0.75. Se lee
como "y después". La pista vacía usa el mismo lenguaje: flecha curva punteada azul
(`stroke-dasharray="1 6"`) + "Toca una flecha".

### Botones y estados

| Estado | Cómo se ve |
|---|---|
| Normal | Probar `--orange`, Borrar `#f3cfc9`, Otro `--blue`; ícono dibujado de 26px |
| Hover | Pestaña baja a `translateY(3px)`; en la paleta el ícono `scale(1.08) rotate(-3deg)`; en la tira la tarjeta sube 3px |
| Presionado | Elemento `translate(2px, 3px)`, sombra `translate(1px, 1px)`: se "aplasta" contra el papel |
| Foco (teclado) | `outline: 3px dashed var(--blue-ink); outline-offset: 5px` |
| Deshabilitado | `--fill: #e6dccb`, texto `rgba(43, 38, 34, 0.5)`, ícono opacidad 0.5 |
| Ejecutando | `setRunning(true)` deshabilita paleta, tira, Probar, Borrar y Otro. Paso actual: `.is-current` (`translateY(-9px) scale(1.08)`) con anillo azul dibujado en 260 ms. Pasos hechos: `.is-done` (opacidad 0.55). Paso fallido: cruz roja dibujada |
| Éxito | Otro **reemplaza** a Probar (Probar `hidden`), aparece con un pop de 320 ms y un anillo azul dibujado en 480 ms (retardo 300 ms). Cualquier edición vuelve a mostrar Probar |

Nota: `.btn` usa `display: inline-flex`, que pisa al atributo `hidden`; por eso existe
`.btn[hidden] { display: none; }`.

### Globo de diálogo

- Ancho `max(56, texto.length * 10.5 + 24)`, alto `34`, radio `11`, cola de 12 de ancho y
  11 de alto (`roundedPath`), con temblor ±0.8 en cada tramo.
- Relleno `#fbf7ee`, trazo 2.6, `boil` solo en la forma. Texto Gochi Hand 22 en `y = -10`.
- Se sujeta horizontalmente al tablero (`[-10 + w/2, 510 - w/2]`); la cola sigue apuntando
  al personaje.
- Aparece con `popAnim` 240 ms (origen `50% 100%`), dura 1300 ms, se desvanece en 200 ms.
  Hay un solo globo a la vez. Textos: "¡Ay!", "¡Ji, ji!", "¡Pío!", "¡Blup!", "¿Mmm?".

### Cruz y círculo

- **Cruz** (`drawX`): dos `wobblyLine` de unas 38 unidades (`bow: 2.4`), `#c24a3c`, trazo 5.2;
  se dibujan con `drawOn` (150 ms, la segunda con 170 ms de retardo). Choque con
  obstáculo: centro de la celda + 10 en Y. Salida del tablero: sobre el borde por donde
  salió (+20 en Y si el choque es horizontal).
- **Círculo** (`penLoop`): azul `#3d6ea5`. Éxito: `penLoop(cx + 6, cy + 4, 64, 56)`, trazo
  3.6, dibujado en 560 ms con retardo 160 ms. Paso actual: `penLoop(50, 50, 46, 44)` en un
  SVG superpuesto con `preserveAspectRatio="none"`.
- `drawOn(path, dur, delay)`: fija `stroke-dasharray` al largo del trazo y anima
  `stroke-dashoffset` del largo a 0. Con movimiento reducido el trazo aparece completo.

### Otros elementos del tablero

| Elemento | Receta |
|---|---|
| Objetivo: botón de costura | `blob(0, 0, 26, 25)` `#c9574a` + aro `blob(0, 0, 18, 17.5)` `#b64a3f` + 4 agujeros r 3.3 + hilo azul en X. Flota ±1.6 (`sin(t / 520)`), destello que parpadea |
| Piedra | `blob` con faceta de sombra recortada, grieta y guijarro |
| Charco | `blob(0, 24, 38, 14)` `#9dbbd8`, dos ondas crema, una gota |
| Mancha de tinta | 14 puntos de radio alterno 20/26, relleno tinta, 3 gotas y un brillo crema |
| Pasto | 3 trazos cortos desde un punto (el lenguaje de la referencia) |
| Salida | Elipse `rx 34`, `ry 10` punteada azul bajo los pies |
| Confeti | 36 papelitos (35 % triángulos) con contorno de tinta 1.3; gravedad 620, giro, aleteo lateral y volteo en Y (`scale(1, cos)`); viven 2–2.8 s |
| Humo (`puff`) | 7 rayos + 3 círculos, escala 0.5 → 1.25 en 420 ms; va en la capa `shadow`, **debajo** del personaje |

## 5. Personajes

### Receta de un personaje nuevo

**Presupuesto de formas.** Un cuerpo principal + 2–4 piezas que definen la silueta
(brote, goma, cola, aguja) + cara. Referencia: Brote = cuerpo, 2 pies, tallo con 2 hojas,
cachetes; Mina = punta, madera, cuerpo, virola, goma, 2 brazos de trazo. Si hace falta
más de ~8 piezas para leerlo, el concepto no es bueno.

**Contorno unificado.**
- Un solo grosor, `SW = 3`, con `ink()`: trazo `INK`, `linejoin`/`linecap` round.
- Detalles internos más finos (1.3–1.5) y con opacidad 0.45–0.5.
- La faceta de sombra se hace así: `clipPath` con el cuerpo, un rectángulo del tono
  oscuro y encima el cuerpo claro corrido unos píxeles. Después, el contorno encima.
- Los `id` de `clipPath` llevan el prefijo `uid` que recibe `build`; el mismo personaje
  se construye varias veces (tablero y retrato de pestaña).

**Coordenadas.** Pies en `(0, 0)`, arriba es Y negativa, alto de cuerpo ~70–90
unidades. El personaje se dibuja a `SCALE = 1.1` en una celda de 100.

**Ojos y pupilas** (los construye `app.js` a partir de `def.eyes`):
- Cada ojo tiene elipse `#fbf6ea` con trazo 2.4 y pupila tinta de radio `pr`.
- Alternativas: cerrado (curva hacia abajo), feliz (`^`) y mareado (`spiral`).
- La pupila se desplaza `look * (rx - pr - 0.4)`.
- Parpadeo:
  - Intervalo `1.6 + random * 3.6` s, dura 0.15 s.
  - 22 % de probabilidad de un segundo parpadeo entre 0.22 y 0.37 s.
  - Se escala el ojo en Y y, pasado 0.82, se muestra la curva cerrada.
- Seguimiento del puntero:
  - Mira el puntero durante 3500 ms desde el último movimiento, con intensidad
    `min(1, distancia / 70)`, suavizado `min(1, dt * 16)`.
  - Sin puntero, mira al azar cada 1400–4000 ms, entre
    `[[0, 0.15], [0.75, 0.1], [-0.75, 0.1], [0.2, 0.85], [-0.3, -0.5], [0, 0.15]]`.
  - En reposo el cuerpo se inclina `look.x * 2.5` grados hacia donde mira.
  - Al voltearse (`face = -1`) la pupila se multiplica por el signo de `face`.
- Boca (`def.mouth` o `null`): `smile`, `grin` (rellena `#7b3129`), `o`, `yawn`, `wavy`.

**Estados obligatorios.**

| Estado | Quién lo hace | Qué debe verse |
|---|---|---|
| Reposo | `app.js` (respiración) + `m.fidget` cada 5–10 s | Respiración (`breathe.period`, `breathe.amp`) y un gesto propio |
| Parpadeo | `app.js` | Automático |
| Mirar | `app.js` + `A.lookAt` | Pupilas al puntero o a la tarjeta recién agregada |
| Tocar | `m.tap` | Risa: aplastamiento + temblor, ojos felices, globo |
| Asentir | `m.nod` | Al agregar un bloque |
| Caminar | `m.step(A, to, d)` | Desplazamiento de una celda con aplastar/estirar |
| Festejar | `m.celebrate` | Festejo propio del personaje |
| Chocar | `m.bump(A, hit, d)` | Llamar `A.mark()` al impacto, volver, `A.dizzy(true/false)` |
| Dormir | `m.sleep` | Bostezo (`mouth = 'yawn'`) y pose de sueño; "z" y respiración lenta los pone `app.js` |

**Personalidad en el movimiento.** Se decide con tres palancas:

- **Ritmo:** cuántos impulsos por celda.
- **Peso:** profundidad de la anticipación y altura del salto.
- **Arrastre:** qué pieza llega tarde (resortes en `render`).

Mismo verbo, distinto cuerpo: Brote salta con resorte, Mina da saltitos nerviosos, Pliegue flota, Ovillo rueda pesado.

### Los 4 personajes: tiempos y curvas

Valores de `m.step` (una celda). `dx` es la dirección horizontal (−1, 0, 1).

| | Brote (semilla) | Mina (lápiz) | Pliegue (pájaro de papel) | Ovillo (lana) |
|---|---|---|---|---|
| Personalidad | Entusiasta, elástico | Prolija, nerviosa | Liviano, orgulloso | Pesado, tranquilo |
| Anticipación | 95 ms `out`: `sy .8 sx 1.16`, `lean -5·dx` | 90 ms `out`: `lean 11·dx`, `sy .92`, brazos 40 | 140 ms `out`: `sy .76 sx 1.12`, ala −10, cola 12 | 160 ms `inOut`: `sx 1.07 sy .94`, `lean 4·dx` |
| Traslado | 300 ms `inOut` | 3 saltitos de 150 ms `inOut` | 520 ms `inOut` | 480 ms `softBack` (sobrepasa) |
| Vuelo | sube 150 `out` a `hop -26` (`sy 1.17 sx .88`), baja 150 `in` | cada saltito: sube 70 `out` a `hop -8` (`sy 1.08`), baja 80 `in` (`sy .94`) | sube 260 `out3` a `hop -44` (`sy 1.16`), cuelga 90 `inOut` a −48, baja 170 `in` | sin salto; giro de hebras 640 ms `softBack` = distancia / 31 rad |
| Aterrizaje | 70 `out` `sy .8 sx 1.18` → 110 `out` `sy 1.07` → 110 `inOut` a 1 | 90 `out` `lean -3·dx sy 1.03` → 110 `inOut` | 70 `out` `sy .88 sx 1.08` → 160 `back` | 240 `inOut` → 240 `out` `sx .95 sy 1.05` → bamboleo 360 ms (`sin(ms/45)·0.05` decreciente) |
| Arrastre | Tallo con resorte `k 180, damp 9` (ángulo) y `k 260, damp 10` (estiramiento) | Brazos con resorte `k 120, damp 10` | Cola con resorte `k 150, damp 7`; aleteo 130/170/140/120 ms | Aguja con resorte `k 90, damp 5`; hilo suelto que se mece |
| Respiración | 1.7 s, 0.028 | 1.15 s, 0.016 | 2.3 s, 0.02 | 3.2 s, 0.032 |
| Choque | Salta hacia el 36 %, se aplasta contra el obstáculo (`sx .72 sy 1.18`) en 60 ms, rebota, tallo caído 40° | Avanza al 30 %, vibra como regla (`sin(ms/22)·20°` decreciente, 650 ms) | Salta al 38 %, se arruga (`sx .66`, pliegues visibles) y se desarruga en 400 ms | Rueda al 34 % en 300 ms `in`, se aplasta (`sx .7 sy 1.16`) y tiembla como gelatina 700 ms |
| Festejo | 3 saltos (`hop -40 + i·6`), crece una hoja nueva en el 2.° (520 ms `back`) | Dibuja un rulo con la punta (900 ms, radio 20×9) y da 2 saltos girando | Salto a `hop -70` y mortal completo (`spin 360`, 380 ms `inOut`), luego aletea | 3 botes decrecientes (−44, −24, −10) girando 180° cada uno |
| Tocar | "¡Ji, ji!", aplastar 80 ms + temblor 520 ms | "¡Ji, ji!", brazos arriba agitándose 560 ms | "¡Pío!", aleteo rápido 600 ms | "¡Blup!", gelatina 900 ms |
| Gesto en reposo | Mira a un lado y al otro, mueve el brote y asiente | Dos golpecitos de punta y una vuelta completa | Inclina la cabeza (−12°), 600 ms, y se acicala | Se mece ±4 rodando |
| Dormir | Bostezo 700 ms, cae con brote vencido (38°) | Bostezo con brazos arriba, se recuesta 16° | Bostezo, mete la cabeza (`spin 10`), patas encogidas | Bostezo, se derrite (`sy .86 sx 1.1`), aguja caída |
| Rastro | — | Línea de lápiz punteada | — | Hilo ondulado; el ovillo se achica hasta 0.84 |

### Registro en `js/characters.js` y contrato con `app.js`

Un personaje es un objeto literal; se registra agregándolo al arreglo exportado:

```js
export const CHARACTERS = [brote, mina, pliegue, ovillo];
```

| Campo | Tipo | Uso en `app.js` |
|---|---|---|
| `id`, `name` | texto | `?char=`, pestaña, consigna, mensajes |
| `color` | hex | Color de pestaña y subrayado del nombre |
| `eyes` | `[{ x, y, rx, ry, pr }]` (2) | Construcción de ojos y cálculo de mirada |
| `mouth` | `{ x, y, w }` o `null` | Boca generada |
| `top` | número | Altura del globo de diálogo |
| `head` | número | Altura de la órbita de mareo y las "z" |
| `pivot` | número | Centro de giro de `spin` y del humo |
| `breathe` | `{ period, amp }` | Respiración |
| `defaults` | objeto | Parámetros propios del *rig*; `settle()` los restaura salvo `PERSIST = ['leaves', 'leafNew', 'roll', 'size']` |
| `trail` | `{ kind: 'pencil' \| 'yarn' }` (opcional) | Rastro en el papel |
| `build(g, uid)` | función | Dibuja en `g` y devuelve `parts` (referencias + estado de resortes) |
| `render(rig, parts, st)` | función por cuadro | `st = { t, dt, vx, vy, ay }`; mueve piezas propias |
| `m.step, bump, celebrate, tap, nod, sleep, fidget` | `async (A, ...)` | Movimientos (§5) |

API del actor `A` que reciben los movimientos:

| Miembro | Qué hace |
|---|---|
| `A.rig` | Estado: `x, y, hop, sx, sy, lean, spin, face, eyes, mouth, dizzy, threaded` + `defaults` |
| `A.T(props, ms, ease)` | Interpola propiedades del *rig*; devuelve promesa |
| `A.P(ms, fn(p, ms))` | Proceso por cuadro (oscilaciones, rulos) |
| `A.wait(ms)` | Espera cancelable |
| `A.lookAt(x, y, ms)` | Fuerza la mirada (−1…1) durante `ms` |
| `A.bubble(texto)` | Globo sobre la cabeza |
| `A.mark()` | Dispara la marca de error en el momento del impacto |
| `A.dizzy(on)` | Ojos en espiral, boca ondulada y órbita de estrellas |

Transformación que arma `app.js` cada cuadro (el orden importa):

```js
pos.transform  = `translate(x, y + hop) scale(1.1)`;
body.transform = `rotate(lean + attn) translate(0 pivot) rotate(spin) translate(0 -pivot) scale(face*sx, sy)`;
```

`lean` gira sobre los pies, `spin` sobre `pivot`, y el aplastamiento se ancla en los pies.
Cuando `face` pasa por 0 (media vuelta de papel) la escala se fuerza a `0.001` para no
generar una matriz singular.

Movimiento reducido: `A.perform(name)` usa `reducedMotion` en lugar de `def.m`. Solo hay
cambios de estado (ojos, boca, cruz), sin saltos. Un personaje nuevo no necesita versión
propia.

## 6. Motor de animación (`js/anim.js`)

| Exportación | Firma | Comportamiento |
|---|---|---|
| `engine` | `update(time)`, `abort(owner)`, `speed` | Avanza todo en el `requestAnimationFrame` de `app.js` |
| `tween` | `(owner, target, props, dur, ease = E.inOut)` | Interpola números; un tween nuevo **quita** esas propiedades a los tweens anteriores del mismo objeto |
| `proc` | `(owner, dur, fn(p, elapsedMs))` | Llama `fn` cada cuadro |
| `wait` | `(owner, ms)` | `proc` vacío |
| `spring` | `(x, v, target, k, damp, dt) → [x, v]` | Resorte amortiguado para arrastre |
| `ABORT` | `Symbol` | Motivo de rechazo al abortar |
| `E` | curvas | `linear`, `in`, `in3`, `out`, `out3`, `inOut`, `inOut3`, `back` (c = 1.9), `softBack` (c = 0.9), `hang` |

- **Dueños y cancelación.** Toda interpolación tiene dueño. `actor.act(fn)` llama
  `interrupt()` (aborta todo lo del actor) y ejecuta `fn`; un `ABORT` se traga y
  devuelve `false`.
- Toda promesa lleva un `.catch` silencioso (`handled`). Sin eso, las interpolaciones
  lanzadas sin `await` generan `Unhandled rejection` al abortarse.

Convenciones de aplastar, estirar y sobrepasar:

| Momento | Valores típicos |
|---|---|
| Anticipación (antes de saltar) | `sy 0.76–0.82`, `sx 1.12–1.16`, 90–140 ms `E.out` |
| Estiramiento (despegue) | `sy 1.12–1.2`, `sx 0.86–0.9` |
| Impacto (aterrizaje) | `sy 0.8–0.88`, `sx 1.08–1.18`, 60–70 ms `E.out` |
| Sobrepaso | `sy 1.04–1.07` 110 ms, o `E.back` / `E.softBack` al volver a 1 |
| Volumen | Si `sy` sube, `sx` baja (y viceversa); la respiración usa `sx = 1 − 0.6·br` |

El rebote va en los **valores** de los cuadros clave o en `E.back`. No se usa una
`cubic-bezier` con control > 1 sobre una escala calibrada: multiplica el sobrepaso.

### Trampas de SVG encontradas

| Trampa | Regla |
|---|---|
| Una animación CSS/WAAPI de `transform` **pisa** el atributo `transform` | `<g>` exterior con la posición en atributo, `<g>` interior animado. Así están globos, humo, "z" y el objetivo. El personaje no usa CSS: `app.js` escribe los atributos por cuadro |
| El origen de transformación en SVG es el del viewBox | En el nodo animado: `transform-box: fill-box` y `transform-origin` explícito (`popAnim` usa `50% 100%`) |
| `animationend` burbujea: el fin de la animación de un hijo llega al padre | El demo usa `animation.finished` de WAAPI, que no burbujea. Si se usa CSS: `if (event.target === node)` |
| El atributo `hidden` no gana contra `display` del autor | `.btn[hidden] { display: none; }` |
| Animar `transform` en una tarjeta borra su `--tilt` | Animar `translate`/`scale`/`rotate` por separado |
| Un filtro en un ancestro fijo hace que el ruido no acompañe | Filtro en un `<g>` dentro del traslado |
| `NaN` en `transform` si al *rig* le falta un campo | Los retratos de pestaña usan un *rig* completo (`hop, sx, sy, lean, spin, face`) |
| `id` de `clipPath` duplicados | Prefijo `uid` por construcción |
| Rastro de lápiz que dependía de la altura del salto | Con pocos cuadros por segundo desaparecía. Se muestrea cada cuadro y el punteado lo da `stroke-dasharray: 9 7` |
| Entrada durante el bostezo ignorada | `sleeping = true` se marca al empezar a bostezar, no al terminar |

## 7. Diseño y puntos de corte

Ancho del escenario (tablero + pestañas), limitado por el alto de la ventana:

```css
.stage { width: min(100%, 760px, calc((100dvh - 292px) * 1.21 + 28px)); min-width: min(100%, 340px); }
```

| Ancho | Tira de programa | Otros cambios |
|---|---|---|
| > 860 px (escritorio) | Una fila: `"palette track actions"` | `.desk` máx. 1200px y centrado vertical (en todos los anchos); `.program` máx. 1160px |
| ≤ 860 px (tableta) | `"palette actions" / "track track"` | — |
| ≤ 600 px (teléfono) | `"palette" / "track" / "actions"`; paleta `space-between`; botones de igual ancho | Tarjetas 60px, en tira 50px; cinta más chica y adentro; tipografías menores |
| ≤ 440 px | — | Pestañas en columna, de igual ancho, retrato 30×34, nombre 14px |

Además: `@media (prefers-reduced-motion: reduce)` anula transiciones y animaciones CSS.
Blancos de toque: tarjetas de 48–64px, botones de 62px de alto.

## 8. Tablero y ejercicio

| Dato | Valor |
|---|---|
| Grilla | `COLS = 5`, `ROWS = 4`, celda `S = 100` unidades |
| `viewBox` | `-16 -22 532 438`, con `overflow: visible` (saltos y globos pueden salir) |
| Pies del personaje | `feet(c, r) = { x: c·100 + 50, y: r·100 + 78 }` |
| Obstáculos | Centrados en la celda y apoyados abajo (base ≈ +30), para no tapar cabezas de la fila de abajo |
| Capas (de abajo a arriba) | `floor, deco, marks, obst, goal, trail, shadow, actor, fx` |

**Generación** (`generateBoard(seed)`, hasta 2000 intentos con `rng(seed)`):

1. Salida y meta al azar, con distancia Manhattan entre 3 y 6.
2. De 3 a 5 obstáculos (`3 + ri(3)`) de tipo `rock`, `puddle` o `blot`, nunca en la
   salida ni en la meta.
3. **BFS** en 4 direcciones desde la salida. Si no hay camino, se descarta.
4. Largo del camino más corto entre 3 y 7.
5. Se descarta un pasillo recto libre (misma fila o columna y largo = Manhattan).
6. Al menos un obstáculo dentro del rectángulo entre salida y meta.
7. Hasta 7 matas de pasto decorativas en celdas libres.

El camino BFS queda en `B.path`. El chico nunca lo ve: no hay camino sugerido.

**Ejecución.** Paso a paso, se resalta la tarjeta actual. Salir del tablero o entrar a un
obstáculo produce un choque y una cruz. Llegar a la meta termina con éxito aunque sobren
pasos. Terminar en otra celda produce "¿Mmm?". Tras un error el personaje vuelve a la
salida con humo; la cruz y el rastro quedan hasta la próxima edición o ejecución.
Cambiar de personaje conserva el tablero.

**Parámetros de URL.**

| Parámetro | Efecto |
|---|---|
| `?seed=N` | Tablero inicial determinista (`parseInt`); sin él, semilla al azar |
| `?char=id` | Personaje inicial (`brote`, `mina`, `pliegue`, `ovillo`); un id desconocido cae en Brote |

"Otro" genera con `Math.random()`: esos tableros no son reproducibles por URL.

## 9. Problemas conocidos y debilidades

| Problema | Detalle y causa probable |
|---|---|
| **El círculo azul de éxito nunca queda centrado** | Causas probables, sin verificar una por una (no se corrigió): (1) el centro está fijo en la celda con un corrimiento a mano, `penLoop(cx + 6, cy + 4, 64, 56)`, en vez de salir de lo que hay que encerrar; (2) lo que hay que encerrar no está en el centro de la celda: el personaje se apoya abajo (pies en +78, cuerpo hacia +40) y el botón salta a `dx 48, hop -60`, arriba a la derecha; (3) `penLoop` es asimétrico: 1.18 vueltas empezando en −2.2 rad, con el radio creciendo de 0.955 a 1.045 (`(t - 0.5) * 0.09`), así que el tramo doble queda arriba a la izquierda. Arreglo sugerido: centrar en la caja (`getBBox`) de personaje + botón ya desplazado, y compensar la deriva de `penLoop` |
| Personajes chicos en escritorio | A 1280×800 el ancho sale del alto (`100dvh - 292px`): tablero ~580px y personaje ~100px |
| Pliegue es el personaje más débil | El ala parece pegada y la cabeza en punta lo hace leer como un cono |
| Confeti sobre la tira | El SVG tiene `overflow: visible` y el confeti cae 2–2.8 s: pasa por encima de la tira de programa antes de desvanecerse |
| Tocar para quitar un bloque falla a veces | Falló 1 de 5 corridas automáticas; causa no encontrada. Hipótesis sin verificar: el clic llega mientras la tarjeta todavía se reacomoda (FLIP de 220 ms) |
| `window.__demo` | Ganchos de prueba (`state`, `setProgram`, `solve`, `run`, `select`, `sleep`, `tap`, `next`, `setLeaves`). Hay que quitarlos o esconderlos detrás de una bandera antes de usarlo de verdad. `solve()` expone la solución |
| No probado | Tabletas reales con toque, Safari y Firefox; costo del hervor de línea en tabletas de gama baja |

## 10. Cómo verificar visualmente

Toda revisión de arte se hace **mirando capturas**, nunca solo leyendo el código.

1. Servir `demo-estilo/` con un servidor temporal y matarlo por PID al terminar (no con
   `pkill -f`):

   ```bash
   cd demo-estilo && python3 -m http.server 8799 --bind 127.0.0.1 & echo $! > /tmp/server.pid
   kill "$(cat /tmp/server.pid)"
   ```

2. Playwright con el Chromium del sistema:

   ```js
   // NODE_PATH=/tmp/pw/node_modules node shots.js
   const { chromium } = require('playwright');
   const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox', '--disable-gpu'] });
   const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
   page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
   page.on('pageerror', (e) => errs.push(e.message));
   await page.goto('http://127.0.0.1:8799/?seed=42&char=mina');
   await page.evaluate(() => document.fonts.ready);
   await page.evaluate(() => { window.__demo.setProgram(window.__demo.solve()); window.__demo.run(); });
   await page.waitForFunction(() => window.__demo.state.won, null, { timeout: 20000 });
   await page.screenshot({ path: 'shots/21-celebrate-mina.png' });
   ```

   - Para ver de cerca: `deviceScaleFactor: 3` y `clip` alrededor de
     `.layer-actor.getBoundingClientRect()`.
   - Para momentos de movimiento: esperar una condición (`state.rig.hop < -18`, existe
     `.xmark`, `state.won`) y no un tiempo fijo.
   - Para comparar lado a lado sin PIL: una página con `page.setContent` que muestre
     las PNG en base64 en una grilla, y una captura de esa página.
   - En 390px, medir `scrollWidth` contra `clientWidth` del documento; tienen que ser
     iguales.
   - Cero errores ni advertencias de consola.

3. Lista de capturas (las de referencia están en `demo-estilo/shots/`, semilla 42):

| Captura | Archivo |
|---|---|
| Cada personaje en reposo, 1280×800 | `01-idle-brote.png` … `04-idle-ovillo.png` |
| A mitad de paso, cada personaje | `10-walk-*.png` a `13-walk-*.png` |
| Festejo, cada personaje | `20-celebrate-*.png` a `23-celebrate-*.png` |
| Choque, cada personaje | `30-bump-*.png` a `33-bump-*.png` |
| Durmiendo (acercamiento) | `40-sleep-*.png` a `43-sleep-*.png` |
| Acercamiento ×3 en reposo | `50-closeup-*.png` a `53-closeup-*.png` |
| Tableta 820×1180 | `60-tablet-820x1180.png` |
| Teléfono 390px (página completa) | `61-phone-390.png` |
| Arrastre, después de ganar, tablero nuevo, foco de teclado | `62-drag.png` … `65-keyboard-focus.png` |

Además de las capturas, conviene comprobar:
- que arrastrar inserta en la posición correcta y soltar afuera no agrega nada;
- que cambiar de personaje durante una ejecución conserva el tablero;
- que se duerme a los ~12 s sin entrada y se despierta con cualquier entrada;
- que con `emulateMedia({ reducedMotion: 'reduce' })` la semilla de `#boil-noise` no cambia.

Para cada personaje, criticar sin generosidad:
- ¿se lee como ilustración dibujada?
- ¿la pose es coherente?
- ¿hay algo roto o superpuesto?
- ¿la personalidad se nota en el movimiento?
