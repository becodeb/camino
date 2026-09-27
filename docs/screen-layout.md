# 17 — Distribución de pantalla

Pedido del 2026-09-27. Se toma de Scratch, Pilas Bloques y Code.org **la distribución**:
dónde están los bloques, dónde se arma el programa, dónde se ve el resultado y dónde se
ejecuta. **No** se toma su diseño: el estilo sigue siendo el cuaderno de
[05](05-estilo-visual.md).

## Lo que tienen en común las tres plataformas

| Zona | Scratch | Pilas Bloques | Code.org |
|---|---|---|---|
| Bloques disponibles (paleta) | Izquierda, en columna | Izquierda, en columna | Centro-izquierda, en columna |
| Espacio para armar el programa | Centro, grande | Centro, grande | Derecha, grande |
| Resultado (escenario, tablero) | Derecha arriba | Derecha | Izquierda arriba |
| Ejecutar | Sobre el escenario (bandera) | Sobre el escenario | Debajo del escenario |
| Bloque de inicio | "al hacer clic en bandera" | "al empezar a ejecutar" | "al ejecutar" |

Patrón común: **paleta → programa → escenario**, con el botón de ejecutar pegado al
escenario y un bloque de inicio fijo del que cuelga el programa.

## Lo que hacen mal para un chico de 6 a 12 años

- **Mucho texto**: consignas largas (en Code.org, a veces en inglés), bloques con frases
  largas, menús con palabras.
- **Muchos botones**: paso a paso, modo rápido, subir, bajar, limpiar, zoom, centrar,
  mostrar código, ver la solución, modo oscuro, idioma, iniciar sesión.
- **Distracciones**: el modo oscuro, los menús, el asistente de IA, los enlaces a otras
  páginas.
- **Botones peligrosos**: "Ver la solución" a la vista.

## Nuestra distribución

### Horizontal (computadora, tablet apaisada; ancho de 1000 px o más)

```
┌──────────────────────────────────────────────────────────────────────┐
│ (personaje)  🔊 Consigna en una línea                     ✋ Ayuda    │
├──────────┬─────────────────────────────────┬─────────────────────────┤
│ PALETA   │ PROGRAMA                        │  ▶ PROBAR    ↺          │
│          │                                 │ ┌─────────────────────┐ │
│ [bloque] │  ┌ al empezar ┐                 │ │                     │ │
│ [bloque] │  │ [bloque]   │                 │ │      ESCENARIO      │ │
│ [bloque] │  │ [bloque]   │                 │ │      (tablero)      │ │
│          │  │ [      ]   │ ← hueco         │ │                     │ │
│          │                                 │ └─────────────────────┘ │
└──────────┴─────────────────────────────────┴─────────────────────────┘
```

### Vertical (tablet parada, celular)

```
┌─────────────────────────────┐
│ (personaje) 🔊 Consigna  ✋ │
├─────────────────────────────┤
│         ESCENARIO           │
│   ▶ PROBAR         ↺        │
├──────────┬──────────────────┤
│ PALETA   │ PROGRAMA         │
└──────────┴──────────────────┘
```

## Reglas

1. **Solo tres controles siempre visibles:** Probar (▶), Volver a empezar (↺) y Ayuda
   (✋ mano levantada). Nada más. No hay paso a paso, zoom, idioma, tema ni menú.
2. **La consigna es una línea**, siempre hablada, con el parlante para repetirla. Los
   íconos cargan el significado.
3. **Los bloques no tienen texto**, solo dibujo: flechas, el dibujo del objeto y el
   número de repeticiones. Así no depende de la lectura.
4. **Arrastrar es la forma principal:** de la paleta al programa, dentro del programa
   para reordenar y afuera del programa (de vuelta a la paleta) para borrar. Encastran
   con un pequeño "clic" visual. **Tocar** un bloque de la paleta lo agrega al final,
   como alternativa.
5. **Bloque de inicio fijo** del que cuelga el programa, con un **hueco punteado** donde
   va el próximo bloque. Así se ve dónde hay que soltar.
6. **Bloques que abrazan:** `repetir` y `si` tienen forma de C y envuelven a otros, con
   la misma forma de encastre que conocen.
7. **Salir** es un enlace discreto para el adulto, lejos de la zona de juego.
8. **Nada que distraiga:** sin modo oscuro, sin enlaces, sin puntajes ni estrellas
   durante la actividad.

## Qué se adapta en las áreas que no son de bloques

Las áreas generales (reglas, deducción, espacial, planificación) no tienen paleta ni
programa, pero siguen el mismo esqueleto:

