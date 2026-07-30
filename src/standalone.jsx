/**
 * Entry point for the downloadable single-file build.
 *
 * A copy opened from disk has no proxy in front of the Messages API, so the
 * first thing it must do is establish how it is going to talk to a client:
 * with the person's own API key, or not at all.
 */

import { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import App from '../relationshiproom.jsx';
import { configureApi } from './core/api.js';

const KEY_STORE = 'relationship-room-key';

/**
 * A key baked in at build time by `npm run build:personal`. Absent in the
 * shared build, which is why it is read through a guard rather than inlined —
 * a distributed file must never carry someone's credential.
 */
const BUILT_IN_KEY = (typeof __RR_BUILTIN_KEY__ === 'string' && __RR_BUILTIN_KEY__) || null;

function Gate({ onReady }) {
  const [key, setKey] = useState('');
  const [remember, setRemember] = useState(true);
  const [saved, setSaved] = useState(null);
  const [checked, setChecked] = useState(false);

  const start = (apiKey) => {
    configureApi({ apiKey, mode: 'direct' });
    if (remember && apiKey) {
      try { localStorage.setItem(KEY_STORE, apiKey); } catch { /* ignore */ }
    }
    onReady();
  };

  const rehearse = () => {
    configureApi({ mode: 'rehearsal' });
    onReady();
  };

  const forget = () => {
    try { localStorage.removeItem(KEY_STORE); } catch { /* ignore */ }
    setSaved(null);
  };

  // Seamless on every run after the first: a key already in this browser (or
  // baked into a personal build) starts the Lab without asking again.
  useEffect(() => {
    let stored = null;
    try { stored = localStorage.getItem(KEY_STORE); } catch { /* private mode */ }
    const auto = BUILT_IN_KEY ?? stored;
    if (auto) {
      configureApi({ apiKey: auto, mode: 'direct' });
      onReady();
      return;
    }
    setSaved(stored);
    setChecked(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Don't flash the gate before we know whether we can skip it.
  if (!checked) return <div className="rr-app" />;

  return (
    <div className="rr-app">
      <style>{GATE_CSS}</style>
      <main className="rr-gate">
        <p className="rr-stamp">VEE CONFIDENTIAL — ACCOUNT LEADERSHIP ONLY</p>
        <h1>The Relationship Room</h1>
        <p className="rr-lede">
          A five-episode simulation in protecting a strategic client relationship.
          You'll inherit a cooling $18M account and have two live conversations
          with the people who hold it in their hands.
        </p>

        <section className="rr-gate-block">
          <h2>Play with the live client</h2>
          <p>
            Reyes and Priya are played by Claude, so they react to what you
            actually say rather than to a script. This needs your own Anthropic
            API key — asked for once, then remembered, so every later run opens
            straight into the account file.
          </p>

          <label htmlFor="rr-key">Anthropic API key</label>
          <input
            id="rr-key" type="password" value={key} autoComplete="off"
            placeholder="sk-ant-…" onChange={(e) => setKey(e.target.value)}
          />
          <label className="rr-check">
            <input type="checkbox" checked={remember}
              onChange={(e) => setRemember(e.target.checked)} />
            Remember it in this browser
          </label>

          <p className="rr-warn">
            <strong>Where this key goes.</strong> It is sent from this page
            straight to <code>api.anthropic.com</code> and nowhere else — there
            is no server in between. But a key held in a browser page can be read
            by anything else running on that page, so use a key scoped to this
            purpose that you can revoke, and don't put this file on a site other
            people load. If you'd rather not, the rehearsal below needs no key at
            all.
          </p>

          <button type="button" className="rr-primary" disabled={!key.trim()}
            onClick={() => start(key.trim())}>
            Open the account file →
          </button>
        </section>

        <section className="rr-gate-block rr-gate-alt">
          <h2>Rehearse without a key</h2>
          <p>
            The same five episodes, the same Trust Meter, the same Hold and
            Replay — but the client follows the facilitator guide's branch table
            rather than improvising. It reacts to reassurance, blame, ownership
            and real questions, and nothing leaves your machine.
          </p>
          <button type="button" className="rr-continue" onClick={rehearse}>
            Run the rehearsal →
          </button>
        </section>

        {saved && (
          <p className="rr-colophon">
            A saved key is being used automatically.{' '}
            <button type="button" className="rr-link" onClick={forget}>Forget it</button>{' '}
            to enter a different one.
          </p>
        )}

        <p className="rr-colophon">
          Built from <em>The Relationship Room</em> facilitator guide — VEE
          Technologies Practice Lab. Works offline; your progress is saved in
          this browser.
        </p>
      </main>
    </div>
  );
}

function Root() {
  const [ready, setReady] = useState(false);
  return ready ? <App /> : <Gate onReady={() => setReady(true)} />;
}

const GATE_CSS = `
.rr-gate{max-width:640px;margin:0 auto;padding:44px 22px 80px}
.rr-gate h1{font:600 34px/1.15 Newsreader,'Iowan Old Style',Georgia,serif;color:#D7D9CF;margin:12px 0 14px}
.rr-gate h2{font:600 19px/1.25 Newsreader,'Iowan Old Style',Georgia,serif;color:#D7D9CF;margin:0 0 8px}
.rr-gate .rr-lede{font:400 17px/1.6 Newsreader,'Iowan Old Style',Georgia,serif;color:#B9C3CB;margin-bottom:26px}
.rr-gate p{color:#8B97A2;font-size:14.5px;line-height:1.62}
/* The App's stylesheet isn't mounted yet, so the stamp needs its own box. */
.rr-gate .rr-stamp{display:inline-block;font:700 9px/1.35 'Courier Prime',ui-monospace,monospace;
  letter-spacing:.14em;color:#C4736F;border:2px solid #6E2A2E;padding:5px 9px;
  transform:rotate(-1.6deg);margin:0 0 10px}
.rr-gate-block{background:#1E262E;border:1px solid #263039;padding:20px 22px;margin-bottom:16px}
.rr-gate-alt{background:#161D24}
.rr-gate label{display:block;font:400 10.5px/1 'Courier Prime',ui-monospace,monospace;
  letter-spacing:.1em;text-transform:uppercase;color:#6E7A85;margin:16px 0 6px}
.rr-gate input[type=password]{width:100%;background:#0C1116;border:1px solid #2B3843;
  color:#D7D9CF;padding:11px 13px;font:400 14px/1.4 'Courier Prime',ui-monospace,monospace}
.rr-check{display:flex!important;align-items:center;gap:8px;text-transform:none!important;
  letter-spacing:0!important;font-size:13px!important;font-family:Archivo,sans-serif!important;
  color:#8B97A2!important;margin-top:12px!important}
.rr-check input{width:auto}
.rr-warn{border-left:2px solid #D9A03C;padding-left:12px;margin-top:16px;font-size:13px}
.rr-warn strong{color:#D9A03C;display:block;margin-bottom:3px}
.rr-warn code{font-family:'Courier Prime',ui-monospace,monospace;color:#B9C3CB}
.rr-gate .rr-primary{background:#D7D9CF;color:#202722;border:0;padding:12px 20px;margin-top:16px;
  font:600 11px/1 Archivo,sans-serif;letter-spacing:.14em;text-transform:uppercase;cursor:pointer}
.rr-gate .rr-primary:disabled{opacity:.3;cursor:not-allowed}
.rr-gate .rr-continue{background:none;border:1px solid #7C8B98;color:#D7D9CF;padding:11px 18px;
  margin-top:10px;font:500 13px/1 Archivo,sans-serif;cursor:pointer}
.rr-gate .rr-continue:hover{background:#D7D9CF;color:#202722}
.rr-colophon{margin-top:26px;font-size:12.5px;color:#5C6873}
.rr-link{background:none;border:0;padding:0;color:#B9C3CB;text-decoration:underline;
  cursor:pointer;font:inherit}
@media (max-width:600px){.rr-gate{padding:28px 16px 60px}.rr-gate h1{font-size:27px}}
`;

createRoot(document.getElementById('root')).render(<Root />);
