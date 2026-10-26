import { describe, expect, it } from 'vitest';
import {
  addBlock, addEventScript, ancestorsOf, blockById, bumpNumber, endOfMain, lapsAllowed, listAt, locate, moveSelected, newEditor, removeSelected,
  sameSlot, selectBlock, setCaret, setLaps, takeEdits, toggleSensor, usage, withProgram, UI_MAX_REPEAT,
  type EditorState, type Rules,
} from './editor';
import { PALETTES, SLOTS, trackById } from './tracks';
import { nextBlockHint } from './hints';
import { checkProgram, slotCount } from './program';

const rules = (copa: 1 | 2 | 3 | 4 | 5): Rules => ({ palette: PALETTES[copa], slots: SLOTS[copa] });

/** Adds blocks one by one, failing the test if one is refused. */
function build(st: EditorState, r: Rules, kinds: Parameters<typeof addBlock>[1][]): EditorState {
  for (const k of kinds) {
    const res = addBlock(st, k, r);
    if (!res.ok) throw new Error(`refused ${k}: ${res.reason}`);
    st = res.state;
  }
  return st;
}

describe('adding blocks', () => {
  it('appends leaves at the caret and moves the caret after each one', () => {
    const r = rules(1);
    const st = build(newEditor(), r, ['forward', 'up', 'jump']);
    expect(st.program.main.map((b) => b.kind)).toEqual(['forward', 'up', 'jump']);
    expect(st.caret).toEqual({ script: 'main', path: [], index: 3 });
    expect(st.selected).toBeNull();
  });

  it('refuses blocks the copa does not offer and leaves the program alone', () => {
    const st = newEditor();
    const res = addBlock(st, 'repeat', rules(1));
    expect(res).toMatchObject({ ok: false, reason: 'not_allowed' });
    expect(res.state).toBe(st);
    expect(addBlock(st, 'turbo', rules(3))).toMatchObject({ ok: false, reason: 'not_allowed' });
  });

  it('puts the caret inside a new repetir and selects it; the next blocks land in its body', () => {
    const r = rules(2);
    let st = build(newEditor(), r, ['forward', 'repeat']);
    const rep = st.program.main[1];
    expect(rep).toMatchObject({ kind: 'repeat', n: 2 });
    expect(st.selected).toBe(rep.id);
    expect(st.caret).toEqual({ script: 'main', path: [{ index: 1, branch: 'body' }], index: 0 });
    st = build(st, r, ['jump', 'up']);
    expect(rep.kind === 'repeat' && st.program.main[1].kind === 'repeat' && st.program.main[1].body.map((b) => b.kind)).toEqual(['jump', 'up']);
    expect(st.program.main).toHaveLength(2);
  });

  it('a new si starts in its "si" branch with the copa\'s first sensor, and the "si no" branch can be filled by tapping its slot', () => {
    const r = rules(3);
    let st = build(newEditor(), r, ['if', 'jump']);
    const iff = st.program.main[0];
    expect(iff).toMatchObject({ kind: 'if', cond: ['puddle_ahead'] });
    st = setCaret(st, { script: 'main', path: [{ index: 0, branch: 'else' }], index: 0 });
    st = build(st, r, ['forward']);
    const out = st.program.main[0];
    expect(out.kind === 'if' && [out.then.map((b) => b.kind), out.else.map((b) => b.kind)]).toEqual([['jump'], ['forward']]);
  });

  it('counts slots like the engine: containers count, children count', () => {
    const r = rules(3);
    const st = build(newEditor(), r, ['repeat', 'if', 'jump']);
    expect(slotCount(st.program)).toBe(3);
    expect(usage(st, r)).toEqual({ used: 3, total: 6, free: 3 });
  });

  it('refuses the block that does not fit: the memory is full, nothing changes', () => {
    const r = rules(2); // 8 slots
    let st = build(newEditor(), r, ['forward', 'forward', 'forward', 'forward', 'forward', 'forward', 'forward', 'forward']);
    expect(usage(st, r).free).toBe(0);
    const res = addBlock(st, 'jump', r);
    expect(res).toMatchObject({ ok: false, reason: 'full' });
    expect(res.state).toBe(st);
    // taking a block out makes room again
    st = removeSelected(selectBlock(st, st.program.main[3].id));
    expect(addBlock(st, 'jump', r).ok).toBe(true);
  });

  it('a program built only with the editor passes the engine\'s own check', () => {
    const r = rules(3);
    const st = build(newEditor(), r, ['repeat', 'if', 'jump']);
    expect(checkProgram(st.program, r)).toEqual([]);
  });

  it('keeps ids unique when starting from an existing program', () => {
    const track = trackById('c2-a')!;
    let st = newEditor(track.refs.gold);
    st = build(setCaret(st, endOfMain(st.program)), rules(2), ['forward', 'forward']);
    expect(checkProgram(st.program, { palette: PALETTES[2], slots: 99 }).filter((p) => p.code === 'duplicate_id')).toEqual([]);
  });
});

