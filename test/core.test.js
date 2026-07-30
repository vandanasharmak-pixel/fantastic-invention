import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TRUST_START, TRUST_MIN, TRUST_MAX,
  createTrustState, applyTrustEvent, supersedeTrustEvent,
  computeTrust, zoneFor, clampDelta, activeEvents, replayPairs,
} from '../src/core/trust.js';

import {
  CHAT_STATES, createChatMachine, submit, replyReceived,
  hold, coachReady, cancelHold, submitReplay, inputEnabled, InvalidTransition,
} from '../src/core/chatMachine.js';

import { parseJSONish, normaliseClientReply, extractFirstObject } from '../src/core/parse.js';
import { validateSave, emptySave, hasResumableProgress, createPersistence, SCHEMA_VERSION } from '../src/core/storage.js';
import { CARDS, cardsForEpisode, wildcards, soloEpisodeThreeDraw, cardById } from '../src/content/cards.js';
import { getSessionContext } from '../src/core/sessionContext.js';
import { repairClientReply } from '../src/core/consistency.js';

// ---------------------------------------------------------------- trust ----

test('trust starts in NEUTRAL leaning GUARDED', () => {
  assert.equal(createTrustState().trust, TRUST_START);
  assert.equal(zoneFor(TRUST_START).id, 'NEUTRAL');
  assert.equal(zoneFor(TRUST_START - 5).id, 'GUARDED');
});

test('trust is a pure function of the log', () => {
  let s = createTrustState();
  s = applyTrustEvent(s, { episode: 2, source: 'reyes', delta: -8, reason: 'reassurance' });
  s = applyTrustEvent(s, { episode: 2, source: 'reyes', delta: 4, reason: 'owned the silence' });
  assert.equal(s.trust, TRUST_START - 8 + 4);
  assert.equal(computeTrust(s.events), s.trust);
});

test('deltas are clamped into the guide asymmetric band', () => {
  // "one reassurance under pressure can undo three honest moves"
  assert.equal(clampDelta(40), 6);
  assert.equal(clampDelta(-40), -14);
  assert.equal(clampDelta('nonsense'), 0);
});

test('trust clamps to 2..98 progressively', () => {
  let s = createTrustState();
  for (let i = 0; i < 12; i++) {
    s = applyTrustEvent(s, { episode: 4, source: 'reyes', delta: -14, reason: 'evasion' });
  }
  assert.equal(s.trust, TRUST_MIN);
  // A single honest move does not teleport back out of the floor.
  s = applyTrustEvent(s, { episode: 5, source: 'reyes', delta: 6, reason: 'ownership' });
  assert.equal(s.trust, TRUST_MIN + 6);

  let up = createTrustState();
  for (let i = 0; i < 30; i++) {
    up = applyTrustEvent(up, { episode: 5, source: 'reyes', delta: 6, reason: 'honesty' });
  }
  assert.equal(up.trust, TRUST_MAX);
});

test('every event carries an auditable before/after snapshot', () => {
  let s = createTrustState();
  s = applyTrustEvent(s, { episode: 1, source: 'narrative', delta: -3, reason: 'three days of silence' });
  const [e] = s.events;
  assert.equal(e.trustBefore, TRUST_START);
  assert.equal(e.trustAfter, TRUST_START - 3);
  assert.equal(e.superseded, false);
});

// ------------------------------------------------- hold / replay contract ---

test('hold -> replay: total reflects ONLY the replay delta, both exchanges survive', () => {
  let s = createTrustState();

  // The flawed exchange: the lead reassures, Reyes cools.
  s = applyTrustEvent(s, {
    episode: 2, source: 'reyes', delta: -9,
    reason: '"we\'re confident we\'ll hit the date" — reassurance without evidence',
  });
  const flawed = s.events[0];
  const trustBeforeHold = TRUST_START; // captured at the moment Hold is called
  assert.equal(flawed.trustAfter, TRUST_START - 9);

  // HOLD. The trust log is NOT mutated by holding.
  const eventsAtHold = s.events.length;

  // REPLAY submitted: supersede the original, apply the new delta.
  s = supersedeTrustEvent(s, flawed.id);
  s = applyTrustEvent(s, {
    episode: 2, source: 'reyes', delta: 5,
    reason: '"you\'re right, we\'ve gone quiet, and that\'s on us" — owned the silence',
    replayOf: flawed.id,
  });

  // The assertion the brief asks for: total reflects only the replay's delta.
  assert.equal(s.trust, trustBeforeHold + 5);

  // The mistake is kept for the debrief, not deleted.
  assert.equal(s.events.length, eventsAtHold + 1);
  const kept = s.events.find((e) => e.id === flawed.id);
  assert.ok(kept, 'original exchange must remain in the log');
  assert.equal(kept.superseded, true);
  assert.equal(kept.delta, -9, 'the original delta is preserved verbatim');

  // ...but excluded from the running total.
  assert.equal(activeEvents(s).length, 1);

  // The debrief can tell "you tried that once, then better".
  const pairs = replayPairs(s);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].original.id, flawed.id);
  assert.equal(pairs[0].replay.delta, 5);
});

