/**
 * Print a trust log as a hand-traceable ledger.
 *
 * "A Hold/Replay should be provably correct if you trace the trust log by
 * hand." This is that trace. Run `npm run trace` to walk a worked Episode Two
 * hold/replay and check the arithmetic yourself.
 */

import {
  createTrustState, applyTrustEvent, supersedeTrustEvent,
  activeEvents, replayPairs, zoneFor, TRUST_START,
} from '../src/core/trust.js';

const pad = (s, n) => String(s).padEnd(n).slice(0, n);

export function renderLedger(state) {
  const lines = [];
  lines.push(`  start                                                    ${String(TRUST_START).padStart(3)}  ${zoneFor(TRUST_START).label}`);
  lines.push('  ' + '─'.repeat(76));
  for (const e of state.events) {
    const mark = e.superseded ? '⊘' : ' ';
    const delta = e.superseded ? '  —' : `${e.delta >= 0 ? '+' : ''}${e.delta}`.padStart(3);
    const after = e.superseded ? '  ·' : String(e.trustAfter).padStart(3);
    const zone = e.superseded ? '(superseded)' : zoneFor(e.trustAfter).label;
    lines.push(`${mark} EP${e.episode} ${pad(e.source, 9)} ${pad(e.reason, 40)} ${delta}  ${after}  ${zone}`);
  }
  lines.push('  ' + '─'.repeat(76));
  lines.push(`  TOTAL (active events only: ${activeEvents(state).length}/${state.events.length})              ${String(state.trust).padStart(3)}  ${zoneFor(state.trust).label}`);
  return lines.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let s = createTrustState();

  s = applyTrustEvent(s, {
    episode: 1, source: 'narrative', delta: -3,
    reason: 'three days of silence since Reyes wrote',
  });

  s = applyTrustEvent(s, {
    episode: 2, source: 'reyes', delta: -9,
    reason: '"we\'re confident we\'ll hit the date"',
  });
  const flawed = s.events.at(-1);

  console.log('\nBEFORE HOLD — the reassurance spiral\n');
  console.log(renderLedger(s));

  // HOLD called here. The log is not touched. `trustBefore` is the trust as it
  // stood *before* the flawed exchange — that is the baseline the replay lands
  // on once the flawed exchange is superseded out of the total.
  const trustBefore = flawed.trustBefore;

  s = supersedeTrustEvent(s, flawed.id);
  s = applyTrustEvent(s, {
    episode: 2, source: 'reyes', delta: 5,
    reason: '"we\'ve gone quiet, and that\'s on us"',
    replayOf: flawed.id,
  });

  console.log('\n\nAFTER REPLAY — the same beat, done better\n');
  console.log(renderLedger(s));

  const [pair] = replayPairs(s);
  console.log(`\n  Hold captured trustBefore = ${trustBefore}`);
  console.log(`  Replay delta             = ${pair.replay.delta >= 0 ? '+' : ''}${pair.replay.delta}`);
  console.log(`  Expected total           = ${trustBefore + pair.replay.delta}`);
  console.log(`  Actual total             = ${s.trust}  ${s.trust === trustBefore + pair.replay.delta ? '✓' : '✗'}`);
  console.log(`\n  Debrief still holds both halves: "${pair.original.reason}" → "${pair.replay.reason}"\n`);
}
