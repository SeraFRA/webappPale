#!/usr/bin/env python3
"""Suite di smoke test per GymLog (Playwright + Chromium headless).

Uso:  python3 test/run_tests.py
Avvia un server HTTP locale (porta 8765) e verifica:
 caricamento senza errori console e senza scroll orizzontale, salvataggio sessione
 con dati per serie, bottoni +/- (2,5 kg) e peso da tastiera, persistenza dopo
 reload, migrazione del vecchio formato, storico (dettaglio per serie, elimina),
 grafici non vuoti con 2+ sessioni, roundtrip export/import, service worker +
 offline, manifest/icone/percorsi relativi, flusso completo tab, impostazioni.

Richiede: pip install playwright && python3 -m playwright install chromium
La cartella /test non fa parte del deploy su GitHub Pages.
"""
import json
import os
import re
import subprocess
import sys
import time
import urllib.request

from playwright.sync_api import sync_playwright

PROJ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8765
BASE = f"http://127.0.0.1:{PORT}"

server = None
failures = []
console_errors = []


def start_server():
    global server
    server = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(PORT), "--bind", "127.0.0.1", "--directory", PROJ],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    for _ in range(50):
        try:
            urllib.request.urlopen(BASE + "/index.html", timeout=1)
            return
        except Exception:
            time.sleep(0.2)
    raise RuntimeError("server locale non avviato")


def stop_server():
    if server:
        server.terminate()
        server.wait(timeout=5)


def check(name, cond, detail=""):
    status = "PASS" if cond else "FAIL"
    print(f"[{status}] {name}" + (f"  -- {detail}" if detail and not cond else ""))
    if not cond:
        failures.append(f"{name}: {detail}")


def new_page(browser):
    ctx = browser.new_context(viewport={"width": 390, "height": 844})
    page = ctx.new_page()
    page.on("console", lambda m: console_errors.append(f"{page.url}: {m.text}") if m.type == "error" else None)
    page.on("pageerror", lambda e: console_errors.append(f"{page.url}: pageerror {e}"))
    return ctx, page


