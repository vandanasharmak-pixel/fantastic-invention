/**
 * The Confidential Envelopes — Deliverable Four, in full.
 *
 * All twenty cards. The prototype shipped a curated four for Episode Three;
 * the guide's routing is the authority and is reproduced exactly:
 *
 *   Cards 1–10  Episode Three reveals, routed unequally across tables A/B/C
 *   Cards 11–16 Episode Four pressure cards
 *   Cards 17–20 Wildcards, held in reserve at the facilitator's discretion
 *
 * "The inequality is the point: it recreates the actual epistemic condition of
 * client work, where you are always partly blind."
 *
 * In solo play there is only one table, so `table` becomes the *strand* a card
 * belongs to. See `soloEpisodeThreeDraw()` for how the unequal-information
 * effect is preserved for a single player.
 */

export const CARD_TYPES = {
  MISSED_DEPENDENCY: { id: 'missed-dependency', label: 'Missed dependency', accent: 'crimson' },
  BURIED_EMAIL: { id: 'buried-email', label: 'Previous email nobody noticed', accent: 'crimson' },
  FALSE_ASSUMPTION: { id: 'false-assumption', label: 'False assumption', accent: 'crimson' },
  POLITICS: { id: 'politics', label: 'Internal politics / senior stakeholder', accent: 'navy' },
  RELATIONSHIP: { id: 'relationship', label: 'Relationship issue', accent: 'navy' },
  POSITIVE: { id: 'positive', label: 'Positive information', accent: 'gold' },
  BUDGET: { id: 'budget', label: 'Budget pressure', accent: 'crimson' },
  VENDOR: { id: 'vendor', label: 'Another vendor issue', accent: 'navy' },
  INCORRECT_ASSUMPTION: { id: 'incorrect-assumption', label: 'Incorrect assumption', accent: 'crimson' },
  CEO_PRESSURE: { id: 'ceo-pressure', label: 'CEO pressure', accent: 'navy' },
  ESCALATION_TRIGGER: { id: 'escalation-trigger', label: 'Escalation trigger', accent: 'crimson' },
  COMMERCIAL: { id: 'commercial', label: 'Commercial risk', accent: 'crimson' },
  LEGAL: { id: 'legal', label: 'Legal / compliance concern', accent: 'crimson' },
  HIDDEN_PRESSURE: { id: 'hidden-pressure', label: 'Hidden client pressure', accent: 'navy' },
  OPPORTUNITY: { id: 'opportunity', label: 'Unexpected opportunity', accent: 'gold' },
  SIGNAL: { id: 'signal', label: 'Relationship signal', accent: 'gold' },
};

const T = CARD_TYPES;

