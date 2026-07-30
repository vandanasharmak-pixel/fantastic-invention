import { useState, useRef, useEffect, useCallback, useMemo } from "react";

import {
  TRUST_START, ZONES, zoneFor,
  createTrustState, applyTrustEvent, supersedeTrustEvent, nextTrustEventId,
  activeEvents, replayPairs,
} from "./src/core/trust.js";
import {
  CHAT_STATES, createChatMachine, submit, replyReceived,
  hold, coachReady, cancelHold, submitReplay, inputEnabled,
} from "./src/core/chatMachine.js";
import {
  createPersistence, validateSave, emptySave, hasResumableProgress, resumeLabel,
} from "./src/core/storage.js";
import { getSessionContext } from "./src/core/sessionContext.js";
import { askClient, askCoach } from "./src/core/api.js";
import { reyesSystem, priyaSystem, coachSystem } from "./src/content/personas.js";
import {
  CARDS, cardById, soloEpisodeThreeDraw, episodeFourDraw, wildcards,
} from "./src/content/cards.js";

/* ============================================================
   THE RELATIONSHIP ROOM — solo practice lab
   Registry room (direction 1a) + Chart Recorder gauge (1b).
   One client, five episodes, a trust log that never drifts.
   ============================================================ */

const persistence = createPersistence();

/* ---------------- Trust Meter — the gauge + the record ---------------- */

/**
 * Deliverable Nine: "no scores, no percentages, no plus-and-minus… a
 * relationship is not at 63%, it is guarded, or warming, or a real partner."
 * The numeric value drives the needle only. It is never rendered.
 */
