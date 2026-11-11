Costruisci una Progressive Web App (PWA) per tracciare i miei allenamenti in palestra, pensata SOLO per uso mobile su iPhone (la aggiungerò alla home screen e la aprirò in standalone). L'interfaccia è in italiano.  
  
## Contesto d'uso  
Ogni volta che arrivo in palestra apro l'app: vedo la scheda del giorno con, per ogni esercizio, i pesi dell'ULTIMA sessione, e registro a tap peso, ripetizioni e come mi sono sentito. A fine mese guardo i grafici dei progressi.  
  
## Vincoli tecnici (obbligatori)  
- Vanilla HTML, CSS e JavaScript: nessun framework, nessun build step, nessuna dipendenza esterna o CDN (deve funzionare 100% offline).  
- Progetto deployabile così com'è su GitHub Pages: tutti i percorsi relativi (niente path assoluti), cartella pronta senza npm/node.  
- Persistenza con localStorage, con chiavi versionate (es. "gym.v1.*") per facilitare migrazioni future.  
- Includi manifest.json, service worker (cache-first, precache di tutti i file) e apple-touch-icon PNG.  
- Grafici disegnati a mano con l'elemento <canvas>: niente librerie.  
  
## Modello dati  
- Scheda: lista di schede per giorno della settimana (es. "Push", "Pull", "Legs" o full body), ognuna con esercizi (id, nome, serie previste, ripetizioni previste).  
- Sessioni: { data ISO, giornoOra, scheda, voci: [{ esercizioId, peso, ripetizioni, sensazione }] }.  
- Sensazione: scala 1-5 (emoji, es. 😫 → 🤩).  
- Impostazioni: incremento peso predefinito (default 2,5 kg), unità kg.  
  
## Schermate e funzionalità  
1. **Home / Sessione di oggi**  
   - Rileva il giorno della settimana e propone la scheda corrispondente (se nessuna, l'ultima usata).  
   - Per ogni esercizio una card con: nome, serie x rip previste, peso e rip dell'ultima volta, selettori a tap: peso con bottoni ±2,5 kg (long-press = incremento configurabile), contatore ripetizioni +1/reset, selettore sensazione 1-5.  
   - Bottone "Salva sessione": salva tutto in localStorage, mostra conferma breve.  
   - Se è già stata registrata una sessione oggi, mostrala con possibilità di modificarla.  
2. **Storico**: elenco sessioni passate, tap per vedere i dettagli, possibilità di eliminare una sessione con conferma.  
3. **Statistiche mensili**: mese navigabile (freccia precedente/successiva) con:  
   - Grafico a linee: peso per esercizio scelto (selettore esercizi) nel tempo.  
   - Grafico a barre: volume totale per sessione (serie x rip x peso).  
   - Grafico a linee: sensazione media nel tempo.  
   - Numeri chiave: sessioni totali, volume totale, miglioramento % sul peso principale.  
4. **Impostazioni**: modifica della scheda (aggiungi/rimuovi esercizi e giorni), incremento peso predefinito, esporta dati in JSON (download file), importa da JSON, cancella tutti i dati (con conferma).  
  
## La mia scheda di partenza  
Usa questa scheda iniziale (poi sarà modificabile dall'app):  
#   
3 giorni a settimana: alternando spinta e tirata  
Tutto 3x10 tranne polpacci e addominali 3x15  
  
Spinta  
  
Chest press 30  
Peck fly 25   
Shoulder press 40  
Macchina trapezi 20  
Tric press 50  
Corde Tric 35  
Addominal crunch   
Addominali alla sbarra  
  
Tirata+gambe  
  
Lat larga 45 provata una da 50  
Rematore 40  
Arm curl gomiti avanti 20  
Macchina curl normali con gomiti appoggiati 20  
Manubrio 16  
Leg press 110  
Leg extension 35-40  
Leg curl 45  
  
## UX e qualità  
- Mobile-first, target touch: bottoni grandi (min 44px), niente hover-only, safe-area iOS rispettata (notch), supporto dark mode automatico, tema scuro elegante.  
- Niente scroll orizzontale, font di sistema, feedback visivo su ogni tap.  
- Zero errori in console; test mentale del flusso completo: prima apertura → registrazione sessione → riapertura → storico → statistiche.  
- Codice leggibile e commentato dove serve, pronto a essere esteso.  
  
## Deliverable  
- File completi (index.html, manifest.json, service worker, icone, CSS/JS separati).  
- README.md in italiano con: struttura dei file, come testare in locale, come pubblicare su GitHub Pages passo passo da Windows.  
Fammi domande se qualcosa è ambiguo PRIMA di scrivere il codice.  
