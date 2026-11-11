/* app.js — router e schermate dell'app (Oggi, Storico, Statistiche, Impostazioni). */
(function () {
  'use strict';

  const D = window.GymData;
  const S = window.GymStore;
  const C = window.GymCharts;

  const state = {
    today: D.dateStr(new Date()),
    draft: null,          // bozza della sessione di oggi (array voci)
    draftWorkoutId: null, // scheda scelta per oggi
    statMonth: D.monthStr(new Date()),
    statExerciseId: null,
    detailId: null,
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
  function buildDraft(workoutId) {
    const workout = S.getWorkout(workoutId);
    const todaySession = S.getSessionByDate(state.today);
    return workout.exercises.map((ex) => {
      let weight = ex.weight, reps = ex.reps, feeling = 3;
      if (todaySession) {
        const e = todaySession.entries.find((x) => x.exerciseId === ex.id);
        if (e) { weight = e.weight; reps = e.reps; feeling = e.feeling; }
      } else {
        const last = S.lastEntryFor(ex.id, state.today);
        if (last) { weight = last.weight; reps = last.reps; feeling = last.feeling; }
      }
      return { exerciseId: ex.id, name: ex.name, sets: ex.sets, weight, reps, feeling };
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

    // card esercizi
    state.draft.forEach((entry, i) => {
      const ex = workout.exercises.find((e) => e.id === entry.exerciseId);
      const last = todaySession ? null : S.lastEntryFor(entry.exerciseId, state.today);
      const card = el('div', { class: 'card exercise' });

      const head = el('div', { class: 'ex-head' }, [
        el('span', { class: 'ex-name', text: entry.name }),
        el('span', { class: 'ex-planned', text: (ex ? ex.sets : entry.sets) + ' x ' + (ex ? ex.reps : entry.reps) + ' prev.' }),
      ]);
      card.appendChild(head);
      card.appendChild(el('div', {
        class: 'ex-last',
        text: todaySession ? 'Valori di oggi (modificabili)' : (last ? 'Ultima volta: ' + last.weight + ' kg x ' + last.reps : 'Nessuna registrazione precedente'),
      }));

      // stepper peso
      card.appendChild(stepperRow('Peso (kg)', entry.weight, (v) => { entry.weight = v; }, 'kg'));
      // stepper ripetizioni
      card.appendChild(stepperRow('Ripetizioni', entry.reps, (v) => { entry.reps = v; }, '', true));
      //感觉
      const feels = el('div', { class: 'feelings' });
      D.FEELINGS.forEach((f) => {
        feels.appendChild(el('button', {
          class: 'feel' + (entry.feeling === f.value ? ' selected' : ''),
          type: 'button',
          title: f.label,
          text: f.emoji,
          onclick: () => { entry.feeling = f.value; render(); },
        }));
      });
      card.appendChild(el('div', { class: 'stepper-row' }, [el('span', { class: 'lbl', text: 'Sensazione' }), feels]));

      view.appendChild(card);
    });

    // salva
    const saveBtn = el('button', {
      class: 'btn primary big',
      type: 'button',
      text: todaySession ? 'Salva modifiche' : 'Salva sessione',
      onclick: saveToday,
    });
    view.appendChild(saveBtn);
  }

  // Riga stepper con tap (passo fisso 2,5) e long-press (passo configurabile)
  function stepperRow(label, value, onChange, suffix, isReps) {
    const valEl = el('span', { class: 'val', text: value + (suffix ? ' ' + suffix : '') });
    function apply(delta, longPress) {
      const settings = S.getSettings();
      let step;
      if (isReps) step = 1;
      else step = longPress ? (settings.weightIncrement || D.FIXED_STEP) : D.FIXED_STEP;
      let v = Number(value) + delta * step;
      if (isReps) v = Math.round(v);
      v = Math.max(0, v);
      if (!isReps) v = Math.round(v * 100) / 100;
      onChange(v);
      valEl.textContent = v + (suffix ? ' ' + suffix : '');
    }
    function stepBtn(sign) {
      const b = el('button', { class: 'btn', type: 'button', text: sign > 0 ? '+' : '−', 'aria-label': (sign > 0 ? 'Aumenta ' : 'Diminuisci ') + label });
      let timer = null, fired = false;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        fired = false;
        timer = setTimeout(() => { fired = true; apply(sign, true); }, 450);
      });
      const end = () => { clearTimeout(timer); if (!fired) apply(sign, false); };
      b.addEventListener('pointerup', end);
      b.addEventListener('pointercancel', () => { clearTimeout(timer); });
      b.addEventListener('pointerleave', () => { clearTimeout(timer); });
      b.addEventListener('contextmenu', (e) => e.preventDefault());
      return b;
    }
    const row = el('div', { class: 'stepper-row' }, [
      el('span', { class: 'lbl', text: label }),
      el('div', { class: 'stepper' }, [stepBtn(-1), valEl, stepBtn(1)]),
    ]);
    if (isReps) {
      const reset = el('button', { class: 'btn small ghost', type: 'button', text: 'reset', onclick: () => { onChange(0); valEl.textContent = '0'; } });
      row.appendChild(reset);
    }
    return row;
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
        exerciseId: e.exerciseId, name: e.name, sets: e.sets,
        weight: Number(e.weight) || 0, reps: Number(e.reps) || 0, feeling: e.feeling,
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
    // raggruppa per mese
    const byMonth = new Map();
    sessions.forEach((s) => {
      const m = s.date.slice(0, 7);
      if (!byMonth.has(m)) byMonth.set(m, []);
      byMonth.get(m).push(s);
    });
    for (const [m, list] of byMonth) {
      view.appendChild(el('div', { class: 'section-title', text: D.monthLabel(m) }));
      list.forEach((s) => {
        const row = el('button', {
          class: 'session-row', type: 'button',
          onclick: () => { location.hash = '#/storico/' + s.id; },
        }, [
          el('span', { class: 's-date', text: D.formatDateIt(s.date) }),
          el('span', { class: 's-info', text: s.workoutName + ' — ' + s.entries.length + ' esercizi' }),
          el('span', { class: 's-vol', text: Math.round(D.sessionVolume(s)).toLocaleString('it-IT') + ' kg' }),
        ]);
        view.appendChild(row);
      });
    }
  }

  function renderHistoryDetail(view, id) {
    const s = S.getSessions().find((x) => x.id === id);
    if (!s) { location.hash = '#/storico'; return; }
    setHeader('Dettaglio sessione', D.formatDateIt(s.date) + ' — ' + s.workoutName);

    view.appendChild(el('button', { class: 'btn ghost', type: 'button', text: '← Torna allo storico', onclick: () => { location.hash = '#/storico'; } }));

    const card = el('div', { class: 'card mt' });
    const table = el('table', { class: 'detail-table' });
    table.appendChild(el('tr', {}, [
      el('th', { text: 'Esercizio' }), el('th', { text: 'Serie' }), el('th', { text: 'Peso' }), el('th', { text: 'Rip' }), el('th', { text: '' }),
    ]));
    s.entries.forEach((e) => {
      const f = D.FEELINGS.find((x) => x.value === e.feeling);
      table.appendChild(el('tr', {}, [
        el('td', { text: e.name }),
        el('td', { text: String(e.sets) + 'x' + e.reps }),
        el('td', { text: e.weight + ' kg' }),
        el('td', { text: String(e.reps) }),
        el('td', { text: f ? f.emoji : '' }),
      ]));
    });
    card.appendChild(table);
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

    // controlli mese
    const monthLabel = el('span', { class: 'month-label', text: D.monthLabel(month) });
    const nav = el('div', { class: 'month-nav' }, [
      navBtn('‹', () => { state.statMonth = D.shiftMonth(month, -1); render(); }),
      monthLabel,
      navBtn('›', () => { state.statMonth = D.shiftMonth(month, 1); render(); }),
    ]);
    view.appendChild(el('div', { class: 'stat-controls' }, [nav]));

    // selettore esercizio per il grafico peso
    const exOptions = allExerciseOptions();
    if (!state.statExerciseId || !exOptions.find((e) => e.id === state.statExerciseId)) {
      // default: esercizio più frequente nel mese, altrimenti il primo
      const count = new Map();
      sessions.forEach((s) => s.entries.forEach((e) => count.set(e.exerciseId, (count.get(e.exerciseId) || 0) + 1)));
      let best = null, bestN = -1;
      count.forEach((n, id) => { if (n > bestN) { bestN = n; best = id; } });
      state.statExerciseId = best || (exOptions[0] && exOptions[0].id) || null;
    }
    const selWrap = el('div', { class: 'card' }, []);
    selWrap.appendChild(el('div', { class: 'sub', text: 'Esercizio per il grafico del peso:' }));
    const sel = el('select', { 'aria-label': 'Esercizio' });
    exOptions.forEach((e) => sel.appendChild(el('option', { value: e.id, text: e.name, ...(e.id === state.statExerciseId ? { selected: '' } : {}) })));
    sel.addEventListener('change', () => { state.statExerciseId = sel.value; render(); });
    selWrap.appendChild(sel);
    view.appendChild(selWrap);

    // KPI
    const totalVolume = sessions.reduce((a, s) => a + D.sessionVolume(s), 0);
    const kpiGrid = el('div', { class: 'kpi-grid' }, [
      kpi(String(sessions.length), 'Sessioni'),
      kpi(Math.round(totalVolume).toLocaleString('it-IT') + ' kg', 'Volume totale'),
      kpi(improvementPct(sessions), 'Peso principale'),
    ]);
    view.appendChild(kpiGrid);

    // grafico 1: peso nel tempo (linee)
    view.appendChild(chartCard('Peso nel tempo — ' + ((exOptions.find((e) => e.id === state.statExerciseId) || {}).name || ''), (canvas) => {
      const pts = [];
      sessions.forEach((s) => {
        const e = s.entries.find((x) => x.exerciseId === state.statExerciseId);
        if (e) pts.push({ label: s.date.slice(8), value: e.weight });
      });
      return C.drawLine(canvas, pts, { color: '#4f8cff' });
    }));

    // grafico 2: volume per sessione (barre)
    view.appendChild(chartCard('Volume per sessione (serie x rip x peso)', (canvas) => {
      const bars = sessions.map((s) => ({ label: s.date.slice(8), value: D.sessionVolume(s) }));
      return C.drawBar(canvas, bars, { color: '#35d07f' });
    }));

    // grafico 3:感觉 media nel tempo (linee)
    view.appendChild(chartCard('Sensazione media (1-5)', (canvas) => {
      const pts = sessions.map((s) => {
        const avg = s.entries.length ? s.entries.reduce((a, e) => a + e.feeling, 0) / s.entries.length : 0;
        return { label: s.date.slice(8), value: avg };
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
    // disegna dopo che il canvas è in DOM (serve clientWidth)
    requestAnimationFrame(() => {
      const ok = drawFn(canvas);
      if (!ok) {
        const empty = el('div', { class: 'chart-empty', text: 'Nessun dato per questo mese' });
        card.appendChild(empty);
        canvas.style.display = 'none';
      }
    });
    return card;
  }

  // Esercizio "principale": più frequente nel mese; improvement = (ultimo - primo)/primo
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
      if (e) pts.push(e.weight);
    });
    if (pts.length < 2 || pts[0] === 0) return '—';
    const pct = ((pts[pts.length - 1] - pts[0]) / pts[0]) * 100;
    return (pct >= 0 ? '+' : '') + pct.toFixed(1).replace('.', ',') + '%';
  }

  // --- Impostazioni --------------------------------------------------------------
  function renderSettings(view) {
    setHeader('Impostazioni', 'Schede, preferenze e dati');

    // incremento peso
    const settings = S.getSettings();
    const incInput = el('input', { type: 'number', min: '0.5', step: '0.5', value: String(settings.weightIncrement), 'aria-label': 'Incremento peso (long-press)' });
    incInput.addEventListener('change', () => {
      const v = parseFloat(incInput.value);
      if (v > 0) { S.updateSettings({ weightIncrement: v }); toast('Incremento salvato: ' + v + ' kg'); }
    });
    view.appendChild(el('div', { class: 'card' }, [
      el('div', { class: 'sub', text: 'Incremento peso per il long-press sui bottoni ± (il tap breve resta 2,5 kg):' }),
      el('div', { class: 'set-row' }, [el('label', { text: 'Incremento (kg)' }), incInput]),
    ]));

    // schede
    view.appendChild(el('div', { class: 'section-title', text: 'Le mie schede' }));
    S.getWorkouts().forEach((w, wi) => {
      const card = el('div', { class: 'card workout-edit' });
      const nameInput = el('input', { type: 'text', class: 'w-name', value: w.name, 'aria-label': 'Nome scheda' });
      nameInput.addEventListener('change', () => {
        const list = S.getWorkouts();
        list[wi].name = nameInput.value.trim() || w.name;
        S.saveWorkouts(list);
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
                  const list = S.getWorkouts().filter((x) => x.id !== w.id);
                  S.saveWorkouts(list);
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
            S.saveWorkouts(list);
          });
        });
        delB.addEventListener('click', () => {
          const list = S.getWorkouts();
          list[wi].exercises.splice(ei, 1);
          S.saveWorkouts(list);
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
          S.saveWorkouts(list);
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
        S.saveWorkouts(list);
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
