# Guía rápida para el docente — 1ro

"Los juegos del monstruo" (T43–T51), clase del martes 2026-10-27, unos 45–50 minutos.

**El link para cada compu** (sin sonido, en el marcador): `https://camino-prueba.becode.com.ar/?grado=1&sonido=no`

**Si algo falla, el plan B** (la ruta vieja de 1ro, la del 2026-10-20): `https://camino-prueba.becode.com.ar/?grado=1&sonido=no&ruta=clasica`

## La clase, en orden

Toda la clase es con las compus (sin calentamiento sin compus): unos 20 minutos de pasada guiada, que es la parte donde aprenden, y el resto del tiempo el Arcade libre.

### 1. La pasada guiada, ~20 minutos

Abren el link, eligen su personaje y la compu los lleva sola por los cuatro juegos, uno después del otro (cada uno hasta 5 minutos: tres rondas o cinco minutos, lo que pase primero):

1. **La receta del monstruo**: armar el sándwich en el orden del dibujo y tocar la campana.
2. **Copiá el baile**: el monstruo baila y ellos repiten los pasos.
3. **¿Qué salió mal?**: el monstruo hace algo mal (sale en malla a la nieve, se pone las medias arriba de los zapatos…); tocan el dibujo que está mal y lo arreglan.
4. **Tocá y pasa**: le ponen reglas a cada animal ("cuando lo toco, salta / cambia de color / tira papelitos / se esconde / gira") y después juegan tocándolos. Abajo a la derecha hay dos botones: el lápiz (**Armar**) y la mano (**¡A jugar!**).

Cada juego se muestra solo la primera vez con una mano fantasma. No hay que leer: todo es con dibujos, y el texto de la barra sale en mayúsculas. Al terminar la pasada sale la bandera verde.

### 2. El Arcade, el resto de la clase

Siete tarjetas: los cuatro juegos, "Tu personaje" (el de los papelitos), el vestidor y la carrera de teclas. Juegan a lo que quieran, cuantas veces quieran. **Lo que eligen y repiten solos es el dato más importante de la clase**: no los mandes a un juego en particular.

**Cómo vuelven a elegir otro juego** (mostráselo con el dedo la primera vez, sin explicar con palabras):

- **Mientras juegan**: abajo a la izquierda hay un botón grande, celeste, con el dibujo del Arcade (las tarjetitas de los juegos) y "Otro juego". Un toque y vuelven a las siete tarjetas.
- **Al terminar una ronda** (y al terminar la carrera de teclas): salen dos botones grandes, uno al lado del otro: el naranja **"¡Otra vez!"** (o "¡Otra carrera!") para jugar de nuevo, y el celeste **"Otro juego"**, el mismo dibujo del Arcade, para elegir otro.
- El botón chico de las cuatro tarjetitas arriba en la barra sigue estando (es para vos).

### 3. El cierre

- Unos 5 minutos antes del final: **"Quedan 5 minutos"** en `/admin`. Cada compu termina lo que está jugando y pasa a la encuesta: una pantalla por cada juego que jugó, con el dibujo del juego y tres caritas, nada más (la contestan solos), y después vuelve al Arcade.
- Al final: **"Terminar la clase"** (se toca dos veces). Cuenta 10 segundos, cierra la sesión y la compu muestra el jardín del chico. Queda lista para el grupo siguiente al cerrar y abrir la tapa.

## `/admin`

Con la contraseña del docente. En "Esta clase" se ve cada compu, en qué paso está y **a qué juego está jugando** (por ejemplo "juego libre · Tocá y pasa"), si ya tiene la bandera verde y si hizo la encuesta.

- **"Juegos para todos"**: si a los ~25 minutos alguien sigue en la pasada guiada, lo pasa al Arcade (lo que hizo queda guardado).
- **"Quedan 5 minutos"** y **"Terminar la clase"**: arriba.

## El rincón del adulto

Mantené apretada la esquina de arriba a la izquierda unos 0,8 segundos: se abre el menú oculto (saltar un paso, terminar la sesión, "Voz sí/no", el comentario del chico anterior, y para 1ro también "Abrir «La carrera»" y "Ir a la escalera de niveles"). Mantener apretado el ✋ de la barra registra "¿en qué lo ayudaste?" cuando ayudás a alguien.

## Qué mirar en vivo

- **¿Tocan sin mirar?** Si un chico toca muy rápido, su personaje se marea y se sienta un ratito: no es un castigo, es para que mire. Si a alguien le pasa todo el tiempo, acercate.
- **¿Miran el pedido antes de armar?** En la receta y en el baile, ¿miran primero o arrancan a tocar?
- **¿Entienden Armar / ¡A jugar!?** En "Tocá y pasa", ¿se dan cuenta solos de que tienen que pasar a jugar para tocar los animales? ¿Se ríen cuando el animal sin reglas solo se sacude?
- **¿Encuentran "Otro juego"?** ¿Vuelven solos a las tarjetas, o se quedan en un juego porque no saben salir?
- **¿Qué repiten?** ¿Vuelven a algún juego una y otra vez? ¿Alguno no lo elige nadie?
- **¿Algo no se entiende sin sonido?** Anotá en qué pantalla se trabaron (podés escribirlo en "Comentario" desde el rincón del adulto, sin nombres).

## Después de la clase: el informe

```
node tools/export-playtest.mjs
node tools/analyze-playtest.mjs exports/<archivo>.json --since 2026-10-27 --until 2026-10-27
```

El primero baja los datos; el segundo imprime el informe. La parte nueva es **"Los juegos del monstruo (1ro, T43–T47)"**: por juego, cuántos chicos lo jugaron, rondas, cuántas veces lo repitieron por su cuenta, terminadas o abandonadas, mareos, lo que mide cada juego y las caritas de la encuesta; por dónde salieron de un juego ("Otro juego" al terminar, el botón grande jugando o el chico de la barra); y por chico, su juego favorito (el que más repitió solo) y si terminó la pasada guiada.
