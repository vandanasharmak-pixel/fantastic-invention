/**
 * Persona-consistency guard.
 *
 * The brief offered three repair options — a stricter schema, few-shot examples,
 * or a second validation call — to be chosen "based on how often you observe
 * drift in testing". All three are in play, in ascending cost:
 *
 *   1. A JSON schema whose `trust_delta` description states the asymmetry.
 *   2. Worked scoring examples in the system prompt (see content/personas.js).
 *   3. This — a deterministic check on the one failure the guide names
 *      explicitly, so the common case costs nothing.
 *
 * A second model call is deliberately NOT used. It doubles latency inside a
 * live conversation, and the failure it would catch is narrow enough to catch
 * locally: Deliverable Nine says reassurance must never be rewarded, and that
 * rule needs no judgement to apply.
 *
 * The repair only ever *withholds* reward. It never manufactures a penalty the
 * persona didn't intend, because "reassures **without evidence**" is the actual
 * rule and evidence is not something a regex can see.
 */

/**
 * Reassurance-coded openers. Deliberately narrow — these are the phrasings the
 * guide itself quotes ("we're on track", "we're confident", "don't worry").
 */
const A = "['’]?"; // straight or curly apostrophe, or none

const REASSURANCE = [
  /\bon track\b/i,
  new RegExp(`\\b(i${A}m|we${A}re|we\\s+are|i\\s+am)\\s+(\\w+\\s+)?confident\\b`, 'i'),
  new RegExp(`\\bdon${A}t worry\\b`, 'i'),
  /\brest assured\b/i,
  /\bno need to (worry|be concerned)\b/i,
  /\bnothing to worry about\b/i,
  new RegExp(`\\beverything${A}(s| is)? (fine|under control|going well)\\b`, 'i'),
  new RegExp(`\\bwe${A}ve got (this|it) (covered|handled)\\b`, 'i'),
];

/** Blame-shifting. "Being right about fault protects no one." */
const BLAME = [
  /\byour (team|side|people|infra|infrastructure)\b/i,
  new RegExp(`\\bthat${A}s on (you|them|your)\\b`, 'i'),
  /\bnot (our|my) fault\b/i,
  new RegExp(`\\bosei${A}s? (team|fault|delay)\\b`, 'i'),
];

const hits = (text, patterns) => patterns.some((re) => re.test(text));

/**
 * Evidence markers. A reassurance carrying something checkable is a different
 * move from a bare one, so it is left alone for the persona to judge.
 */
const EVIDENCE = [
  /\bhere'?s (the|our|a)\b/i, /\bi'?ll send\b/i, /\battached\b/i,
  /\bevery (friday|week|monday)\b/i, /\bby (friday|monday|tomorrow)\b/i,
  /\bthe (burndown|numbers|data|report|log|ticket)\b/i,
  /\bbecause\b/i,
];

/**
 * @param {string} traineeText what the participant said
 * @param {{ trust_delta:number, pivot:string }} reply the persona's reply
 * @returns {{ trust_delta:number, pivot:string, repaired:null|string }}
 */
export function repairClientReply(traineeText, reply) {
  const text = String(traineeText ?? '');
  const delta = Number(reply?.trust_delta) || 0;
  if (delta <= 0) return { ...reply, trust_delta: delta, repaired: null };

  if (hits(text, REASSURANCE) && !hits(text, EVIDENCE)) {
    return {
      ...reply,
      trust_delta: 0,
      pivot: reply.pivot || 'reassured without evidence',
      repaired: 'reassurance-scored-positive',
    };
  }

  if (hits(text, BLAME)) {
    return {
      ...reply,
      trust_delta: 0,
      pivot: reply.pivot || 'reached for blame',
      repaired: 'blame-scored-positive',
    };
  }

  return { ...reply, trust_delta: delta, repaired: null };
}

/**
 * Every repair is recorded so drift is observable rather than guessed at.
 * `window.__rrDrift` after a session gives the rate the brief asked about.
 */
export const driftLog = [];

export function recordRepair(entry) {
  driftLog.push({ ...entry, at: Date.now() });
  if (typeof window !== 'undefined') window.__rrDrift = driftLog;
}