- La consigna arriba y el escenario grande.
- Las opciones o piezas en la zona de la paleta.
- Los mismos tres controles en el mismo lugar.
- **Arrastrar** donde tenga sentido: animales a las casitas, cajas entre estantes, la
  pieza al hueco, la opción elegida al signo de pregunta.

## Cómo quedó implementado (2026-09-27, T1)

- **El esqueleto** es `app/src/ui/WorldSheet.tsx` y `shell.css`, compartido por todas las
  áreas. Barra: retrato del personaje, parlante, consigna en una línea (dos en el
  teléfono), "hoja N" y la mano levantada. Escenario: la hoja con el tablero, la figurita
  de la pista y la línea en tinta azul; arriba de la hoja (abajo en vertical) ▶ Probar o
  Seguir, y ↺. "Salir" pasó a la esquina de abajo a la izquierda, chico y pálido.
- **Corte horizontal/vertical** a 1000 px de ancho. En horizontal el ancho de la hoja
  sale del alto de la ventana; el programa se desplaza dentro de su zona. En vertical la
  hoja ocupa hasta 44 % del alto y la página se desplaza.
- **La mano** hoy registra `help_requested` y repite la última pista (o la consigna si
  todavía no hubo). La lógica de autonomía (esperar, ofrecer, "no la pidió") es de T2.
- **Bloques** (`areas/algorithmic/editor.ts`, `ui/BlockEditor.tsx`, `ui/blocks.tsx`):
  recortes de papel con encastre (muesca arriba, saliente abajo) dibujados con trazo
  exacto y el filtro `rough`, como todo `.cut`. Bloque de inicio naranja con el mismo ▶
  de Probar. La cinta (`repetir`) es un bloque en C color cinta con el número en un
  disco que se toca para cambiarlo. El programa sigue siendo el mismo `Program` de los
  generadores y el simulador: el editor solo lo edita.
- **Arrastrar**: umbral de 8 px; mientras se arrastra se abre un hueco azul punteado donde
  va a caer y el resto se corre. Soltar sobre el programa (con 30 px de tolerancia)
  inserta o reordena; soltar un bloque del programa en cualquier otro lado lo borra (cae
  y se desvanece); un bloque de la paleta soltado afuera vuelve a la paleta. Al encastrar,
  el bloque se desliza a su lugar, se aplasta un poco y aparecen dos rayitas azules.
  Tocar un bloque de la paleta lo agrega al final (o adentro de la cinta que se acaba de
  agregar tocando). Tocar un bloque del programa lo saca, salvo en *Arreglalo*, donde lo
  elige para cambiarlo.
- **Límites de esta versión.** Una cinta no entra en otra (el modelo tiene un solo nivel
  de repetición). El bloque "si hay mancha" se dibuja en C pero su boca es fija: ya trae
  adentro el bloque de salto, porque el comando es atómico ("si hay mancha adelante,
  saltala; si no, un paso"). Un `si` que envuelva bloques a elección necesita otro modelo
  de programa y queda para el mundo 2 de doc 16 (T3). Las áreas generales ya tienen la
  barra, la mano y "salir" en el mismo lugar; sus propios botones y el arrastre se
  adaptan en T4.

## Ayuda, primer contacto y mano fantasma (2026-09-27, T2)

- **La mano levantada** llama a `host.requestHelp()`: el controlador registra
  `help_requested` y manda la ayuda que toca (ver [09](09-dificultad-dinamica.md), "Ayuda y
  autonomía"). La primera vez que una pista queda esperando, la mano se sacude con un halo
  azul y se oye "Si querés ayuda, tocá la mano" (una vez por sesión).
- **La mano fantasma** (`ui/ghost.ts`) es la misma mano de papel durazno con trazo de
  tinta, señalando con el índice, en una capa fija que no se puede tocar. Muestra el gesto
  sobre la pantalla real sin cambiar nada: arrastra una copia del bloque hasta el hueco
  punteado, toca ▶, o toca la opción. Cada área le da su guion (`AreaDefinition.demo`).
- **El brillo de la meta** es un anillo de birome azul que late tres veces alrededor de lo
  marcado `data-guide="target"` (el botón, la casita del camión, el dibujo de las cajas).
- La ayuda espera a que el tablero se quede quieto (`busy`), así nunca tapa una corrida.
- Durante la sesión del chico no hay pestañas de personajes arriba del escenario (tampoco en
  la pantalla final); solo la galería de adultos las muestra.