export const CARDS = [
  {
    id: 1,
    title: 'The Real Reason',
    type: T.MISSED_DEPENDENCY,
    table: 'A',
    episode: 3,
    body: [
      'You dig into the delay and find the truth the status reports have been dancing around. Phase 2 is not behind because the re-architecture is hard. It is behind because the staging and pre-production environments have never been stood up by Cirrus’s own SRE team. VEE’s work is largely built and has nowhere validated to run at scale.',
      'This has been true for weeks. The account narrative — "re-architecture complexity" — is a comfortable fiction that lets everyone avoid an awkward conversation about a Cirrus-side dependency.',
    ],
    whatThisChanges:
      'The delay is not your delivery failure. But being right about that protects no one. The move is to name the shared problem honestly and offer to help fix a dependency you do not own.',
    overturns: 'the-delay-is-our-integration-problem',
  },
  {
    id: 2,
    title: 'The Email That Died',
    type: T.BURIED_EMAIL,
    table: 'A',
    episode: 3,
    body: [
      'Buried in the account inbox is a message from Anika Sharma to Raymond Osei, sent six weeks ago (it is in your dossier — go and read it now). In it, Anika flagged the environment risk clearly and early, warned that the Atlas launch date was at risk, and asked for a meeting to fix it.',
      'Osei replied "I’ll do my best." Anika rolled off two weeks later. The thread died in her rushed handover. Nobody escalated it. Nobody closed it. The warning was there all along.',
    ],
    whatThisChanges:
      'VEE saw this coming and let it slide. That is uncomfortable — and it is also leverage for honesty: "We flagged this six weeks ago and dropped the ball on following it through. Here is how we fix it now."',
    overturns: 'nobody-saw-this-coming',
  },
  {
    id: 3,
    title: 'The Date Nobody Rebaselined',
    type: T.FALSE_ASSUMPTION,
    table: 'A',
    episode: 3,
    body: [
      'Everyone — including your own last two status reports — has been calling the Atlas launch "on track." You check the actual plan against the actual environment delay and realise: the date has never been re-baselined. The plan and reality quietly diverged weeks ago. "On track" is a habit, not a fact.',
      'If nothing changes, the launch will slip past the date the CEO has promised the board.',
    ],
    whatThisChanges:
      'The green status is fiction. You now know something Reyes suspects and the CEO doesn’t. Whether you surface it — before it surfaces itself — is the whole test.',
    overturns: 'the-launch-is-on-track',
  },
  {
    id: 4,
    title: 'The Sponsor’s Secret',
    type: T.POLITICS,
    table: 'B',
    episode: 3,
    body: [
      'In a quiet aside, Priya lets something slip that she has told almost no one: a reorganisation is being discussed that could move Programme Cirrus One out from under her and to a new Chief Operating Officer. She is not certain. She is worried. And she asked you, half-joking, "would you still have my back if I weren’t your sponsor?"',
      'If the reorg happens, VEE’s carefully built sponsor relationship partly resets — and the new owner may be far less friendly.',
    ],
    whatThisChanges:
      'Your most reliable ally may be losing her seat. It changes who you invest in, how you protect Priya now, and how much you should be building relationships beyond her before you have to.',
    overturns: 'priya-is-our-stable-sponsor',
  },
  {
    id: 5,
    title: 'Why Reyes Flinches',
    type: T.RELATIONSHIP,
    table: 'B',
    episode: 3,
    body: [
      'You learn why Alan Reyes is so allergic to confident promises about analytics and AI. Before VEE, Cirrus hired a vendor who sold an "AI-powered automated migration" — dazzling demo, real money, and it never worked in production, costing the company most of a year. Reyes championed it internally and was left exposed when it failed. He carries that scar into every VEE conversation about Phase 3.',
      'His caution isn’t obstruction. It’s an engineer who has been burned by exactly the kind of promise VEE is tempted to make.',
    ],
    whatThisChanges:
      'Every reassurance you give Reyes lands on an old wound. The move is evidence over enthusiasm, and honesty about limits — the opposite of the vendor who hurt him.',
    overturns: 'reyes-is-just-difficult',
  },
  {
    id: 6,
    title: 'The Praise You Never Claimed',
    type: T.POSITIVE,
    table: 'B',
    episode: 3,
    body: [
      'Good news, for once. Six weeks ago, Cirrus’s Chief Product Officer cited Phase 1 as a modernisation success in a board deck — named it as evidence that the platform is scaling for the IPO. VEE never knew. Nobody picked it up, thanked the CPO, or built on it.',
      'It is a live, unclaimed asset: a senior Cirrus voice already advocating for VEE’s work, at exactly the level where Phase 3 will be decided.',
    ],
    whatThisChanges:
      'You have an advocate you didn’t know about, at board level, right when a competitor is circling Phase 3. The question is whether you notice good news as readily as bad — and whether you act on it.',
    overturns: 'we-have-no-support-above-priya',
  },
  {
    id: 7,
    title: 'The Freeze Upstairs',
    type: T.BUDGET,
    table: 'C',
    episode: 3,
    body: [
      'You find out why Osei’s environments are late, and it has nothing to do with him being slow. Cirrus is in a company-wide hiring freeze, driven by the CFO’s push to show discipline ahead of the IPO. Osei has lost two engineers to the pause with no backfill approved and cannot stand up what he cannot staff.',
      'The delay VEE has been quietly absorbing blame for is a symptom of Marcus Webb’s own cost pressure — a fact nobody has connected out loud.',
    ],
    whatThisChanges:
      'The delay traces back to the CFO’s own decisions. Handled clumsily, that’s an accusation. Handled well, it’s a way to help Webb see the cost of his own freeze — without ever saying so.',
    overturns: 'osei-is-slow',
  },
  {
    id: 8,
    title: 'A Competitor in the Building',
    type: T.VENDOR,
    table: 'C',
    episode: 3,
    body: [
      'Word reaches you that Aperture Analytics has been in to see the CFO’s office about Phase 3, positioning itself as faster and cheaper than VEE on the AI layer. It is not a formal procurement yet. But they are in the building, and they are talking about the six-million-dollar prize VEE has been assuming is its own.',
      'Every stumble VEE makes in Phase 2 is now being quietly scored by people who are also listening to Aperture.',
    ],
    whatThisChanges:
      'Phase 3 is no longer safe. It sharpens everything: the strategic cost of the Phase 2 strain, and the value of that unclaimed board-level advocate.',
    overturns: 'phase-3-is-ours',
  },
  {
    id: 9,
    title: 'The Engineer Who Decides',
    type: T.POSITIVE,
    table: 'C',
    episode: 3,
    body: [
      'You finally get a real read on Susan Okafor, Director of Engineering Enablement — the informal leader who decides whether the internal teams actually adopt the new platform or route around it. Privately, she is impressed by what VEE has built. Publicly, she stays cautious, because a group of her engineers were burned by a workflow change in Phase 1 and she will not expose them again without being sure.',
      'She is winnable. She has simply never been properly engaged by VEE — the enablement action has sat unassigned for three weeks.',
    ],
    whatThisChanges:
      'Adoption is not the lost cause the "green, assumed on track" rating pretends. It is an unworked opportunity sitting in plain sight — if someone invests in Susan now.',
    overturns: 'okafor-is-a-blocker',
  },
  {
    id: 10,
    title: 'The Teams Aren’t Ready',
    type: T.INCORRECT_ASSUMPTION,
    table: 'C',
    episode: 3,
    body: [
      'The flip side of the good news. While Susan is winnable, the honest state of engineering-team readiness is not the green it’s rated. The internal teams have had almost no preparation for the cutover. If the platform cuts over to unprepared teams, the outcome is exactly the Phase 1 workflow backlash again — but bigger, at launch, with a marquee customer watching and the board in the room.',
      'The green rating on R-04 is comfortable and wrong.',
    ],
    whatThisChanges:
      'A risk everyone is calling green is actually amber-to-red. Surfacing an uncomfortable truth about your own optimistic rating — before it detonates at launch — is the harder, better move.',
    overturns: 'adoption-is-green',
  },
  {
    id: 11,
    title: 'The CEO Wants a Number',
    type: T.CEO_PRESSURE,
    table: 'ALL',
    episode: 4,
    body: [
      'It arrives through Priya, and it is not a request. Dana Coetzee wants a firm, in-writing commitment to the Atlas launch date — because she has told the board she will showcase it at the Q3 review, eight weeks out, as proof the platform is IPO-ready. The CEO who barely knows VEE exists now has VEE’s date attached to her own credibility.',
      'Priya is passing on the pressure with an apology in her eyes. She needs something she can give Dana. She is asking you what to say.',
    ],
    whatThisChanges:
      'The easy move is to give the number and make the pressure go away — the reassurance failure from Episode Two, now at board level. The hard move is to give the CEO honesty she can act on instead of comfort she’ll remember.',
    overturns: null,
  },
  {
    id: 12,
    title: 'Aperture’s Board Friend',
    type: T.VENDOR,
    table: 'ONE',
    episode: 4,
    body: [
      'The competitor threat has a name and a door. Aperture has a relationship with a member of Cirrus’s board — the reason they got the meeting with the CFO’s office so easily. If Phase 2 stumbles publicly at the board review, there is a friendly voice already in the room ready to suggest an alternative for Phase 3.',
      'This isn’t paranoia. It’s the political reality behind the launch date.',
    ],
    whatThisChanges:
      'The board review is no longer just a milestone; it is a contest. It raises the cost of every Phase 2 stumble and the value of protecting the CEO from a public surprise.',
    overturns: null,
  },
  {
    id: 13,
    title: 'The Environments Won’t Land',
    type: T.ESCALATION_TRIGGER,
    table: 'ONE',
    episode: 4,
    body: [
      'Osei tells you privately what he won’t put in a ticket: the environments will not be ready in time for the current launch date. The freeze is not lifting. He is quietly asking you not to make a noise about it, because it makes his team look bad.',
      'You now hold the single fact that determines whether the launch is real — and the person who told you is begging you to keep it quiet.',
    ],
    whatThisChanges:
      'This is the escalation crucible. Staying quiet protects Osei and lets the CEO walk into a board surprise. Escalating protects the date and the CEO — but exposes a Cirrus team, inside your sponsor’s house. There is no clean move, only a well-made one.',
    overturns: null,
  },
  {
    id: 14,
    title: 'The Money Question',
    type: T.COMMERCIAL,
    table: 'ONE',
    episode: 4,
    body: [
      'CR-114 — the $1.2M change request — is still sitting on Marcus Webb’s desk, and now you learn why he won’t sign. The programme is over budget in aggregate (much of it nothing to do with VEE), and Webb has decided that no new spend gets approved without a value story he can defend to the board and the investors.',
      'The request was submitted as a cost. Webb needs it to be a value. Nobody has re-framed it for him.',
    ],
    whatThisChanges:
      'The blocker isn’t the money; it’s the framing. Webb doesn’t need a cheaper number — he needs a defensible one. The move is to give the CFO the value story he can carry, not to discount your way to a yes.',
    overturns: null,
  },
  {
    id: 15,
    // Routing sheet calls this "The Security Landmine"; the morning checklist
    // calls it "The Legal Landmine". The card face is authoritative.
    title: 'The Security Landmine',
    type: T.LEGAL,
    table: 'ONE',
    episode: 4,
    body: [
      'A new signal from Cirrus Security: the Phase 3 AI features — the models that score supply-chain and demand risk on customer data — have triggered a security and data-privacy review. It is early, but it pulls in SOC 2 scope, customer data-processing assessments, and emerging model-governance questions, and it could add months to Phase 3.',
      'It sits under the strategic prize like a landmine nobody has stepped on yet.',
    ],
    whatThisChanges:
      'The Phase 3 you’re fighting Aperture for has a compliance risk attached. Raising it early looks like caution and builds trust with Reyes; hiding it to protect the sale recreates the exact vendor behaviour that burned him.',
    overturns: null,
  },
  {
    id: 16,
    title: 'Priya Is Exposed',
    type: T.HIDDEN_PRESSURE,
    table: 'ONE',
    episode: 4,
    body: [
      'The pressure on the CEO flows downhill and lands on Priya. Because the delay sits inside her own house (Osei reports to her), Priya is the one who looks bad if the launch slips — and she is the one Webb will question about the overspend. She is carrying the risk of a problem she can’t fully control, quietly, alone.',
      'She hasn’t asked for help. But she is one bad week away from being the person blamed for all of it.',
    ],
    whatThisChanges:
      'Your ally is more exposed than she’s letting on. How you escalate now either shields her or sacrifices her. Protecting Priya means giving her the truth early enough to protect herself — not sparing her the truth.',
    overturns: null,
  },

  // ---- Wildcards 17–20 ----------------------------------------------------
  // "Play them to reward a table that is doing well (a positive card), to
  //  complicate a table that is coasting (a risk card), or to rescue a
  //  stalling debrief with a fresh piece of intel."
  {
    id: 17,
    title: 'The Quiet Ally',
    type: T.OPPORTUNITY,
    table: 'WILDCARD',
    episode: null,
    wildcardMode: 'reward',
    body: [
      'Tom Bianchi, the PMO lead everyone underrates, pulls you aside. He is tired of watching the environment issue get "deferred" week after week in his own minutes. He offers to put it formally on the RAID register with a named owner and a date — giving VEE the paper trail and the escalation lever it has been missing — if VEE will back him.',
      'The bureaucrat you might have dismissed is offering to be your most useful ally.',
    ],
    whatThisChanges:
      'The person who runs the process can create the escalation path for you — cleanly, on the record, without VEE having to point fingers. Ally-building where you least expected it.',
    overturns: null,
  },
  {
    id: 18,
    title: 'The Rumour',
    type: T.FALSE_ASSUMPTION,
    table: 'WILDCARD',
    episode: null,
    wildcardMode: 'complicate',
    body: [
      'Someone on the team heard "from a reliable source" that Cirrus is unhappy with VEE and already talking to Aperture about replacing them on Phase 2. It spreads fast and it changes the mood at the table — suddenly everyone is defensive and deal-protective.',
      'It is not true. Aperture is circling Phase 3, not Phase 2, and Cirrus is not replacing anyone. But the rumour feels true, and the team is about to act on it.',
    ],
    whatThisChanges:
      'A powerful test of fact-versus-story at the worst moment. Will the team verify the rumour or act on the fear? Acting on unverified bad news is how good teams damage relationships that were never actually in danger.',
    overturns: null,
  },
  {
    id: 19,
    // Routing sheet: "A Message From Reyes"; checklist: "A Text From Reyes".
    title: 'A Message From Reyes',
    type: T.SIGNAL,
    table: 'WILDCARD',
    episode: null,
    wildcardMode: 'reward',
    // "it only arrives if the team has been genuinely straight with him"
    requiresTrustAtLeast: 'WARMING',
    body: [
      'A short, unexpected message from Alan Reyes lands on the account lead’s phone: "Appreciated your straight answer earlier. Means more than you know. Let’s keep it that way."',
      'It is small, and it is enormous. It is the clearest signal in the whole Lab of what actually rebuilds trust with this man — and it only arrives if the team has been genuinely straight with him.',
    ],
    whatThisChanges:
      'Proof, in his own words, that candour is the currency here. Play this to a table that has earned it — it tells the room, better than you can, exactly which behaviour worked.',
    overturns: null,
  },
  {
    id: 20,
    title: 'The Board Slide',
    type: T.POSITIVE,
    table: 'WILDCARD',
    episode: null,
    wildcardMode: 'reenergise',
    body: [
      'You get your hands on the actual CPO board slide that praised Phase 1. It names VEE’s zero-downtime first lift as "the clearest evidence to date that Cirrus One is delivering." In a board deck. Eight weeks before the review where Phase 3 hangs in the balance.',
      'It is the single strongest piece of positive leverage in the account — and it has been sitting unused because nobody was looking for good news.',
    ],
    whatThisChanges:
      'When you need to remind a discouraged table that this account is winnable — or to make the point that teams hunt for risks but ignore assets — this card does it in one line.',
    overturns: null,
  },
];

