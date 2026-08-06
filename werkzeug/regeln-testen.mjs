/* =====================================================================
   RISIKO — TESTS FUER DEN REGELKERN
   Aufruf: npm test

   Prueft risiko-regeln.js ohne Browser, ohne Karte, ohne Three.js. Genau
   dafuer ist der Kern von der Darstellung getrennt.

   Die Faelle sind nach Schadenspotenzial ausgewaehlt, nicht nach Zeilen-
   abdeckung: Weltdaten (ein Tippfehler dort zerlegt das Spiel lautlos),
   die Hausregeln, der zweistufige Kampf und der Determinismus – Letzterer,
   weil der spaetere Online-Betrieb darauf aufbaut.
   ===================================================================== */
import test from "node:test";
import assert from "node:assert/strict";
import E from "./regeln-laden.mjs";

const IDS = Object.keys(E.TERR);

/* Zustand mit bekannter Lage bauen: alles gehoert Spieler 0, ausser den
   ausdruecklich zugewiesenen Laendern. So haengt kein Test am Zufall der
   Aufstellung. */
function bau({ armies = {}, owner = {}, opts = {}, phase = "attack", cur = 0, spieler = 2 } = {}) {
  const namen = ["A", "B", "C", "D"].slice(0, spieler);
  const s = JSON.parse(
    JSON.stringify(
      E.createGame(
        namen.map((n) => ({ name: n, color: "#fff" })),
        Object.assign({ cap3: true, cards: true, draft: false, dice: true }, opts),
        4711
      )
    )
  );
  IDS.forEach((id) => { s.owner[id] = 0; s.armies[id] = 1; });
  Object.assign(s.owner, owner);
  Object.assign(s.armies, armies);
  s.phase = phase; s.cur = cur; s.pending = null; s.winner = null;
  s.reinf = 0; s.fortCap = {}; s.conquered = false;
  return s;
}
const gut = (r) => { assert.equal(r.ok, true, "Aktion abgelehnt: " + r.error); return r.state; };
const schlecht = (r) => { assert.equal(r.ok, false, "Aktion haette abgelehnt werden muessen"); return r.error; };

/* ---------------------------------------------------------------- */
test("Weltdaten sind vollstaendig und in sich stimmig", () => {
  assert.equal(IDS.length, 42, "es muessen 42 Territorien sein");

  // Jede Nachbarschaft muss in beide Richtungen eingetragen sein, sonst
  // kann man in eine Richtung angreifen und in die andere nicht.
  const einseitig = [];
  for (const a of IDS)
    for (const b of E.ADJ[a]) {
      assert.ok(E.TERR[b], a + " zeigt auf unbekanntes Land " + b);
      if (!E.ADJ[b].includes(a)) einseitig.push(a + " -> " + b);
    }
  assert.deepEqual(einseitig, [], "einseitige Nachbarschaften");

  // Kein Land ohne Nachbarn, keins mit sich selbst verbunden
  for (const a of IDS) {
    assert.ok(E.ADJ[a] && E.ADJ[a].length > 0, a + " hat keine Nachbarn");
    assert.ok(!E.ADJ[a].includes(a), a + " grenzt an sich selbst");
    assert.equal(new Set(E.ADJ[a]).size, E.ADJ[a].length, a + " hat doppelte Nachbarn");
  }

  // Jedes Land gehoert zu genau einem bekannten Kontinent
  for (const a of IDS) assert.ok(E.CONTINENTS[E.TERR[a].c], a + " hat unbekannten Kontinent");
  const summe = Object.keys(E.CONTINENTS)
    .map((c) => IDS.filter((id) => E.TERR[id].c === c).length)
    .reduce((x, y) => x + y, 0);
  assert.equal(summe, 42, "Kontinente decken nicht alle Laender ab");
});