describe('the event script (copa 4)', () => {
  it('is refused where the copa has no event, and costs 1 slot for the hat', () => {
    expect(addEventScript(newEditor(), rules(3))).toMatchObject({ ok: false, reason: 'not_allowed' });
    const res = addEventScript(newEditor(), rules(4));
    expect(res.ok && slotCount(res.state.program)).toBe(1);
    expect(res.ok && res.state.caret).toEqual({ script: 'event', path: [], index: 0 });
  });

  it('adding a block with the caret in the event lane creates the hat on the way (2 slots)', () => {
    const r = rules(4);
    let st = newEditor();
    st = setCaret(st, endOfMain(st.program));
    const res = addBlock(st, 'brake', r, { script: 'event', path: [], index: 0 });
    expect(res.ok).toBe(true);
    st = res.state;
    expect(st.program.onLog?.body.map((b) => b.kind)).toEqual(['brake']);
    expect(slotCount(st.program)).toBe(2);
  });

  it('refuses a block for the event lane when only one slot is left (the hat would not fit)', () => {
    const r: Rules = { palette: PALETTES[4], slots: 2 };
    const st = build(newEditor(), r, ['forward', 'forward']);
    expect(addBlock(st, 'brake', r, { script: 'event', path: [], index: 0 })).toMatchObject({ ok: false, reason: 'full' });
  });

  it('selecting and removing the hat takes the whole script away', () => {
    const r = rules(4);
    let st = build(newEditor(), r, ['forward']);
    st = addEventScript(st, r).state;
    st = build(st, r, ['brake', 'wait']);
    expect(slotCount(st.program)).toBe(4);
    st = removeSelected(selectBlock(st, st.program.onLog!.id));
    expect(st.program.onLog).toBeUndefined();
    expect(slotCount(st.program)).toBe(1);
    expect(st.caret.script).toBe('main');
  });
});

describe('selecting, removing, moving', () => {
  it('tapping a block selects it and puts the caret right after it', () => {
    const r = rules(1);
    let st = build(newEditor(), r, ['forward', 'up', 'jump']);
    st = selectBlock(st, st.program.main[0].id);
    expect(st.selected).toBe(st.program.main[0].id);
    expect(st.caret).toEqual({ script: 'main', path: [], index: 1 });
    st = build(st, r, ['down']);
    expect(st.program.main.map((b) => b.kind)).toEqual(['forward', 'down', 'up', 'jump']);
  });

  it('removing a container takes its children and leaves the caret where it was', () => {
    const r = rules(2);
    let st = build(newEditor(), r, ['forward', 'repeat', 'jump', 'up']);
    st = removeSelected(selectBlock(st, st.program.main[1].id));
    expect(st.program.main.map((b) => b.kind)).toEqual(['forward']);
    expect(st.caret).toEqual({ script: 'main', path: [], index: 1 });
    expect(st.selected).toBeNull();
  });

  it('removing a block inside a container keeps the container', () => {
    const r = rules(2);
    let st = build(newEditor(), r, ['repeat', 'jump', 'up']);
    const rep = st.program.main[0];
    const inner = rep.kind === 'repeat' ? rep.body[0] : null;
    st = removeSelected(selectBlock(st, inner!.id));
    const after = st.program.main[0];
    expect(after.kind === 'repeat' && after.body.map((b) => b.kind)).toEqual(['up']);
    expect(st.caret).toEqual({ script: 'main', path: [{ index: 0, branch: 'body' }], index: 0 });
  });

  it('moves a block one place earlier or later, and stays at the ends', () => {
    const r = rules(1);
    let st = build(newEditor(), r, ['forward', 'up', 'jump']);
    st = selectBlock(st, st.program.main[2].id);
    let res = moveSelected(st, 1);
    expect(res.moved).toBe(false);
    res = moveSelected(st, -1);
    expect(res.moved).toBe(true);
    expect(res.state.program.main.map((b) => b.kind)).toEqual(['forward', 'jump', 'up']);
    expect(res.state.caret.index).toBe(2);
    expect(res.state.selected).toBe(st.selected);
    const top = moveSelected(moveSelected(res.state, -1).state, -1);
    expect(top.moved).toBe(false);
    expect(top.state.program.main[0].kind).toBe('jump');
  });

  it('moves inside a container without leaving it', () => {
    const r = rules(2);
    let st = build(newEditor(), r, ['repeat', 'jump', 'up']);
    const rep = st.program.main[0];
    st = selectBlock(st, rep.kind === 'repeat' ? rep.body[1].id : '');
    const res = moveSelected(st, -1);
    const after = res.state.program.main[0];
    expect(after.kind === 'repeat' && after.body.map((b) => b.kind)).toEqual(['up', 'jump']);
  });

  it('a caret to nowhere is ignored', () => {
    const st = build(newEditor(), rules(1), ['forward']);
    expect(setCaret(st, { script: 'main', path: [{ index: 5, branch: 'body' }], index: 0 })).toBe(st);
    expect(setCaret(st, { script: 'event', path: [], index: 0 })).toBe(st);
    expect(setCaret(st, { script: 'main', path: [], index: 9 })).toBe(st);
  });
});

