// The Workshop's dropdowns (T40): what each menu offers, given the project
// and the sprite whose script is being edited, and what a stored value is
// shown as (a sprite is stored by id and shown by its name, so duplicating
// or renaming never breaks a `¿tocando?`). Also the palette's blocks with
// their defaults for that sprite (a `¿tocando?` in the character's palette
// asks for the log; anywhere else for the character).

import { EDGE, KEYS, MESSAGES, PALETTE, SOUNDS, VARS, type Cat, type MenuKind, type Op } from './blocks';
import { COSTUMES } from './game';
import { make, type Block, type Project, type Sprite } from './model';

export interface Option { value: string; label: string }

export function menuOptions(kind: MenuKind, p: Project, sprite: Sprite | null): Option[] {
  switch (kind) {
    case 'key': return KEYS.map((k) => ({ value: k.name, label: k.name }));
    case 'var': return VARS.map((v) => ({ value: v, label: v }));
    case 'msg': return MESSAGES.map((m) => ({ value: m, label: m }));
    case 'sound': return SOUNDS.map((m) => ({ value: m, label: m }));
    case 'costume': return (sprite ? COSTUMES[sprite.kind] : []).map((c) => ({ value: c, label: c }));
    case 'touch': return [
      ...p.sprites.filter((s) => s.kind !== 'stage' && s.kind !== 'floor' && s.id !== sprite?.id).map((s) => ({ value: s.id, label: s.name })),
      { value: EDGE, label: 'borde' },
    ];
  }
}

/** What a stored menu value is shown as. */
export function menuLabel(p: Project, kind: MenuKind, v: string): string {
  if (kind === 'touch') return v === EDGE ? 'borde' : p.sprites.find((s) => s.id === v)?.name ?? v;
  return v;
}

export interface PaletteItem { key: string; op: Op; make(): Block }

/** The palette of a sprite, by category (the stage has no motion of its own, like Scratch). */
export function paletteFor(p: Project, sprite: Sprite | null): { cat: Cat; items: PaletteItem[] }[] {
  const others = p.sprites.filter((s) => s.kind !== 'stage' && s.kind !== 'floor' && s.id !== sprite?.id);
  const touchDefault = (sprite?.kind === 'player' ? others.find((s) => s.kind === 'obstacle') : others.find((s) => s.kind === 'player'))?.id ?? others[0]?.id ?? EDGE;
  const costume = sprite ? COSTUMES[sprite.kind][1] ?? COSTUMES[sprite.kind][0] : '';
  const stage = sprite?.kind === 'stage';
  return (Object.keys(PALETTE) as Cat[]).map((cat) => {
    const items: PaletteItem[] = [];
    for (const op of PALETTE[cat]) {
      if (stage && (cat === 'motion' || op === 'touching' || op === 'show' || op === 'hide' || op === 'costume' || op === 'say' || op === 'sayFor')) continue;
      if (op === 'var') {
        for (const v of VARS) items.push({ key: `var-${v}`, op, make: () => make('var', { VAR: v }) });
        continue;
      }
      if (op === 'touching') { items.push({ key: op, op, make: () => make('touching', { OBJ: touchDefault }) }); continue; }
      if (op === 'costume') { items.push({ key: op, op, make: () => make('costume', { C: costume }) }); continue; }
      if (op === 'changeX') { items.push({ key: op, op, make: () => make('changeX', { DX: 10 }) }); continue; }
      items.push({ key: op, op, make: () => make(op) });
    }
    return { cat, items };
  }).filter((c) => c.items.length);
}