function TrustMeter({ trust, events, compact }) {
  const zone = zoneFor(trust);
  const angle = -120 + ((trust - 2) / 96) * 240;
  const log = [...activeEvents({ events })].reverse().slice(0, 4);

  const trace = useMemo(() => {
    const pts = [{ t: TRUST_START }, ...activeEvents({ events }).map((e) => ({ t: e.trustAfter }))];
    const step = pts.length > 1 ? 268 / (pts.length - 1) : 0;
    return pts.map((p, i) => `${10 + i * step},${70 - ((p.t - 2) / 96) * 62}`).join(" ");
  }, [events]);

  return (
    <section
      className={`rr-meter ${compact ? "rr-meter-compact" : ""}`}
      aria-label={`Client trust in VEE: ${zone.label}, ${zone.caption}`}
    >
      <h2 className="rr-meter-head">CLIENT TRUST — CLASSIFICATION</h2>

      <div className="rr-dial" role="img" aria-label={`Trust dial reading ${zone.label}`}>
        <div className="rr-dial-bezel" />
        <div className="rr-dial-face" />
        <div className="rr-dial-arcs" />
        <div className="rr-dial-ticks" />
        {ZONES.map((z, i) => (
          <span key={z.id} className={`rr-dial-label rr-dial-label-${i}`}>{z.label}</span>
        ))}
        <div className="rr-needle" style={{ transform: `rotate(${angle}deg)` }} />
        <div className="rr-dial-hub" />
      </div>

      <p className="rr-zone-now">
        <strong>{zone.label}</strong>
        <span>{zone.caption}</span>
      </p>

      {!compact && (
        <>
          <h3 className="rr-meter-head rr-meter-sub">SESSION TRACE</h3>
          <div className="rr-strip">
            <svg viewBox="0 0 288 78" width="100%" height="78" aria-hidden="true">
              <polyline points={trace} fill="none" stroke="#3A4144" strokeWidth="1.6" />
            </svg>
            <span className="rr-strip-tag">PROLOGUE → NOW</span>
          </div>

          <h3 className="rr-meter-head rr-meter-sub">MOVEMENT LOG</h3>
          <ul className="rr-movelog">
            {log.length === 0 && <li className="rr-movelog-empty">opened at NEUTRAL · inherited position</li>}
            {log.map((e) => (
              <li key={e.id}>
                <span className={e.delta >= 0 ? "rr-up" : "rr-down"}>
                  {e.delta >= 0 ? "▲" : "▼"} EP{e.episode}
                </span>{" "}
                {zoneFor(e.trustBefore).label} → {zoneFor(e.trustAfter).label}
                <em>{e.reason}</em>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/* ---------------- Redaction — what you don't know yet ---------------- */

function Redacted({ children, revealed }) {
  return revealed ? (
    <span>{children}</span>
  ) : (
    <span className="rr-redact" aria-label="redacted — not yet known">{children}</span>
  );
}

/* ---------------- Confidential envelope ---------------- */

function Envelope({ card, opened, onOpen }) {
  if (opened) {
    return (
      <article className={`rr-card rr-card-${card.type.accent}`}>
        <header>
          <span className="rr-card-no">CONFIDENTIAL · CARD {card.id}</span>
          <h4>{card.title}</h4>
          <span className="rr-card-type">{card.type.label}</span>
        </header>
        {card.body.map((p, i) => <p key={i}>{p}</p>)}
        <p className="rr-card-changes">
          <strong>WHAT THIS CHANGES</strong> {card.whatThisChanges}
        </p>
      </article>
    );
  }
  return (
    <button type="button" className="rr-envelope" onClick={onOpen}>
      <span className="rr-envelope-seal">CONFIDENTIAL</span>
      <span className="rr-envelope-route">
        {card.episode ? `EP${card.episode} CUE` : "WILDCARD"} · SEALED
      </span>
      <span className="rr-envelope-open">Open envelope</span>
    </button>
  );
}

/* ---------------- The live conversation ---------------- */

function ClientChat({ persona, episode, state, dispatch, minTurns = 2, onDone }) {
  const [machine, setMachine] = useState(createChatMachine);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState(0);
  const endRef = useRef(null);
  const inputRef = useRef(null);

  const busy = machine.state === CHAT_STATES.AWAITING_REPLY || machine.state === CHAT_STATES.HOLDING;
  const replaying = machine.state === CHAT_STATES.REPLAYING;

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); },
    [messages, machine.hold?.coachNote]);

  const systemFor = useCallback(() => {
    const ctx = getSessionContext(state);
    return persona === "reyes" ? reyesSystem(ctx, episode) : priyaSystem(ctx);
  }, [state, persona, episode]);

  async function send(text, isReplay) {
    if (!text.trim() || busy) return;

    const replayOf = isReplay ? machine.hold?.pivotExchange?.trustEventId ?? null : null;
    setMachine((m) => submit(m, { replayOf }));
    setInput("");

    const history = messages
      .filter((m) => !m.superseded)
      .map((m) => `${m.role === "user" ? "Trainee" : "Client"}: ${m.text}`)
      .join("\n");

    const prompt = isReplay
      ? `Conversation so far:\n${history}\n\nThe trainee is REPLAYING the same beat. Ignore their previous attempt entirely and react only to this new one as if it is what they said the first time:\nTrainee: ${text}`
      : `Conversation so far:\n${history}\n\nTrainee: ${text}`;

    const reply = await askClient(persona, systemFor(), prompt);

    const eventId = dispatch({
      type: "trust",
      episode,
      source: persona,
      delta: reply.trust_delta,
      reason: reply.pivot || (reply.degraded ? "connection faltered" : "exchange"),
      replayOf,
      degraded: reply.degraded,
    });

    setMessages((prev) => {
      const next = replayOf
        ? prev.map((m) => (m.trustEventId === replayOf ? { ...m, superseded: true }
          : m.pairedWith === replayOf ? { ...m, superseded: true } : m))
        : [...prev];
      return [
        ...next,
        { role: "user", text, replay: !!replayOf, pairedWith: null },
        {
          role: "client", text: reply.speech, pivot: reply.pivot,
          delta: reply.trust_delta, trustEventId: eventId, degraded: reply.degraded,
        },
      ];
    });

    setTurns((t) => t + 1);
    setMachine((m) => replyReceived(m));
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  async function callHold() {
    const lastClient = [...messages].reverse().find((m) => m.role === "client" && !m.superseded);
    const lastUser = [...messages].reverse().find((m) => m.role === "user" && !m.superseded);
    if (!lastClient || !lastUser) return;

    setMachine((m) => hold(m, {
      trustBefore: state.trustEvents.find((e) => e.id === lastClient.trustEventId)?.trustBefore ?? state.trust,
      pivotExchange: { trustEventId: lastClient.trustEventId, said: lastUser.text },
    }));

    const note = await askCoach(
      coachSystem("replay", getSessionContext(state)),
      `The trainee said: "${lastUser.text}"\nThe client replied: "${lastClient.text}"\nWhat the client registered: ${lastClient.pivot || "no clear pivot"}`,
    );
    setMachine((m) => coachReady(m, note));
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  const canHold = machine.state === CHAT_STATES.IDLE
    && messages.some((m) => m.role === "client" && !m.superseded);

  return (
    <div className="rr-chat">
      <div className="rr-transcript" role="log" aria-live="polite" aria-label="Conversation transcript">
        <p className="rr-transcript-head">TRANSCRIPT — VERBATIM</p>
        <hr className="rr-rule" />

        {messages.map((m, i) => (
          <div
            key={i}
            className={[
              "rr-turn", `rr-turn-${m.role}`,
              m.superseded ? "rr-struck" : "", m.replay ? "rr-take-two" : "",
            ].join(" ")}
          >
            <p className="rr-speaker">
              {m.role === "user" ? "YOU — VEE DELIVERY" : persona === "reyes" ? "REYES, A." : "NADKARNI, P."}
              {m.replay && <span className="rr-tag-retake">RETAKE</span>}
              {m.role === "client" && m.delta !== 0 && !m.superseded && (
                <span className={m.delta > 0 ? "rr-up" : "rr-down"}>
                  {m.delta > 0 ? "▲ TRUST ROSE" : "▼ TRUST FELL"}
                </span>
              )}
            </p>
            <p className="rr-line">{m.text}</p>
            {m.degraded && <p className="rr-degraded">[the line is poor — try that again]</p>}
          </div>
        ))}

        {machine.state === CHAT_STATES.HOLDING && (
          <p className="rr-holding">HOLD CALLED · rewinding the record…</p>
        )}

        {machine.hold?.coachNote && (
          <div className="rr-void">
            <span className="rr-void-stamp" aria-hidden="true">VOID — RETAKE</span>
            <p className="rr-void-head">HOLD CALLED · RECORD REWOUND</p>
            <p className="rr-line">{machine.hold.coachNote}</p>
          </div>
        )}

        {machine.state === CHAT_STATES.AWAITING_REPLY && (
          <p className="rr-waiting" aria-live="polite">the room waits…</p>
        )}
        <div ref={endRef} />
      </div>

      <form
        className="rr-compose"
        onSubmit={(e) => { e.preventDefault(); send(input, replaying); }}
      >
        <label className="rr-sr" htmlFor="rr-reply">
          {replaying ? "Take that moment again" : "What you say next"}
        </label>
        <input
          id="rr-reply"
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={replaying ? "Same moment. Say it differently…" : "Type what you say…"}
          disabled={!inputEnabled(machine)}
          autoComplete="off"
        />
        <button type="submit" disabled={!inputEnabled(machine) || !input.trim()}>
          {replaying ? "RETAKE" : "SEND"}
        </button>
      </form>

      <div className="rr-chat-actions">
        {canHold && (
          <button type="button" className="rr-hold-btn" onClick={callHold}>
            ⟲ Call Hold — replay this moment
          </button>
        )}
        {replaying && (
          <button type="button" className="rr-ghost" onClick={() => setMachine((m) => cancelHold(m))}>
            Cancel the retake
          </button>
        )}
        {turns >= minTurns && machine.state === CHAT_STATES.IDLE && (
          <button type="button" className="rr-continue" onClick={onDone}>
            Move on →
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------------- Episode shell ---------------- */

function EpisodeShell({ num, title, lede, children }) {
  const h = useRef(null);
  useEffect(() => { h.current?.focus(); }, []);
  return (
    <article className="rr-panel">
      <p className="rr-ep-label">EPISODE {num}</p>
      <h1 tabIndex={-1} ref={h}>{title}</h1>
      <p className="rr-lede">{lede}</p>
      {children}
    </article>
  );
}

/* ---------------- Screens ---------------- */

function Intro({ onStart, resume, onResume, onDiscard }) {
  return (
    <article className="rr-panel rr-intro">
      <p className="rr-stamp">VEE CONFIDENTIAL — ACCOUNT LEADERSHIP ONLY</p>
      <h1>You've just inherited Cirrus.</h1>
      <p className="rr-lede">
        Two years old. Eighteen million dollars. And depending on the next few weeks, either the
        reference account that wins VEE its next three enterprise clients — or the loss that gets
        discussed in a board review nobody enjoys.
      </p>
      <p>
        You already know the frameworks. This is what happens to them when a real person is
        disappointed in you, when you don't have the whole picture, and when the relationship
        you're responsible for is quietly starting to slip. Five episodes, one client, and two
        live conversations with the people who hold this relationship in their hands.
      </p>
      <p className="rr-note">
        Nothing here is graded. Being clumsy is completely fine — it's the point. The only way to
        do this badly is to play it safe.
      </p>

      {resume && (
        <div className="rr-resume">
          <p className="rr-resume-head">THE FILE IS STILL OPEN</p>
          <p>You left this account mid-session. Everything is where you left it.</p>
          <div className="rr-resume-actions">
            <button type="button" className="rr-primary" onClick={onResume}>{resumeLabel(resume)}</button>
            <button type="button" className="rr-ghost" onClick={onDiscard}>Start fresh</button>
          </div>
        </div>
      )}

      <button type="button" className="rr-primary" onClick={onStart}>
        Open the account file →
      </button>
    </article>
  );
}

function Dossier({ onContinue }) {
  return (
    <article className="rr-panel">
      <p className="rr-stamp">ACCOUNT FILE — READ FOR THE RELATIONSHIP, NOT ONLY THE FACTS</p>
      <h1>Cirrus Systems, Inc.</h1>
      <dl className="rr-facts">
        <div><dt>Engagement</dt><dd>Programme "Cirrus One" — platform re-architecture · Month 26 of 36</dd></div>
        <div><dt>Status</dt><dd><strong>AMBER</strong> — strong history, present strain, contested future</dd></div>
        <div><dt>Executive sponsor</dt><dd>Priya Nadkarni, VP Platform Engineering — your ally</dd></div>
        <div><dt>The cooling champion</dt><dd>Alan Reyes, VP Engineering &amp; Chief Architect</dd></div>
        <div><dt>Root cause of the slip</dt><dd><Redacted>not yet established</Redacted></dd></div>
      </dl>
      <p>
        Cirrus runs supply-chain and logistics for large customers — when it's down, warehouses feel
        it. The company is IPO-track, and every decision is weighed against that clock. Phase 2, the
        "Atlas" launch, is roughly five weeks behind. VEE's own status reports call it "on track."
        Reyes doesn't believe that anymore.
      </p>

      <blockquote className="rr-email">
        <p className="rr-email-head">Alan Reyes → Priya Nadkarni · cc VEE Delivery · 3 days ago</p>
        <p>
          "I'll be direct because I'd rather say this now than after. I don't have a clear picture of
          where we actually are on the Atlas launch, and that worries me. The last two status updates
          have been reassuring and vague in the same breath. You know my history here. The last time
          things went quiet, I found out we had a problem when our customers found out — during an
          incident, in front of the board. I'm not accusing anyone of anything. I'm telling you that
          'on track' without evidence doesn't settle me anymore. I'd like to sit down with the VEE
          team. Soon."
        </p>
      </blockquote>

      <p className="rr-note">
        He isn't angry. He's scared, and being unusually honest about it. Notice what sits underneath
        the position — that's the whole lab.
      </p>
      <button type="button" className="rr-primary" onClick={onContinue}>
        Something's landed in your inbox →
      </button>
    </article>
  );
}

function EpisodeOne({ state, dispatch, onDone }) {
  const [facts, setFacts] = useState(state.worksheets.ep1?.facts ?? "");
  const [stories, setStories] = useState(state.worksheets.ep1?.stories ?? "");
  const [feedback, setFeedback] = useState(state.worksheets.ep1?.feedback ?? "");
  const [busy, setBusy] = useState(false);
  const done = !!feedback;

  async function submitWork() {
    setBusy(true);
    const note = await askCoach(
      coachSystem("fact_story", getSessionContext(state)),
      `Reyes's email said: "I don't have a clear picture of where we actually are... that worries me... 'on track' without evidence doesn't settle me anymore."\n\nTrainee's FACT column:\n${facts}\n\nTrainee's STORY column:\n${stories}`,
    );
    dispatch({ type: "worksheet", key: "ep1", value: { facts, stories, feedback: note } });
    dispatch({
      type: "trust", episode: 1, source: "narrative", delta: -3,
      reason: "three days of silence since Reyes reached out",
    });
    setFeedback(note);
    setBusy(false);
  }

  return (
    <EpisodeShell
      num="One" title="Something Feels Wrong"
      lede="Before you decide what to reply, decide what's actually true. Take his email apart — what you know, and what you're filling in."
    >
      <div className="rr-two-col">
        <div>
          <label htmlFor="rr-fact">FACT — what you actually know</label>
          <textarea id="rr-fact" rows={6} value={facts} disabled={done}
            onChange={(e) => setFacts(e.target.value)} />
        </div>
        <div>
          <label htmlFor="rr-story">STORY — what you're inferring or assuming</label>
          <textarea id="rr-story" rows={6} value={stories} disabled={done}
            onChange={(e) => setStories(e.target.value)} />
        </div>
      </div>

      {!done ? (
        <button type="button" className="rr-primary" disabled={busy || !facts.trim() || !stories.trim()}
          onClick={submitWork}>
          {busy ? "Thinking…" : "Compare"}
        </button>
      ) : (
        <>
          <div className="rr-coach"><p className="rr-coach-tag">FACILITATOR</p><p>{feedback}</p></div>
          <button type="button" className="rr-continue" onClick={onDone}>
            He's agreed to meet. Let's go →
          </button>
        </>
      )}
    </EpisodeShell>
  );
}

function EpisodeThree({ state, dispatch, onDone }) {
  const draw = useMemo(() => soloEpisodeThreeDraw(state.strand ?? "A"), [state.strand]);
  const [gotWrong, setGotWrong] = useState(state.worksheets.ep3?.gotWrong ?? "");
  const [choice, setChoice] = useState(state.worksheets.ep3?.choice ?? null);
  const [feedback, setFeedback] = useState(state.worksheets.ep3?.feedback ?? "");
  const [busy, setBusy] = useState(false);
  const allOpen = draw.held.every((c) => state.cardsOpened.includes(c.id));
  const done = !!feedback;

  async function decide() {
    setBusy(true);
    const note = await askCoach(
      coachSystem("cards", getSessionContext(state)),
      `What the trainee says they got wrong: ${gotWrong}\nTheir choice: they decided to ${choice} this information with the client.`,
    );
    dispatch({ type: "worksheet", key: "ep3", value: { gotWrong, choice, feedback: note } });
    dispatch({
      type: "trust", episode: 3, source: "narrative",
      delta: choice === "share" ? 5 : -4,
      reason: choice === "share"
        ? "resolved to bring the hard truth forward before being asked"
        : "chose silence again — and he told you exactly what silence does to him",
    });
    setFeedback(note);
    setBusy(false);
  }

  return (
    <EpisodeShell
      num="Three" title="Hidden Truths"
      lede="Open the envelopes. Everything inside is true, and you didn't know any of it thirty minutes ago."
    >
      <div className="rr-envelopes">
        {draw.held.map((c) => (
          <Envelope key={c.id} card={c} opened={state.cardsOpened.includes(c.id)}
            onOpen={() => dispatch({ type: "openCard", id: c.id })} />
        ))}
      </div>

      <p className="rr-unseen">
        {draw.unseen.length} further cards exist in this account. You do not hold them. Somebody
        else always knows something you don't — that is the actual condition of client work.
      </p>

      {allOpen && !done && (
        <>
          <label htmlFor="rr-wrong">
            What did you get wrong — specifically, what did you treat as fact that this just overturned?
          </label>
          <textarea id="rr-wrong" rows={3} value={gotWrong} onChange={(e) => setGotWrong(e.target.value)} />

          <fieldset className="rr-choices">
            <legend>Do you bring this to Reyes as a shared problem, or hold it?</legend>
            <button type="button" aria-pressed={choice === "share"}
              className={choice === "share" ? "rr-choice rr-on" : "rr-choice"}
              onClick={() => setChoice("share")}>
              Share it — name the shared problem
            </button>
            <button type="button" aria-pressed={choice === "hold"}
              className={choice === "hold" ? "rr-choice rr-on" : "rr-choice"}
              onClick={() => setChoice("hold")}>
              Hold it — keep it as leverage for now
            </button>
          </fieldset>

          <button type="button" className="rr-primary" disabled={busy || !gotWrong.trim() || !choice}
            onClick={decide}>
            {busy ? "Thinking…" : "Decide"}
          </button>
        </>
      )}

      {done && (
        <>
          <div className="rr-coach"><p className="rr-coach-tag">FACILITATOR</p><p>{feedback}</p></div>
          <button type="button" className="rr-continue" onClick={onDone}>
            A call from the top is coming →
          </button>
        </>
      )}
    </EpisodeShell>
  );
}

function EpisodeFour({ state, dispatch, onDone }) {
  const deal = useMemo(() => episodeFourDraw(2), []);
  const [decision, setDecision] = useState(state.worksheets.ep4?.decision ?? null);
  const [committed, setCommitted] = useState(!!state.worksheets.ep4?.decision);

  const cards = [...deal.always, ...deal.dealt];

  return (
    <EpisodeShell
      num="Four" title="Pressure & Escalation"
      lede="Three things have just happened at once, the way they always do. The CEO wants a firm date for the board. A competitor has been seen at the CFO's office. And the environments you've been waiting six weeks for still aren't ready — and you still don't control that."
    >
      {!committed ? (
        <>
          <div className="rr-envelopes">
            {cards.map((c) => (
              <Envelope key={c.id} card={c} opened={state.cardsOpened.includes(c.id)}
                onOpen={() => dispatch({ type: "openCard", id: c.id })} />
            ))}
          </div>

          <p className="rr-note">
            No clean answer here. Escalate badly and you embarrass the one ally you have — the delay
            lives inside her own house. Stay quiet and you gamble the launch, and the CEO walks into
            a board review she was never warned about.
          </p>

          <fieldset className="rr-choices">
            <legend>Make the call. No fence-sitting.</legend>
            <button type="button" aria-pressed={decision === "escalate"}
              className={decision === "escalate" ? "rr-choice rr-on" : "rr-choice"}
              onClick={() => setDecision("escalate")}>
              Escalate — take it to Priya now
            </button>
            <button type="button" aria-pressed={decision === "hold"}
              className={decision === "hold" ? "rr-choice rr-on" : "rr-choice"}
              onClick={() => setDecision("hold")}>
              Hold — bet the environments land in time
            </button>
          </fieldset>

          <button type="button" className="rr-primary" disabled={!decision}
            onClick={() => {
              dispatch({ type: "worksheet", key: "ep4", value: { decision } });
              if (decision === "hold") {
                dispatch({
                  type: "trust", episode: 4, source: "narrative", delta: -7,
                  reason: "indecision under a deadline — the silence held, and so did the risk",
                });
              }
              setCommitted(true);
            }}>
            Commit to it
          </button>
        </>
      ) : decision === "escalate" ? (
        <ClientChat persona="priya" episode={4} state={state} dispatch={dispatch}
          minTurns={2} onDone={onDone} />
      ) : (
        <>
          <div className="rr-coach">
            <p className="rr-coach-tag">THE ROOM</p>
            <p>
              You decided not to escalate. The date stands, unbacked by anything you control, and
              Priya will find out in the room rather than from you. That bet is now part of this
              account's history — you'll feel its weight in the next conversation, whichever way
              it lands.
            </p>
          </div>
          <button type="button" className="rr-continue" onClick={onDone}>
            One conversation left to put it right →
          </button>
        </>
      )}
    </EpisodeShell>
  );
}

function EpisodeFive({ state, dispatch, onDone }) {
  const w = state.worksheets.ep5 ?? {};
  const [opening, setOpening] = useState(w.opening ?? "");
  const [own, setOwn] = useState(w.own ?? "");
  const [nonNeg, setNonNeg] = useState(w.nonNeg ?? "");
  const [planned, setPlanned] = useState(!!w.nonNeg);

  return (
    <EpisodeShell
      num="Five" title="Saving the Relationship"
      lede="One conversation. The goal is not to win it, or to be proven right, or to get him to say it's fine. The goal is to leave him trusting you more than when he sat down."
    >
      {!planned ? (
        <>
          <label htmlFor="rr-open">Your opening line — the actual words</label>
          <textarea id="rr-open" rows={2} value={opening} onChange={(e) => setOpening(e.target.value)} />
          <label htmlFor="rr-own">What you'll own, in the first ninety seconds</label>
          <textarea id="rr-own" rows={2} value={own} onChange={(e) => setOwn(e.target.value)} />
          <label htmlFor="rr-nn">
            Your non-negotiable — the one thing you will not do, no matter how the conversation pulls
          </label>
          <textarea id="rr-nn" rows={2} value={nonNeg} onChange={(e) => setNonNeg(e.target.value)} />
          <button type="button" className="rr-primary"
            disabled={!opening.trim() || !own.trim() || !nonNeg.trim()}
            onClick={() => {
              dispatch({ type: "worksheet", key: "ep5", value: { opening, own, nonNeg } });
              setPlanned(true);
            }}>
            Sit down with him
          </button>
        </>
      ) : (
        <>
          <p className="rr-nonneg">
            <span>YOUR NON-NEGOTIABLE</span> {nonNeg}
          </p>
          <ClientChat persona="reyes" episode={5} state={state} dispatch={dispatch}
            minTurns={3} onDone={onDone} />
        </>
      )}
    </EpisodeShell>
  );
}

function Debrief({ state, dispatch }) {
  const [text, setText] = useState(state.debrief ?? "");
  const [busy, setBusy] = useState(!state.debrief);
  const [commitment, setCommitment] = useState(state.commitment ?? "");
  const pairs = replayPairs({ events: state.trustEvents });
  const zone = zoneFor(state.trust);

  useEffect(() => {
    if (state.debrief) return;
    let live = true;
    (async () => {
      const log = state.trustEvents
        .map((e) => `[EP${e.episode}${e.superseded ? " · SUPERSEDED BY A REPLAY" : ""}] ${e.delta >= 0 ? "+" : ""}${e.delta}: ${e.reason}`)
        .join("\n");
      const sheets = Object.entries(state.worksheets)
        .map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join("\n");
      const note = await askCoach(
        coachSystem("debrief", getSessionContext(state)),
        `Trust log (chronological):\n${log}\n\nTheir own written work:\n${sheets}\n\nWhere the account ends: ${zone.label} — ${zone.caption}.`,
      );
      if (!live) return;
      dispatch({ type: "debrief", value: note });
      setText(note); setBusy(false);
    })();
    return () => { live = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <article className="rr-panel">
      <p className="rr-stamp">GRAND DEBRIEF — THE ACCOUNT'S FULL ARC</p>
      <h1>Where Cirrus ends today.</h1>
      <TrustMeter trust={state.trust} events={state.trustEvents} />

      {busy ? (
        <p className="rr-waiting">reconstructing the account…</p>
      ) : (
        <div className="rr-coach rr-debrief"><p>{text}</p></div>
      )}

      {pairs.length > 0 && (
        <section className="rr-retakes">
          <h2>You tried that once, then better.</h2>
          {pairs.map((p, i) => (
            <div key={i} className="rr-retake-pair">
              <p className="rr-struck"><em>First take —</em> {p.original.reason}</p>
              <p><em>Retake —</em> {p.replay.reason}</p>
            </div>
          ))}
        </section>
      )}

      <h2>One commitment. Not ten.</h2>
      <p className="rr-lede">
        When you're next in a difficult conversation with a real client, what's the one thing you'll
        do differently? Make it specific enough that you'll know whether you did it.
      </p>
      <label className="rr-sr" htmlFor="rr-commit">Your commitment</label>
      <textarea id="rr-commit" rows={3} value={commitment}
        placeholder="When I am next in a difficult conversation with a client, I commit to…"
        onChange={(e) => setCommitment(e.target.value)}
        onBlur={() => dispatch({ type: "commitment", value: commitment })} />

      {commitment.trim() && (
        <p className="rr-closing">
          Trust never moved because someone won an argument. It moved in the three seconds after
          something hard was said — when a person decided to be honest instead of smooth. That's the
          whole job. Not the frameworks. The pause.
        </p>
      )}
    </article>
  );
}

/* ---------------- Root ---------------- */

const SCREENS = ["intro", "dossier", "ep1", "ep2", "ep3", "ep4", "ep5", "debrief"];
const EPISODE_OF = { intro: 0, dossier: 0, ep1: 1, ep2: 2, ep3: 3, ep4: 4, ep5: 5, debrief: 6 };

export default function App() {
  const [state, setState] = useState(() => ({
    ...emptySave(), trust: TRUST_START, strand: "A", debrief: null,
  }));
  const [resume, setResume] = useState(null);
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    const loaded = persistence.load();
    if (loaded.status === "ok" && hasResumableProgress(loaded.data)) {
      setResume(loaded.data);
    } else if (loaded.status === "incompatible" || loaded.status === "corrupt") {
      persistence.clear();
    }
    setBooted(true);
  }, []);

  useEffect(() => {
    if (!booted || state.screen === "intro") return;
    persistence.save(state);
  }, [state, booted]);

  useEffect(() => {
    const flush = () => persistence.flush();
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", flush);
    };
  }, []);

  /**
   * Every meaningful state change goes through here.
   *
   * Trust event ids are minted up front rather than read back out of the
   * updater — React runs updaters during render, so anything assigned inside
   * one is still null by the time dispatch returns.
   */
  const dispatch = useCallback((action) => {
    const createdId = action.type === "trust" ? nextTrustEventId() : null;
    setState((s) => {
      switch (action.type) {
        case "trust": {
          let next = { events: s.trustEvents, trust: s.trust };
          if (action.replayOf) next = supersedeTrustEvent(next, action.replayOf);
          next = applyTrustEvent(next, {
            id: createdId,
            episode: action.episode, source: action.source,
            delta: action.delta, reason: action.reason, replayOf: action.replayOf ?? null,
          });
          return { ...s, trustEvents: next.events, trust: next.trust };
        }
        case "worksheet":
          return { ...s, worksheets: { ...s.worksheets, [action.key]: action.value } };
        case "openCard":
          return s.cardsOpened.includes(action.id)
            ? s : { ...s, cardsOpened: [...s.cardsOpened, action.id] };
        case "screen":
          return { ...s, screen: action.value, episode: EPISODE_OF[action.value] ?? s.episode };
        case "commitment":
          return { ...s, commitment: action.value };
        case "debrief":
          return { ...s, debrief: action.value };
        default:
          return s;
      }
    });
    return createdId;
  }, []);

  const go = (screen) => dispatch({ type: "screen", value: screen });

  /**
   * The facilitator's wildcard. "When you need to change the temperature of one
   * table without touching the others." In solo play: if trust has been static
   * across two episodes, complicate it; if it's climbing, reward it.
   */
  const wildcard = useMemo(() => {
    const ep = EPISODE_OF[state.screen] ?? 0;
    if (ep < 3 || ep > 5) return null;
    const recent = activeEvents({ events: state.trustEvents }).filter((e) => e.episode >= ep - 1);
    if (recent.length === 0 || state.cardsOpened.some((id) => id >= 17)) return null;
    const movement = recent.reduce((a, e) => a + Math.abs(e.delta), 0);
    if (movement > 4) {
      return zoneFor(state.trust).id === "WARMING" || zoneFor(state.trust).id === "TRUSTED"
        ? cardById(19) : null;
    }
    return cardById(18);
  }, [state.screen, state.trustEvents, state.cardsOpened, state.trust]);

  if (!booted) return null;

  const showMeter = state.screen !== "intro" && state.screen !== "debrief";

  return (
    <div className="rr-app">
      <style>{CSS}</style>
      <a href="#rr-main" className="rr-skip">Skip to the account</a>

      <header className="rr-header">
        <p className="rr-brand">VEE PRACTICE LAB / CIRRUS ONE</p>
        <p className="rr-onrecord">
          <span className="rr-dot" aria-hidden="true" />
          {state.screen === "intro" ? "FILE SEALED" : "ON RECORD"}
        </p>
      </header>

      <div className={showMeter ? "rr-stage rr-stage-split" : "rr-stage"}>
        <main id="rr-main" tabIndex={-1}>
          {state.screen === "intro" && (
            <Intro
              onStart={() => go("dossier")}
              resume={resume}
              onResume={() => { setState((s) => ({ ...s, ...resume })); setResume(null); }}
              onDiscard={() => { persistence.clear(); setResume(null); }}
            />
          )}
          {state.screen === "dossier" && <Dossier onContinue={() => go("ep1")} />}
          {state.screen === "ep1" && <EpisodeOne state={state} dispatch={dispatch} onDone={() => go("ep2")} />}
          {state.screen === "ep2" && (
            <EpisodeShell num="Two" title="The First Client Meeting"
              lede="He's not angry. He's careful, and he's come to find out whether VEE will be straight with him. You have the opening of this conversation — the part that decides everything.">
              <ClientChat persona="reyes" episode={2} state={state} dispatch={dispatch}
                minTurns={2} onDone={() => go("ep3")} />
            </EpisodeShell>
          )}
          {state.screen === "ep3" && <EpisodeThree state={state} dispatch={dispatch} onDone={() => go("ep4")} />}
          {state.screen === "ep4" && <EpisodeFour state={state} dispatch={dispatch} onDone={() => go("ep5")} />}
          {state.screen === "ep5" && <EpisodeFive state={state} dispatch={dispatch} onDone={() => go("debrief")} />}
          {state.screen === "debrief" && <Debrief state={state} dispatch={dispatch} />}

          {wildcard && !state.cardsOpened.includes(wildcard.id) && (
            <aside className="rr-wildcard">
              <p className="rr-wildcard-tag">THE FACILITATOR PLAYS A CARD</p>
              <Envelope card={wildcard} opened={false}
                onOpen={() => dispatch({ type: "openCard", id: wildcard.id })} />
            </aside>
          )}
        </main>

        {showMeter && (
          <aside className="rr-rail">
            <TrustMeter trust={state.trust} events={state.trustEvents} />
            <div className="rr-needs">
              <p className="rr-meter-head">WHAT HE ACTUALLY NEEDS</p>
              <p>
                Never to be surprised by{" "}
                <Redacted revealed={state.cardsOpened.length > 0}>bad news he learns too late</Redacted>{" "}
                in front of{" "}
                <Redacted revealed={state.cardsOpened.length > 1}>customers or the board</Redacted>{" "}
                again.
              </p>
              <p className="rr-sealed">
                {CARDS.length - state.cardsOpened.length} ITEMS STILL SEALED
              </p>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

/* ---------------- CSS — Registry room, Chart Recorder gauge ---------------- */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,300..700;1,6..72,300..600&family=Archivo:wght@400;500;600;700&family=Courier+Prime:wght@400;700&display=swap');

.rr-app{--ink:#12181D;--slate:#1E262E;--edge:#263039;--paper:#D7D9CF;--paper-hi:#EDEEE7;
  --green:#202722;--ox:#6E2A2E;--ox-lit:#C4736F;--blue:#2F3E6B;--mute:#7C8B98;--rule:#9BA292;
  --ivory:#C7C1B0;--vermilion:#C0453A;--amber:#D9A03C;
  background:var(--ink);color:var(--paper);min-height:100%;
  font-family:Archivo,system-ui,sans-serif;font-size:15px;line-height:1.6}
.rr-app *{box-sizing:border-box}

.rr-skip{position:absolute;left:-9999px;top:0;background:var(--paper);color:var(--ink);padding:10px 16px;z-index:99}
.rr-skip:focus{left:8px;top:8px}
.rr-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.rr-app :focus-visible{outline:2px solid var(--amber);outline-offset:2px}
main:focus{outline:none}

.rr-header{display:flex;align-items:center;gap:16px;height:46px;padding:0 20px;
  background:#0C1116;border-bottom:1px solid var(--edge);position:sticky;top:0;z-index:10}
.rr-brand{font:400 9.5px/1 'Courier Prime',monospace;letter-spacing:.18em;color:var(--mute);margin:0}
.rr-onrecord{margin:0 0 0 auto;display:flex;align-items:center;gap:7px;
  font:400 9.5px/1 'Courier Prime',monospace;letter-spacing:.14em;color:var(--mute)}
.rr-dot{width:6px;height:6px;border-radius:50%;background:var(--ox)}

.rr-stage{max-width:1180px;margin:0 auto;padding:26px 20px 80px}
.rr-stage-split{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:22px;align-items:start}
.rr-rail{position:sticky;top:70px;display:flex;flex-direction:column;gap:16px}

.rr-panel{background:var(--paper);color:var(--green);padding:30px 34px;
  background-image:repeating-linear-gradient(180deg,rgba(32,39,34,.05) 0 1px,transparent 1px 29px);
  box-shadow:0 14px 30px rgba(0,0,0,.4),0 1px 0 var(--paper-hi) inset}
.rr-panel h1{font:600 30px/1.2 Newsreader,serif;margin:10px 0 12px}
.rr-panel h2{font:600 20px/1.25 Newsreader,serif;margin:26px 0 8px}
.rr-panel p{max-width:64ch}
.rr-lede{font:400 17px/1.55 Newsreader,serif;margin-bottom:16px}
.rr-note{display:block;border-left:2px solid var(--ox);padding-left:12px;
  font-size:14px;color:#4A5245;margin:16px 0}

.rr-stamp{display:inline-block;font:700 9px/1.35 'Courier Prime',monospace;letter-spacing:.14em;
  color:var(--ox);border:2px solid var(--ox);padding:5px 9px;transform:rotate(-1.6deg);opacity:.85;margin:0 0 8px}
.rr-ep-label{font:700 9.5px/1 'Courier Prime',monospace;letter-spacing:.2em;color:var(--ox);margin:0}

.rr-facts{margin:16px 0}
.rr-facts>div{display:grid;grid-template-columns:180px 1fr;gap:12px;
  border-top:1px solid var(--rule);padding:8px 0}
.rr-facts dt{font:400 11px/1.4 'Courier Prime',monospace;color:#5A6258}
.rr-facts dd{margin:0}

.rr-email{background:var(--paper-hi);border-left:3px solid var(--ox);padding:14px 16px;margin:18px 0}
.rr-email-head{font:400 10.5px/1 'Courier Prime',monospace;color:#5A6258;margin:0 0 8px}
.rr-email p:last-child{font:400 16px/1.6 Newsreader,serif;font-style:italic;margin:0}

.rr-redact{background:#0A0E12;color:transparent;padding:0 4px;border-radius:1px;user-select:none}

.rr-app label{display:block;font:400 10.5px/1 'Courier Prime',monospace;letter-spacing:.09em;
  text-transform:uppercase;color:#5A6258;margin:16px 0 6px}
.rr-app textarea,.rr-app input[type=text],.rr-app input:not([type]){width:100%;
  border:1px solid var(--rule);background:var(--paper-hi);color:var(--green);
  padding:10px 12px;font:400 15px/1.55 Archivo,sans-serif;resize:vertical;border-radius:0}
.rr-two-col{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin:6px 0}

.rr-primary{background:var(--green);color:var(--paper);border:0;padding:12px 20px;
  font:600 11px/1 Archivo,sans-serif;letter-spacing:.14em;text-transform:uppercase;
  cursor:pointer;margin-top:16px}
.rr-primary:hover:not(:disabled){background:var(--ink)}
.rr-primary:disabled{opacity:.35;cursor:not-allowed}
.rr-continue{background:none;border:1px solid var(--green);color:var(--green);
  padding:10px 18px;font:500 13px/1 Archivo,sans-serif;cursor:pointer;margin-top:16px}
.rr-continue:hover{background:var(--green);color:var(--paper)}
.rr-ghost{background:none;border:0;color:#5A6258;text-decoration:underline;
  cursor:pointer;font-size:13px;padding:8px}

.rr-choices{border:0;padding:0;margin:14px 0;display:flex;gap:10px;flex-wrap:wrap}
.rr-choices legend{font:400 10.5px/1 'Courier Prime',monospace;letter-spacing:.09em;
  text-transform:uppercase;color:#5A6258;margin-bottom:8px}
.rr-choice{flex:1 1 240px;text-align:left;background:var(--paper-hi);border:1px solid var(--rule);
  padding:13px 15px;font:400 14px/1.4 Archivo,sans-serif;color:var(--green);cursor:pointer}
.rr-choice.rr-on{border:2px solid var(--green);background:#C9CCC0;font-weight:600}

.rr-coach{background:var(--paper-hi);border:1px solid var(--rule);border-left:3px solid var(--blue);
  padding:15px 17px;margin:18px 0}
.rr-coach-tag{font:700 9.5px/1 'Courier Prime',monospace;letter-spacing:.16em;color:var(--blue);margin:0 0 7px}
.rr-debrief p{font:400 16.5px/1.7 Newsreader,serif;white-space:pre-wrap}

.rr-envelopes{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:14px;margin:18px 0}
.rr-envelope{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;
  min-height:132px;padding:20px;background:var(--paper-hi);border:1.5px dashed var(--rule);
  cursor:pointer;font-family:'Courier Prime',monospace;color:var(--ox);width:100%}
.rr-envelope:hover{border-color:var(--ox);background:#E3E4DC}
.rr-envelope-seal{font:700 12px/1 'Courier Prime',monospace;letter-spacing:.2em}
.rr-envelope-route{font-size:9.5px;letter-spacing:.14em;color:#5A6258}
.rr-envelope-open{font:500 11px/1 Archivo,sans-serif;letter-spacing:.1em;text-transform:uppercase;
  color:var(--green);border-bottom:1px solid var(--green);padding-bottom:2px;margin-top:4px}

.rr-card{background:var(--paper-hi);border:1px solid var(--rule);border-top:4px solid var(--ox);padding:16px 18px}
.rr-card-navy{border-top-color:var(--blue)}
.rr-card-gold{border-top-color:#8A5F1E}
.rr-card-no{font:700 9px/1 'Courier Prime',monospace;letter-spacing:.16em;color:var(--ox)}
.rr-card h4{font:600 17px/1.25 Newsreader,serif;margin:7px 0 3px}
.rr-card-type{font:400 10px/1 'Courier Prime',monospace;color:#5A6258}
.rr-card p{font-size:14px;margin:10px 0}
.rr-card-changes{border-top:1px solid var(--rule);padding-top:10px;font-size:13.5px;color:var(--green)}
.rr-card-changes strong{display:block;font:700 9px/1 'Courier Prime',monospace;
  letter-spacing:.16em;color:var(--blue);margin-bottom:5px}
.rr-unseen{font:400 13px/1.6 Archivo,sans-serif;color:#5A6258;border-top:1px solid var(--rule);padding-top:12px}

.rr-wildcard{margin-top:22px;background:var(--slate);padding:16px 18px;border:1px solid var(--edge)}
.rr-wildcard-tag{font:700 9px/1 'Courier Prime',monospace;letter-spacing:.18em;color:var(--amber);margin:0 0 12px}

/* ---- transcript ---- */
.rr-chat{margin-top:18px}
.rr-transcript{background:var(--paper-hi);border:1px solid var(--rule);padding:20px 22px;
  max-height:440px;overflow-y:auto}
.rr-transcript-head{font:700 9.5px/1 'Courier Prime',monospace;letter-spacing:.2em;color:#5A6258;margin:0}
.rr-rule{border:0;border-top:2px solid var(--green);width:64px;margin:9px 0 20px}
.rr-turn{margin-bottom:22px}
.rr-turn-user{border-left:2px solid var(--rule);padding-left:16px;margin-left:32px}
.rr-speaker{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;
  font:700 9.5px/1 'Courier Prime',monospace;letter-spacing:.16em;color:var(--green);margin:0 0 5px}
.rr-turn-user .rr-speaker{color:#5A6258}
.rr-line{margin:0;font:400 19px/1.55 Newsreader,serif;color:var(--green);max-width:56ch;text-wrap:pretty}
.rr-turn-user .rr-line{font:400 15px/1.6 Archivo,sans-serif;color:#3E463C;max-width:58ch}
.rr-struck{opacity:.34;filter:saturate(.3)}
.rr-struck .rr-line{text-decoration:line-through;text-decoration-thickness:1px}
.rr-up{color:#4E6B4A;font:700 8.5px/1 'Courier Prime',monospace;letter-spacing:.12em}
.rr-down{color:var(--ox);font:700 8.5px/1 'Courier Prime',monospace;letter-spacing:.12em}
.rr-tag-retake{font:700 8.5px/1 'Courier Prime',monospace;letter-spacing:.12em;color:var(--blue)}
.rr-degraded{font:400 12px/1.5 'Courier Prime',monospace;color:#5A6258;font-style:italic;margin:6px 0 0}

.rr-void{position:relative;border-top:2px solid var(--ox);border-bottom:2px solid var(--ox);
  padding:22px 0 16px;margin:26px 0}
.rr-void-stamp{position:absolute;top:-18px;left:56px;transform:rotate(-6deg);
  border:3px double var(--ox);padding:5px 13px;background:var(--paper-hi);
  font:700 14px/1 'Courier Prime',monospace;letter-spacing:.2em;color:var(--ox)}
.rr-void-head{font:700 9.5px/1.6 'Courier Prime',monospace;letter-spacing:.16em;color:var(--ox);margin:0 0 8px}
.rr-holding,.rr-waiting{font:400 12px/1.6 'Courier Prime',monospace;color:#5A6258;font-style:italic}

.rr-compose{display:flex;gap:10px;margin-top:14px}
.rr-compose input{flex:1;border:1px solid var(--rule);background:var(--paper);padding:13px 14px;
  font:400 15px/1.4 Archivo,sans-serif;color:var(--green)}
.rr-compose input:disabled{opacity:.5}
.rr-compose button{border:0;background:var(--green);color:var(--paper);padding:0 22px;
  font:600 10px/1 Archivo,sans-serif;letter-spacing:.16em;cursor:pointer}
.rr-compose button:disabled{opacity:.35;cursor:not-allowed}
.rr-chat-actions{display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-top:12px}
.rr-hold-btn{border:2px solid var(--ox);background:transparent;color:var(--ox);
  padding:9px 16px;font:700 10px/1 'Courier Prime',monospace;letter-spacing:.14em;cursor:pointer}
.rr-hold-btn:hover{background:var(--ox);color:var(--paper-hi)}
.rr-nonneg{background:var(--paper-hi);border-left:3px solid var(--blue);padding:11px 14px;font-size:14px}
.rr-nonneg span{display:block;font:700 9px/1 'Courier Prime',monospace;
  letter-spacing:.16em;color:var(--blue);margin-bottom:5px}

/* ---- the gauge ---- */
.rr-meter{background:var(--slate);border:1px solid var(--edge);padding:16px 18px}
.rr-meter-head{font:700 9px/1 'Courier Prime',monospace;letter-spacing:.2em;color:#6E7A85;margin:0}
.rr-meter-sub{margin-top:20px;padding-top:14px;border-top:1px solid var(--edge)}
.rr-dial{position:relative;width:100%;aspect-ratio:1;max-width:236px;margin:12px auto 0}
.rr-dial-bezel{position:absolute;inset:0;border-radius:50%;
  background:radial-gradient(circle at 50% 30%,#4A5254,#22282A);box-shadow:0 8px 20px rgba(0,0,0,.5)}
.rr-dial-face{position:absolute;inset:8px;border-radius:50%;background:var(--ink)}
.rr-dial-arcs{position:absolute;inset:13px;border-radius:50%;
  background:conic-gradient(from 240deg,#6B3A38 0 48deg,#8A7647 48deg 96deg,#767C79 96deg 144deg,
    #5E7A6A 144deg 192deg,#7E8F6E 192deg 240deg,transparent 240deg);
  mask:radial-gradient(circle closest-side,transparent 74%,#000 75%,#000 88%,transparent 89%);
  -webkit-mask:radial-gradient(circle closest-side,transparent 74%,#000 75%,#000 88%,transparent 89%)}
.rr-dial-ticks{position:absolute;inset:13px;border-radius:50%;
  background:repeating-conic-gradient(from 240deg,#4A4D46 0 .45deg,transparent .45deg 6deg);
  mask:radial-gradient(circle closest-side,transparent 62%,#000 63%,#000 72%,transparent 73%);
  -webkit-mask:radial-gradient(circle closest-side,transparent 62%,#000 63%,#000 72%,transparent 73%)}
.rr-dial-label{position:absolute;transform:translate(-50%,-50%);
  font:600 8px/1 Archivo,sans-serif;letter-spacing:.14em;color:#6C6656;white-space:nowrap}
.rr-dial-label-0{left:20%;top:56%}
.rr-dial-label-1{left:28%;top:31%}
.rr-dial-label-2{left:50%;top:20%}
.rr-dial-label-3{left:72%;top:31%}
.rr-dial-label-4{left:80%;top:56%}
.rr-needle{position:absolute;left:50%;bottom:50%;width:2px;height:38%;margin-left:-1px;
  transform-origin:50% 100%;background:linear-gradient(180deg,var(--vermilion) 0 72%,#7C2C25 72%);
  transition:transform 1.4s cubic-bezier(.34,1.24,.42,1)}
.rr-dial-hub{position:absolute;left:50%;top:50%;width:20px;height:20px;margin:-10px 0 0 -10px;
  border-radius:50%;background:radial-gradient(circle at 38% 34%,#5C6365,#242A2C);
  box-shadow:0 1px 2px rgba(0,0,0,.6)}
.rr-zone-now{text-align:center;margin:10px 0 0}
.rr-zone-now strong{display:block;font:600 22px/1.1 Archivo,sans-serif;letter-spacing:.12em;
  text-transform:uppercase;color:var(--ivory)}
.rr-zone-now span{font:400 11px/1.6 'Courier Prime',monospace;color:#6E7A85}

.rr-strip{position:relative;background:var(--ivory);margin-top:10px;
  box-shadow:0 3px 8px rgba(0,0,0,.45);
  background-image:repeating-linear-gradient(90deg,rgba(90,86,72,.2) 0 1px,transparent 1px 24px),
    repeating-linear-gradient(180deg,rgba(90,86,72,.2) 0 1px,transparent 1px 15.5px)}
.rr-strip-tag{position:absolute;left:8px;top:6px;
  font:400 8px/1 'Courier Prime',monospace;letter-spacing:.1em;color:#6C6656}

.rr-movelog{list-style:none;margin:10px 0 0;padding:0;display:flex;flex-direction:column;gap:9px}
.rr-movelog li{font:400 10px/1.45 'Courier Prime',monospace;color:#8B97A2}
.rr-movelog em{display:block;color:#5C6873;font-style:normal}
.rr-movelog-empty{color:#5C6873}

.rr-needs{background:var(--slate);border:1px solid var(--edge);padding:16px 18px}
.rr-needs p{font:400 14px/1.65 Newsreader,serif;color:#B9C3CB;margin:9px 0 0;max-width:none}
.rr-sealed{font:400 9px/1.5 'Courier Prime',monospace!important;letter-spacing:.1em;color:#5C6873!important}

.rr-resume{background:var(--paper-hi);border:2px solid var(--blue);padding:16px 18px;margin:22px 0}
.rr-resume-head{font:700 9.5px/1 'Courier Prime',monospace;letter-spacing:.16em;color:var(--blue);margin:0 0 8px}
.rr-resume-actions{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.rr-resume-actions .rr-primary{margin-top:8px}

.rr-retakes{margin-top:26px;border-top:1px solid var(--rule);padding-top:8px}
.rr-retake-pair{border-left:2px solid var(--blue);padding-left:14px;margin:14px 0}
.rr-retake-pair p{margin:4px 0;font-size:14px}
.rr-closing{margin-top:22px;font:400 17px/1.65 Newsreader,serif;border-top:2px solid var(--green);padding-top:16px}

@media (max-width:900px){
  .rr-stage-split{grid-template-columns:minmax(0,1fr)}
  .rr-rail{position:static;order:-1}
  .rr-dial{max-width:190px}
  .rr-two-col{grid-template-columns:1fr}
  .rr-envelopes{grid-template-columns:1fr}
  .rr-panel{padding:22px 18px}
  .rr-panel h1{font-size:25px}
  .rr-turn-user{margin-left:0}
  .rr-line{font-size:17px}
  .rr-void-stamp{left:12px}
}

@media (prefers-reduced-motion:reduce){
  .rr-app *,.rr-needle{transition:none!important;animation:none!important}
  html{scroll-behavior:auto}
}
`;