test("Einkommen: Mindestens 3, sonst Laender/3, plus Kontinentbonus", () => {
  const s = bau({ spieler: 2 });
  IDS.forEach((id) => (s.owner[id] = 1));           // A besitzt nichts
  ["alaska", "alberta", "ontario"].forEach((id) => (s.owner[id] = 0));
  assert.equal(E.incomeOf(s, 0), 3, "3 Laender ergeben das Minimum 3");

  // 12 Laender, aber bewusst kein Kontinent vollstaendig – sonst kaeme der
  // Bonus dazu und der Test pruefte zwei Dinge auf einmal.
  const zwoelf = ["alaska", "nwterr", "greenland", "alberta", "ontario", "quebec", "westus",
                  "eastus", "ural", "siberia", "yakutsk", "kamchatka"];   // NA ohne Mittelamerika
  IDS.forEach((id) => (s.owner[id] = 1));
  zwoelf.forEach((id) => (s.owner[id] = 0));
  assert.equal(E.incomeOf(s, 0), 4, "12 Laender ergeben 4, ohne Kontinentbonus");

  // Ganz Australien (2 Bonus) dazu, isoliert gerechnet
  const t = bau({ spieler: 2 });
  IDS.forEach((id) => (t.owner[id] = 1));
  const austral = IDS.filter((id) => E.TERR[id].c === "Australien");
  austral.forEach((id) => (t.owner[id] = 0));
  assert.equal(E.incomeOf(t, 0), 3 + 2, "4 Laender (Minimum 3) plus Australien-Bonus 2");
});

test("Kartenwerte folgen der Hausregel-Staffel", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map(E.tradeValue), [4, 6, 8, 10, 12, 15, 20, 25]);
});

test("Gueltige Kartensaetze: 3 gleiche, 3 verschiedene, Joker", () => {
  const k = (x) => ({ sym: x });
  assert.equal(E.isValidSet([k("inf"), k("inf"), k("inf")]), true, "3 gleiche");
  assert.equal(E.isValidSet([k("inf"), k("kav"), k("art")]), true, "3 verschiedene");
  assert.equal(E.isValidSet([k("wild"), k("inf"), k("kav")]), true, "mit Joker");
  assert.equal(E.isValidSet([k("inf"), k("inf"), k("kav")]), false, "2+1 ist ungueltig");
  assert.equal(E.isValidSet([k("inf"), k("kav")]), false, "nur 2 Karten");
});

test("apply veraendert den Eingabezustand nicht", () => {
  const s = bau({ armies: { china: 5, india: 3 }, owner: { india: 1 } });
  const vorher = JSON.stringify(s);
  E.apply(s, { type: "ATTACK", from: "china", to: "india", dice: 2 });
  assert.equal(JSON.stringify(s), vorher, "Zustand wurde in place veraendert");
});

/* ---------------- zweistufiger Kampf ---------------- */
test("ATTACK wuerfelt nur fuer den Angreifer und laesst die Truppen stehen", () => {
  const s = bau({ armies: { china: 6, india: 3 }, owner: { india: 1 } });
  const n = gut(E.apply(s, { type: "ATTACK", from: "china", to: "india", dice: 2 }));
  assert.equal(n.pending.type, "defend");
  assert.equal(n.pending.aDice.length, 2, "genau 2 Angriffswuerfel");
  assert.equal(n.pending.max, 2, "Verteidiger darf bis 2 werfen");
  assert.equal(n.armies.china, 6, "Angreifer verliert noch nichts");
  assert.equal(n.armies.india, 3, "Verteidiger verliert noch nichts");
});

test("Waehrend einer offenen Abwehr ist nur DEFEND erlaubt", () => {
  const s = bau({ armies: { china: 6, india: 3 }, owner: { india: 1 } });
  const n = gut(E.apply(s, { type: "ATTACK", from: "china", to: "india", dice: 2 }));
  assert.match(schlecht(E.apply(n, { type: "END_PHASE" })), /Verteidiger/);
  assert.match(schlecht(E.apply(n, { type: "OCCUPY", count: 1 })), /Verteidiger/);
  assert.match(
    schlecht(E.apply(n, { type: "ATTACK", from: "china", to: "india", dice: 1 })),
    /Verteidiger/
  );
});

