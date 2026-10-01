// Names the adult reads: grades and flow steps.

import type { StepId } from './flow';

export const GRADES = [1, 2, 3, 4, 5] as const;
export const GRADE_LABEL: Record<number, string> = { 1: '1ro', 2: '2do', 3: '3ro', 4: '4to', 5: '5to' };

export const STEP_NAME: Record<StepId, string> = {
  setup: 'preparación', character: 'personaje', tool_check: 'prueba de herramientas', ladder: 'escalera de niveles',
  free_play: 'juego libre', typing: 'Teclas del bosque', wardrobe: 'vestidor', survey: 'encuesta', goodbye: 'despedida',
};
