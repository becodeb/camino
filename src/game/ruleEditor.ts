// The rule cards of 3ro as data: what placing, moving or dropping a block
// does to a set of rules, and where every card sits in the notebook. Pure
// and headless, like editor.ts for programs. A notebook of rules is not one
// stack under ▶: each rule is its own card, a hat (the trigger) with its
// actions hanging below. Hats never nest; only actions go under a hat; one
// card per trigger.

import { isHat, type ActionId, type HatId, type Rule } from './rules';

export type RuleBlock = { kind: 'hat'; id: HatId } | { kind: 'action'; id: ActionId };

export const ruleBlock = (id: string): RuleBlock => (isHat(id) ? { kind: 'hat', id } : { kind: 'action', id: id as ActionId });

/** Where a block of the notebook is: a card's hat, or action `action` of card `rule`. */
export interface RuleRef { rule: number; action?: number }

/** Where a dragged block would land: an action slot of a card, or a new card. */
export type RuleTarget = { rule: number; at: number } | { newRule: true };

export type RuleRefusal = 'dup' | 'full' | 'orphan' | 'hat-in-card' | 'no-room';

export interface RuleOpts { maxActions: number; maxRules: number }

const clone = (rules: readonly Rule[]): Rule[] => rules.map((r) => ({ hat: r.hat, actions: [...r.actions] }));

/** Why `block` cannot go to `target`, or null. */
export function ruleRefusal(rules: readonly Rule[], target: RuleTarget | null, block: RuleBlock, o: RuleOpts, moving?: RuleRef): RuleRefusal | null {
  if (block.kind === 'hat') {
    if (rules.some((r) => r.hat === block.id)) return 'dup';
    if (rules.length >= o.maxRules) return 'no-room';
    return null;
  }
  if (!target || 'newRule' in target) return 'orphan';
  const r = rules[target.rule];
  if (!r) return 'orphan';
  const own = moving && moving.rule === target.rule && moving.action != null;
  if (!own && r.actions.length >= o.maxActions) return 'full';
  return null;
}

export function addRule(rules: readonly Rule[], hat: HatId): Rule[] {
  return [...clone(rules), { hat, actions: [] }];
}

export function addAction(rules: readonly Rule[], rule: number, at: number, action: ActionId): Rule[] {
  const next = clone(rules);
  next[rule].actions.splice(Math.max(0, Math.min(at, next[rule].actions.length)), 0, action);
  return next;
}

export function removeRef(rules: readonly Rule[], ref: RuleRef): Rule[] {
  const next = clone(rules);
  if (ref.action == null) next.splice(ref.rule, 1);
  else next[ref.rule].actions.splice(ref.action, 1);
  return next;
}

/** Moves action `from` to `to` (a slot counted in the card *without* the moving action). */
export function moveAction(rules: readonly Rule[], from: Required<RuleRef>, to: { rule: number; at: number }): Rule[] {
  const action = rules[from.rule].actions[from.action];
  return addAction(removeRef(rules, from), to.rule, to.at, action);
}

export type RuleDragSource = { from: 'palette'; block: RuleBlock } | { from: 'notebook'; ref: RuleRef; block: RuleBlock };

export interface RuleDropResult {
  rules: Rule[] | null;
  outcome: 'add' | 'move' | 'remove' | 'cancel' | 'rejected' | 'noop';
  reason?: RuleRefusal;
  /** The card concerned (a new card, the card receiving the action, or the card that already has this hat). */
  rule?: number;
}

/**
 * Decides a release. `target` is the slot under the pointer when it is over
 * the notebook (`null` elsewhere); `overNotebook` says whether it is.
 * Palette → notebook adds (a hat makes a new card, an action goes in a card);
 * notebook → notebook moves an action between cards; notebook → elsewhere
 * takes the block out (a hat takes its whole card).
 */
export function resolveRuleDrop(rules: readonly Rule[], src: RuleDragSource, target: RuleTarget | null, overNotebook: boolean, o: RuleOpts): RuleDropResult {
  const b = src.block;
  if (src.from === 'palette') {
    if (!overNotebook) return { rules: null, outcome: 'cancel' };
    const why = ruleRefusal(rules, target, b, o);
    if (why) return { rules: null, outcome: 'rejected', reason: why, rule: why === 'dup' ? rules.findIndex((r) => r.hat === b.id) : undefined };
    if (b.kind === 'hat') return { rules: addRule(rules, b.id), outcome: 'add', rule: rules.length };
    const t = target as { rule: number; at: number };
    return { rules: addAction(rules, t.rule, t.at, b.id), outcome: 'add', rule: t.rule };
  }
  if (!overNotebook) return { rules: removeRef(rules, src.ref), outcome: 'remove' };
  if (b.kind === 'hat' || src.ref.action == null) return { rules: null, outcome: 'noop' };
  if (!target || 'newRule' in target) return { rules: null, outcome: 'noop' };
  const from = src.ref as Required<RuleRef>;
  const why = ruleRefusal(rules, target, b, o, from);
  if (why) return { rules: null, outcome: 'rejected', reason: why, rule: target.rule };
  if (target.rule === from.rule && target.at === from.action) return { rules: null, outcome: 'noop' };
  return { rules: moveAction(rules, from, target), outcome: 'move', rule: target.rule };
}