test("Verluste entsprechen immer der kleineren Wuerfelzahl", () => {
  for (const [nA, nD] of [[1, 1], [2, 1], [1, 2], [2, 2], [3, 2], [3, 1]]) {
    const s = bau({ armies: { china: 9, india: 9 }, owner: { india: 1 } });
    const n = gut(E.apply(s, { type: "ATTACK", from: "china", to: "india", dice: nA }));
    const e = gut(E.apply(n, { type: "DEFEND", dice: nD }));
    const vA = 9 - e.armies.china, vD = 9 - e.armies.india;
    assert.equal(vA + vD, Math.min(nA, nD), `${nA} gegen ${nD}: Summe der Verluste`);
    assert.ok(vA >= 0 && vD >= 0, "keine negativen Verluste");
    assert.equal(e.pending, null, "Abwehr beendet das Zwischenstadium");
  }
});

test("Wuerfelzahlen werden begrenzt", () => {
  const s = bau({ armies: { china: 3, india: 2 }, owner: { india: 1 } });
  assert.match(schlecht(E.apply(s, { type: "ATTACK", from: "china", to: "india", dice: 3 })), /1–2/);
  assert.match(schlecht(E.apply(s, { type: "ATTACK", from: "china", to: "india", dice: 0 })), /1–2/);
  const n = gut(E.apply(s, { type: "ATTACK", from: "china", to: "india", dice: 2 }));
  assert.match(schlecht(E.apply(n, { type: "DEFEND", dice: 3 })), /1–2/);
});

test("Ohne die Hausregel und ohne Wahl faellt die Entscheidung sofort", () => {
  const aus = bau({ armies: { china: 6, india: 3 }, owner: { india: 1 }, opts: { dice: false } });
  const n1 = gut(E.apply(aus, { type: "ATTACK", from: "china", to: "india" }));
  assert.ok(!n1.pending || n1.pending.type === "occupy", "kein defend-Zwischenstadium");
  assert.equal(n1.armies.china + n1.armies.india, 9 - 2, "2 Paare sofort verglichen");

  const einer = bau({ armies: { china: 6, india: 1 }, owner: { india: 1 } });
  const n2 = gut(E.apply(einer, { type: "ATTACK", from: "china", to: "india", dice: 3 }));
  assert.ok(!n2.pending || n2.pending.type === "occupy", "1 Truppe laesst keine Wahl");
});

test("Angriff wird abgelehnt, wo er nicht erlaubt ist", () => {
  // brazil gehoert hier ebenfalls dem Gegner, sonst greift die Besitzpruefung
  // zuerst und der Nachbarschaftstest liefe ins Leere.
  const s = bau({ armies: { china: 5, india: 3 }, owner: { india: 1, brazil: 1 } });
  assert.match(schlecht(E.apply(s, { type: "ATTACK", from: "china", to: "brazil", dice: 1 })),
    /grenzen nicht/);
  assert.match(schlecht(E.apply(s, { type: "ATTACK", from: "china", to: "siam", dice: 1 })),
    /Eigenes Land/);
  const einTruppe = bau({ armies: { china: 1, india: 3 }, owner: { india: 1 } });
  assert.match(schlecht(E.apply(einTruppe, { type: "ATTACK", from: "china", to: "india", dice: 1 })),
    /Mindestens 2/);
  const falschePhase = bau({ armies: { china: 5, india: 3 }, owner: { india: 1 }, phase: "fortify" });
  assert.match(schlecht(E.apply(falschePhase, { type: "ATTACK", from: "china", to: "india", dice: 1 })),
    /Angriffsphase/);
});

