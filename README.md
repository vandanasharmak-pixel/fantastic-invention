# The Relationship Room — solo edition

A solo, AI-powered version of the VEE Technologies Practice Lab: a five-episode
simulation in protecting a strategic client relationship (the Cirrus Systems
account).

The facilitator guide in `docs/facilitator-guide.md` is the source of truth for
character behaviour, the confidential cards, and the episode structure.

## Status

The state layer is built and tested. The UI is **not yet integrated** — see
_Pending_ below.

```
src/core/trust.js         Trust Meter reducer — append-only event log
src/core/chatMachine.js   Hold/Replay state machine (idle|awaitingReply|holding|replaying)
src/core/parse.js         Three-pass defensive parsing of persona replies
src/core/storage.js       Versioned persistence + resume affordance
src/content/cards.js      All 20 confidential cards, with the guide's routing
test/core.test.js         24 tests
scripts/trace-trust.js    Hand-traceable trust ledger
```

```sh
npm test       # 24 tests
npm run trace  # walk an Episode Two hold/replay by hand
```

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
Lab land far harder than twenty small ones."_ Most exchanges should score a
delta of 0; the persona prompt has to enforce this.

**Superseded events are kept, not deleted.** A replayed mistake stays in the
log with `superseded: true` and contributes nothing to the total, because the
Grand Debrief reconstructs the whole journey — _"we lost it right there, and
spent the rest of the day earning it back"_ is the closing beat.

**Card 19 is earned.** _"It only arrives if the team has been genuinely
straight with him"_ — gated on trust reaching WARMING.

## Pending

Integration with the existing prototype (`Relationship Room - Directions.dc.html`
and `support.js`) from the Claude Design project. The blocking unknown is the
signature of `support.js`'s `callClaude` and `window.storage` — `storage.js`
takes an injectable backend so it can adapt, but the retry/fallback wrapper
around `callClaude` needs the real signature before it can be written.