// ------------------------------------------------------------------ layout

export interface RuleDims {
  /** A hat: width and height. */
  hatW: number;
  hatH: number;
  /** An action block. */
  w: number;
  h: number;
  /** The paper card around a rule: padding and the space between cards. */
  pad: number;
  gap: number;
}

export const RULE_DIMS: RuleDims = { hatW: 168, hatH: 64, w: 88, h: 58, pad: 10, gap: 18 };

/** An action's width: arrows are pictures; "sumar 1 punto" carries two lines of words too. */
export const actionWidth = (id: string, d: RuleDims = RULE_DIMS) => (id === 'score' ? d.w + 44 : d.w);

export interface PlacedCard {
  rule: number;
  x: number; y: number; w: number; h: number;
  hat: { x: number; y: number; w: number; h: number };
  actions: { x: number; y: number; w: number; h: number; id: ActionId }[];
  /** The dashed line where the next action goes (empty cards, the active card, and while an action is dragged). */
  slot: { x: number; y: number; w: number; h: number; at: number } | null;
}

export interface RuleLayout {
  cards: PlacedCard[];
  /** The dashed hat where a new card starts, or null when every trigger has its card. */
  fresh: { x: number; y: number; w: number; h: number } | null;
  width: number;
  height: number;
}

export interface RuleLayoutOptions {
  dims?: RuleDims;
  columns?: number;
  maxActions: number;
  maxRules: number;
  /** The card receiving taps: it shows its free line. */
  active?: number | null;
  /** An action is being dragged: every card with room shows its free line. */
  showSlots?: boolean;
}

/**
 * Cards flow into `columns` columns, each new card into the shorter one (so
 * the page reads as a set of cards, not a list). A card is its hat, its
 * actions under it, and maybe a free line.
 */
export function layoutRules(rules: readonly Rule[], o: RuleLayoutOptions): RuleLayout {
  const d = o.dims ?? RULE_DIMS;
  const cols = Math.max(1, o.columns ?? 2);
  const cw = d.hatW + d.pad * 2;
  const heights = Array.from({ length: cols }, () => 0);
  const place = (h: number) => {
    const col = heights.indexOf(Math.min(...heights));
    const x = col * (cw + d.gap), y = heights[col];
    heights[col] += h + d.gap;
    return { x, y };
  };
  const cards: PlacedCard[] = rules.map((r, i) => {
    const room = r.actions.length < o.maxActions;
    const showSlot = room && (r.actions.length === 0 || o.active === i || !!o.showSlots);
    const h = d.pad + d.hatH + r.actions.length * d.h + (showSlot ? d.h : 0) + d.pad;
    const { x, y } = place(h);
    const ax = x + d.pad + 8;
    let ay = y + d.pad + d.hatH;
    const actions = r.actions.map((id) => { const a = { x: ax, y: ay, w: actionWidth(id, d), h: d.h, id }; ay += d.h; return a; });
    return {
      rule: i, x, y, w: cw, h,
      hat: { x: x + d.pad, y: y + d.pad, w: d.hatW, h: d.hatH },
      actions,
      slot: showSlot ? { x: ax, y: ay, w: d.w, h: d.h, at: r.actions.length } : null,
    };
  });
  const fresh = rules.length < o.maxRules ? (() => { const p = place(d.hatH + d.pad * 2); return { x: p.x + d.pad, y: p.y + d.pad, w: d.hatW, h: d.hatH }; })() : null;
  return { cards, fresh, width: cols * cw + (cols - 1) * d.gap, height: Math.max(0, Math.max(...heights) - d.gap) };
}

/**
 * The slot a block dragged to (x, y) — notebook canvas coordinates — falls
 * into: for an action, the card under the pointer (a little tolerance round
 * it) and the line by height; for a hat, a new card anywhere on the page.
 */
export function ruleTargetAt(layout: RuleLayout, x: number, y: number, block: RuleBlock, tolerance = 18): RuleTarget | null {
  if (block.kind === 'hat') return { newRule: true };
  const card = layout.cards.find((c) => x >= c.x - tolerance && x <= c.x + c.w + tolerance && y >= c.y - tolerance && y <= c.y + c.h + tolerance);
  if (!card) return null;
  const i = card.actions.findIndex((a) => y < a.y + a.h / 2);
  return { rule: card.rule, at: i < 0 ? card.actions.length : i };
}