/* ---------------- Eroberung ---------------- */
test("cap3 begrenzt das Nachruecken, ohne cap3 zaehlt die ganze Armee", () => {
  const mit = bau({ armies: { china: 9, india: 1 }, owner: { india: 1 } });
  const a = gut(E.apply(mit, { type: "ATTACK", from: "china", to: "india", dice: 3 }));
  if (a.pending && a.pending.type === "occupy") assert.ok(a.pending.max <= 3, "cap3 deckelt bei 3");

  const ohne = bau({ armies: { china: 9, india: 1 }, owner: { india: 1 }, opts: { cap3: false } });
  const b = gut(E.apply(ohne, { type: "ATTACK", from: "china", to: "india", dice: 3 }));
  if (b.pending && b.pending.type === "occupy")
    assert.equal(b.pending.max, b.armies.china - 1, "ohne cap3 alles bis auf eine");
});

test("OCCUPY verschiebt genau die gewaehlte Zahl", () => {
  let s = bau({ armies: { china: 9, india: 1 }, owner: { india: 1 } });
  s = gut(E.apply(s, { type: "ATTACK", from: "china", to: "india", dice: 3 }));
  if (!s.pending || s.pending.type !== "occupy") return; // Angriff ging daneben, anderer Test deckt das
  const vor = s.armies.china;
  const n = gut(E.apply(s, { type: "OCCUPY", count: 2 }));
  assert.equal(n.armies.china, vor - 2);
  assert.equal(n.armies.india, 2);
  assert.equal(n.owner.india, 0, "Land hat den Besitzer gewechselt");
  assert.equal(n.pending, null);
});

test("Ausscheiden uebertraegt die Handkarten an den Sieger", () => {
  const s = bau({ armies: { china: 9, india: 1 }, owner: { india: 1 }, spieler: 2 });
  IDS.forEach((id) => (s.owner[id] = 0));
  s.owner.india = 1;                       // B besitzt nur noch dieses eine Land
  s.armies.china = 9; s.armies.india = 1;
  s.hands[1] = [{ sym: "inf" }, { sym: "kav" }];
  const n = gut(E.apply(s, { type: "ATTACK", from: "china", to: "india", dice: 3 }));
  if (n.armies.india > 0) return;          // Verteidiger hat gehalten
  assert.equal(n.players[1].alive, false, "B ist ausgeschieden");
  assert.equal(n.hands[1].length, 0, "B hat keine Karten mehr");
  assert.equal(n.hands[0].length, 2, "A hat sie uebernommen");
});

test("Sieg wird erkannt, wenn alles einem gehoert", () => {
  let s = bau({ armies: { china: 9, india: 1 }, owner: { india: 1 } });
  s = gut(E.apply(s, { type: "ATTACK", from: "china", to: "india", dice: 3 }));
  if (!s.pending || s.pending.type !== "occupy") return;
  const n = gut(E.apply(s, { type: "OCCUPY", count: 1 }));
  assert.equal(n.winner, 0, "A besitzt alle 42 Laender");
});

/* ---------------- Verschieben ---------------- */
test("Zwischenland-Regel: das Kontingent friert zu Phasenbeginn ein", () => {
  let s = bau({ armies: { china: 5, siam: 1 }, phase: "attack" });
  s = gut(E.apply(s, { type: "END_PHASE" }));            // -> fortify
  assert.equal(s.phase, "fortify");
  assert.equal(E.fortifyCapOf(s, "china"), 4, "5 Truppen, eine muss bleiben");

  s = gut(E.apply(s, { type: "FORTIFY", from: "china", to: "siam", count: 3 }));
  assert.equal(s.armies.china, 2);
  assert.equal(s.armies.siam, 4);
  assert.equal(E.fortifyCapOf(s, "china"), 1, "Kontingent schrumpft mit");

  // Nachschub aendert das Kontingent nicht – genau darum geht die Regel
  s.armies.china = 9;
  assert.equal(E.fortifyMaxOf(s, "china"), 1, "Deckel gilt weiter, trotz 9 Truppen");
  assert.match(schlecht(E.apply(s, { type: "FORTIFY", from: "china", to: "siam", count: 2 })), /1–1/);
});

