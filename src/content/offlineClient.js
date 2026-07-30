/**
 * Rehearsal mode — the Lab with no API key and no network.
 *
 * These are not a substitute for the personas; they are the guide's own branch
 * table played deterministically. Deliverable Five is written as branches
 * rather than a monologue precisely because the client "is never a puppet
 * reading lines in order" — which means the branches themselves are playable
 * without a model, just less improvisational.
 *
 * Shared by the standalone build's rehearsal mode and the test harness, so the
 * two can never drift apart.
 */

const REASSURANCE = /\b(on track|confident|don'?t worry|rest assured|going well|no problem)\b/i;
const OWNERSHIP = /\b(that'?s on us|we went quiet|gone quiet|we should have|our fault|we dropped|my fault)\b/i;
const QUESTION = /\?\s*$|\bwhat would\b|\bwhat'?s worrying\b|\bhow do you\b|\bwhat do you need\b/i;
const BLAME = /\byour (team|side|people|infra)\b|\bosei\b|\bnot our fault\b/i;
const PROMISE = /\bi promise\b|\bguarantee\b|\bdefinitely will\b|\bwe will absolutely\b/i;

const REYES = {
  blame: {
    speech: "[flatly] And that helps me how? I don't need to know whose fault it is. I need to know what's true and what happens next.",
    trust_delta: -11, pivot: 'reached for blame',
  },
  reassure: {
    speech: "[a pause] On track. Right. See, that's the word that's stopped meaning anything to me. I've had three updates that all said \"on track,\" and none of them showed me anything I could actually check. [beat] I'm not asking you to make me feel better. I'm asking you to tell me something true.",
    trust_delta: -9, pivot: 'reassured without evidence',
  },
  promise: {
    speech: "[quietly] Can you actually commit to that? Because I've had the impressive promise before. It cost us the better part of a year.",
    trust_delta: -6, pivot: 'over-promised to close the discomfort',
  },
  own: {
    speech: "[sits back, some tension leaving him] Thank you. That's… I didn't expect you to just say it. [beat] Yeah. It went quiet, and quiet is the thing that scares me with this, for reasons you probably know. So — since you're being straight — tell me straight: are we going to make this date or not?",
    trust_delta: 6, pivot: 'owned the silence',
  },
  question: {
    speech: "[a small nod] That's a better question than I expected, honestly. What worries me? [pause] The last time this platform had a problem, I found out when our customers found out — during an incident, live. I looked like I didn't know what was happening in my own platform. I can't have that again. Not at launch, not in front of the board.",
    trust_delta: 4, pivot: 'asked a real question',
  },
  idle: {
    speech: '[he waits, and lets the silence sit] Go on.',
    trust_delta: 0, pivot: '',
  },
};

const PRIYA = {
  blame: {
    speech: "[cooling] Ray's team. Right. You understand Ray reports to me? [beat] So what you're telling me, three days before I stand in front of my CEO, is that my department is the problem. That's… that's a great position to put me in.",
    trust_delta: -11, pivot: 'attacked the sponsor’s own house',
  },
  reassure: {
    speech: "[tight] That's not what I asked. I need something I can defend to Dana, not something that sounds fine in this room.",
    trust_delta: -7, pivot: 'offered comfort where she needed a position',
  },
  promise: {
    speech: "[pressing] Is that real, or is that what you'd like to be true? Because I'm the one who has to say it out loud upstairs.",
    trust_delta: -5, pivot: 'over-promised to a sponsor who has to defend it',
  },
  own: {
    speech: "[a breath] Okay. Thank you for coming to me first instead of letting me find out in the room. [beat] So it's the environments. Yeah. I know Ray's underwater — that freeze has gutted his team. What are you actually proposing? Because I need to walk into Dana's office with a plan, not a confession.",
    trust_delta: 6, pivot: 'came to her first, without blame',
  },
  question: {
    speech: "[leaning in] What do I need? I need to look like I'm on top of this rather than blindsided by it. Give me that and I can carry almost anything upstairs.",
    trust_delta: 4, pivot: 'asked what she actually needed',
  },
  idle: {
    speech: "[glancing at the clock] Go on — I've got about four minutes.",
    trust_delta: 0, pivot: '',
  },
};

/** The guide's branch table, resolved against what the trainee actually said. */
export function offlineClientReply(persona, traineeText) {
  const t = String(traineeText ?? '');
  const lines = persona === 'priya' ? PRIYA : REYES;

  // Order matters: blame and reassurance are the failure paths and must win
  // over an incidental question mark in the same sentence.
  if (BLAME.test(t)) return { ...lines.blame };
  if (REASSURANCE.test(t)) return { ...lines.reassure };
  if (PROMISE.test(t)) return { ...lines.promise };
  if (OWNERSHIP.test(t)) return { ...lines.own };
  if (QUESTION.test(t)) return { ...lines.question };
  return { ...lines.idle };
}

const COACH = {
  replay: "You were trying to settle him — that's what most people reach for when someone senior goes quiet. Look at what it actually did. If the goal isn't to reassure him, what is it? Take the same moment again, aiming at that instead.",
  fact_story:
    "Read your FACT column back slowly. Anything in there about what he thinks or feels is a story — he wrote words, and you inferred a state of mind from them. That inference might be right; it just isn't evidence. What's the one assumption there that, if it were wrong, would change your whole next move?",
  cards:
    "You've just learned something that makes you right about the delay. Notice what that did to you — whether you reached for it as a defence or as a way in. Being right about fault protects no one here. What would you do differently if the goal were to make this a problem you both own?",
  debrief:
    "Look at where the account ended, and then at where it moved. Every inch of that was something you said, or didn't say, in a handful of hard moments — not a plan, not a framework, a sentence. Somewhere in there you were confidently wrong about something, and a card or a person showed you. Somewhere else you asked instead of explained, and the temperature changed.\n\nThe thing worth carrying isn't the account. It's the three seconds after someone says the thing you didn't want to hear. That's where this relationship was made and lost, and it's where yours are too.",
};

export const offlineCoachReply = (mode) => COACH[mode] ?? COACH.replay;
