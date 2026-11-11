/* store.js — persistenza su localStorage con chiavi versionate (gym.v1.*)
   e logica di dominio (proposta scheda del giorno, CRUD sessioni, export/import).
   Dipende da GymData (data.js). */
(function (root, factory) {
  const data = (typeof module !== 'undefined' && module.exports) ? require('./data.js') : root.GymData;
  const api = factory(data);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.GymStore = api;
})(typeof self !== 'undefined' ? self : globalThis, function (D) {
  'use strict';

  const KEYS = {
    sessions: 'gym.v1.sessions',
    workouts: 'gym.v1.workouts',
    settings: 'gym.v1.settings',
  };
  const EXPORT_VERSION = 1;

  // Storage iniettabile (utile nei test); di default localStorage del browser.
  let storage = (typeof localStorage !== 'undefined') ? localStorage : null;
  function setStorage(s) { storage = s; }
  function memStorage() {
    const m = new Map();
    return {
      getItem: (k) => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => m.set(k, String(v)),
      removeItem: (k) => m.delete(k),
      clear: () => m.clear(),
    };
  }
  if (!storage) storage = memStorage();

  function read(key, fallback) {
    try {
      const raw = storage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }
  function write(key, value) {
    storage.setItem(key, JSON.stringify(value));
  }

  function ensureSeed() {
    if (!storage.getItem(KEYS.workouts)) write(KEYS.workouts, D.SEED_WORKOUTS);
    if (!storage.getItem(KEYS.settings)) write(KEYS.settings, D.SEED_SETTINGS);
    if (!storage.getItem(KEYS.sessions)) write(KEYS.sessions, []);
  }

  // --- Impostazioni -------------------------------------------------------
  function getSettings() { ensureSeed(); return read(KEYS.settings, { ...D.SEED_SETTINGS }); }
  function updateSettings(patch) {
    const s = { ...getSettings(), ...patch };
    write(KEYS.settings, s);
    return s;
  }

  // --- Schede -------------------------------------------------------------
  function getWorkouts() { ensureSeed(); return read(KEYS.workouts, D.SEED_WORKOUTS); }
  function saveWorkouts(list) { write(KEYS.workouts, list); return list; }
  function getWorkout(id) { return getWorkouts().find((w) => w.id === id) || null; }

  // --- Sessioni -----------------------------------------------------------
  // Migrazione: le vecchie voci "piatte" (peso/rip/sensazione unici) diventano
  // una lista di serie del numero previsto dall'esercizio, con gli stessi valori.
  function normalizeEntry(e) {
    if (Array.isArray(e.series) && e.series.length) return e;
    return Object.assign({}, e, {
      series: D.defaultSeries(e.sets, e.weight, e.reps, e.feeling),
    });
  }
  function normalizeSession(s) {
    return Object.assign({}, s, { entries: (s.entries || []).map(normalizeEntry) });
  }

  function getSessions() {
    ensureSeed();
    return read(KEYS.sessions, []).map(normalizeSession);
  }
  function saveSessions(list) { write(KEYS.sessions, list); return list; }

  function sortedSessions() {
    return getSessions().slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.ts - a.ts));
  }
  function lastSession() {
    const s = sortedSessions();
    return s.length ? s[0] : null;
  }
  function getSessionByDate(dStr) {
    return getSessions().find((s) => s.date === dStr) || null;
  }
  function upsertSession(session) {
    const list = getSessions().filter((s) => s.date !== session.date);
    list.push(session);
    saveSessions(list);
    return session;
  }
  function deleteSession(id) {
    saveSessions(getSessions().filter((s) => s.id !== id));
  }

  // Ultima volta che ho fatto quell'esercizio (per mostrare peso/rip "dell'ultima")
  function lastEntryFor(exerciseId, beforeDate) {
    const sessions = sortedSessions();
    for (const s of sessions) {
      if (beforeDate && s.date >= beforeDate) continue;
      const e = (s.entries || []).find((x) => x.exerciseId === exerciseId);
      if (e) return e;
    }
    return null;
  }

  // --- Proposta scheda del giorno ------------------------------------------
  // Oggi è un giorno di allenamento (mar/gio/sab/dom): alternanza ciclica
  // rispetto all'ultima sessione registrata. Se non ci sono sessioni, mapping fisso.
  // Altrimenti: ultima scheda usata (o la prima scheda in assoluto).
  function proposedWorkoutId(d) {
    d = d || new Date();
    const day = d.getDay();
    const workouts = getWorkouts();
    if (!workouts.length) return null;
    const last = lastSession();
    if (D.TRAINING_DAYS.includes(day)) {
      if (last && last.workoutId) {
        const idx = workouts.findIndex((w) => w.id === last.workoutId);
        if (idx >= 0) return workouts[(idx + 1) % workouts.length].id;
      }
      return D.FALLBACK_DAY_WORKOUT[day] || workouts[0].id;
    }
    if (last && last.workoutId) return last.workoutId;
    return workouts[0].id;
  }

  // --- Export / Import ------------------------------------------------------
  function exportJSON() {
    ensureSeed();
    return JSON.stringify({
      app: 'gymlog',
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      settings: getSettings(),
      workouts: getWorkouts(),
      sessions: getSessions(),
    }, null, 2);
  }

  function importJSON(text) {
    let parsed;
    try { parsed = JSON.parse(text); } catch (e) { return { ok: false, error: 'JSON non valido' }; }
    if (!parsed || typeof parsed !== 'object') return { ok: false, error: 'Formato non riconosciuto' };
    const workouts = Array.isArray(parsed.workouts) ? parsed.workouts : null;
    const sessions = Array.isArray(parsed.sessions) ? parsed.sessions : null;
    if (!workouts || !sessions) return { ok: false, error: 'mancano workouts o sessions' };
    for (const w of workouts) {
      if (!w.id || !w.name || !Array.isArray(w.exercises)) return { ok: false, error: 'scheda non valida: ' + (w.name || w.id) };
    }
    for (const s of sessions) {
      if (!s.id || !s.date || !Array.isArray(s.entries)) return { ok: false, error: 'sessione non valida: ' + (s.date || s.id) };
    }
    if (parsed.settings && typeof parsed.settings === 'object') write(KEYS.settings, { ...D.SEED_SETTINGS, ...parsed.settings });
    write(KEYS.workouts, workouts);
    write(KEYS.sessions, sessions);
    return { ok: true, sessions: sessions.length, workouts: workouts.length };
  }

  // Cancella tutti i dati; al prossimo accesso vengono re-seedati scheda e impostazioni.
  function clearAll() {
    storage.removeItem(KEYS.sessions);
    storage.removeItem(KEYS.workouts);
    storage.removeItem(KEYS.settings);
    ensureSeed();
  }

  return {
    KEYS,
    setStorage,
    ensureSeed,
    getSettings, updateSettings,
    getWorkouts, saveWorkouts, getWorkout,
    getSessions, saveSessions, sortedSessions, lastSession, getSessionByDate, upsertSession, deleteSession,
    lastEntryFor,
    proposedWorkoutId,
    exportJSON, importJSON, clearAll,
  };
});