test("Die Zwischenland-Regel laesst sich nicht abschalten", () => {
  // Sie ist fest verdrahtet – ein mitgegebenes chain-Flag darf nichts bewirken,
  // und opts fuehrt das Feld gar nicht mehr.
  let s = bau({ armies: { china: 5, siam: 1 }, phase: "attack", opts: { chain: false } });
  assert.equal("chain" in s.opts, false, "opts kennt kein chain mehr");
  s = gut(E.apply(s, { type: "END_PHASE" }));
  s = gut(E.apply(s, { type: "FORTIFY", from: "china", to: "siam", count: 4 }));
  assert.equal(E.fortifyCapOf(s, "china"), 0, "Kontingent aufgebraucht");
  s.armies.china = 20;                       // Nachschub aendert daran nichts
  assert.equal(E.fortifyMaxOf(s, "china"), 0, "trotz 20 Truppen keine Abgabe mehr");
});

test("Frisch angekommene Truppen koennen nicht weitergereicht werden", () => {
  // Der Kern der Regel: Ontario -> Alberta -> Alaska geht nicht in einem Zug.
  let s = bau({
    armies: { ontario: 10, alberta: 1, alaska: 1 },
    owner: { brazil: 1 },            // B braucht ein Land, sonst kann er nicht verstaerken
    phase: "attack",
  });
  s = gut(E.apply(s, { type: "END_PHASE" }));
  assert.equal(E.fortifyCapOf(s, "alberta"), 0, "Alberta startet mit einer Truppe");

  s = gut(E.apply(s, { type: "FORTIFY", from: "ontario", to: "alberta", count: 9 }));
  assert.equal(s.armies.alberta, 10, "die Truppen sind angekommen");
  assert.equal(E.fortifyMaxOf(s, "alberta"), 0, "koennen aber nicht weiter");
  assert.match(
    schlecht(E.apply(s, { type: "FORTIFY", from: "alberta", to: "alaska", count: 1 })),
    /nichts mehr abgeben/
  );

  // Im naechsten eigenen Zug ist Alberta wieder beweglich.
  // Einen kompletten Zug abwickeln: verstaerken, angreifen, verschieben, beenden.
  const zugDurchspielen = (z) => {
    while (z.reinf > 0) z = gut(E.apply(z, { type: "PLACE", terr: E.terrOf(z, z.cur)[0] }));
    z = gut(E.apply(z, { type: "END_PHASE" }));   // -> attack
    z = gut(E.apply(z, { type: "END_PHASE" }));   // -> fortify
    return gut(E.apply(z, { type: "END_PHASE" })); // -> naechster Spieler, reinforce
  };
  let t = gut(E.apply(s, { type: "END_PHASE" }));   // A beendet, B ist dran
  assert.equal(t.cur, 1);
  t = zugDurchspielen(t);                          // B spielt durch, A ist dran
  assert.equal(t.cur, 0, "A ist wieder am Zug");
  assert.equal(t.phase, "reinforce");

  while (t.reinf > 0) t = gut(E.apply(t, { type: "PLACE", terr: "ontario" }));
  t = gut(E.apply(t, { type: "END_PHASE" }));       // -> attack
  t = gut(E.apply(t, { type: "END_PHASE" }));       // -> fortify
  assert.equal(E.fortifyCapOf(t, "alberta"), 9, "Albertas Kontingent ist neu berechnet");
  t = gut(E.apply(t, { type: "FORTIFY", from: "alberta", to: "alaska", count: 9 }));
  assert.equal(t.armies.alaska, 10, "jetzt duerfen sie weiter");
});

