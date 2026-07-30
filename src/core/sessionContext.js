/**
 * One condensed brief, assembled once and threaded into every persona prompt.
 *
 * "Reyes and Priya both need to remember the whole session, not just their own
 * chat thread." Passing raw transcript would blow the window by Episode Five,
 * so this is a digest: zone, revealed cards, decisions, the non-negotiable.
 */

import { zoneFor, activeEvents } from './trust.js';
import { cardById } from '../content/cards.js';

const EPISODE_NAMES = {
  0: 'Prologue — Inheriting the Account',
  1: 'One — Something Feels Wrong',
  2: 'Two — The First Client Meeting',
  3: 'Three — Hidden Truths',
  4: 'Four — Pressure & Escalation',
  5: 'Five — Saving the Relationship',
  6: 'The Grand Debrief',
};

/**
 * @returns {{ zone, episode, cardsOpened, decisions, nonNegotiable, brief }}
 */
export function getSessionContext(state) {
  const { trust, trustEvents = [], episode = 0, cardsOpened = [], worksheets = {} } = state;
  const zone = zoneFor(trust);
  const cards = cardsOpened.map(cardById).filter(Boolean);

  const decisions = [];
  if (worksheets.ep3?.choice) {
    decisions.push(
      worksheets.ep3.choice === 'share'
        ? 'In Episode Three they chose to bring the hidden truth to the client as a shared problem.'
        : 'In Episode Three they chose to hold the hidden truth back rather than surface it.',
    );
  }
  if (worksheets.ep4?.decision) {
    decisions.push(
      worksheets.ep4.decision === 'escalate'
        ? 'In Episode Four they escalated to Priya rather than staying quiet.'
        : 'In Episode Four they chose NOT to escalate, betting the environments would land in time.',
    );
  }
  if (worksheets.ep1?.facts) {
    decisions.push('In Episode One they separated fact from story on Reyes’s email before replying.');
  }

  const nonNegotiable = worksheets.ep5?.nonNeg?.trim() || null;

  const pivots = activeEvents({ events: trustEvents })
    .filter((e) => e.reason)
    .slice(-4)
    .map((e) => `${e.delta >= 0 ? 'warmed' : 'cooled'}: ${e.reason}`);

  const lines = [
    `SESSION SO FAR (condensed — this is what the client remembers, not a transcript):`,
    `Current episode: ${EPISODE_NAMES[episode] ?? episode}.`,
    `The client's trust in VEE right now: ${zone.label.toUpperCase()} — ${zone.caption}. React consistently with this.`,
  ];

  if (cards.length) {
    lines.push(
      `The trainee has discovered: ${cards.map((c) => `${c.title} (${c.whatThisChanges.split('.')[0]}.)`).join(' ')}`,
    );
  } else {
    lines.push('The trainee has not yet discovered any of the hidden truths about this account.');
  }

  if (decisions.length) lines.push(`Decisions they have made: ${decisions.join(' ')}`);
  if (pivots.length) lines.push(`Recent moments that moved trust — ${pivots.join('; ')}.`);
  if (nonNegotiable) {
    lines.push(
      `They privately committed to one non-negotiable for the recovery conversation: "${nonNegotiable}". Do not mention it, but apply pressure that tests whether they hold it.`,
    );
  }

  return { zone, episode, cardsOpened: cards, decisions, nonNegotiable, brief: lines.join('\n') };
}