export const cardById = (id) => CARDS.find((c) => c.id === id) ?? null;
export const cardsForEpisode = (n) => CARDS.filter((c) => c.episode === n);
export const wildcards = () => CARDS.filter((c) => c.table === 'WILDCARD');

/**
 * Solo adaptation of the unequal draw.
 *
 * A single player cannot literally hold less than the room, so the inequality
 * is preserved in time rather than across tables: the player opens one strand
 * in full and only glimpses the others, and the Grand Debrief reveals what the
 * other two strands held — reproducing "the colleague at the next table is
 * holding a piece of the picture you'd give anything to see."
 */
export const STRANDS = ['A', 'B', 'C'];

/** Which strand this session inherits. Rotating it makes a replay a new Lab. */
export const strandForSeed = (seed = 0) => STRANDS[Math.abs(seed) % STRANDS.length];

export function soloEpisodeThreeDraw(strand = 'A') {
  const held = cardsForEpisode(3).filter((c) => c.table === strand);
  const unseen = cardsForEpisode(3).filter((c) => c.table !== strand);
  return { strand, held, unseen };
}

/**
 * Episode Four deal. Card 11 always lands; the rest raise the escalation
 * stakes. In solo play deal two so the crucible has real horns — rotated by
 * seed, because a fixed slice would leave cards 14-16 permanently unplayed.
 */