test("Verschieben nur zwischen eigenen Nachbarn", () => {
  let s = bau({ armies: { china: 5 }, owner: { siam: 1 }, phase: "attack" });
  s = gut(E.apply(s, { type: "END_PHASE" }));
  assert.match(schlecht(E.apply(s, { type: "FORTIFY", from: "china", to: "siam", count: 1 })),
    /müssen dir gehören/);
  assert.match(schlecht(E.apply(s, { type: "FORTIFY", from: "china", to: "brazil", count: 1 })),
    /grenzen nicht/);
});

/* ---------------- Aufstellung und Ablauf ---------------- */
test("Zufaellige Aufstellung verteilt alle Laender und alle Truppen", () => {
  const s = E.createGame(
    [{ name: "A", color: "#f00" }, { name: "B", color: "#00f" }, { name: "C", color: "#0f0" }],
    { cap3: true, cards: true, draft: false, dice: true },
    99
  );
  assert.equal(E.freeTerr(s).length, 0, "kein Land bleibt herrenlos");
  assert.deepEqual(s.toPlace, [0, 0, 0], "alle Starttruppen gesetzt");
  const gesamt = IDS.reduce((n, id) => n + s.armies[id], 0);
  assert.equal(gesamt, 3 * 35, "3 Spieler mal 35 Truppen");
  assert.equal(s.phase, "reinforce");
});

test("Phasen laufen im Kreis und der naechste Spieler kommt dran", () => {
  let s = bau({ phase: "reinforce", spieler: 2 });
  s.reinf = 0;
  s = gut(E.apply(s, { type: "END_PHASE" }));
  assert.equal(s.phase, "attack");
  s = gut(E.apply(s, { type: "END_PHASE" }));
  assert.equal(s.phase, "fortify");
  s = gut(E.apply(s, { type: "END_PHASE" }));
  assert.equal(s.phase, "reinforce");
  assert.equal(s.cur, 1, "jetzt ist B am Zug");
  assert.ok(s.reinf >= 3, "B bekommt Verstaerkung");
});

test("Verstaerkungsphase laesst sich nicht mit offenen Truppen verlassen", () => {
  const s = bau({ phase: "reinforce" });
  s.reinf = 2;
  assert.match(schlecht(E.apply(s, { type: "END_PHASE" })), /Erst alle Truppen/);
});

/* ---------------- Sicht eines Spielers ---------------- */
test("viewFor entfernt alles, was ein Spieler nicht wissen darf", () => {
  const s = bau({ spieler: 3 });
  s.hands = [[{ sym: "inf" }], [{ sym: "kav" }, { sym: "wild" }], [{ sym: "art" }]];
  s.discard = [{ sym: "inf" }, { sym: "art" }];
  const v = E.viewFor(s, 0);

  assert.equal(v.rng, null, "kein Zufallszustand");
  assert.equal(v.you, 0);
  assert.equal(v.redacted, true);

  // eigene Hand vollstaendig, fremde nur als Rueckseiten
  assert.deepEqual(v.hands[0], [{ sym: "inf" }], "eigene Karten bleiben lesbar");
  assert.ok(v.hands[1].every((k) => k.hidden && k.sym === null), "fremde Hand verdeckt");
  assert.ok(v.hands[2].every((k) => k.hidden && k.sym === null), "fremde Hand verdeckt");

  // Anzahlen bleiben oeffentlich – die Oberflaeche zeigt sie an
  assert.deepEqual(v.hands.map((h) => h.length), [1, 2, 1], "Kartenzahlen bleiben sichtbar");
  assert.equal(v.deck.length, s.deck.length, "Stapelgroesse bleibt sichtbar");
  assert.ok(v.deck.every((k) => k.hidden), "Stapelinhalt verdeckt");
  assert.ok(v.discard.every((k) => k.hidden), "Ablage verdeckt");

  // im gesamten JSON darf kein fremdes Symbol mehr auftauchen
  const ohneEigene = JSON.stringify({ ...v, hands: v.hands.slice(1) });
  assert.equal(/"sym":"(kav|wild|art)"/.test(ohneEigene), false, "Symbol durchgesickert");
});