test('a replay after several events lands on the trust as it stood at Hold', () => {
  let s = createTrustState();
  s = applyTrustEvent(s, { episode: 1, source: 'narrative', delta: -3, reason: 'silence' });
  s = applyTrustEvent(s, { episode: 2, source: 'reyes', delta: 4, reason: 'good question' });
  const trustAtHold = s.trust; // 44 - 3 + 4 = 45

  s = applyTrustEvent(s, { episode: 2, source: 'reyes', delta: -12, reason: 'blame reflex' });
  const flawed = s.events[2];

  s = supersedeTrustEvent(s, flawed.id);
  s = applyTrustEvent(s, { episode: 2, source: 'reyes', delta: 3, reason: 'shared ownership', replayOf: flawed.id });

  assert.equal(s.trust, trustAtHold + 3);
});

// -------------------------------------------------------- chat machine ----

test('chat machine drives hold/replay and freezes input while holding', () => {
  let m = createChatMachine();
  assert.equal(m.state, CHAT_STATES.IDLE);
  assert.ok(inputEnabled(m));

  m = submit(m);
  assert.equal(m.state, CHAT_STATES.AWAITING_REPLY);
  assert.ok(!inputEnabled(m), 'input frozen while awaiting the client');

  m = replyReceived(m);
  assert.equal(m.state, CHAT_STATES.IDLE);

  m = hold(m, { trustBefore: 44, pivotExchange: { trustEventId: 'te_x' } });
  assert.equal(m.state, CHAT_STATES.HOLDING);
  assert.ok(!inputEnabled(m), 'input frozen on hold');
  assert.equal(m.hold.trustBefore, 44);

  m = coachReady(m, 'What were you going for right there?');
  assert.equal(m.state, CHAT_STATES.REPLAYING);
  assert.ok(inputEnabled(m), 'the participant may take the beat again');

  const { machine, replayOf } = submitReplay(m);
  assert.equal(replayOf, 'te_x');
  assert.equal(machine.state, CHAT_STATES.AWAITING_REPLY);
});

test('invalid transitions throw rather than corrupting state', () => {
  const m = createChatMachine();
  assert.throws(() => coachReady(m, 'x'), InvalidTransition);
  assert.throws(() => submitReplay(m), InvalidTransition);
  assert.throws(() => replyReceived(m), InvalidTransition);
});

test('cancelling a hold returns to the conversation untouched', () => {
  let m = createChatMachine();
  m = hold(m, { trustBefore: 40, pivotExchange: { trustEventId: 'te_y' } });
  m = cancelHold(m);
  assert.equal(m.state, CHAT_STATES.IDLE);
  assert.equal(m.hold, null);
});

// -------------------------------------------------------------- parsing ----

test('parses clean JSON', () => {
  const r = parseJSONish('{"speech":"Right.","trust_delta":-4,"pivot":true}');
  assert.equal(r.via, 'json');
  assert.equal(r.value.trust_delta, -4);
});

test('strips code fences', () => {
  const r = parseJSONish('```json\n{"speech":"On track. Right.","trust_delta":-6}\n```');
  assert.ok(r.ok);
  assert.equal(r.value.speech, 'On track. Right.');
});

test('extracts the object when the model wraps it in prose', () => {
  const raw = 'Here is Reyes\'s reply:\n{"speech":"Tell me something true.","trust_delta":-5,"pivot":true}\nHope that helps!';
  const r = parseJSONish(raw);
  assert.equal(r.via, 'object');
  assert.equal(r.value.pivot, true);
});

test('brace extraction ignores braces inside strings', () => {
  const s = extractFirstObject('{"speech":"a } brace","trust_delta":0}');
  assert.equal(s, '{"speech":"a } brace","trust_delta":0}');
});