describe('numbers and sensors (buttons, never typing)', () => {
  it('repetir counts up and down inside 1..UI_MAX_REPEAT', () => {
    const r = rules(2);
    let st = build(newEditor(), r, ['repeat']);
    const id = st.program.main[0].id;
    st = bumpNumber(st, id, 1);
    st = bumpNumber(st, id, 1);
    expect(st.program.main[0]).toMatchObject({ n: 4 });
    for (let i = 0; i < 40; i++) st = bumpNumber(st, id, 1);
    expect(st.program.main[0]).toMatchObject({ n: UI_MAX_REPEAT });
    for (let i = 0; i < 40; i++) st = bumpNumber(st, id, -1);
    expect(st.program.main[0]).toMatchObject({ n: 1 });
  });

  it('esperar goes from 1 to 9', () => {
    const r = rules(4);
    let st = build(newEditor(), r, ['wait']);
    const id = st.program.main[0].id;
    expect(bumpNumber(st, id, -1)).toBe(st);
    for (let i = 0; i < 20; i++) st = bumpNumber(st, id, 1);
    expect(st.program.main[0]).toMatchObject({ n: 9 });
  });

  it('vueltas is a copa 5 option; the number comes back as 2', () => {
    const r5 = rules(5);
    expect(lapsAllowed(r5)).toBe(true);
    expect(lapsAllowed(rules(4))).toBe(false);
    let st = build(newEditor(), r5, ['repeat']);
    const id = st.program.main[0].id;
    st = setLaps(st, id, true, r5);
    expect(st.program.main[0]).toMatchObject({ n: 'laps' });
    expect(bumpNumber(st, id, 1)).toBe(st);
    st = setLaps(st, id, false, r5);
    expect(st.program.main[0]).toMatchObject({ n: 2 });
    const r2 = rules(2);
    const st2 = build(newEditor(), r2, ['repeat']);
    expect(setLaps(st2, st2.program.main[0].id, true, r2)).toBe(st2);
  });

  it('a si keeps at least one sensor, only offers the copa\'s sensors and orders them', () => {
    const r5 = rules(5);
    let st = build(newEditor(), r5, ['if']);
    const id = st.program.main[0].id;
    expect(toggleSensor(st, id, 'puddle_ahead', r5)).toBe(st); // the only one stays
    st = toggleSensor(st, id, 'nitro_positive', r5);
    st = toggleSensor(st, id, 'straight_ahead', r5);
    expect(st.program.main[0]).toMatchObject({ cond: ['puddle_ahead', 'straight_ahead', 'nitro_positive'] });
    st = toggleSensor(st, id, 'puddle_ahead', r5);
    expect(st.program.main[0]).toMatchObject({ cond: ['straight_ahead', 'nitro_positive'] });
    const r3 = rules(3);
    const st3 = build(newEditor(), r3, ['if']);
    expect(toggleSensor(st3, st3.program.main[0].id, 'straight_ahead', r3)).toBe(st3);
  });
});

