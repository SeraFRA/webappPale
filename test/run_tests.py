#!/usr/bin/env python3
"""Suite di smoke test per GymLog (Playwright + Chromium headless).

Uso:  python3 test/run_tests.py
Avvia un server HTTP locale (porta 8765) e verifica:
 caricamento senza errori console, salvataggio sessione, persistenza dopo
 reload, storico (elimina), grafici non vuoti con 2+ sessioni, roundtrip
 export/import, service worker + offline, manifest/icone, flusso tab,
 long-press vs tap sul peso.

Richiede: pip install playwright && python3 -m playwright install chromium
La cartella /test non fa parte del deploy su GitHub Pages.
"""
import json
import os
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


def new_page(browser, ctx_options=None):
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, **(ctx_options or {}))
    page = ctx.new_page()
    page.on("console", lambda m: console_errors.append(f"{page.url}: {m.text}") if m.type == "error" else None)
    page.on("pageerror", lambda e: console_errors.append(f"{page.url}: pageerror {e}"))
    return ctx, page


def canvas_has_ink(page, canvas_sel):
    return page.evaluate(
        """(sel) => {
            const c = document.querySelector(sel);
            if (!c) return -1;
            const ctx = c.getContext('2d');
            const d = ctx.getImageData(0, 0, c.width, c.height).data;
            let n = 0;
            for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
            return n;
        }""", canvas_sel)


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
            check("T1 bottone salva", page.locator("button.btn.primary", has_text="Salva").count() >= 1)

            # ---- Test 2: tap +/- peso (passo fisso 2,5) e salva sessione ---
            first_val = page.locator(".exercise").first.locator(".stepper .val").first
            before = first_val.inner_text()
            plus = page.locator(".exercise").first.locator(".stepper .btn").nth(1)
            plus.click()
            after = first_val.inner_text()
            check("T2 tap + aumenta di 2,5", float(after.split()[0]) - float(before.split()[0]) == 2.5,
                  f"{before} -> {after}")
            #感觉 5 sulla prima card
            page.locator(".exercise").first.locator(".feel").nth(4).click()
            page.locator("button.btn.primary", has_text="Salva sessione").click()
            page.wait_for_selector(".toast.show", timeout=3000)
            toast_txt = page.locator("#toast").inner_text()
            check("T2 toast salvataggio", "salvata" in toast_txt.lower(), toast_txt)

            # ---- Test 3: persistenza dopo reload ---------------------------
            page.reload(wait_until="load")
            page.wait_for_selector(".exercise")
            check("T3 sessione di oggi ancora lì", "già registrata" in page.locator("#view").inner_text().lower())
            check("T3 bottone diventa Salva modifiche", page.locator("button.btn.primary", has_text="Salva modifiche").count() == 1)

            # ---- Test 4: long-press usa incremento configurabile -----------
            page.evaluate("GymStore.updateSettings({weightIncrement: 5})")
            page.reload(wait_until="load")
            page.wait_for_selector(".exercise")
            v = page.locator(".exercise").first.locator(".stepper .val").first
            b0 = float(v.inner_text().split()[0])
            box = page.locator(".exercise").first.locator(".stepper .btn").nth(1).bounding_box()
            page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
            page.mouse.down()
            page.wait_for_timeout(650)
            page.mouse.up()
            b1 = float(v.inner_text().split()[0])
            check("T4 long-press +5 (configurabile)", b1 - b0 == 5, f"{b0} -> {b1}")
            page.evaluate("GymStore.updateSettings({weightIncrement: 2.5})")

            # ---- Test 5: storico + dettaglio + elimina ----------------------
            page.goto(BASE + "/index.html#/storico", wait_until="load")
            page.wait_for_selector(".session-row")
            check("T5 storico ha 1 sessione", page.locator(".session-row").count() == 1)
            page.locator(".session-row").first.click()
            page.wait_for_selector(".detail-table")
            check("T5 dettaglio mostra tabella", page.locator(".detail-table td").count() >= 8)
            page.locator("button.btn.danger", has_text="Elimina sessione").click()
            page.wait_for_selector("#modal-backdrop:not(.hidden)")
            page.locator("#modal button.btn.danger").click()
            page.wait_for_selector(".empty-state", timeout=3000)
            check("T5 sessione eliminata", page.locator(".session-row").count() == 0)

            # ---- Test 6: 2+ sessioni in date diverse -> grafici non vuoti --
            today = page.evaluate("GymData.dateStr(new Date())")
            y, m = today[:4], today[5:7]
            page.evaluate(
                """([y, m]) => {
                    const mk = (day, w) => GymStore.upsertSession({
                        id: 't-' + day, date: `${y}-${m}-${day}`, ts: Date.now(),
                        workoutId: 'w-push', workoutName: 'Spinta',
                        entries: [
                            {exerciseId:'ex-chest-press', name:'Chest press', sets:3, weight:w, reps:10, feeling:4},
                            {exerciseId:'ex-peck-fly', name:'Peck fly', sets:3, weight:25, reps:10, feeling:3},
                        ]});
                    mk('03', 30); mk('12', 35); mk('20', 37.5);
                }""", [y, m])
            page.goto(BASE + "/index.html#/statistiche", wait_until="load")
            page.wait_for_selector(".chart-card canvas")
            page.wait_for_timeout(400)  # lascia disegnare i canvas
            canvases = page.locator(".chart-card canvas")
            n = canvases.count()
            check("T6 tre grafici presenti", n == 3, f"n={n}")
            inks = [canvas_has_ink(page, f".chart-card:nth-of-type({i}) canvas") for i in range(1, n + 1)]
            # i chart-card sono dentro #view; uso selettore più robusto:
            inks = [page.evaluate(
                """(i) => { const cs = document.querySelectorAll('.chart-card canvas');
                    const c = cs[i]; if (!c) return -1;
                    const d = c.getContext('2d').getImageData(0,0,c.width,c.height).data;
                    let k=0; for (let j=3;j<d.length;j+=4) if (d[j]>0) k++; return k; }""", i)
                for i in range(n)]
            check("T6 grafici non vuoti", all(k > 500 for k in inks), f"inks={inks}")
            kpi_vals = page.locator(".kpi .kpi-val").all_inner_texts()
            check("T6 KPI presenti", len(kpi_vals) == 3 and kpi_vals[0] == "3", str(kpi_vals))
            check("T6 miglioramento %", "%" in kpi_vals[2], str(kpi_vals))
            # naviga mese precedente (vuoto -> stati vuoti gestiti)
            page.locator(".month-nav .btn").first.click()
            page.wait_for_timeout(300)
            check("T6 mese vuoto gestito", page.locator(".chart-empty").count() >= 1)
            page.locator(".month-nav .btn").nth(1).click()  # torna al mese corrente

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
            check("T8 pagina offline dalla cache", "GymLog" in page.title() and page.locator(".exercise").count() >= 8,
                  page.title())
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
            import re
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

            # ---- Test 11: impostazioni — cambio incremento + export file ----
            page.goto(BASE + "/index.html#/impostazioni", wait_until="load")
            page.wait_for_selector(".workout-edit")
            inc = page.locator("input[type=number]").first
            inc.fill("5")
            inc.dispatch_event("change")
            page.wait_for_timeout(200)
            check("T11 incremento salvato", page.evaluate("GymStore.getSettings().weightIncrement") == 5.0)
            check("T11 export/import/cancella presenti",
                  page.locator("button", has_text="Esporta dati").count() == 1 and
                  page.locator("button", has_text="Importa da JSON").count() == 1 and
                  page.locator("button", has_text="Cancella tutti i dati").count() == 1)
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