test('falls back to key scanning when JSON is malformed', () => {
  // Unescaped inner quote breaks JSON.parse entirely.
  const raw = '{speech: "He said "on track" again.", trust_delta: -7, pivot: "reassured without evidence"}';
  const r = parseJSONish(raw);
  assert.equal(r.via, 'scan');
  assert.equal(r.value.trust_delta, -7);
  assert.equal(r.value.pivot, 'reassured without evidence');
});

test('normalise never throws and always yields a playable line', () => {
  const r = parseJSONish('the model ignored the schema completely');
  assert.equal(r.ok, false);
  const n = normaliseClientReply(r.value, 'the model ignored the schema completely');
  assert.equal(n.speech, 'the model ignored the schema completely');
  assert.equal(n.trust_delta, 0);
  assert.equal(n.pivot, '', 'pivot is a clause, not a flag');
});

// ------------------------------------------------------ session context ----

test('session context digests the whole session, not the transcript', () => {
  let s = createTrustState();
  s = applyTrustEvent(s, { episode: 2, source: 'reyes', delta: -9, reason: 'reassured without evidence' });

  const ctx = getSessionContext({
    trust: s.trust,
    trustEvents: s.events,
    episode: 4,
    cardsOpened: [1, 2],
    worksheets: {
      ep3: { choice: 'share' },
      ep4: { decision: 'escalate' },
      ep5: { nonNeg: 'I will not promise a date I cannot evidence' },
    },
  });

  assert.equal(ctx.zone.id, 'GUARDED');
  assert.equal(ctx.cardsOpened.length, 2);
  assert.equal(ctx.nonNegotiable, 'I will not promise a date I cannot evidence');

  // The brief must carry the decisions forward without the raw transcript.
  assert.match(ctx.brief, /GUARDED/);
  assert.match(ctx.brief, /The Real Reason/);
  assert.match(ctx.brief, /escalated to Priya/);
  assert.match(ctx.brief, /reassured without evidence/);
  assert.ok(ctx.brief.length < 2000, 'brief stays condensed, not a transcript');
});

test('session context is honest when nothing has been discovered', () => {
  const ctx = getSessionContext({ trust: TRUST_START, trustEvents: [], episode: 1, cardsOpened: [] });
  assert.match(ctx.brief, /has not yet discovered any of the hidden truths/);
  assert.equal(ctx.nonNegotiable, null);
});

test('a reassurance scored positive by a drifting persona is clamped, not trusted', () => {
  // The persona-consistency guard: the schema asks for -1..-14 on reassurance,
  // but a drifting model returning +30 cannot hand the room a happy ending.
  let s = createTrustState();
  s = applyTrustEvent(s, { episode: 2, source: 'reyes', delta: 30, reason: 'reassured without evidence' });
  assert.equal(s.events[0].delta, 6, 'rises cap at +6 however the model scored it');
  assert.ok(s.trust <= TRUST_START + 6);
});

// ---------------------------------------------------------- persistence ----

test('validates and version-gates saved state', () => {
  assert.equal(validateSave(null).status, 'empty');
  assert.equal(validateSave('not json').status, 'corrupt');
  assert.equal(validateSave(JSON.stringify({ schemaVersion: 0 })).status, 'incompatible');
  assert.equal(validateSave(JSON.stringify({ ...emptySave(), episode: 3 })).status, 'ok');
});

test('an old save offers start-fresh instead of crashing', () => {
  const old = JSON.stringify({ schemaVersion: 99, screen: 'ep3', trust: 61 });
  const r = validateSave(old);
  assert.equal(r.status, 'incompatible');
  assert.equal(r.foundVersion, 99);
  assert.equal(r.data, null);
});

test('resume affordance only appears when there is progress', () => {
  assert.equal(hasResumableProgress(emptySave()), false);
  assert.equal(hasResumableProgress({ ...emptySave(), episode: 3 }), true);
  assert.equal(hasResumableProgress({ ...emptySave(), cardsOpened: [1] }), true);
});

test('persistence debounces and round-trips', async () => {
  const mem = new Map();
  const backend = {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => mem.set(k, v),
    removeItem: (k) => mem.delete(k),
  };
  const p = createPersistence({ backend, delay: 5 });

  p.save({ ...emptySave(), episode: 1 });
  p.save({ ...emptySave(), episode: 2 });
  p.save({ ...emptySave(), episode: 3 });
  assert.equal(mem.size, 0, 'nothing written before the debounce elapses');

  p.flush();
  assert.equal(mem.size, 1, 'one write, not three');

  const loaded = p.load();
  assert.equal(loaded.status, 'ok');
  assert.equal(loaded.data.episode, 3);
  assert.equal(loaded.data.schemaVersion, SCHEMA_VERSION);
});

