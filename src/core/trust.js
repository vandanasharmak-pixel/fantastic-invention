/**
 * The Trust Meter — single source of truth.
 *
 * Deliverable Nine of the facilitator guide is emphatic on two points that
 * shape this module:
 *
 *   1. "Notice there are no scores, no percentages, no plus-and-minus. That is
 *      deliberate. The moment trust becomes a number, participants start
 *      optimising the number instead of tending the relationship."
 *      -> The numeric value here is INTERNAL. Never render it. Render the zone.
 *
 *   2. "Trust rises slowly through many small honesties and falls quickly
 *      through a single evasion... one reassurance under pressure can undo
 *      three honest moves."
 *      -> Deltas are deliberately asymmetric. See DELTA_BOUNDS.
 *
 * Current trust is a pure function of the append-only event log. Nothing may
 * hold a trust value that did not come out of `computeTrust()`.
 */

export const TRUST_MIN = 2;
export const TRUST_MAX = 98;

/**
 * "It begins here, in NEUTRAL leaning GUARDED, because that is exactly where
 * Cirrus is when the participants inherit it: not broken, but cooling."
 */
export const TRUST_START = 44;

export const ZONES = [
  { id: 'BROKEN', label: 'Broken', caption: 'trust is gone', min: 2, max: 20 },
  { id: 'GUARDED', label: 'Guarded', caption: 'watching, wary', min: 20, max: 40 },
  { id: 'NEUTRAL', label: 'Neutral', caption: 'transactional', min: 40, max: 60 },
  { id: 'WARMING', label: 'Warming', caption: 'leaning in', min: 60, max: 80 },
  { id: 'TRUSTED', label: 'Trusted', caption: 'a real partner', min: 80, max: 98 },
];

/**
 * The asymmetry that makes the Meter honest. A single evasion outweighs a
 * single honesty; three honest moves are needed to undo one reassurance.
 */
export const DELTA_BOUNDS = { minRise: 1, maxRise: 6, maxFall: -14 };

export const clampTrust = (n) => Math.max(TRUST_MIN, Math.min(TRUST_MAX, n));

export function zoneFor(value) {
  const v = clampTrust(value);
  return ZONES.find((z, i) => v < z.max || i === ZONES.length - 1);
}

/**
 * Clamp a persona-supplied delta into the guide's asymmetric band.
 * A model that returns +40 does not get to hand the room a happy ending.
 */
export function clampDelta(delta) {
  const d = Number(delta);
  if (!Number.isFinite(d)) return 0;
  if (d > 0) return Math.min(DELTA_BOUNDS.maxRise, Math.round(d));
  if (d < 0) return Math.max(DELTA_BOUNDS.maxFall, Math.round(d));
  return 0;
}

let seq = 0;
const nextId = () => `te_${Date.now().toString(36)}_${(seq++).toString(36)}`;

/**
 * Recompute every snapshot in the log from scratch.
 *
 * Superseded events (a flawed exchange that was later replayed) stay in the
 * log — the debrief needs "you tried that once, then better" — but contribute
 * nothing to the running total and carry null snapshots.
 *
 * Clamping is applied progressively rather than to the final sum, so that a
 * relationship which genuinely bottomed out has to climb back from the floor
 * instead of retroactively pretending it never hit it.
 */
export function recompute(events) {
  let trust = TRUST_START;
  const replayed = events.map((e) => {
    if (e.superseded) return { ...e, trustBefore: null, trustAfter: null };
    const before = trust;
    const after = clampTrust(before + e.delta);
    trust = after;
    return { ...e, trustBefore: before, trustAfter: after };
  });
  return { events: replayed, trust };
}

export const computeTrust = (events) => recompute(events).trust;

export function createTrustState() {
  return { events: [], trust: TRUST_START };
}

/**
 * The ONE path by which trust ever changes. Persona replies, deterministic
 * narrative nudges ("three days of silence"), and replays all come through
 * here, so there is one place to reason about and one place to test.
 */
export function applyTrustEvent(state, { episode, source, delta, reason, replayOf = null }) {
  const event = {
    id: nextId(),
    episode,
    source,
    delta: clampDelta(delta),
    reason,
    replayOf,
    superseded: false,
    timestamp: Date.now(),
    trustBefore: null,
    trustAfter: null,
  };
  return recompute([...state.events, event]);
}

/**
 * Mark the original flawed exchange as superseded by a replay. Kept for the
 * debrief's narrative; excluded from the running total.
 */
export function supersedeTrustEvent(state, eventId) {
  return recompute(
    state.events.map((e) => (e.id === eventId ? { ...e, superseded: true } : e)),
  );
}

/** The events that actually moved the needle, for the Grand Debrief spine. */
export const activeEvents = (state) => state.events.filter((e) => !e.superseded);

/** Both halves of a replay pair, for the "you tried that once, then better" beat. */
export function replayPairs(state) {
  return state.events
    .filter((e) => e.replayOf)
    .map((replay) => ({
      original: state.events.find((o) => o.id === replay.replayOf) || null,
      replay,
    }))
    .filter((p) => p.original);
}
