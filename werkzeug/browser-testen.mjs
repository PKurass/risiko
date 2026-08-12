/* =====================================================================
   RISIKO — ZWEI BROWSER, EIN SPIEL

   Startet den echten server/risiko.php und daneben zwei echte Chromium-
   Fenster mit risiko.html. Das eine eroeffnet ein Spiel, das andere tritt
   ueber die Kennung bei, dann wird gezogen.

   Bewusst OHNE Screenshots: geprueft wird ueber Zustaende, nicht ueber
   Aussehen. Ein Bild kostet ein Vielfaches und beantwortet hier nichts –
   die Frage ist "stehen ueberall dieselben Bretter?", und die beantwortet
   ein Vergleich zweier Zeichenketten genauer als jedes Auge.

   Alles laeuft ueber denselben Webserver, damit Seite und Postfach
   dieselbe Herkunft haben und niemand CORS einrichten muss.

   Aufruf: npm run browsertest   (braucht php und Chromium)
   ===================================================================== */
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { WURZEL } from "./regeln-laden.mjs";

const HAFEN = 8742;
const SEITE = "http://127.0.0.1:" + HAFEN + "/risiko.html";
const DB = path.join(os.tmpdir(), "risiko-browsertest-" + process.pid + ".sqlite");
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

/* Der PHP-Server liefert das ganze Verzeichnis aus: die Seite ebenso wie
   server/risiko.php. Router, damit alles ausser der PHP-Datei als Datei
   ausgeliefert wird. */
const php = spawn("php", ["-S", "127.0.0.1:" + HAFEN, "-t", WURZEL], {
  env: { ...process.env, RISIKO_DSN: "sqlite:" + DB },
  stdio: ["ignore", "ignore", "pipe"],
});
let phpFehler = "";
php.stderr.on("data", (d) => { phpFehler += d.toString(); });

