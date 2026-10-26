// Copa v2 garage: the words. Kid-facing copy in Rioplatense Spanish, short and
// concrete. One place so the program, the palette, the step-by-step captions and
// the messages say the same thing.

import type { BlockKind, Sensor } from './program';
import type { CrashCause } from './sim';
import type { ReasonCode } from './rivals';

export const BLOCK_LABEL: Readonly<Record<BlockKind, string>> = {
  forward: 'avanzar', up: 'subir', down: 'bajar', jump: 'saltar', turbo: 'turbo',
  brake: 'frenar', wait: 'esperar', repeat: 'repetir', if: 'si', nitro: 'cambiar nitro',
};

export const SENSOR_LABEL: Readonly<Record<Sensor, string>> = {
  puddle_ahead: 'charco adelante', straight_ahead: 'recta adelante', nitro_positive: 'nitro > 0',
};

/** "¿Hay un charco adelante?": the question a `si` asks, for the step-by-step captions. */
export const SENSOR_QUESTION: Readonly<Record<Sensor, string>> = {
  puddle_ahead: '¿Hay un charco adelante?', straight_ahead: '¿Hay una recta adelante?', nitro_positive: '¿Quedan nitros?',
};

/** The big in-screen message when the kart crashes, by cause. */
export const CRASH_TEXT: Readonly<Record<CrashCause, string>> = {
  wall: 'Este bloque llevó el auto contra la pared.',
  drop: 'Este bloque tiró el auto por el barranco.',
  no_ramp: 'Ahí no había una subida o bajada para este bloque.',
  log: 'Se cruzó un tronco y el auto no esperó a que se fuera.',
};

export const STUCK_TEXT = 'Se te terminó el programa antes de la meta.';
export const TIMEOUT_TEXT = 'El programa da vueltas y vueltas y nunca llega. Revisá los repetir.';

/** Seconds with a decimal comma: 5,4 s. */
export const seconds = (ms: number): string => `${(Math.abs(ms) / 1000).toFixed(1).replace('.', ',')} s`;

export const PLACE_WORD: Readonly<Record<1 | 2 | 3, string>> = { 1: '1ro', 2: '2do', 3: '3ro' };

/** Why the race went the way it did: the truthful sentence for each reason code (rivals.ts `reasonFor`). */
export function reasonText(reason: ReasonCode, o: { rivalName: string; rivalIsFox: boolean; skids: number; sputters: number; wastedJumps: number }): string {
  switch (reason) {
    case 'fast_and_clean': return 'Tu programa fue más rápido y sin perder tiempo.';
    case 'skids': return o.skids === 1 ? 'Patinaste una vez en un charco.' : `Patinaste ${o.skids} veces en charcos.`;
    case 'sputters': return o.sputters === 1 ? 'El turbo se quedó sin nafta una vez.' : `El turbo se quedó sin nafta ${o.sputters} veces.`;
    case 'no_turbo': return o.rivalIsFox ? 'El zorro usó turbo en las rectas.' : 'No usaste todo el turbo: en las rectas se gana tiempo.';
    case 'wasted_jumps': return o.wastedJumps === 1 ? 'Saltaste una vez donde no había charco, y saltar tarda más.' : `Saltaste ${o.wastedJumps} veces donde no había charco, y saltar tarda más.`;
    case 'slow': return `Tu programa anduvo bien, pero ${o.rivalName} fue más rápido.`;
    case 'crash': return 'El auto se chocó.';
    case 'stuck': return STUCK_TEXT;
  }
}

/** "a el zorro" is "al zorro": the animals' names come with their article ("el zorro", "la rana"). */
export const aAnimal = (name: string): string => (name.startsWith('el ') ? `al ${name.slice(3)}` : `a ${name}`);
