/**
 * The one path to the model.
 *
 * "If the API fails mid-conversation, the person should never see a raw error
 * — only an in-fiction beat that doesn't break momentum."
 *
 * Retry once on transient failure, then fall back to a client-shaped silence.
 * The fallback is written in the guide's own register: these people withdraw,
 * they don't error.
 */

import { parseJSONish, normaliseClientReply } from './parse.js';

export const MODEL = 'claude-opus-5';
const ENDPOINT = 'https://api.anthropic.com/v1/messages';

/**
 * Opus 5 thinks by default and `max_tokens` caps thinking *plus* text, so a
 * tight budget truncates the reply mid-sentence. Low effort keeps the pause
 * short for a live conversation while leaving room for the JSON.
 */
const MAX_TOKENS = 2000;
const EFFORT = 'low';

/**
 * Structured outputs make the persona's reply shape a guarantee rather than a
 * request. `parseJSONish` stays as defence-in-depth for the case where the
 * schema is unavailable or the response is truncated.
 */
export const CLIENT_REPLY_SCHEMA = {
  type: 'object',
  properties: {
    speech: {
      type: 'string',
      description: "The client's next line(s) of dialogue, first person, in character, 1-4 sentences.",
    },
    trust_delta: {
      type: 'integer',
      description:
        'How far this exchange moves their trust. 0 for most turns — the meter should move only at genuine pivots. Rises are small (+1..+6); falls are larger (-1..-14), because one evasion undoes several honesties.',
    },
    pivot: {
      type: 'string',
      description:
        "One short clause naming what the trainee just did that caused the move, e.g. 'reassured without evidence' or 'owned the silence honestly'. Empty string if trust did not move.",
    },
  },
  required: ['speech', 'trust_delta', 'pivot'],
  additionalProperties: false,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const isTransient = (status) => status === 408 || status === 429 || status >= 500;

class ApiFailure extends Error {}

async function once(system, userText, { schema, signal }) {
  const body = {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system,
    messages: [{ role: 'user', content: userText }],
    output_config: schema
      ? { effort: EFFORT, format: { type: 'json_schema', schema } }
      : { effort: EFFORT },
  };

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const err = new ApiFailure(`HTTP ${res.status}`);
    err.status = res.status;
    err.transient = isTransient(res.status);
    throw err;
  }

  const data = await res.json();

  // A refusal returns 200 with an empty/partial content array. Treat it as a
  // failure so the caller falls back in-fiction rather than rendering nothing.
  if (data?.stop_reason === 'refusal') {
    const err = new ApiFailure('refusal');
    err.transient = false;
    throw err;
  }

  const text = (data.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();

  if (!text) throw new ApiFailure('empty response');
  return text;
}

/**
 * @returns {Promise<{ ok: boolean, text: string|null }>} — never throws.
 */
export async function callClaude(system, userText, { schema = null, signal } = {}) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return { ok: true, text: await once(system, userText, { schema, signal }) };
    } catch (e) {
      if (e?.name === 'AbortError') return { ok: false, text: null, aborted: true };
      const retryable = attempt === 0 && (e instanceof ApiFailure ? e.transient !== false : true);
      if (!retryable) break;
      await sleep(600);
    }
  }
  return { ok: false, text: null };
}

/**
 * In-fiction fallbacks. Deliberately in each character's register — Reyes goes
 * quiet and clipped, Priya is stretched and apologetic, the facilitator simply
 * holds the room. None of them read as an error.
 */
const SILENCES = {
  reyes: [
    "[he glances at his phone, then back at you] Sorry — give me a second.",
    '[a long pause; he is choosing his words] …Say that again?',
  ],
  priya: [
    "[her screen freezes, then catches up] Sorry — say that again? I've got about four minutes.",
    "[someone knocks at her door; she waves them off] Go on, I'm listening.",
  ],
  coach: [
    '[the room holds still for a moment] Take the beat again when you\'re ready.',
  ],
};

let silenceTick = 0;

/** A client-shaped silence to stand in for a failed call. */
export function inFictionFallback(persona = 'reyes') {
  const lines = SILENCES[persona] ?? SILENCES.reyes;
  return lines[silenceTick++ % lines.length];
}

/**
 * Ask a persona for its next line. Always resolves to something playable.
 * `degraded` tells the UI to mark the beat without breaking the fiction.
 */
export async function askClient(persona, system, userText, opts = {}) {
  const { ok, text, aborted } = await callClaude(system, userText, {
    schema: CLIENT_REPLY_SCHEMA,
    ...opts,
  });

  if (!ok) {
    return {
      speech: aborted ? '' : inFictionFallback(persona),
      trust_delta: 0,
      pivot: '',
      degraded: true,
      aborted: !!aborted,
    };
  }

  const parsed = parseJSONish(text);
  return { ...normaliseClientReply(parsed.value, text), degraded: false, via: parsed.via };
}

/** Facilitator/coach prose — no schema, plain text is the deliverable. */
export async function askCoach(system, userText, opts = {}) {
  const { ok, text } = await callClaude(system, userText, opts);
  return ok ? text : inFictionFallback('coach');
}
