# The Relationship Room — solo edition

A solo, AI-powered version of the VEE Technologies Practice Lab: a five-episode
simulation in protecting a strategic client relationship (the Cirrus Systems
account).

The facilitator guide in `docs/facilitator-guide.md` is the source of truth for
character behaviour, the confidential cards, and the episode structure.

## Status

Complete and integrated.

```
relationshiproom.jsx        The app — Registry room + Chart Recorder gauge
src/core/trust.js           Trust Meter reducer — append-only event log
src/core/chatMachine.js     Hold/Replay state machine (idle|awaitingReply|holding|replaying)
src/core/parse.js           Three-pass defensive parsing of persona replies
src/core/api.js             callClaude — retry once, then an in-fiction beat
src/core/consistency.js     Persona-drift guard — reassurance is never rewarded
src/core/storage.js         Versioned persistence + resume affordance
src/core/sessionContext.js  The condensed brief every persona prompt receives
src/content/cards.js        All 20 confidential cards, with the guide's routing
src/content/personas.js     Reyes, Priya and the facilitator, per Deliverable Five
test/core.test.js           40 tests
scripts/trace-trust.js      Hand-traceable trust ledger
```

```sh
npm test        # 40 unit tests
npm run trace   # walk an Episode Two hold/replay by hand
npm run verify  # drive the real app in a real browser — 52 checks
```

`npm run verify` bundles `dev/harness.jsx` (which stubs the Messages API with
guide-faithful canned replies) and drives the app headless: it plays a
reassurance, calls Hold, plays the retake, and asserts the flawed exchange is
struck rather than deleted and that trust lands on the pre-Hold baseline. It
also runs the flow with the API failing every call, reloads mid-session to check
resume, measures the layout at 390px, and walks the whole arc — envelopes, the
escalation to Priya, the recovery conversation, the Grand Debrief — asserting
the meter stayed scarce throughout. A separate pass drives the entire flow on
the keyboard alone — skip link, tab order, visible focus, the heading taking
focus on each episode, Enter-to-send, and envelopes opening from the keyboard —
and one more coasts deliberately to confirm the facilitator deals a wildcard.
Screenshots land in `dev/`.

## Persona-drift guard

The brief offered three repair options, to be chosen on observed drift. All
three are in play, in ascending cost: a JSON schema whose `trust_delta`
description states the asymmetry; worked scoring examples in the system prompt;
and `consistency.js`, which catches the one failure the guide names explicitly.

A second validation call is deliberately **not** used — it doubles latency
inside a live conversation, and this failure is narrow enough to catch locally.
The repair only ever *withholds* reward: it zeroes a positive score on
reassurance-coded or blame-coded input rather than inventing a penalty, because
the actual rule is "reassures **without evidence**" and a regex cannot see
evidence. Every repair is recorded to `window.__rrDrift`, so a real session
gives you the drift rate the brief asked about.

## The visual world

Direction **1a "Registry"** for the room — ledger-grey paper, oxblood
classification stamps, redaction bars over everything the player hasn't earned
yet, and a `VOID — RETAKE` stamp struck across a superseded exchange — with
direction **1b "Chart Recorder"**'s instrument as the Trust Meter: an ivory dial
with five zone arcs, a needle that takes 1.4s to travel, and a strip chart of
the whole session underneath.

Newsreader carries the client's voice at 19px; Archivo carries your own replies,
deliberately smaller than his. Courier Prime does the stamps and routing codes.

## Model configuration

`claude-opus-5`, via `output_config.format` with a JSON schema so the persona's
reply shape is a guarantee rather than a request. `parseJSONish` stays behind it
as defence-in-depth. Thinking is on by default on this model and `max_tokens`
caps thinking *plus* text, so the budget is 2000 at `effort: "low"` — enough
headroom for the reply, short enough that a live conversation doesn't stall.

## Design notes that come straight from the guide

**The Trust Meter shows zones, never a number.** Deliverable Nine is explicit:
_"there are no scores, no percentages, no plus-and-minus… the moment trust
becomes a number, participants start optimising the number instead of tending
the relationship."_ The numeric value in `trust.js` is internal bookkeeping;
the UI must render `zoneFor(trust).label` — Broken / Guarded / Neutral /
Warming / Trusted. It starts at NEUTRAL leaning GUARDED.

**Trust is asymmetric by design.** _"Trust rises slowly through many small
honesties and falls quickly through a single evasion."_ `clampDelta` bounds
rises at +6 and falls at −14, so one reassurance genuinely costs three honest
moves. Persona replies cannot hand the room a flattering ending.

**Moves are scarce.** _"Do not move the Meter for every small thing — you will
exhaust its meaning… four or five deliberate, narrated moves across the whole
Lab land far harder than twenty small ones."_ Most exchanges score 0, and a
zero-delta turn is not recorded as an event at all — so the movement log stays
a record of pivots rather than a transcript. The reducer enforces this; the
prompt only asks for it.

**Superseded events are kept, not deleted.** A replayed mistake stays in the
log with `superseded: true` and contributes nothing to the total, because the
Grand Debrief reconstructs the whole journey — _"we lost it right there, and
spent the rest of the day earning it back"_ is the closing beat.

**Card 19 is earned.** _"It only arrives if the team has been genuinely
straight with him"_ — gated on trust reaching WARMING.

**Wildcards are played as a facilitator would.** Cards 17–20 are held in
reserve: if trust has been static across two episodes the session deals _The
Rumour_ to complicate a table that's coasting; if the player has genuinely
earned it, _A Message From Reyes_ arrives instead. Neither is guaranteed.

## Fixes to the prototype's engineering

- **Replay double-counted.** The old `send()` read `trust` as its baseline, but
  by replay time that already included the flawed exchange's delta — so the
  retake stacked on top of the mistake instead of replacing it. The flawed
  event is now superseded and the retake lands on the trust as it stood before.
- **`trustBefore` was captured and never used**, and `trustLog` drifted
  independently of `setTrust`. There is now one log and one derivation.
- **Persistence never loaded.** `window.storage?.set(...)` was called behind
  optional chaining inside a `try{}catch{}` that swallowed everything, and no
  code ever read it back. `support.js` turns out to be the dc-runtime — it
  provides no storage API at all.
- **The Trust Meter rendered a number and mis-aligned its zones.** Five equal
  20%-wide blocks were labelled against boundaries at 15/35/55/75, so a needle
  at 36% sat visually in GUARDED while reading NEUTRAL. Zones are now even, and
  the value is never displayed — Deliverable Nine forbids it.
- **No error handling around any model call.** Every call now retries once and
  then falls back to a client-shaped silence.
- **Envelopes were click-only `<div>`s**, the chat log had no live region, and
  the two-column worksheet and envelope grid had no single-column fallback.

Three more surfaced only once the app was driven in a browser:

- **A replay struck the client's reply but left the trainee's own flawed line
  standing**, because the two halves of an exchange were never linked.
- **`window.storage` does not exist in an ordinary browser**, so the default
  backend resolved to nothing and every save silently no-opped outside Claude
  Design. `localStorage` is now probe-verified first.
- **The dial's zone labels collided with the tick ring**, which is why they were
  illegible; they're a scale strip under the dial now.