test("viewFor laesst das Spielbrett unangetastet", () => {
  const s = bau({ armies: { china: 7 }, owner: { india: 1 } });
  const v = E.viewFor(s, 1);
  assert.deepEqual(v.owner, s.owner, "Besitzverhaeltnisse sind oeffentlich");
  assert.deepEqual(v.armies, s.armies, "Truppenzahlen sind oeffentlich");
  assert.deepEqual(v.players, s.players);
  assert.equal(v.phase, s.phase);
  assert.equal(v.cur, s.cur);
  assert.deepEqual(v.log, s.log, "der Verlauf ist bereits offengelegt");
});

test("viewFor veraendert den Originalzustand nicht", () => {
  const s = bau({ spieler: 2 });
  s.hands = [[{ sym: "inf" }], [{ sym: "kav" }]];
  const vorher = JSON.stringify(s);
  E.viewFor(s, 0);
  assert.equal(JSON.stringify(s), vorher);
});

test("Aus der Sicht laesst sich der naechste Wurf nicht vorhersagen", () => {
  /* Das ist der eigentliche Zweck. Mit dem vollen Zustand trifft eine
     Vorhersage immer – ohne rng darf sie nur noch zufaellig stimmen.
     Gemessen ueber viele Startwerte, damit ein Zufallstreffer nichts
     kaputtmacht. */
  const angriff = { type: "ATTACK", from: "china", to: "india", dice: 3 };
  const wurf = (z) => {
    const r = E.apply(z, angriff);
    return r.ok && r.state.pending ? r.state.pending.aDice.join("-") : null;
  };

  let mitVoll = 0, mitSicht = 0, n = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const s = bau({ armies: { china: 9, india: 9 }, owner: { india: 1 } });
    s.rng = seed;                                  // je Durchgang andere Lage
    const echt = wurf(s);
    if (!echt) continue;
    n++;
    if (wurf(JSON.parse(JSON.stringify(s))) === echt) mitVoll++;   // voller Zustand
    if (wurf(E.viewFor(s, 1)) === echt) mitSicht++;                // nur die Sicht
  }

  assert.ok(n > 150, "genug Durchgaenge");
  assert.equal(mitVoll, n, "mit vollem Zustand ist die Vorhersage immer richtig");
  assert.ok(
    mitSicht < n * 0.2,
    `aus der Sicht darf die Vorhersage nur zufaellig stimmen, war aber ${mitSicht}/${n}`
  );
});

/* ---------------- Determinismus ---------------- */
test("Gleicher Startwert ergibt exakt denselben Spielverlauf", () => {
  const spiel = () =>
    E.createGame(
      [{ name: "A", color: "#f00" }, { name: "B", color: "#00f" }],
      { cap3: true, cards: true, draft: false, dice: true },
      2024
    );
  assert.equal(JSON.stringify(spiel()), JSON.stringify(spiel()));

  // auch ueber mehrere Aktionen hinweg
  const lauf = () => {
    let s = bau({ armies: { china: 8, india: 8 }, owner: { india: 1 } });
    s = gut(E.apply(s, { type: "ATTACK", from: "china", to: "india", dice: 3 }));
    return gut(E.apply(s, { type: "DEFEND", dice: 2 }));
  };
  assert.equal(JSON.stringify(lauf()), JSON.stringify(lauf()));
});

test("Verschiedene Startwerte ergeben verschiedene Spiele", () => {
  const spiel = (seed) =>
    JSON.stringify(
      E.createGame(
        [{ name: "A", color: "#f00" }, { name: "B", color: "#00f" }],
        { cap3: true, cards: true, draft: false, dice: true },
        seed
      ).owner
    );
  assert.notEqual(spiel(1), spiel(2));
});