export function episodeFourDraw(count = 2, seed = 0) {
  const always = CARDS.filter((c) => c.episode === 4 && c.table === 'ALL');
  const pool = CARDS.filter((c) => c.episode === 4 && c.table === 'ONE');
  const start = Math.abs(seed) % pool.length;
  const dealt = Array.from({ length: Math.min(count, pool.length) },
    (_, i) => pool[(start + i) % pool.length]);
  return { always, dealt, pool };
}

/**
 * The Grand Debrief's pooling moment.
 *
 * "The discomfort a table feels when it learns another table knew something
 * crucial… is why the Grand Debrief, where the tables finally pool what they
 * knew, lands with the force of a revelation rather than a summary."
 *
 * Solo play has no other tables, so the close is where every card the session
 * never dealt is finally laid out.
 */
export function unseenAtClose(cardsOpened = []) {
  const seen = new Set(cardsOpened);
  return CARDS.filter((c) => !seen.has(c.id));
}

const ZONE_ORDER = ['BROKEN', 'GUARDED', 'NEUTRAL', 'WARMING', 'TRUSTED'];

/**
 * The facilitator's wildcard, played as Deliverable Four describes it: "to
 * reward a table that is doing well (a positive card), to complicate a table
 * that is coasting (a risk card)".
 *
 * Solo adaptation: a table that is coasting shows up as a Trust Meter that has
 * barely moved across two episodes. Note that *no movement at all* is the
 * strongest coasting signal, not a reason to sit on your hands.
 *
 * @param {{episode:number, zoneId:string, trustEvents:Array, cardsOpened:number[]}} s
 * @returns {object|null} the card to play, or null to hold
 */
export function selectWildcard({ episode, zoneId, trustEvents = [], cardsOpened = [] }) {
  // The wildcards belong to the back half, and only one is ever played.
  if (episode < 3 || episode > 5) return null;
  if (cardsOpened.some((id) => id >= 17)) return null;

  const recent = trustEvents.filter((e) => !e.superseded && e.episode >= episode - 1);
  const movement = recent.reduce((total, e) => total + Math.abs(e.delta), 0);

  // Coasting — the needle has barely moved in two episodes. Complicate it.
  if (movement <= 4) return cardById(18);

  // Earned — a lot has moved and it moved the right way. Reward it.
  const reward = cardById(19);
  const floor = ZONE_ORDER.indexOf(reward.requiresTrustAtLeast);
  if (ZONE_ORDER.indexOf(zoneId) >= floor) return reward;

  // Working hard and losing anyway. Do not pile on.
  return null;
}
