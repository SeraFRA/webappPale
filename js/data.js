/* data.js — dati iniziali (seed) e costanti dell'app.
   Pattern UMD leggero: funziona nel browser (window.GymData) e in Node per i test. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.GymData = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  // Sensazione: scala 1-5 con emoji (dal prompt)
  const FEELINGS = [
    { value: 1, emoji: '😫', label: ' pessima' },
    { value: 2, emoji: '😕', label: ' meh' },
    { value: 3, emoji: '😐', label: ' normale' },
    { value: 4, emoji: '🙂', label: ' buona' },
    { value: 5, emoji: '🤩', label: ' top' },
  ];

  // Giorni di allenamento: martedì(2), giovedì(4), sabato(6), domenica(0)
  const TRAINING_DAYS = [2, 4, 6, 0];

  // Prima volta (nessuna sessione): mapping giorno -> scheda di partenza
  const FALLBACK_DAY_WORKOUT = { 2: 'w-pull-legs', 4: 'w-push', 6: 'w-pull-legs', 0: 'w-pull-legs' };

  // Scheda iniziale richiesta dal prompt. Peso = riferimento "ultima volta".
  const SEED_WORKOUTS = [
    {
      id: 'w-push',
      name: 'Spinta',
      exercises: [
        { id: 'ex-chest-press',   name: 'Chest press',                 sets: 3, reps: 10, weight: 30 },
        { id: 'ex-peck-fly',      name: 'Peck fly',                    sets: 3, reps: 10, weight: 25 },
        { id: 'ex-shoulder-press',name: 'Shoulder press',              sets: 3, reps: 10, weight: 40 },
        { id: 'ex-trapezi',       name: 'Macchina trapezi',            sets: 3, reps: 10, weight: 20 },
        { id: 'ex-tric-press',    name: 'Tric press',                  sets: 3, reps: 10, weight: 50 },
        { id: 'ex-corde-tric',    name: 'Corde Tric',                  sets: 3, reps: 10, weight: 35 },
        { id: 'ex-crunch',        name: 'Addominal crunch',            sets: 3, reps: 15, weight: 0 },
        { id: 'ex-sbarra',        name: 'Addominali alla sbarra',       sets: 3, reps: 15, weight: 0 },
      ],
    },
    {
      id: 'w-pull-legs',
      name: 'Tirata+gambe',
      exercises: [
        { id: 'ex-lat',            name: 'Lat larga',                          sets: 3, reps: 10, weight: 50 },
        { id: 'ex-rematore',       name: 'Rematore',                           sets: 3, reps: 10, weight: 40 },
        { id: 'ex-arm-curl',       name: 'Arm curl gomiti avanti',             sets: 3, reps: 10, weight: 20 },
        { id: 'ex-macchina-curl',  name: 'Macchina curl gomiti appoggiati',    sets: 3, reps: 10, weight: 20 },
        { id: 'ex-manubrio',       name: 'Manubrio',                           sets: 3, reps: 10, weight: 16 },
        { id: 'ex-leg-press',      name: 'Leg press',                          sets: 3, reps: 10, weight: 120 },
        { id: 'ex-leg-extension',  name: 'Leg extension',                      sets: 3, reps: 10, weight: 30 },
        { id: 'ex-leg-curl',       name: 'Leg curl',                           sets: 3, reps: 10, weight: 45 },
      ],
    },
  ];

  const SEED_SETTINGS = { unit: 'kg' };

  // Peso di fallback per i bottoni +/- (il valore resta comunque editibile da tastiera)
  const FIXED_STEP = 2.5;

  function uid(prefix) {
    return (prefix || 'id') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  // 'YYYY-MM-DD' in timezone locale (non UTC, per non slittare il giorno)
  function dateStr(d) {
    d = d || new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function monthStr(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  function monthLabel(mStr) {
    const [y, m] = mStr.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
  }

  function shiftMonth(mStr, delta) {
    const [y, m] = mStr.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return monthStr(d);
  }

  function formatDateIt(dStr) {
    const [y, m, d] = dStr.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
  }

  // Volume di una voce: somma (peso x rip) di ogni serie registrata.
  // Fallback per il vecchio formato "piatto" (peso/rip unici moltiplicati per le serie).
  function entryVolume(entry) {
    if (Array.isArray(entry.series) && entry.series.length) {
      return entry.series.reduce((sum, s) => sum + (Number(s.weight) || 0) * (Number(s.reps) || 0), 0);
    }
    return (Number(entry.weight) || 0) * (Number(entry.reps) || 0) * (Number(entry.sets) || 0);
  }

  function sessionVolume(session) {
    return (session.entries || []).reduce((sum, e) => sum + entryVolume(e), 0);
  }

  // Media dei pesi delle serie di una voce (per grafici e KPI); null se non ci sono serie.
  function avgSeriesWeight(entry) {
    if (!Array.isArray(entry.series) || !entry.series.length) return null;
    const ws = entry.series.map((s) => Number(s.weight) || 0);
    return ws.reduce((a, b) => a + b, 0) / ws.length;
  }

  // Crea "count" serie uguali (usato per la migrazione del vecchio formato e per i default).
  function defaultSeries(count, weight, reps, feeling) {
    return Array.from({ length: Math.max(1, count || 3) }, () => ({
      weight: Number(weight) || 0,
      reps: Number(reps) || 0,
      feeling: feeling || 3,
    }));
  }

  // Formatta un peso per la UI italiana (virgola decimale)
  function fmtKg(v) {
    return String(Math.round((Number(v) || 0) * 100) / 100).replace('.', ',');
  }

  return {
    FEELINGS,
    TRAINING_DAYS,
    FALLBACK_DAY_WORKOUT,
    SEED_WORKOUTS,
    SEED_SETTINGS,
    FIXED_STEP,
    uid,
    dateStr,
    monthStr,
    monthLabel,
    shiftMonth,
    formatDateIt,
    entryVolume,
    sessionVolume,
    avgSeriesWeight,
    defaultSeries,
    fmtKg,
  };
});