def main():
    start_server()
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()

            # ---- Test 1: caricamento pulito --------------------------------
            ctx, page = new_page(browser)
            page.goto(BASE + "/index.html", wait_until="load")
            page.wait_for_selector("#tabbar .tab")
            check("T1 titolo", page.title() == "GymLog — Allenamenti", page.title())
            check("T1 4 tab", page.locator("#tabbar .tab").count() == 4)
            check("T1 home mostra esercizi", page.locator(".exercise").count() >= 8,
                  f"count={page.locator('.exercise').count()}")
            check("T1 serie per esercizio", page.locator(".serie").count() >= 24,
                  f"count={page.locator('.serie').count()}")
            check("T1 input peso per serie", page.locator(".w-input").count() == page.locator(".serie").count())
            check("T1 bottone salva", page.locator("button.btn.primary", has_text="Salva").count() >= 1)
            check("T1 niente scroll orizzontale",
                  page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"))

            # ---- Test 2: bottoni +/- (2,5 kg), fatica e salvataggio ---------
            first = page.locator(".exercise").first
            w0 = first.locator(".serie").first.locator(".w-input")
            b0 = float(w0.input_value())
            plus = first.locator(".serie").first.locator(".row-peso .btn.step").nth(1)
            plus.click()
            check("T2 tap + aumenta di 2,5", float(w0.input_value()) - b0 == 2.5, f"{b0} -> {w0.input_value()}")
            minus = first.locator(".serie").first.locator(".row-peso .btn.step").nth(0)
            minus.click()
            check("T2 tap meno torna indietro di 2,5", float(w0.input_value()) == b0, w0.input_value())
            # fatica 5 sulla prima serie
            page.locator(".exercise").first.locator(".serie").first.locator(".feel").nth(4).click()
            check("T2 fatica selezionata",
                  "selected" in (page.locator(".exercise").first.locator(".serie").first
                                 .locator(".feel").nth(4).get_attribute("class") or ""))
            page.locator("button.btn.primary", has_text="Salva sessione").click()
            page.wait_for_selector(".toast.show", timeout=3000)
            check("T2 toast salvataggio", "salvata" in page.locator("#toast").inner_text().lower())

            # ---- Test 3: persistenza dopo reload ---------------------------
            page.reload(wait_until="load")
            page.wait_for_selector(".exercise")
            check("T3 sessione di oggi ancora lì", "già registrata" in page.locator("#view").inner_text().lower())
            check("T3 serie ripopolate", page.locator(".serie").count() >= 24)
            stored = page.evaluate("GymStore.getSessionByDate(GymData.dateStr(new Date()))")
            s0 = stored["entries"][0]["series"][0] if stored else {}
            check("T3 formato per-serie salvato",
                  stored and len(stored["entries"][0]["series"]) == 3
                  and abs(s0.get("weight", -99) - b0) < 0.01 and s0.get("feeling") == 5
                  and s0.get("reps") == 10,
                  json.dumps(s0))

            # ---- Test 4: peso scritto da tastiera ---------------------------
            winput = page.locator(".exercise").first.locator(".serie").first.locator(".w-input")
            winput.fill("42.5")
            winput.dispatch_event("change")
            rinput = page.locator(".exercise").first.locator(".serie").first.locator(".r-input")
            rinput.fill("12")
            rinput.dispatch_event("change")
            page.locator("button.btn.primary", has_text="Salva modifiche").click()
            page.wait_for_timeout(300)
            stored = page.evaluate("GymStore.getSessionByDate(GymData.dateStr(new Date()))")
            s0 = stored["entries"][0]["series"][0]
            check("T4 peso da tastiera salvato", s0["weight"] == 42.5 and s0["reps"] == 12, str(s0))

            # ---- Test 5: storico, dettaglio per serie, elimina ---------------
            page.goto(BASE + "/index.html#/storico", wait_until="load")
            page.wait_for_selector(".session-row")
            check("T5 storico ha 1 sessione", page.locator(".session-row").count() == 1)
            page.locator(".session-row").first.click()
            page.wait_for_selector(".detail-ex")
            check("T5 dettaglio mostra le serie", page.locator(".detail-serie").count() == 24,
                  f"count={page.locator('.detail-serie').count()}")
            page.locator("button.btn.danger", has_text="Elimina sessione").click()
            page.wait_for_selector("#modal-backdrop:not(.hidden)")
            page.locator("#modal button.btn.danger").click()
            page.wait_for_selector(".empty-state", timeout=3000)
            check("T5 sessione eliminata", page.locator(".session-row").count() == 0)

            # ---- Test 5b: migrazione vecchio formato "piatto" -----------------
            page.evaluate("""() => {
                const m = GymData.monthStr(new Date());
                GymStore.upsertSession({
                    id: 'old-mig', date: m + '-02', ts: 1,
                    workoutId: 'w-push', workoutName: 'Spinta',
                    entries: [{ exerciseId: 'ex-chest-press', name: 'Chest press',
                                sets: 3, weight: 40, reps: 10, feeling: 2 }],
                });
            }""")
            norm = page.evaluate("""() => {
                const s = GymStore.getSessions().find(x => x.id === 'old-mig');
                return { n: s.entries[0].series.length, w: s.entries[0].series[1].weight,
                         f: s.entries[0].series[1].feeling, vol: GymData.sessionVolume(s) };
            }""")
            check("T5b migrazione in 3 serie", norm["n"] == 3 and norm["w"] == 40 and norm["f"] == 2, str(norm))
            check("T5b volume migrato = 3x40x10", norm["vol"] == 1200, str(norm))
            page.goto(BASE + "/index.html#/storico/old-mig", wait_until="load")
            page.wait_for_selector(".detail-serie")
            check("T5b dettaglio mostra serie migrate", page.locator(".detail-serie").count() == 3)

            # ---- Test 6: 2+ sessioni in date diverse -> grafici non vuoti ----
            today = page.evaluate("GymData.dateStr(new Date())")
            y, m = today[:4], today[5:7]
            page.evaluate("""([y, m]) => {
                const mk = (day, w) => GymStore.upsertSession({
                    id: 't-' + day, date: `${y}-${m}-${day}`, ts: Date.now(),
                    workoutId: 'w-push', workoutName: 'Spinta',
                    entries: [
                        { exerciseId: 'ex-chest-press', name: 'Chest press', sets: 3,
                          series: [{weight: w, reps: 10, feeling: 4}, {weight: w, reps: 10, feeling: 4},
                                   {weight: w, reps: 10, feeling: 4}] },
                        { exerciseId: 'ex-peck-fly', name: 'Peck fly', sets: 3,
                          series: [{weight: 25, reps: 10, feeling: 3}, {weight: 25, reps: 10, feeling: 3}] },
                    ]});
                mk('03', 30); mk('12', 35); mk('20', 37.5);
            }""", [y, m])
            page.goto(BASE + "/index.html#/statistiche", wait_until="load")
            page.wait_for_selector(".chart-card canvas")
            page.wait_for_timeout(400)
            n = page.locator(".chart-card canvas").count()
            check("T6 tre grafici presenti", n == 3, f"n={n}")
            inks = [page.evaluate(
                """(i) => { const cs = document.querySelectorAll('.chart-card canvas');
                    const c = cs[i]; if (!c) return -1;
                    const d = c.getContext('2d').getImageData(0,0,c.width,c.height).data;
                    let k = 0; for (let j = 3; j < d.length; j += 4) if (d[j] > 0) k++; return k; }""", i)
                for i in range(n)]
            check("T6 grafici non vuoti", all(k > 500 for k in inks), f"inks={inks}")
            kpi_vals = page.locator(".kpi .kpi-val").all_inner_texts()
            check("T6 KPI sessioni (4 nel mese)", len(kpi_vals) == 3 and kpi_vals[0] == "4", str(kpi_vals))
            check("T6 KPI volume", "kg" in kpi_vals[1], str(kpi_vals))
            check("T6 KPI miglioramento %", "%" in kpi_vals[2], str(kpi_vals))
            page.locator(".month-nav .btn").first.click()  # mese precedente: vuoto
            page.wait_for_timeout(300)
            check("T6 mese vuoto gestito", page.locator(".chart-empty").count() >= 1)
            page.locator(".month-nav .btn").nth(1).click()

            # ---- Test 7: roundtrip export/import ---------------------------
            exported = page.evaluate("GymStore.exportJSON()")
            n_sessions = page.evaluate("GymStore.getSessions().length")
            page.evaluate("localStorage.clear()")
            page.reload(wait_until="load")
            page.wait_for_selector("#tabbar .tab")
            check("T7 dopo clear: storico vuoto", page.evaluate("GymStore.getSessions().length") == 0)
            res = page.evaluate("(t) => GymStore.importJSON(t)", exported)
            check("T7 import ok", res.get("ok") is True, str(res))
            re_exported = page.evaluate("GymStore.exportJSON()")
            a = json.loads(exported); b = json.loads(re_exported)
            check("T7 roundtrip dati identici",
                  a["sessions"] == b["sessions"] and a["workouts"] == b["workouts"] and n_sessions == len(b["sessions"]))

            # ---- Test 8: service worker + offline ---------------------------
            page.reload(wait_until="load")
            page.wait_for_function("navigator.serviceWorker && !!navigator.serviceWorker.controller", timeout=8000)
            check("T8 service worker attivo", True)
            ctx.set_offline(True)
            page.goto(BASE + "/index.html", wait_until="load")
            page.wait_for_selector(".exercise", timeout=8000)
            check("T8 pagina offline dalla cache (home + serie)",
                  "GymLog" in page.title() and page.locator(".serie").count() >= 24, page.title())
            page.goto(BASE + "/index.html#/storico", wait_until="load")
            page.wait_for_selector(".session-row")
            check("T8 storico offline con dati", page.locator(".session-row").count() == n_sessions)
            ctx.set_offline(False)

            # ---- Test 9: manifest e percorsi relativi -----------------------
            man = json.loads(urllib.request.urlopen(BASE + "/manifest.json").read())
            check("T9 manifest valido", man["display"] == "standalone" and man["start_url"] == "./index.html")
            for icon in man["icons"]:
                code = urllib.request.urlopen(BASE + "/" + icon["src"].lstrip("./")).getcode()
                check(f"T9 icona {icon['src']} esiste", code == 200)
            html = urllib.request.urlopen(BASE + "/index.html").read().decode()
            refs = re.findall(r'(?:src|href)="([^"]+)"', html)
            bad = [r for r in refs if r.startswith("/") or r.startswith("http")]
            check("T9 nessun path assoluto in index.html", not bad, str(bad))
            sw = urllib.request.urlopen(BASE + "/sw.js").read().decode()
            missing = [a for a in re.findall(r"'\./([^']+)'", sw)
                       if urllib.request.urlopen(BASE + "/" + a).getcode() != 200]
            check("T9 precache sw: tutti i file esistono", not missing, str(missing))

            # ---- Test 10: flusso completo tab -------------------------------
            for route, marker in [("#/oggi", ".exercise"), ("#/storico", ".session-row"),
                                  ("#/statistiche", ".chart-card"), ("#/impostazioni", ".workout-edit")]:
                page.goto(BASE + "/index.html" + route, wait_until="load")
                page.wait_for_selector(marker, timeout=5000)
                check(f"T10 tab {route}", True)

            # ---- Test 11: impostazioni --------------------------------------
            page.goto(BASE + "/index.html#/impostazioni", wait_until="load")
            page.wait_for_selector(".workout-edit")
            check("T11 niente campo incremento (long-press rimosso)",
                  "Incremento" not in page.locator("#view").inner_text())
            check("T11 export/import/cancella presenti",
                  page.locator("button", has_text="Esporta dati").count() == 1 and
                  page.locator("button", has_text="Importa da JSON").count() == 1 and
                  page.locator("button", has_text="Cancella tutti i dati").count() == 1)
            n_ex = page.locator(".workout-edit").first.locator(".ex-edit").count()
            page.locator(".workout-edit").first.locator("button", has_text="+ Aggiungi esercizio").click()
            page.wait_for_selector(".workout-edit")
            check("T11 aggiungi esercizio",
                  page.locator(".workout-edit").first.locator(".ex-edit").count() == n_ex + 1)
            # il nuovo esercizio appare in home (la bozza deve rileggere la scheda)
            page.goto(BASE + "/index.html#/oggi", wait_until="load")
            page.wait_for_selector(".exercise")
            check("T11 nuovo esercizio visibile in home",
                  page.locator(".exercise", has_text="Nuovo esercizio").count() == 1,
                  f"n={page.locator('.exercise').count()}")
            ctx.close()
            browser.close()
    finally:
        stop_server()

    print()
    if console_errors:
        print("Errori console raccolti:")
        for e in console_errors:
            print("  -", e)
    check("Console senza errori", not console_errors, f"{len(console_errors)} errori")

    print()
    if failures:
        print(f"RISULTATO: {len(failures)} FAIL")
        for f in failures:
            print("  -", f)
        sys.exit(1)
    print("RISULTATO: TUTTI I TEST PASSATI")


if __name__ == "__main__":
    main()
