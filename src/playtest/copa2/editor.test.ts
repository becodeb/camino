import { describe, expect, it } from 'vitest';
import {
  addBlock, addEventScript, ancestorsOf, blockById, bumpNumber, endOfMain, lapsAllowed, listAt, locate, moveBlock, moveSelected, newEditor, removeBlock, removeSelected, withoutBlock,
  sameSlot, selectBlock, addSensor, removeSensor, sensorTarget, emptyConditions, setCaret, setLaps, takeEdits, usage, withProgram, UI_MAX_REPEAT,
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

  it('a new si starts in its "si" branch with an empty condition, and the "si no" branch can be filled by tapping its slot', () => {
    const r = rules(3);
    let st = build(newEditor(), r, ['if', 'jump']);
    const iff = st.program.main[0];
    expect(iff).toMatchObject({ kind: 'if', cond: [] });
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
    // the new si still looks at nothing: that is the only thing wrong with it
    expect(checkProgram(st.program, r).map((p) => p.code)).toEqual(['empty_condition']);
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

  it('a new si looks at nothing; a sensor piece fills its hole, a second one joins with y, the copa\'s sensors only, in the engine\'s order', () => {
    const r5 = rules(5);
    let st = build(newEditor(), r5, ['if']);
    const id = st.program.main[0].id;
    expect(st.program.main[0]).toMatchObject({ kind: 'if', cond: [] });
    expect(emptyConditions(st.program)).toEqual([id]);
    expect(sensorTarget(st)).toBe(id);
    let res = addSensor(st, id, 'nitro_positive', r5);
    if (!res.ok) throw new Error('refused');
    st = res.state;
    expect(emptyConditions(st.program)).toEqual([]);
    res = addSensor(st, id, 'straight_ahead', r5);
    if (!res.ok) throw new Error('refused');
    st = res.state;
    expect(st.program.main[0]).toMatchObject({ cond: ['straight_ahead', 'nitro_positive'] }); // engine order, not tap order
    const three = addSensor(st, id, 'puddle_ahead', r5);
    expect(three.ok).toBe(false);
    expect(!three.ok && three.reason).toBe('cond_full');
    expect(addSensor(st, id, 'straight_ahead', r5)).toMatchObject({ ok: true }); // already there: nothing changes
    st = removeSensor(st, id, 'straight_ahead');
    expect(st.program.main[0]).toMatchObject({ cond: ['nitro_positive'] });
    st = removeSensor(st, id, 'nitro_positive');
    expect(emptyConditions(st.program)).toEqual([id]); // the hole comes back
    const r3 = rules(3);
    const st3 = build(newEditor(), r3, ['if']);
    const refused = addSensor(st3, st3.program.main[0].id, 'straight_ahead', r3);
    expect(!refused.ok && refused.reason).toBe('not_allowed');
  });

  it('a tapped sensor goes to the selected si, else the last empty one, else the last with room', () => {
    const r5 = rules(5);
    let st = build(newEditor(), r5, ['if']);
    const first = st.program.main[0].id;
    st = setCaret(st, endOfMain(st.program));
    st = build(st, r5, ['if']);
    const second = st.program.main[1].id;
    expect(st.selected).toBe(second);
    st = selectBlock(st, first);
    expect(sensorTarget(st)).toBe(first); // selected wins
    st = setCaret(st, endOfMain(st.program)); // deselects
    expect(sensorTarget(st)).toBe(second); // the last empty
    const res = addSensor(st, second, 'puddle_ahead', r5);
    if (!res.ok) throw new Error('refused');
    expect(sensorTarget(setCaret(res.state, endOfMain(res.state.program)))).toBe(first); // the other one is still empty
    expect(sensorTarget(newEditor())).toBeNull();
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
        if (hint.block.kind === 'sensor') {
          const put = addSensor(st, hint.ifId!, hint.block.sensor!, r);
          if (!put.ok) throw new Error(`sensor refused: ${put.reason}`);
          st = put.state;
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
        }
      }
      expect(nextBlockHint(st.program, track)).toBeNull();
      expect(slotCount(st.program)).toBeLessThanOrEqual(track.slots);
    });
  }
});

