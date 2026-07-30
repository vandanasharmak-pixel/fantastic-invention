/**
 * Versioned persistence.
 *
 * "A person should be able to close the tab mid-Episode-Three, come back
 * tomorrow, resume exactly where they left off."
 *
 * One shape, one version, one debounced writer. Old or corrupt saves never
 * crash the app — they surface a "start fresh" path instead.
 */

export const SCHEMA_VERSION = 1;
export const STORAGE_KEY = 'relationship-room';

export function emptySave() {
  return {
    schemaVersion: SCHEMA_VERSION,
    screen: 'intro',
    episode: 0,
    trustEvents: [],
    worksheets: {},
    commitment: null,
    cardsOpened: [],
    decisions: {},
    transcriptDigest: [],
    updatedAt: null,
  };
}

const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * @returns {{ status:'empty'|'ok'|'incompatible'|'corrupt', data:object|null, foundVersion?:number }}
 */
export function validateSave(raw) {
  if (raw == null) return { status: 'empty', data: null };

  let parsed = raw;
  if (typeof raw === 'string') {
    try { parsed = JSON.parse(raw); }
    catch { return { status: 'corrupt', data: null }; }
  }

  if (!isPlainObject(parsed)) return { status: 'corrupt', data: null };

  const v = parsed.schemaVersion;
  if (typeof v !== 'number') return { status: 'corrupt', data: null };
  if (v !== SCHEMA_VERSION) return { status: 'incompatible', data: null, foundVersion: v };

  if (!Array.isArray(parsed.trustEvents)) return { status: 'corrupt', data: null };
  if (!Array.isArray(parsed.cardsOpened)) return { status: 'corrupt', data: null };

  return { status: 'ok', data: { ...emptySave(), ...parsed } };
}

/** Has the person got progress worth offering to resume? */
export function hasResumableProgress(save) {
  if (!save) return false;
  return (
    (save.episode ?? 0) > 0 ||
    save.trustEvents?.length > 0 ||
    save.cardsOpened?.length > 0 ||
    Object.keys(save.worksheets ?? {}).length > 0
  );
}

/** Human label for the resume affordance on the intro screen. */
export function resumeLabel(save) {
  const ep = save?.episode ?? 0;
  if (ep === 0) return 'Resume — Prologue';
  const names = {
    1: 'Something Feels Wrong',
    2: 'The First Client Meeting',
    3: 'Hidden Truths',
    4: 'Pressure & Escalation',
    5: 'Saving the Relationship',
    6: 'The Grand Debrief',
  };
  return `Resume — Episode ${ep}: ${names[ep] ?? ''}`.trim();
}

/**
 * Debounced writer. Meaningful state changes only — never per keystroke.
 * `backend` defaults to `window.storage` but is injectable for tests.
 */
export function createPersistence({ backend, key = STORAGE_KEY, delay = 500 } = {}) {
  const store = backend ?? (typeof window !== 'undefined' ? window.storage : null);
  let timer = null;
  let pending = null;

  const writeNow = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    if (pending == null || !store) return;
    const payload = { ...pending, schemaVersion: SCHEMA_VERSION, updatedAt: Date.now() };
    pending = null;
    try { store.setItem(key, JSON.stringify(payload)); }
    catch { /* quota or unavailable — losing a save must never break the room */ }
  };

  return {
    save(state) {
      pending = state;
      if (timer) clearTimeout(timer);
      timer = setTimeout(writeNow, delay);
    },
    flush: writeNow,
    load() {
      if (!store) return { status: 'empty', data: null };
      try { return validateSave(store.getItem(key)); }
      catch { return { status: 'corrupt', data: null }; }
    },
    clear() {
      if (timer) { clearTimeout(timer); timer = null; }
      pending = null;
      try { store?.removeItem(key); } catch { /* ignore */ }
    },
  };
}
