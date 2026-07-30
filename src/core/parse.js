/**
 * Defensive parsing of a client-persona reply.
 *
 * A malformed model response must never stall an episode. Three passes, in
 * descending order of confidence:
 *
 *   1. Strict JSON (after stripping code fences and surrounding prose).
 *   2. Balanced-brace extraction — finds the first complete object even when
 *      the model wrapped it in commentary.
 *   3. Key-based regex scanning for `speech` / `trust_delta` / `pivot`
 *      individually, so a single unescaped quote costs one field, not the turn.
 *
 * Only if all three fail does the caller fall back to an in-fiction beat.
 */

const FENCE = /^\s*```(?:json|javascript|js)?\s*\n?([\s\S]*?)\n?\s*```\s*$/i;

export function stripFences(text) {
  const s = String(text ?? '').trim();
  const m = s.match(FENCE);
  return m ? m[1].trim() : s;
}

/** Find the first balanced `{...}` run, ignoring braces inside strings. */
export function extractFirstObject(text) {
  const s = String(text ?? '');
  const start = s.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (escaped) { escaped = false; continue; }
    if (c === '\\') { escaped = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

const unescape = (s) =>
  s.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\');

/**
 * Pass 3. Scan for each key independently. Deliberately tolerant: single or
 * double quotes, unquoted keys, trailing prose.
 */
export function scanFields(text) {
  const s = String(text ?? '');
  const out = {};

  const speech = s.match(/["']?speech["']?\s*:\s*"((?:[^"\\]|\\.)*)"/i)
    || s.match(/["']?speech["']?\s*:\s*'((?:[^'\\]|\\.)*)'/i);
  if (speech) out.speech = unescape(speech[1]);

  const delta = s.match(/["']?trust[_\s-]?delta["']?\s*:\s*(-?\d+(?:\.\d+)?)/i);
  if (delta) out.trust_delta = Number(delta[1]);

  const pivot = s.match(/["']?pivot["']?\s*:\s*(true|false)/i);
  if (pivot) out.pivot = pivot[1].toLowerCase() === 'true';

  const reason = s.match(/["']?reason["']?\s*:\s*"((?:[^"\\]|\\.)*)"/i);
  if (reason) out.reason = unescape(reason[1]);

  return Object.keys(out).length ? out : null;
}

/**
 * @returns {{ ok: boolean, value: object|null, via: 'json'|'object'|'scan'|null }}
 */
export function parseJSONish(text) {
  const stripped = stripFences(text);

  try {
    const v = JSON.parse(stripped);
    if (v && typeof v === 'object') return { ok: true, value: v, via: 'json' };
  } catch { /* fall through */ }

  const objText = extractFirstObject(stripped);
  if (objText) {
    try {
      const v = JSON.parse(objText);
      if (v && typeof v === 'object') return { ok: true, value: v, via: 'object' };
    } catch { /* fall through */ }
  }

  const scanned = scanFields(stripped);
  if (scanned) return { ok: true, value: scanned, via: 'scan' };

  return { ok: false, value: null, via: null };
}

/**
 * Normalise a parsed reply into the shape the app consumes, filling gaps
 * rather than throwing. `speech` falling back to the raw text means that even
 * a model which ignored the schema entirely still produces a playable line.
 */
export function normaliseClientReply(parsed, rawText) {
  const v = parsed ?? {};
  const speech = typeof v.speech === 'string' && v.speech.trim()
    ? v.speech.trim()
    : String(rawText ?? '').trim();
  return {
    speech,
    trust_delta: Number.isFinite(Number(v.trust_delta)) ? Number(v.trust_delta) : 0,
    pivot: v.pivot === true,
    reason: typeof v.reason === 'string' ? v.reason : '',
  };
}