let browser;
try {
  for (let i = 0; i < 80; i++) {
    try { const a = await fetch(SEITE); if (a.ok) break; } catch {}
    await warte(100);
  }

  browser = await chromium.launch();
  const seiten = [];
  for (const name of ["Anna", "Bert"]) {
    const s = await browser.newPage({ viewport: { width: 1100, height: 800 } });
    s.on("pageerror", (e) => { throw new Error(name + ": " + e.message); });
    /* Der Server steht bei diesem Aufbau unter server/risiko.php – genau
       die Voreinstellung. Gesetzt wird es trotzdem, damit der Test auch
       dann noch stimmt, wenn die Voreinstellung sich aendert. */
    await s.addInitScript(() => { window.RISIKO_SERVER = "server/risiko.php"; });
    await s.goto(SEITE);
    await s.waitForTimeout(900);
    seiten.push({ name, s });
  }
  const [A, B] = seiten;

  const stand = (g) => g.s.evaluate(() => (window.G ? JSON.stringify(G) : null));
  const gleich = async () => (await stand(A)) === (await stand(B));

  // --- Anna eroeffnet ---
  /* Ohne Haken laeuft die Aufstellung automatisch. Die Laenderwahl waere ein
     eigener Ablauf; hier geht es um Netz und Synchronisierung. */
  await A.s.uncheck("#optDraft");
  await A.s.fill("#setupPlayers input", "Anna");
  await A.s.click("#netzNeu");
  await A.s.waitForSelector("#lobbyOverlay.show", { timeout: 8000 });
  const code = (await A.s.textContent("#lobbyCode")).trim();
  assert.match(code, /^[A-Z0-9]{6}$/, "Die Kennung muss sechs Zeichen haben, war: " + code);

  // --- Bert tritt bei ---
  await B.s.fill("#setupPlayers input", "Bert");
  await B.s.click("#netzBei");
  await B.s.fill("#netzCode", code);
  await B.s.click("#netzBeiOk");
  await B.s.waitForSelector("#lobbyOverlay.show", { timeout: 8000 });

  // Anna sieht Bert in der Liste (die Lobby fragt im Takt nach)
  await A.s.waitForFunction(
    () => document.querySelectorAll("#lobbyListe .netzzeile").length >= 2,
    null, { timeout: 8000 }
  );

  // Nur der Wirt sieht den Startknopf
  assert.equal(await A.s.isVisible("#lobbyStart"), true, "Anna hat eröffnet und muss starten können");
  assert.equal(await B.s.isVisible("#lobbyStart"), false, "Bert darf den Startknopf nicht sehen");

  // --- Starten; Bert muss von selbst nachziehen ---
  await A.s.click("#lobbyStart");
  for (const g of seiten) {
    await g.s.waitForFunction(() => window.G !== null && !document.getElementById("lobbyOverlay").classList.contains("show"),
      null, { timeout: 12000 });
  }
  assert.ok(await gleich(), "Nach dem Start müssen beide Bretter gleich sein");

  // --- Wer nicht dran ist, darf nicht ziehen ---
  const drankunde = async (g) => g.s.evaluate(() => ({ cur: G.cur, platz: netz.platz, phase: G.phase, reinf: G.reinf }));
  const aInfo = await drankunde(A);
  const nichtDran = aInfo.cur === 0 ? B : A;
  const dran = aInfo.cur === 0 ? A : B;
  const vorher = await stand(dran);
  await nichtDran.s.evaluate(() => dispatch({ type: "END_PHASE" }));
  await warte(400);
  assert.equal(await stand(dran), vorher, "Ein Zug des Falschen darf nichts bewirken");
  assert.equal(
    await nichtDran.s.evaluate(() => document.getElementById("log").textContent.includes("am Zug")),
    true, "Der Falsche muss einen Hinweis bekommen"
  );

  // --- Ein paar echte Zuege ---
  async function zug(aktion) {
    const wer = (await drankunde(A)).cur === 0 ? A : B;
    const bisher = await wer.s.evaluate(() => netz.sitzung.bis);
    await wer.s.evaluate((a) => dispatch(a), aktion);
    await wer.s.waitForFunction((b) => netz.sitzung.bis > b, bisher, { timeout: 8000 });
    // der andere holt im Takt nach
    const anderer = wer === A ? B : A;
    await anderer.s.waitForFunction((b) => netz.sitzung.bis > b, bisher, { timeout: 15000 });
    assert.ok(await gleich(), "Nach jedem Zug müssen beide Bretter gleich sein");
  }

  let wache = 0;
  while ((await drankunde(A)).phase === "reinforce" && wache++ < 40) {
    const i = await A.s.evaluate(() => {
      const eigen = Object.keys(G.owner).filter((t) => G.owner[t] === G.cur);
      return eigen[0];
    });
    const info = await drankunde(A);
    if (info.reinf > 0) await zug({ type: "PLACE", terr: i, count: 1 });
    else await zug({ type: "END_PHASE" });
  }
  assert.equal((await drankunde(A)).phase, "attack", "Nach dem Setzen muss die Angriffsphase kommen");

  // --- Ein Kampf: die Wuerfel kommen vom Server ---
  const angriff = await A.s.evaluate(() => {
    const meine = Object.keys(G.owner).filter((t) => G.owner[t] === G.cur && G.armies[t] > 1);
    for (const von of meine) {
      const ziel = (RiskEngine.ADJ[von] || []).find((t) => G.owner[t] !== G.cur);
      if (ziel) return { von, ziel, wuerfel: RiskEngine.attackMaxOf(G, von) };
    }
    return null;
  });
  assert.ok(angriff, "Es hätte ein Angriff möglich sein müssen");
  await zug({ type: "ATTACK", from: angriff.von, to: angriff.ziel, dice: angriff.wuerfel });

  /* Jetzt ist der VERTEIDIGER dran – und der ist nicht am Zug. Genau diese
     Ausnahme muss die Sperre durchlassen. */
  const pending = await A.s.evaluate(() => (G.pending ? { typ: G.pending.type, to: G.pending.to, max: G.pending.max } : null));
  if (pending && pending.typ === "defend") {
    const wer = await A.s.evaluate((t) => G.owner[t], pending.to);
    const verteidiger = wer === 0 ? A : B;
    const bisher = await verteidiger.s.evaluate(() => netz.sitzung.bis);
    await verteidiger.s.evaluate((m) => dispatch({ type: "DEFEND", dice: m }), pending.max);
    await verteidiger.s.waitForFunction((b) => netz.sitzung.bis > b, bisher, { timeout: 8000 });
    const anderer = verteidiger === A ? B : A;
    await anderer.s.waitForFunction((b) => netz.sitzung.bis > b, bisher, { timeout: 15000 });
    assert.ok(await gleich(), "Nach der Abwehr müssen beide Bretter gleich sein");
  }

  const kampf = await A.s.evaluate(() => {
    const e = G.log.filter((x) => x.d && x.d.d && x.d.d.length).pop();
    return e ? e.d : null;
  });
  assert.ok(kampf, "Es muss ein ausgewerteter Kampf im Verlauf stehen");
  assert.ok(kampf.a.every((w) => w >= 1 && w <= 6) && kampf.d.every((w) => w >= 1 && w <= 6),
    "Die Würfel vom Server müssen 1..6 sein");

  const zuege = await A.s.evaluate(() => netz.sitzung.bis);
  console.log("Alles gut: " + zuege + " Zuege in zwei echten Browsern gespielt,");
  console.log("beide Bretter nach jedem Zug identisch, Zugsperre greift.");
} finally {
  if (browser) await browser.close();
  php.kill();
  for (const f of [DB, DB + "-journal", DB + "-wal", DB + "-shm"]) {
    try { fs.unlinkSync(f); } catch {}
  }
  if (phpFehler.includes("Fatal") || phpFehler.includes("Parse error")) {
    console.error("PHP meldete:\n" + phpFehler);
    process.exitCode = 1;
  }
}