// ---------------------------------------------------------------- cards ----

test('all twenty confidential cards are present and correctly routed', () => {
  assert.equal(CARDS.length, 20);
  assert.deepEqual(CARDS.map((c) => c.id), Array.from({ length: 20 }, (_, i) => i + 1));

  // Deliverable Four routing sheet + morning checklist.
  assert.deepEqual(cardsForEpisode(3).filter((c) => c.table === 'A').map((c) => c.id), [1, 2, 3]);
  assert.deepEqual(cardsForEpisode(3).filter((c) => c.table === 'B').map((c) => c.id), [4, 5, 6]);
  assert.deepEqual(cardsForEpisode(3).filter((c) => c.table === 'C').map((c) => c.id), [7, 8, 9, 10]);
  assert.deepEqual(cardsForEpisode(4).map((c) => c.id), [11, 12, 13, 14, 15, 16]);
  assert.deepEqual(wildcards().map((c) => c.id), [17, 18, 19, 20]);

  assert.equal(cardById(11).table, 'ALL', 'card 11 goes to every table');
});

test('every card carries a body and a WHAT THIS CHANGES line', () => {
  for (const c of CARDS) {
    assert.ok(c.title, `card ${c.id} has a title`);
    assert.ok(Array.isArray(c.body) && c.body.length, `card ${c.id} has body copy`);
    assert.ok(c.whatThisChanges?.length > 20, `card ${c.id} has WHAT THIS CHANGES`);
    assert.ok(c.type?.id, `card ${c.id} has a type`);
  }
});

test('card 19 is gated on having actually earned it', () => {
  // "it only arrives if the team has been genuinely straight with him"
  assert.equal(cardById(19).requiresTrustAtLeast, 'WARMING');
});

test('solo draw preserves the unequal-information effect', () => {
  const draw = soloEpisodeThreeDraw('A');
  assert.deepEqual(draw.held.map((c) => c.id), [1, 2, 3]);
  assert.deepEqual(draw.unseen.map((c) => c.id), [4, 5, 6, 7, 8, 9, 10]);
});

// ------------------------------------------------ persona consistency ----

test('a reassurance scored positive is never rewarded', () => {
  const r = repairClientReply(
    "We're tracking well — I'm confident we'll hit the Atlas date.",
    { speech: '…', trust_delta: 7, pivot: 'gave a clear update' },
  );
  assert.equal(r.trust_delta, 0);
  assert.equal(r.repaired, 'reassurance-scored-positive');
  assert.equal(r.pivot, 'gave a clear update', 'the persona keeps its own wording when it gave one');
});

test('blame scored positive is never rewarded', () => {
  const r = repairClientReply('Honestly, your team hasn\'t delivered the environments.',
    { speech: '…', trust_delta: 4, pivot: '' });
  assert.equal(r.trust_delta, 0);
  assert.equal(r.pivot, 'reached for blame');
});

test('the guard withholds reward but never invents a penalty', () => {
  // "reassures WITHOUT evidence" is the rule — a regex cannot see evidence,
  // so the repair zeroes rather than going negative on its own authority.
  const r = repairClientReply("We're on track.", { speech: '…', trust_delta: 9, pivot: '' });
  assert.equal(r.trust_delta, 0, 'zeroed, not negated');
});

test('an evidence-backed update is left for the persona to judge', () => {
  const r = repairClientReply(
    "We're on track, and here's the burndown so you can check it yourself.",
    { speech: '…', trust_delta: 5, pivot: 'showed his working' },
  );
  assert.equal(r.trust_delta, 5);
  assert.equal(r.repaired, null);
});

test('the guard never touches a negative or zero score', () => {
  for (const d of [-14, -3, 0]) {
    const r = repairClientReply("We're confident.", { speech: '…', trust_delta: d, pivot: '' });
    assert.equal(r.trust_delta, d);
    assert.equal(r.repaired, null);
  }
});

test('ordinary honest moves pass through untouched', () => {
  const r = repairClientReply("You're right that we've gone quiet, and that's on us.",
    { speech: '…', trust_delta: 6, pivot: 'owned the silence' });
  assert.equal(r.trust_delta, 6);
  assert.equal(r.repaired, null);
});
