# GymLog — PWA per tracciare gli allenamenti in palestra

Progressive Web App vanilla (HTML/CSS/JS, zero dipendenze) pensata per iPhone:
la aggiungi alla home screen e la usi in standalone, 100% offline.
Interfaccia in italiano.

## Struttura dei file

```
progetto pale/
├── index.html                  # shell dell'app (header, view, tab bar, modal, toast)
├── manifest.json               # manifest PWA (standalone, icone, tema)
├── sw.js                       # service worker cache-first con precache completa
├── css/
│   └── style.css               # tema scuro elegante + light mode automatica, safe-area iOS
├── js/
│   ├── data.js                 # seed scheda iniziale, costanti (sensazioni, giorni), helper date
│   ├── store.js                # persistenza localStorage (chiavi gym.v1.*), CRUD, export/import JSON
│   ├── charts.js               # grafici a mano su <canvas> (linee e barre), niente librerie
│   └── app.js                  # router a hash (#/oggi, #/storico, #/statistiche, #/impostazioni) + viste
├── icons/                      # PNG generate: 32, 192, 512, maskable 512, apple-touch-icon 180
├── test/
│   └── run_tests.py            # suite di smoke test (Playwright) — NON viene publicada su Pages
├── .github/workflows/deploy.yml# deploy automatico su GitHub Pages (esclude test/ e documenti)
├── AGENT.md                    # regole di lavoro dell'agente
└── Prompt.md                   # specifica iniziale
```

## Come probarla in locale (Windows)

Il service worker funziona solo su `http(s)`, non su `file://`. Dalla cartella del progetto:

```powershell
cd "C:\Users\franc\Desktop\Progetti\progetto pale"
python -m http.server 8000
```

Poi apri `http://localhost:8000` nel browser. Per simulare l'iPhone: DevTools (F12) → toggle device toolbar → iPhone.

## Come eseguire i test automatici

I test vivono in `test/` e restano fuori dal deploy. Servono Python + Playwright:

```powershell
pip install playwright
python -m playwright install chromium
python test\run_tests.py
```

La suite avvia da sola un server locale e verifica: caricamento senza errori console,
salvataggio sessione e persistenza dopo reload, tap (+2,5 kg) vs long-press (incremento
configurabile), storico con eliminazione, 3 grafici non vuoti con 2+ sessioni, KPI,
roundtrip export/import JSON, service worker attivo e pagina offline dalla cache,
manifest e icone valide, nessun path assoluto, flusso completo delle 4 tab.

## Pubblicare su GitHub Pages (passo passo da Windows)

1. Crea un repository su GitHub (es. `gymlog`) e collegalo in locale:
   ```powershell
   cd "C:\Users\franc\Desktop\Progetti\progetto pale"
   git init
   git add .
   git commit -m "GymLog PWA"
   git branch -M main
   git remote add origin https://github.com/TUO-USERNAME/gymlog.git
   git push -u origin main
   ```
2. Il file `.github/workflows/deploy.yml` presente nel repo pubblica automaticamente
   su GitHub Pages a ogni push su `main`, copiando solo i file dell'app
   (`index.html`, `manifest.json`, `sw.js`, `css/`, `js/`, `icons/`) — la cartella
   `test/` e i file `.md` restano fuori dal sito.
3. Su GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. Dopo il primo push, l'app è online su `https://TUO-USERNAME.github.io/gymlog/`.

Non serve `npm`, non serve build: tutti i percorsi sono relativi (`./...`).

## Aggiungere l'app alla home di iPhone (da fare manualmente)

1. Apri `https://TUO-USERNAME.github.io/gymlog/` in Safari su iPhone.
2. Tocca il pulsante **Condividi** → **Aggiungi a Home**.
3. L'icona (apple-touch-icon) e il nome "GymLog" appariranno nella home screen.

## Verifiche manuali consigliate su iPhone reale

- **Offline reale**: dopo la prima apertura, attiva la modalità Aereo e riapri l'app
  dalla home screen: deve caricarsi completamente (service worker cache-first).
- **Standalone**: dall'icona in home non si vede la barra di Safari.
- **Notch/safe-area**: in verticale i contenuti non finiscono sotto il notch.
- **Tema**: l'app segue automaticamente chiaro/scuro di iOS.

## Modello dati (localStorage, chiavi versionate)

- `gym.v1.settings` — `{ weightIncrement: 2.5, unit: "kg" }`
- `gym.v1.workouts` — schede: `{ id, name, exercises: [{ id, name, sets, reps, weight }] }`
- `gym.v1.sessions` — sessioni: `{ id, date: "YYYY-MM-DD", ts, workoutId, workoutName,
  entries: [{ exerciseId, name, sets, weight, reps, feeling: 1-5 }] }`
  (una sessione per giorno: salvando di nuovo si modifica quella del giorno)

Esempio di export/import: `Impostazioni → Esporta dati (JSON)` produce
`gymlog-export-YYYY-MM-DD.json` con `{ app, version, exportedAt, settings, workouts, sessions }`.

## Scelte implementative

- **Scheda del giorno**: giorni di allenamento mar/gio/sab/dom; la proposta alterna
  la scheda rispetto all'ultima sessione registrata (Spinta ↔ Tirata+gambe), con
  fallback iniziale mar→Tirata+gambe, gio→Spinta, sab/dom→Tirata+gambe.
  negli altri giorni propone l'ultima scheda usata.
- **Peso**: tap su ± = 2,5 kg fissi; long-press (450 ms) = incremento configurabile
  in Impostazioni (default 2,5 kg).
- **Volume** di una sessione = Σ (serie × ripetizioni × peso) delle voci.
- **Grafici**: disegnati su `<canvas>` con gestione del devicePixelRatio.
- **Service worker**: precache di tutti i file in `gymlog-sw-v1`, cache-first,
  fallback offline sulla shell per le navigazioni.
