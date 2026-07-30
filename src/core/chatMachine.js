/**
 * Hold / Replay as a real state machine.
 *
 * Deliverable Ten: "Replay is not 'let's discuss what went wrong'... The
 * participant does not talk about the better move — they make it, out loud, in
 * the chair, with the client responding differently."
 *
 * The five steps of the guide's replay map onto these transitions:
 *   HOLD      -> hold()          (freeze the scene; the client goes still)
 *   REWIND    -> hold() captures `pivotExchange` — the one beat, not the scene
 *   SURFACE   -> coachReady()    (the coach asks "what were you going for?")
 *   REFRAME   -> still `replaying`; the coach's question is on screen
 *   REPLAY    -> submitReplay()  (same moment, new goal, go)
 *
 * Critically: Hold does NOT mutate the trust log. `trustBefore` is captured at
 * the moment Hold is called, and the replay's delta is applied relative to it
 * once the original exchange has been superseded.
 */

export const CHAT_STATES = Object.freeze({
  IDLE: 'idle',
  AWAITING_REPLY: 'awaitingReply',
  HOLDING: 'holding',
  REPLAYING: 'replaying',
});

const { IDLE, AWAITING_REPLY, HOLDING, REPLAYING } = CHAT_STATES;

export function createChatMachine() {
  return {
    state: IDLE,
    /** Set while holding/replaying; null otherwise. */
    hold: null,
  };
}

/** Input is frozen unless the participant is genuinely free to speak. */
export const inputEnabled = (m) => m.state === IDLE || m.state === REPLAYING;

export const isBusy = (m) => m.state === AWAITING_REPLY;

class InvalidTransition extends Error {
  constructor(from, action) {
    super(`Invalid chat transition: cannot "${action}" from "${from}"`);
    this.name = 'InvalidTransition';
  }
}

const expect = (m, action, ...allowed) => {
  if (!allowed.includes(m.state)) throw new InvalidTransition(m.state, action);
};

/** Participant sends a turn. `replayOf` is set when this is the second attempt. */
export function submit(m, { replayOf = null } = {}) {
  expect(m, 'submit', IDLE, REPLAYING);
  return { ...m, state: AWAITING_REPLY, pendingReplayOf: replayOf };
}

/** A client reply came back (or a fallback stood in for one). */
export function replyReceived(m) {
  expect(m, 'replyReceived', AWAITING_REPLY);
  return { ...m, state: IDLE, hold: null, pendingReplayOf: null };
}

/**
 * Facilitator (or the participant) calls hold. Freeze input, snapshot the
 * pivot, and remember the trust value as it stood at this instant.
 */
export function hold(m, { trustBefore, pivotExchange }) {
  expect(m, 'hold', IDLE);
  return {
    ...m,
    state: HOLDING,
    hold: { trustBefore, pivotExchange, coachNote: null },
  };
}

/** The coach persona has returned its "what were you going for?" question. */
export function coachReady(m, coachNote) {
  expect(m, 'coachReady', HOLDING);
  return { ...m, state: REPLAYING, hold: { ...m.hold, coachNote } };
}

/** Abandon the replay and return to the conversation unchanged. */
export function cancelHold(m) {
  expect(m, 'cancelHold', HOLDING, REPLAYING);
  return { ...m, state: IDLE, hold: null };
}

/**
 * The participant takes the beat again. Returns the machine plus the
 * `replayOf` id the caller must thread into `applyTrustEvent`, so the flawed
 * exchange is superseded and the new delta lands on `trustBefore`.
 */
export function submitReplay(m) {
  expect(m, 'submitReplay', REPLAYING);
  const replayOf = m.hold?.pivotExchange?.trustEventId ?? null;
  return { machine: submit({ ...m, state: REPLAYING }, { replayOf }), replayOf };
}

export { InvalidTransition };
