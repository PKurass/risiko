/* =====================================================================
   RISIKO — ZUSAMMENSPIEL VON SERVER UND REGELKERN

   Startet den echten server/risiko.php mit dem eingebauten PHP-Webserver
   gegen eine SQLite-Datei und laesst ZWEI voneinander unabhaengige
   Spielstaende ueber ihn gegeneinander spielen. Jeder kennt nur, was der
   Server ihm gibt – so, wie es spaeter zwei Browser tun.

   Geprueft wird die eine Zusicherung, auf der der Online-Betrieb steht:
   nach jedem Zug stehen auf beiden Geraeten EXAKT dieselben Bretter. Sonst
   streiten sich hinterher zwei Rechner darueber, wer gewonnen hat.

   Aufruf: npm run netztest   (braucht php auf dem Rechner)
   ===================================================================== */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import E from "./regeln-laden.mjs";
import { WURZEL } from "./regeln-laden.mjs";

const HAFEN = 8731;
const BASIS = "http://127.0.0.1:" + HAFEN + "/risiko.php";
const DB = path.join(os.tmpdir(), "risiko-netztest-" + process.pid + ".sqlite");

function warte(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function ruf(was, daten, get) {
  const u = new URL(BASIS);
  u.searchParams.set("was", was);
  for (const [k, v] of Object.entries(get || {})) u.searchParams.set(k, v);
  const a = await fetch(u, daten ? {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(daten),
  } : {});
  const t = await a.text();
  let j;
  try { j = JSON.parse(t); } catch { throw new Error(was + " lieferte kein JSON:\n" + t); }
  if (!a.ok) throw new Error(was + " scheiterte: " + (j.fehler || a.status));
  return j;
}

/* Ein "Geraet": haelt einen eigenen Spielstand und weiss nur, welche Zuege
   es schon nachgespielt hat. Genau die Lage eines Browsers. */
function geraet(name, spiel, geheim, platz) {
  return { name, spiel, geheim, platz, stand: null, bis: 0 };
}
async function starten(g, saat, spieler, opts) {
  g.stand = E.createGame(spieler, opts, saat);
}
/* Neue Zuege abholen und in Reihenfolge anwenden – mit dem Zufall, den der
   Server mitgeliefert hat. */
async function abholen(g) {
  const { zuege } = await ruf("zuege", null, { spiel: g.spiel, seit: String(g.bis) });
  for (const z of zuege) {
    const r = E.apply(g.stand, z.aktion, z.zufall);
    assert.equal(r.ok, true, g.name + " lehnte Zug " + z.nr + " ab: " + r.error);
    g.stand = r.state;
    g.bis = z.nr;
  }
  return zuege.length;
}
async function ziehen(g, aktion) {
  await ruf("zug", { spiel: g.spiel, geheim: g.geheim, aktion });
  return abholen(g);          // der eigene Zug kommt denselben Weg zurueck
}

const php = spawn("php", ["-S", "127.0.0.1:" + HAFEN, "-t", path.join(WURZEL, "server")], {
  env: { ...process.env, RISIKO_DSN: "sqlite:" + DB },
  stdio: ["ignore", "ignore", "pipe"],
});
let phpFehler = "";
php.stderr.on("data", (d) => { phpFehler += d.toString(); });

try {
  /* Auf den Server warten – ohne feste Pause, die mal zu kurz und mal zu
     lang waere. */
  for (let i = 0; i < 60; i++) {
    try { await ruf("lage", null, { spiel: "XXXXXX" }); break; }
    catch (e) { if (String(e).includes("gibt es nicht")) break; await warte(100); }
  }

  const opts = { cap3: true, cards: true, draft: false, dice: true };

  // --- Lobby ---
  const a1 = await ruf("anlegen", { name: "Anna", color: "#ff5470", opts });
  const b1 = await ruf("beitreten", { spiel: a1.spiel, name: "Bert", color: "#4da3ff" });
  assert.equal(b1.platz, 1, "Der zweite Spieler muss Platz 2 bekommen");

  const lage = await ruf("lage", null, { spiel: a1.spiel });
  assert.equal(lage.spieler.length, 2);
  assert.equal(lage.saat, null, "Vor dem Start darf es den Startwert nicht geben");
  assert.equal(JSON.stringify(lage.spieler[0]), JSON.stringify({ name: "Anna", color: "#ff5470" }),
    "Das Geheimnis darf niemals nach aussen gehen");

  // Fremdes Geheimnis darf nicht starten duerfen
  await assert.rejects(
    () => ruf("starten", { spiel: a1.spiel, geheim: b1.geheim }),
    /angelegt/,
    "Nur wer das Spiel angelegt hat, darf es starten"
  );

  const start = await ruf("starten", { spiel: a1.spiel, geheim: a1.geheim });
  assert.ok(start.saat > 0, "Nach dem Start muss es einen Startwert geben");

  // --- Zwei Geraete, gleicher Startwert ---
  const A = geraet("Anna", a1.spiel, a1.geheim, 0);
  const B = geraet("Bert", a1.spiel, b1.geheim, 1);
  const spieler = start.spieler;
  await starten(A, start.saat, spieler, start.opts);
  await starten(B, start.saat, spieler, start.opts);
  const gleich = () => JSON.stringify(A.stand) === JSON.stringify(B.stand);
  assert.ok(gleich(), "Gleicher Startwert muss dasselbe Brett ergeben");

  // --- Erfundenes Geheimnis wird abgewiesen ---
  await assert.rejects(
    () => ruf("zug", { spiel: A.spiel, geheim: "00000000000000000000000000000000",
                       aktion: { type: "END_PHASE" } }),
    /Geheimnis/,
    "Ohne gueltiges Geheimnis darf niemand ziehen"
  );

  /* Wer gerade ziehen darf – wird nach jedem Zug neu bestimmt, denn der
     Zug wechselt. Beide Geraete holen anschliessend ab, damit der Vergleich
     Sinn ergibt. */
  const amZug = () => (A.stand.cur === 0 ? A : B);
  const rest = () => (A.stand.cur === 0 ? B : A);
  let zuege = 0;
  async function zug(g, aktion, warum) {
    await ziehen(g, aktion);
    await abholen(g === A ? B : A);
    zuege++;
    assert.ok(gleich(), "Nach " + warum + " muessen beide Bretter gleich sein");
  }

  /* Bis zu einer Phase vorspulen. Verstaerkungen muessen dabei gesetzt
     werden – "Phase beenden" wird sonst zu Recht abgelehnt. */
  async function bisPhase(ziel) {
    let wache = 0;
    while (A.stand.phase !== ziel && A.stand.winner === null && wache++ < 300) {
      if (A.stand.phase === "reinforce" && A.stand.reinf > 0) {
        const eigen = Object.keys(A.stand.owner).filter((t) => A.stand.owner[t] === A.stand.cur);
        await zug(amZug(), { type: "PLACE", terr: eigen[0], count: 1 }, "PLACE");
      } else {
        await zug(amZug(), { type: "END_PHASE" }, "END_PHASE");
      }
    }
    assert.equal(A.stand.phase, ziel, "Phase " + ziel + " nicht erreicht");
  }

  // --- Ein paar Zuege hin und her, ueber den Zugwechsel hinweg ---
  await bisPhase("attack");
  await bisPhase("fortify");
  await bisPhase("reinforce");      // jetzt ist der andere Spieler dran
  assert.ok(zuege > 5, "Es sollten mehrere Zuege gelaufen sein, tatsaechlich " + zuege);

  // --- Ein Kampf, bei dem der Server wuerfelt ---
  await bisPhase("attack");
  const dran = amZug();
  const andere = rest();
  let gekaempft = false;
  const meine = Object.keys(A.stand.owner).filter((t) => A.stand.owner[t] === A.stand.cur && A.stand.armies[t] > 1);
  for (const von of meine) {
    const ziel = (E.ADJ[von] || []).find((t) => A.stand.owner[t] !== A.stand.cur);
    if (!ziel) continue;
    await ziehen(dran, { type: "ATTACK", from: von, to: ziel, dice: E.attackMaxOf(A.stand, von) });
    await abholen(andere);
    assert.ok(gleich(), "Nach dem Angriffswurf muessen beide Bretter gleich sein");
    if (A.stand.pending && A.stand.pending.type === "defend") {
      const verteidiger = A.stand.owner[ziel] === 0 ? A : B;
      const gegner = verteidiger === A ? B : A;
      await ziehen(verteidiger, { type: "DEFEND", dice: A.stand.pending.max });
      await abholen(gegner);
      assert.ok(gleich(), "Nach der Abwehr muessen beide Bretter gleich sein");
    }
    const kampf = A.stand.log.filter((e) => e.d && e.d.d && e.d.d.length).pop();
    assert.ok(kampf, "Es muss ein Kampf im Verlauf stehen");
    assert.ok(kampf.d.a.every((w) => w >= 1 && w <= 6), "Wuerfel muessen 1..6 sein");
    gekaempft = true;
    break;
  }
  assert.ok(gekaempft, "Es haette ein Angriff moeglich sein muessen");

  // --- Zwei Spiele stoeren sich nicht ---
  const c1 = await ruf("anlegen", { name: "Cleo", color: "#37d67a", opts });
  assert.notEqual(c1.spiel, a1.spiel, "Jedes Spiel bekommt eine eigene Kennung");
  const fremd = await ruf("zuege", null, { spiel: c1.spiel, seit: "0" });
  assert.equal(fremd.zuege.length, 0, "Ein neues Spiel darf keine fremden Zuege sehen");

  console.log("Alles gut: " + (A.bis) + " Zuege ueber den Server gespielt,");
  console.log("beide Spielstaende nach jedem Zug identisch.");
} finally {
  php.kill();
  for (const f of [DB, DB + "-journal", DB + "-wal", DB + "-shm"]) {
    try { fs.unlinkSync(f); } catch {}
  }
  if (phpFehler.includes("Fatal") || phpFehler.includes("Parse error")) {
    console.error("PHP meldete:\n" + phpFehler);
    process.exitCode = 1;
  }
}