describe('edit counts for the data', () => {
  it('counts adds, removes, moves and number changes, and starts again after takeEdits', () => {
    const r = rules(2);
    let st = build(newEditor(), r, ['forward', 'repeat']);
    st = bumpNumber(st, st.program.main[1].id, 1);
    st = selectBlock(st, st.program.main[0].id);
    st = moveSelected(st, 1).state;
    st = removeSelected(selectBlock(st, st.program.main[0].id));
    const { counts, state } = takeEdits(st);
    expect(counts).toEqual({ add: 2, remove: 1, move: 1, number: 1 });
    expect(takeEdits(state).counts).toEqual({ add: 0, remove: 0, move: 0, number: 0 });
  });

  it('a refused add counts nothing', () => {
    const st = newEditor();
    const res = addBlock(st, 'repeat', rules(1));
    expect(res.state.edits.add).toBe(0);
  });
});

describe('locating things', () => {
  it('locate and listAt agree, ancestorsOf names the containers outermost first', () => {
    const track = trackById('c5-a')!;
    const p = track.refs.gold;
    const turbo = track.trickBlockId;
    const at = locate(p, turbo)!;
    expect(listAt(p, at.script, at.path)?.[at.index].id).toBe(turbo);
    const anc = ancestorsOf(p, turbo);
    expect(anc.length).toBe(3); // repetir vueltas > repetir tiles > si
    expect(anc[0]).toBe(p.main[0].id);
    expect(ancestorsOf(p, p.onLog!.body[0].id)).toEqual([p.onLog!.id]);
    expect(ancestorsOf(p, 'nope')).toEqual([]);
  });

  it('withProgram swaps the program, keeps ids growing and the caret valid', () => {
    const st = build(newEditor(), rules(1), ['forward', 'up']);
    const gold = trackById('c1-a')!.refs.gold;
    const next = withProgram(st, gold);
    expect(next.program).toBe(gold);
    expect(next.nextId).toBeGreaterThanOrEqual(st.nextId);
    expect(next.caret).toEqual(endOfMain(gold));
  });

  it('sameSlot compares places, not objects', () => {
    expect(sameSlot({ script: 'main', path: [{ index: 1, branch: 'body' }], index: 0 }, { script: 'main', path: [{ index: 1, branch: 'body' }], index: 0 })).toBe(true);
    expect(sameSlot({ script: 'main', path: [], index: 0 }, { script: 'event', path: [], index: 0 })).toBe(false);
  });
});

describe('following the ghost hint through the editor builds the gold program on every track', () => {
  // the hint says WHAT and WHERE; the editor must be able to do exactly that (the garage moves the caret to the hint's place)
  for (const id of ['c1-a', 'c2-c', 'c3-b', 'c4-a', 'c5-b']) {
    it(id, () => {
      const track = trackById(id)!;
      const r: Rules = { palette: PALETTES[track.copa], slots: track.slots };
      let st = newEditor();
      for (let guard = 0; guard < 40; guard++) {
        const hint = nextBlockHint(st.program, track);
        if (!hint) break;
        expect(hint.wrongBlockId).toBeUndefined();
        if (hint.block.kind === 'on_log') {
          const res = addEventScript(st, r);
          if (!res.ok) throw new Error('event refused');
          st = res.state;
          continue;
        }
        st = setCaret(st, hint.position);
        const res = addBlock(st, hint.block.kind, r);
        if (!res.ok) throw new Error(`refused ${hint.block.kind}: ${res.reason}`);
        st = res.state;
        if (hint.block.kind === 'repeat' && hint.block.n === 'laps') st = setLaps(st, res.id!, true, r);
        else if ((hint.block.kind === 'repeat' || hint.block.kind === 'wait') && typeof hint.block.n === 'number') {
          for (let i = 0; i < 40; i++) {
            const b = st.program;
            const cur = locate(b, res.id!);
            const list = cur && listAt(b, cur.script, cur.path);
            const blk = list?.[cur!.index];
            if (blk && 'n' in blk && blk.n === hint.block.n) break;
            st = bumpNumber(st, res.id!, 1);
          }
        } else if (hint.block.kind === 'if') {
          const want = hint.block.cond ?? [];
          const condNow = () => { const b = blockById(st.program, res.id!); return b && b.kind === 'if' ? b.cond : []; };
          for (const s of want) if (!condNow().includes(s)) st = toggleSensor(st, res.id!, s, r);
          for (const s of [...condNow()]) if (!want.includes(s)) st = toggleSensor(st, res.id!, s, r);
        }
      }
      expect(nextBlockHint(st.program, track)).toBeNull();
      expect(slotCount(st.program)).toBeLessThanOrEqual(track.slots);
    });
  }
});
