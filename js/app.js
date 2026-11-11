/* app.js — router e schermate dell'app (Oggi, Storico, Statistiche, Impostazioni). */
(function () {
  'use strict';

  const D = window.GymData;
  const S = window.GymStore;
  const C = window.GymCharts;

  const state = {
    today: D.dateStr(new Date()),
    draft: null,          // bozza della sessione di oggi (array voci con serie)
    draftWorkoutId: null, // scheda scelta per oggi
    statMonth: D.monthStr(new Date()),
    statExerciseId: null,
  };

  // --- Helper DOM ----------------------------------------------------------
  function el(tag, attrs, children) {
    const n = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        if (k === 'class') n.className = attrs[k];
        else if (k === 'text') n.textContent = attrs[k];
        else if (k.startsWith('on') && typeof attrs[k] === 'function') n.addEventListener(k.slice(2), attrs[k]);
        else n.setAttribute(k, attrs[k]);
      }
    }
    (children || []).forEach((c) => { if (c) n.appendChild(c); });
    return n;
  }

  function parseNum(v) {
    const n = parseFloat(String(v).replace(',', '.'));
    return isNaN(n) ? 0 : n;
  }
  function fmtNum(v) { return String(Math.round((Number(v) || 0) * 100) / 100); }

  let toastTimer = null;
  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 1900);
  }

  function modal(opts) {
    const backdrop = document.getElementById('modal-backdrop');
    const box = document.getElementById('modal');
    box.innerHTML = '';
    box.appendChild(el('h3', { text: opts.title }));
    if (opts.body) box.appendChild(el('p', { text: opts.body }));
    const actions = el('div', { class: 'modal-actions' });
    (opts.buttons || []).forEach((b) => {
      actions.appendChild(el('button', {
        class: 'btn ' + (b.class || ''),
        text: b.label,
        onclick: () => { closeModal(); if (b.onClick) b.onClick(); },
      }));
    });
    box.appendChild(actions);
    backdrop.classList.remove('hidden');
  }
  function closeModal() {
    document.getElementById('modal-backdrop').classList.add('hidden');
  }
  document.getElementById('modal-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modal-backdrop') closeModal();
  });

  function setHeader(title, sub) {
    document.getElementById('app-title').textContent = title;
    document.getElementById('header-sub').textContent = sub || '';
  }

  // --- Router ----------------------------------------------------------------
  function parseHash() {
    const h = location.hash || '#/oggi';
    const parts = h.replace(/^#\//, '').split('/');
    return { name: parts[0] || 'oggi', arg: parts[1] || null };
  }

  function render() {
    const r = parseHash();
    document.querySelectorAll('#tabbar .tab').forEach((t) => {
      t.classList.toggle('active', t.dataset.route === '#/' + r.name);
    });
    const view = document.getElementById('view');
    view.innerHTML = '';
    if (r.name === 'storico' && r.arg) renderHistoryDetail(view, r.arg);
    else if (r.name === 'storico') renderHistory(view);
    else if (r.name === 'statistiche') renderStats(view);
    else if (r.name === 'impostazioni') renderSettings(view);
    else renderHome(view);
    window.scrollTo(0, 0);
  }

  document.querySelectorAll('#tabbar .tab').forEach((t) => {
    t.addEventListener('click', () => { location.hash = t.dataset.route; });
  });
  window.addEventListener('hashchange', render);

  // --- Bozza sessione di oggi ------------------------------------------------
  // Ogni voce: { exerciseId, name, sets, series: [{ weight, reps, feeling }] }
  function buildDraft(workoutId) {
    const workout = S.getWorkout(workoutId);
    const todaySession = S.getSessionByDate(state.today);
    return workout.exercises.map((ex) => {
      const count = Math.max(1, ex.sets || 3);
      const src = todaySession
        ? todaySession.entries.find((x) => x.exerciseId === ex.id)
        : S.lastEntryFor(ex.id, state.today);
      const series = [];
      for (let i = 0; i < count; i++) {
        let w = Number(ex.weight) || 0, r = Number(ex.reps) || 0, f = 3;
        if (src) {
          if (src.series && src.series[i]) {
            w = Number(src.series[i].weight) || w;
            r = Number(src.series[i].reps) || r;
            f = src.series[i].feeling || 3;
          } else if (typeof src.weight === 'number') {
            w = src.weight || w; r = src.reps || r; f = src.feeling || 3;
          }
        }
        series.push({ weight: w, reps: r, feeling: f });
      }
      return { exerciseId: ex.id, name: ex.name, sets: count, series };
    });
  }

  // --- Schermata Oggi ----------------------------------------------------------
  function renderHome(view) {
    if (!state.draftWorkoutId || !S.getWorkout(state.draftWorkoutId)) {
      state.draftWorkoutId = S.proposedWorkoutId(new Date());
    }
    const workout = S.getWorkout(state.draftWorkoutId);
    const todaySession = S.getSessionByDate(state.today);
    if (!state.draft || state.draft._workoutId !== workout.id) {
      state.draft = buildDraft(workout.id);
      state.draft._workoutId = workout.id;
    }

    const dateLabel = new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
    setHeader('Allenamento di oggi', dateLabel);

    // selettore scheda
    const sel = el('select', { 'aria-label': 'Scheda del giorno' });
    S.getWorkouts().forEach((w) => {
      sel.appendChild(el('option', { value: w.id, text: w.name, ...(w.id === workout.id ? { selected: '' } : {}) }));
    });
    sel.addEventListener('change', () => {
      state.draftWorkoutId = sel.value;
      state.draft = null;
      render();
    });
    view.appendChild(el('div', { class: 'card' }, [
      el('div', { class: 'sub', text: todaySession ? 'Sessione di oggi già registrata: modificala e salva.' : 'Scheda proposta per oggi:' }),
      sel,
    ]));

    // card esercizi con blocchi per serie
    state.draft.forEach((entry) => {
      const ex = workout.exercises.find((e) => e.id === entry.exerciseId);
      const last = S.lastEntryFor(entry.exerciseId, state.today);
      const card = el('div', { class: 'card exercise' });

      card.appendChild(el('div', { class: 'ex-head' }, [
        el('span', { class: 'ex-name', text: entry.name }),
        el('span', { class: 'ex-planned', text: (ex ? ex.sets : entry.sets) + ' x ' + (ex ? ex.reps : '') + ' prev.' }),
      ]));
      if (todaySession) {
        card.appendChild(el('div', { class: 'ex-last', text: 'Valori di oggi (modificabili, serie per serie)' }));
      } else if (last && last.series) {
        card.appendChild(el('div', {
          class: 'ex-last',
          text: 'Ultima: ' + last.series.map((s) => D.fmtKg(s.weight) + ' kg x ' + s.reps).join(' · '),
        }));
      } else {
        card.appendChild(el('div', { class: 'ex-last', text: 'Nessuna registrazione precedente' }));
      }

      entry.series.forEach((sr, si) => {
        card.appendChild(serieBlock(entry, sr, si));
      });

      view.appendChild(card);
    });

    // salva
    view.appendChild(el('button', {
      class: 'btn primary big',
      type: 'button',
      text: todaySession ? 'Salva modifiche' : 'Salva sessione',
      onclick: saveToday,
    }));
  }

  // Blocco di una serie: peso (input + bottoni ±2,5), ripetizioni (input), fatica (emoji 1-5).
  // Tutti i controlli aggiornano la bozza senza re-render (niente perdita di focus/tastiera).
  function serieBlock(entry, sr, si) {
    const block = el('div', { class: 'serie' });
    block.appendChild(el('div', { class: 'serie-tag', text: 'Serie ' + (si + 1) }));

    // peso: [−][input][+]
    const wInput = el('input', {
      type: 'number', class: 'w-input', inputmode: 'decimal', step: '0.5', min: '0',
      value: fmtNum(sr.weight), 'aria-label': 'Peso serie ' + (si + 1) + ' (kg)',
    });
    wInput.addEventListener('change', () => {
      sr.weight = Math.max(0, Math.round(parseNum(wInput.value) * 100) / 100);
      wInput.value = fmtNum(sr.weight);
    });
    const minus = el('button', {
      class: 'btn step', type: 'button', text: '−',
      'aria-label': 'Diminuisci peso serie ' + (si + 1),
      onclick: () => { sr.weight = Math.max(0, Math.round((sr.weight - D.FIXED_STEP) * 100) / 100); wInput.value = fmtNum(sr.weight); },
    });
    const plus = el('button', {
      class: 'btn step', type: 'button', text: '+',
      'aria-label': 'Aumenta peso serie ' + (si + 1),
      onclick: () => { sr.weight = Math.max(0, Math.round((sr.weight + D.FIXED_STEP) * 100) / 100); wInput.value = fmtNum(sr.weight); },
    });
    block.appendChild(el('div', { class: 'row-peso' }, [
      minus, wInput, el('span', { class: 'lbl-unit', text: 'kg' }), plus,
    ]));

    // rip + fatica
    const rInput = el('input', {
      type: 'number', class: 'r-input', inputmode: 'numeric', step: '1', min: '0',
      value: String(sr.reps), 'aria-label': 'Ripetizioni serie ' + (si + 1),
    });
    rInput.addEventListener('change', () => {
      sr.reps = Math.max(0, Math.round(parseNum(rInput.value)));
      rInput.value = String(sr.reps);
    });
    const feels = el('div', { class: 'feelings compact' });
    D.FEELINGS.forEach((f) => {
      const fb = el('button', {
        class: 'feel' + (sr.feeling === f.value ? ' selected' : ''),
        type: 'button', text: f.emoji,
        title: 'Fatica ' + f.value + '/5', 'aria-label': 'Fatica ' + f.value + ' su 5, serie ' + (si + 1),
      });
      fb.addEventListener('click', () => {
        sr.feeling = f.value;
        // aggiorna solo le classi dei bottoni di questo blocco (no re-render)
        feels.querySelectorAll('.feel').forEach((b, k) => {
          b.classList.toggle('selected', D.FEELINGS[k].value === f.value);
        });
      });
      feels.appendChild(fb);
    });
    block.appendChild(el('div', { class: 'row-rip' }, [
      el('label', { text: 'Rip' }), rInput, feels,
    ]));
    return block;
  }

  function saveToday() {
    const workout = S.getWorkout(state.draftWorkoutId);
    const existing = S.getSessionByDate(state.today);
    const session = {
      id: existing ? existing.id : D.uid('ses'),
      date: state.today,
      ts: Date.now(),
      workoutId: workout.id,
      workoutName: workout.name,
      entries: state.draft.map((e) => ({
        exerciseId: e.exerciseId,
        name: e.name,
        sets: e.sets,
        series: e.series.map((s) => ({
          weight: Number(s.weight) || 0,
          reps: Number(s.reps) || 0,
          feeling: s.feeling || 3,
        })),
      })),
    };
    S.upsertSession(session);
    toast(existing ? 'Modifiche salvate' : 'Sessione salvata');
    state.draft = null;
    render();
  }

  // --- Storico -----------------------------------------------------------------
  function renderHistory(view) {
    setHeader('Storico', 'Tutte le sessioni registrate');
    const sessions = S.sortedSessions();
    if (!sessions.length) {
      view.appendChild(el('div', { class: 'empty-state', text: 'Nessuna sessione ancora. Vai su "Oggi" e allenati!' }));
      return;
    }
    const byMonth = new Map();
    sessions.forEach((s) => {
      const m = s.date.slice(0, 7);
      if (!byMonth.has(m)) byMonth.set(m, []);
      byMonth.get(m).push(s);
    });
    for (const [m, list] of byMonth) {
      view.appendChild(el('div', { class: 'section-title', text: D.monthLabel(m) }));
      list.forEach((s) => {
        view.appendChild(el('button', {
          class: 'session-row', type: 'button',
          onclick: () => { location.hash = '#/storico/' + s.id; },
        }, [
          el('span', { class: 's-date', text: D.formatDateIt(s.date) }),
          el('span', { class: 's-info', text: s.workoutName + ' — ' + s.entries.length + ' esercizi' }),
          el('span', { class: 's-vol', text: Math.round(D.sessionVolume(s)).toLocaleString('it-IT') + ' kg' }),
        ]));
      });
    }
  }

  function renderHistoryDetail(view, id) {
    const s = S.getSessions().find((x) => x.id === id);
    if (!s) { location.hash = '#/storico'; return; }
    setHeader('Dettaglio sessione', D.formatDateIt(s.date) + ' — ' + s.workoutName);

    view.appendChild(el('button', { class: 'btn ghost', type: 'button', text: '← Torna allo storico', onclick: () => { location.hash = '#/storico'; } }));

    const card = el('div', { class: 'card mt' });
    s.entries.forEach((e, i) => {
      const ex = el('div', { class: 'detail-ex' });
      ex.appendChild(el('b', { text: e.name }));
      (e.series || []).forEach((sr, j) => {
        const f = D.FEELINGS.find((x) => x.value === sr.feeling);
        ex.appendChild(el('div', {
          class: 'detail-serie',
          text: 'S' + (j + 1) + ' · ' + D.fmtKg(sr.weight) + ' kg x ' + sr.reps + (f ? ' · ' + f.emoji : ''),
        }));
      });
      card.appendChild(ex);
    });
    card.appendChild(el('div', { class: 'muted mt', text: 'Volume totale: ' + Math.round(D.sessionVolume(s)).toLocaleString('it-IT') + ' kg' }));
    view.appendChild(card);

    view.appendChild(el('button', {
      class: 'btn danger big mt', type: 'button', text: 'Elimina sessione',
      onclick: () => {
        modal({
          title: 'Eliminare la sessione?',
          body: 'La sessione del ' + D.formatDateIt(s.date) + ' (' + s.workoutName + ') verrà rimossa definitivamente.',
          buttons: [
            { label: 'Annulla', class: 'ghost' },
            { label: 'Elimina', class: 'danger', onClick: () => { S.deleteSession(s.id); toast('Sessione eliminata'); location.hash = '#/storico'; } },
          ],
        });
      },
    }));
  }

  // --- Statistiche ---------------------------------------------------------------
  function allExerciseOptions() {
    const seen = new Map();
    S.getWorkouts().forEach((w) => w.exercises.forEach((e) => { if (!seen.has(e.id)) seen.set(e.id, e.name); }));
    return Array.from(seen, ([id, name]) => ({ id, name }));
  }

  function renderStats(view) {
    setHeader('Statistiche', 'Progressi mensili');
    const month = state.statMonth;
    const sessions = S.sortedSessions().filter((s) => s.date.slice(0, 7) === month).slice().sort((a, b) => a.date.localeCompare(b.date));

    const monthLabel = el('span', { class: 'month-label', text: D.monthLabel(month) });
    view.appendChild(el('div', { class: 'stat-controls' }, [
      el('div', { class: 'month-nav' }, [
        navBtn('‹', () => { state.statMonth = D.shiftMonth(month, -1); render(); }),
        monthLabel,
        navBtn('›', () => { state.statMonth = D.shiftMonth(month, 1); render(); }),
      ]),
    ]));

    // selettore esercizio per il grafico peso
    const exOptions = allExerciseOptions();
    if (!state.statExerciseId || !exOptions.find((e) => e.id === state.statExerciseId)) {
      let best = null, bestN = -1;
      const count = new Map();
      sessions.forEach((s) => s.entries.forEach((e) => count.set(e.exerciseId, (count.get(e.exerciseId) || 0) + 1)));
      count.forEach((n, id) => { if (n > bestN) { bestN = n; best = id; } });
      state.statExerciseId = best || (exOptions[0] && exOptions[0].id) || null;
    }
    const selWrap = el('div', { class: 'card' }, [
      el('div', { class: 'sub', text: 'Esercizio per il grafico del peso:' }),
    ]);
    const sel = el('select', { 'aria-label': 'Esercizio' });
    exOptions.forEach((e) => sel.appendChild(el('option', { value: e.id, text: e.name, ...(e.id === state.statExerciseId ? { selected: '' } : {}) })));
    sel.addEventListener('change', () => { state.statExerciseId = sel.value; render(); });
    selWrap.appendChild(sel);
    view.appendChild(selWrap);

    // KPI
    const totalVolume = sessions.reduce((a, s) => a + D.sessionVolume(s), 0);
    view.appendChild(el('div', { class: 'kpi-grid' }, [
      kpi(String(sessions.length), 'Sessioni'),
      kpi(Math.round(totalVolume).toLocaleString('it-IT') + ' kg', 'Volume totale'),
      kpi(improvementPct(sessions), 'Peso principale'),
    ]));

    // grafico 1: peso (media serie) nel tempo
    view.appendChild(chartCard('Peso nel tempo — ' + ((exOptions.find((e) => e.id === state.statExerciseId) || {}).name || ''), (canvas) => {
      const pts = [];
      sessions.forEach((s) => {
        const e = s.entries.find((x) => x.exerciseId === state.statExerciseId);
        const v = e ? D.avgSeriesWeight(e) : null;
        if (v != null) pts.push({ label: s.date.slice(8), value: Math.round(v * 10) / 10 });
      });
      return C.drawLine(canvas, pts, { color: '#4f8cff' });
    }));

    // grafico 2: volume per sessione (barre)
    view.appendChild(chartCard('Volume per sessione (peso x rip per serie)', (canvas) => {
      const bars = sessions.map((s) => ({ label: s.date.slice(8), value: D.sessionVolume(s) }));
      return C.drawBar(canvas, bars, { color: '#35d07f' });
    }));

    // grafico 3: fatica media nel tempo (linee)
    view.appendChild(chartCard('Fatica media (1-5)', (canvas) => {
      const pts = sessions.map((s) => {
        const fs = [];
        s.entries.forEach((e) => {
          if (Array.isArray(e.series)) e.series.forEach((sr) => fs.push(sr.feeling || 3));
          else if (e.feeling) fs.push(e.feeling);
        });
        return { label: s.date.slice(8), value: fs.length ? fs.reduce((a, b) => a + b, 0) / fs.length : 3 };
      });
      return C.drawLine(canvas, pts, { color: '#f5b83d' });
    }));
  }

  function navBtn(label, onClick) {
    return el('button', { class: 'btn small', type: 'button', text: label, onclick: onClick });
  }
  function kpi(val, lbl) {
    return el('div', { class: 'kpi' }, [el('div', { class: 'kpi-val', text: val }), el('div', { class: 'kpi-lbl', text: lbl })]);
  }
  function chartCard(title, drawFn) {
    const card = el('div', { class: 'chart-card' });
    card.appendChild(el('h4', { text: title }));
    const canvas = el('canvas', {});
    card.appendChild(canvas);
    requestAnimationFrame(() => {
      const ok = drawFn(canvas);
      if (!ok) {
        card.appendChild(el('div', { class: 'chart-empty', text: 'Nessun dato per questo mese' }));
        canvas.style.display = 'none';
      }
    });
    return card;
  }

  // Esercizio "principale": più frequente nel mese; improvement = (ultimo - primo)/primo sulle medie serie
  function improvementPct(sessions) {
    if (!sessions.length) return '—';
    const count = new Map();
    sessions.forEach((s) => s.entries.forEach((e) => count.set(e.exerciseId, (count.get(e.exerciseId) || 0) + 1)));
    let mainId = null, bestN = -1;
    count.forEach((n, id) => { if (n > bestN) { bestN = n; mainId = id; } });
    if (!mainId) return '—';
    const pts = [];
    sessions.forEach((s) => {
      const e = s.entries.find((x) => x.exerciseId === mainId);
      const v = e ? D.avgSeriesWeight(e) : null;
      if (v != null) pts.push(v);
    });
    if (pts.length < 2 || pts[0] === 0) return '—';
    const pct = ((pts[pts.length - 1] - pts[0]) / pts[0]) * 100;
    return (pct >= 0 ? '+' : '') + pct.toFixed(1).replace('.', ',') + '%';
  }

  // --- Impostazioni --------------------------------------------------------------
  // Ogni modifica alle schede invalida la bozza di oggi (per rileggere gli esercizi).
  function invalidateDraft() { state.draft = null; }

  function renderSettings(view) {
    setHeader('Impostazioni', 'Schede e dati');

    // schede
    view.appendChild(el('div', { class: 'section-title', text: 'Le mie schede' }));
    S.getWorkouts().forEach((w, wi) => {
      const card = el('div', { class: 'card workout-edit' });
      const nameInput = el('input', { type: 'text', class: 'w-name', value: w.name, 'aria-label': 'Nome scheda' });
      nameInput.addEventListener('change', () => {
        const list = S.getWorkouts();
        list[wi].name = nameInput.value.trim() || w.name;
        S.saveWorkouts(list); invalidateDraft();
        toast('Scheda rinominata');
      });
      card.appendChild(el('div', { class: 'card-head' }, [
        nameInput,
        el('button', {
          class: 'btn small danger', type: 'button', text: 'Elimina scheda',
          onclick: () => {
            if (S.getWorkouts().length <= 1) { toast('Serve almeno una scheda'); return; }
            modal({
              title: 'Eliminare la scheda "' + w.name + '"?',
              body: 'Gli esercizi spariranno dalle proposte. Le sessioni passate restano nello storico.',
              buttons: [
                { label: 'Annulla', class: 'ghost' },
                { label: 'Elimina', class: 'danger', onClick: () => {
                  S.saveWorkouts(S.getWorkouts().filter((x) => x.id !== w.id));
                  invalidateDraft();
                  toast('Scheda eliminata');
                  render();
                } },
              ],
            });
          },
        }),
      ]));

      w.exercises.forEach((ex, ei) => {
        const row = el('div', { class: 'ex-edit' });
        const nameI = el('input', { type: 'text', value: ex.name, 'aria-label': 'Nome esercizio', title: 'Nome' });
        const setsI = el('input', { type: 'number', value: String(ex.sets), min: '1', title: 'Serie', 'aria-label': 'Serie' });
        const repsI = el('input', { type: 'number', value: String(ex.reps), min: '1', title: 'Ripetizioni', 'aria-label': 'Ripetizioni' });
        const weightI = el('input', { type: 'number', value: String(ex.weight), min: '0', step: '0.5', title: 'Peso (kg)', 'aria-label': 'Peso' });
        const delB = el('button', { class: 'btn small danger', type: 'button', text: '×', 'aria-label': 'Rimuovi esercizio' });
        [nameI, setsI, repsI, weightI].forEach((inp) => {
          inp.addEventListener('change', () => {
            const list = S.getWorkouts();
            const e = list[wi].exercises[ei];
            e.name = nameI.value.trim() || e.name;
            e.sets = Math.max(1, parseInt(setsI.value, 10) || e.sets);
            e.reps = Math.max(1, parseInt(repsI.value, 10) || e.reps);
            e.weight = Math.max(0, parseFloat(weightI.value) || 0);
            S.saveWorkouts(list); invalidateDraft();
          });
        });
        delB.addEventListener('click', () => {
          const list = S.getWorkouts();
          list[wi].exercises.splice(ei, 1);
          S.saveWorkouts(list); invalidateDraft();
          toast('Esercizio rimosso');
          render();
        });
        row.appendChild(nameI); row.appendChild(setsI); row.appendChild(repsI); row.appendChild(weightI); row.appendChild(delB);
        card.appendChild(row);
      });

      card.appendChild(el('button', {
        class: 'btn small ghost', type: 'button', text: '+ Aggiungi esercizio',
        onclick: () => {
          const list = S.getWorkouts();
          list[wi].exercises.push({ id: D.uid('ex'), name: 'Nuovo esercizio', sets: 3, reps: 10, weight: 0 });
          S.saveWorkouts(list); invalidateDraft();
          render();
        },
      }));
      view.appendChild(card);
    });

    view.appendChild(el('button', {
      class: 'btn ghost', type: 'button', text: '+ Aggiungi scheda',
      onclick: () => {
        const list = S.getWorkouts();
        list.push({ id: D.uid('w'), name: 'Nuova scheda', exercises: [] });
        S.saveWorkouts(list); invalidateDraft();
        render();
      },
    }));

    // dati: export / import / cancella
    view.appendChild(el('hr', { class: 'divider' }));
    view.appendChild(el('div', { class: 'section-title', text: 'Dati' }));

    view.appendChild(el('button', {
      class: 'btn big', type: 'button', text: 'Esporta dati (JSON)',
      onclick: () => {
        const blob = new Blob([S.exportJSON()], { type: 'application/json' });
        const a = el('a', { href: URL.createObjectURL(blob), download: 'gymlog-export-' + state.today + '.json' });
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        toast('Export completato');
      },
    }));

    const fileInput = el('input', { type: 'file', accept: 'application/json,.json', style: 'display:none' });
    fileInput.addEventListener('change', () => {
      const f = fileInput.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        const res = S.importJSON(String(reader.result));
        if (res.ok) { toast('Importati: ' + res.sessions + ' sessioni, ' + res.workouts + ' schede'); state.draft = null; state.draftWorkoutId = null; render(); }
        else toast('Import fallito: ' + res.error);
      };
      reader.readAsText(f);
      fileInput.value = '';
    });
    view.appendChild(fileInput);
    view.appendChild(el('button', {
      class: 'btn big mt', type: 'button', text: 'Importa da JSON',
      onclick: () => fileInput.click(),
    }));

    view.appendChild(el('div', { class: 'danger-zone' }, [
      el('button', {
        class: 'btn big danger', type: 'button', text: 'Cancella tutti i dati',
        onclick: () => {
          modal({
            title: 'Cancellare TUTTI i dati?',
            body: 'Sessioni, schede personalizzate e impostazioni verranno rimosse. L\'app tornerà allo stato iniziale.',
            buttons: [
              { label: 'Annulla', class: 'ghost' },
              { label: 'Cancella tutto', class: 'danger', onClick: () => {
                S.clearAll();
                state.draft = null; state.draftWorkoutId = null;
                toast('Dati cancellati');
                render();
              } },
            ],
          });
        },
      }),
    ]));
  }

  // --- Init ----------------------------------------------------------------------
  S.ensureSeed();
  render();
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => { /* offline non disponibile (es. file://) */ });
    });
  }
})();
