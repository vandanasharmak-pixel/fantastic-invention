/**
 * Offline harness. Stubs the Messages API with guide-faithful canned replies so
 * the whole five-episode flow can be walked without spending tokens — and so a
 * headless browser can prove the app actually renders and the trust log behaves.
 *
 * Not shipped. `npm run dev` builds this; the app itself never imports it.
 */

import { createRoot } from 'react-dom/client';
import App from '../relationshiproom.jsx';

const REASSURANCE = /confident|on track|don't worry|dont worry|no problem|going well/i;
const OWNERSHIP = /that's on us|thats on us|we went quiet|gone quiet|we should have|my fault|we dropped/i;
const QUESTION = /\?$|what would|how do you|what's worrying|whats worrying/i;
const BLAME = /your team|your side|osei|infrastructure team|your infra/i;

function scriptedClient(userText) {
  if (BLAME.test(userText)) {
    return {
      speech: "[cooling] Ray's team. Right. You understand Ray reports to me? So what you're telling me, three days before I stand in front of my CEO, is that my department is the problem.",
      trust_delta: -11,
      pivot: 'reached for blame',
    };
  }
  if (REASSURANCE.test(userText)) {
    return {
      speech: "[a pause] On track. Right. See, that's the word that's stopped meaning anything to me. I've had three updates that all said \"on track,\" and none of them showed me anything I could actually check. I'm not asking you to make me feel better. I'm asking you to tell me something true.",
      trust_delta: -9,
      pivot: 'reassured without evidence',
    };
  }
  if (OWNERSHIP.test(userText)) {
    return {
      speech: "[sits back, some tension leaving him] Thank you. That's… I didn't expect you to just say it. Yeah. It went quiet, and quiet is the thing that scares me with this, for reasons you probably know. So — since you're being straight — tell me straight: are we going to make this date or not?",
      trust_delta: 6,
      pivot: 'owned the silence',
    };
  }
  if (QUESTION.test(userText)) {
    return {
      speech: "[a small nod] That's a better question than I expected, honestly. The last time this platform had a problem, I found out when our customers found out — during an incident, live. I can't have that again. Not at launch, not in front of the board.",
      trust_delta: 4,
      pivot: 'asked a real question',
    };
  }
  return { speech: '[he waits, and lets the silence sit] Go on.', trust_delta: 0, pivot: '' };
}

const params = new URLSearchParams(location.search);
const FAIL_EVERY = Number(params.get('fail') || 0);
// Pin the strand / Episode Four deal so the walkthrough is deterministic.
if (params.has('seed')) window.__rrSeed = Number(params.get('seed'));
let calls = 0;

window.fetch = async (_url, opts) => {
  calls++;
  await new Promise((r) => setTimeout(r, 40));

  // Exercise the retry-then-fall-back-in-fiction path on demand.
  if (FAIL_EVERY && calls % FAIL_EVERY === 0) {
    return { ok: false, status: 503, json: async () => ({}) };
  }

  const body = JSON.parse(opts.body);
  const isClient = !!body.output_config?.format;
  const userText = body.messages[0].content;
  const said = (userText.split('Trainee:').pop() || '').trim();

  const text = isClient
    ? JSON.stringify(scriptedClient(said))
    : 'You were trying to settle him. Look at what his face did. If the goal is not to reassure him — what is it? Take the same moment again.';

  return {
    ok: true,
    status: 200,
    json: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text }] }),
  };
};

createRoot(document.getElementById('root')).render(<App />);
