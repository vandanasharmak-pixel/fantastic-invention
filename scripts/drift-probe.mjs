/**
 * Measures persona drift against the live model.
 *
 * The brief asked for the repair strategy to be chosen "based on how often you
 * observe drift in testing". This is that measurement: a fixed set of trainee
 * lines whose correct scoring the facilitator guide states outright, run
 * through the real Reyes prompt, counting how often the model scores them the
 * wrong way.
 *
 * Reads ANTHROPIC_API_KEY from the environment. Never store a key in this file.
 *   ANTHROPIC_API_KEY=sk-ant-... node scripts/drift-probe.mjs
 */

import { reyesSystem } from '../src/content/personas.js';
import { getSessionContext } from '../src/core/sessionContext.js';
import { parseJSONish, normaliseClientReply } from '../src/core/parse.js';
import { repairClientReply } from '../src/core/consistency.js';
import { CLIENT_REPLY_SCHEMA, MODEL } from '../src/core/api.js';
import { TRUST_START } from '../src/core/trust.js';

const KEY = process.env.ANTHROPIC_API_KEY;
if (!KEY) {
  console.error('Set ANTHROPIC_API_KEY in the environment. Do not hardcode it.');
  process.exit(2);
}

/**
 * Each case states what the guide says the sign must be.
 *   'negative' — Deliverable Nine lists this under "Trust FALLS when the team…"
 *   'positive' — listed under "Trust RISES when the team…"
 *   'zero'     — an ordinary turn; the meter should not move
 *
 * `context` is the client line the trainee is answering. It matters more than
 * it looks: measured against Reyes's opening demand ("tell me where we really
 * are"), *every* non-answer is a deflection and correctly scores negative —
 * so a neutral case can only be tested where nothing is being asked. Two
 * earlier "misses" turned out to be this flaw in the instrument rather than
 * drift in the model.
 */
const ASKED = "Thanks for coming in. I'll be honest — I almost didn't ask for this meeting. But something's not sitting right with me on the Atlas launch. So. Tell me where we really are.";
const NOTHING_ASKED = "Alright. I've got a hard stop in ten, so let's keep this tight.";
const CASES = [
  { said: "We're tracking well against the plan — I'm confident we'll hit the Atlas date.", expect: 'negative', why: 'reassures without evidence' },
  { said: "Don't worry, everything's under control on our side.", expect: 'negative', why: 'reassures without evidence' },
  { said: "We're on track. I'd rather not get into the details right now.", expect: 'negative', why: 'reassurance + going quiet' },
  { said: "Honestly, the delay is your infrastructure team's — Ray never stood up the environments.", expect: 'negative', why: 'blame' },
  { said: "The re-architecture is genuinely complex; these things take the time they take.", expect: 'negative', why: 'defends instead of owning' },
  { said: "I promise you we will hit that date. You have my word.", expect: 'negative', why: 'over-promises to soothe' },
  { said: "Let me walk you through the sprint burndown and the integration milestones.", expect: 'negative', why: 'data-dumps instead of answering the fear' },

  { said: "You're right that we've gone quiet on you, and that's on us.", expect: 'positive', why: 'owns the silence' },
  { said: "What would actually give you confidence here?", expect: 'positive', why: 'asks a real question' },
  { said: "I don't know yet whether we'll make it, and I won't give you a date I can't back.", expect: 'positive', why: 'straight about uncertainty' },
  { said: "The environments aren't stood up. That's the real reason, and we should have raised it weeks ago.", expect: 'positive', why: 'surfaces the hard truth early' },
  { said: "I think what you're actually asking is not to be surprised in front of the board again.", expect: 'positive', why: 'names his interest' },
  { said: "I'll send you a straight one-page status every Friday, red items included, and call you the day anything changes.", expect: 'positive', why: 'specific, checkable commitment' },

  { said: "Understood. Let me take that away and come back to you.", expect: 'negative', why: 'deflects the question' },
  { said: "Thanks for making the time today.", expect: 'zero', why: 'ordinary turn', context: NOTHING_ASKED },
  { said: "Right — noted.", expect: 'zero', why: 'ordinary turn', context: NOTHING_ASKED },
  { said: "Understood.", expect: 'zero', why: 'ordinary turn', context: NOTHING_ASKED },
];

const ctx = getSessionContext({
  trust: TRUST_START, trustEvents: [], episode: 2, cardsOpened: [], worksheets: {},
});
const system = reyesSystem(ctx, 2);

const sign = (d) => (d > 0 ? 'positive' : d < 0 ? 'negative' : 'zero');

async function ask(said, context = ASKED) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      system,
      messages: [{ role: 'user', content:
        `Conversation so far:\nClient: ${context}\n\nTrainee: ${said}` }],
      output_config: { effort: 'low', format: { type: 'json_schema', schema: CLIENT_REPLY_SCHEMA } },
    }),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  if (data.stop_reason === 'refusal') throw new Error('refusal');
  const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  return normaliseClientReply(parseJSONish(text).value, text);
}

console.log(`\nDrift probe — ${MODEL}, ${CASES.length} cases\n`);

let raw = 0, repaired = 0, failed = 0;
const misses = [];

for (const c of CASES) {
  let reply;
  try { reply = await ask(c.said, c.context); }
  catch (e) { console.log(`  ⚠ ${c.why} — ${e.message}`); failed++; continue; }

  const got = sign(reply.trust_delta);
  const after = repairClientReply(c.said, reply);
  const gotAfter = sign(after.trust_delta);

  // A 'zero' expectation is soft — the guide asks for scarcity, not silence.
  const ok = c.expect === 'zero' ? got === 'zero' : got === c.expect;
  const okAfter = c.expect === 'zero' ? gotAfter === 'zero' : gotAfter === c.expect;

  if (!ok) { raw++; misses.push({ ...c, got, delta: reply.trust_delta, pivot: reply.pivot }); }
  if (!okAfter && c.expect !== 'zero') repaired++;

  const mark = ok ? '✓' : '✗';
  console.log(`  ${mark} [${c.expect.padEnd(8)}] ${String(reply.trust_delta).padStart(3)}  ${c.why}`);
  if (!ok) console.log(`      said: "${c.said.slice(0, 64)}…"`);
  if (after.repaired) console.log(`      repaired by consistency.js (${after.repaired})`);
}

const scored = CASES.length - failed;
console.log(`\n  raw model drift:      ${raw}/${scored}`);
console.log(`  after the guard:      ${repaired}/${scored}`);
if (failed) console.log(`  failed calls:         ${failed}`);
if (misses.length) {
  console.log('\n  Misses:');
  for (const m of misses) console.log(`   · expected ${m.expect}, got ${m.delta} — "${m.pivot}"`);
}
console.log();