describe('dragging placed blocks (C12): move and delete by id', () => {
  const r = rules(4);
  /** forward, repetir 2 [jump, brake], down */
  const sample = (): EditorState => {
    let st = build(newEditor(), r, ['forward', 'repeat', 'jump', 'brake']);
    st = setCaret(st, { script: 'main', path: [], index: 2 });
    return build(st, r, ['down']);
  };
  const kinds = (st: EditorState) => st.program.main.map((b) => b.kind);

  it('removeBlock takes a container with everything inside it and leaves the caret where it was', () => {
    const st = sample();
    const rep = st.program.main[1];
    const out = removeBlock(st, rep.id);
    expect(kinds(out)).toEqual(['forward', 'down']);
    expect(slotCount(out.program)).toBe(2);
    expect(out.caret).toEqual({ script: 'main', path: [], index: 1 });
    expect(out.edits.remove).toBe(1);
  });

  it('reorders a block inside the main script (the slot is read in the program without it)', () => {
    const st = sample();
    const down = st.program.main[2];
    const res = moveBlock(st, down.id, { script: 'main', path: [], index: 0 }, r);
    expect(res.ok).toBe(true);
    expect(kinds(res.state)).toEqual(['down', 'forward', 'repeat']);
    expect(res.state.selected).toBe(down.id);
    expect(res.state.edits.move).toBe(1);
    expect(slotCount(res.state.program)).toBe(slotCount(st.program));
  });

  it('moves a block into a container and out of it', () => {
    const st = sample();
    const fwd = st.program.main[0];
    const rep = st.program.main[1];
    // in the program without `forward` the repetir is at index 0
    const into = moveBlock(st, fwd.id, { script: 'main', path: [{ index: 0, branch: 'body' }], index: 1 }, r);
    expect(into.ok).toBe(true);
    const inner = (into.state.program.main[0] as Extract<typeof rep, { kind: 'repeat' }>).body.map((b) => b.kind);
    expect(inner).toEqual(['jump', 'forward', 'brake']);
    const jump = (st.program.main[1] as Extract<typeof rep, { kind: 'repeat' }>).body[0];
    const out = moveBlock(st, jump.id, { script: 'main', path: [], index: 2 }, r);
    expect(out.ok && kinds(out.state)).toEqual(['forward', 'repeat', 'jump', 'down']);
  });

  it('a container carries its body, ids and numbers along', () => {
    let st = sample();
    const rep = st.program.main[1];
    st = bumpNumber(st, rep.id, 3);
    const before = JSON.stringify(blockById(st.program, rep.id));
    const res = moveBlock(st, rep.id, { script: 'main', path: [], index: 0 }, r);
    expect(res.ok && kinds(res.state)).toEqual(['repeat', 'forward', 'down']);
    expect(JSON.stringify(blockById(res.state.program, rep.id))).toBe(before);
    expect(checkProgram(res.state.program, r)).toEqual([]);
  });

  it('dropping where it came from changes nothing', () => {
    const st = sample();
    const down = st.program.main[2];
    const res = moveBlock(st, down.id, { script: 'main', path: [], index: 2 }, r);
    expect(res.ok).toBe(true);
    expect(res.state.program).toEqual(st.program);
    expect(res.state.edits.move).toBe(0);
  });

  it('refuses a slot that points to nothing, and the event hat never moves', () => {
    const r4 = rules(4);
    let st = build(newEditor(), r4, ['forward']);
    st = addEventScript(st, r4).state;
    st = build(st, r4, ['brake']);
    expect(moveBlock(st, st.program.onLog!.id, { script: 'main', path: [], index: 0 }, r4)).toMatchObject({ ok: false, reason: 'not_allowed' });
    const fwd = st.program.main[0];
    expect(moveBlock(st, fwd.id, { script: 'main', path: [{ index: 5, branch: 'body' }], index: 0 }, r4)).toMatchObject({ ok: false, reason: 'nowhere' });
  });

  it('moves a block from the main script into the event script and back', () => {
    const r4 = rules(4);
    let st = build(newEditor(), r4, ['forward', 'brake']);
    st = addEventScript(st, r4).state;
    const brake = st.program.main[1];
    const res = moveBlock(st, brake.id, { script: 'event', path: [], index: 0 }, r4);
    expect(res.ok).toBe(true);
    expect(res.state.program.onLog?.body.map((b) => b.id)).toEqual([brake.id]);
    expect(kinds(res.state)).toEqual(['forward']);
    const back = moveBlock(res.state, brake.id, { script: 'main', path: [], index: 1 }, r4);
    expect(back.ok && kinds(back.state)).toEqual(['forward', 'brake']);
    expect(back.state.program.onLog?.body).toEqual([]);
  });

  it('moving the first block into an event lane without a hat creates the hat, and needs one free place', () => {
    const r4 = rules(4);
    const st = build(newEditor(), r4, ['forward', 'brake']);
    const brake = st.program.main[1];
    const res = moveBlock(st, brake.id, { script: 'event', path: [], index: 0 }, r4);
    expect(res.ok).toBe(true);
    expect(res.state.program.onLog?.body).toHaveLength(1);
    expect(slotCount(res.state.program)).toBe(3);
    const tight: Rules = { palette: r4.palette, slots: 2 };
    expect(moveBlock(st, brake.id, { script: 'event', path: [], index: 0 }, tight)).toMatchObject({ ok: false, reason: 'full' });
    expect(moveBlock(st, brake.id, { script: 'event', path: [], index: 0 }, rules(3))).toMatchObject({ ok: false, reason: 'nowhere' });
  });

  it('withoutBlock is the program the hand leaves behind (the original is untouched)', () => {
    const st = sample();
    const rep = st.program.main[1];
    const snap = JSON.stringify(st.program);
    const left = withoutBlock(st.program, rep.id);
    expect(left.main.map((b) => b.kind)).toEqual(['forward', 'down']);
    expect(JSON.stringify(st.program)).toBe(snap);
    expect(withoutBlock(st.program, 'nope')).toBe(st.program);
  });
});
