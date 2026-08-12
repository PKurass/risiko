/* =====================================================================
   RISIKO — NETZTEIL

   Verbindet die Oberflaeche mit dem Postfach-Server (server/risiko.php).
   Kennt weder Regeln noch Darstellung: er reicht Aktionen ein, holt die
   der anderen ab und sagt Bescheid, wenn sich etwas getan hat.

   Das Verfahren in einem Satz: es wird nie ein Spielstand uebertragen,
   sondern nur die Liste der Zuege. Jeder spielt sie in derselben
   Reihenfolge nach und kommt damit auf dasselbe Brett – dieselbe Idee wie
   ein Schachprotokoll.

   Warum kein Spielstand? Er enthaelt Dinge, die kein einzelner Spieler
   wissen darf (Handkarten der anderen, der Rest des Kartenstapels). Wer
   Zuege verschickt, verschickt nur, was ohnehin alle sehen.

   Die Zufallszahlen kommen bei jedem Zug vom Server mit. Deshalb kann
   niemand einen Wurf vorausberechnen, und deshalb kommen trotzdem alle auf
   dasselbe Ergebnis.
   ===================================================================== */
const RiskNetz = (function () {

  /* Wo der Server steht. Voreinstellung: neben der Seite, so wie es nach
     dem Hochladen bei einem Webhoster aussieht. Zum Ausprobieren laesst
     sich das ueber window.RISIKO_SERVER umbiegen. */
  function basis() {
    return window.RISIKO_SERVER || "server/risiko.php";
  }

  async function ruf(was, daten, abfrage) {
    const u = new URL(basis(), location.href);
    u.searchParams.set("was", was);
    for (const k in abfrage || {}) u.searchParams.set(k, abfrage[k]);
    let a;
    try {
      a = await fetch(u.toString(), daten ? {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(daten),
      } : {});
    } catch (e) {
      /* Netz weg, Server aus, Funkloch – fuer den Spieler ist das dasselbe,
         und es ist kein Programmfehler. */
      throw new Error("Der Server ist nicht erreichbar.");
    }
    const text = await a.text();
    let j = null;
    try { j = JSON.parse(text); } catch (e) {
      throw new Error("Der Server hat unverständlich geantwortet.");
    }
    if (!a.ok) throw new Error(j && j.fehler ? j.fehler : "Fehler " + a.status);
    return j;
  }

  /* ---------- Lobby ---------- */
  const anlegen = (name, farbe, opts) => ruf("anlegen", { name: name, color: farbe, opts: opts });
  const beitreten = (spiel, name, farbe) => ruf("beitreten", { spiel: spiel, name: name, color: farbe });
  const lage = (spiel) => ruf("lage", null, { spiel: spiel });
  const starten = (spiel, geheim) => ruf("starten", { spiel: spiel, geheim: geheim });

  /* ---------- Sitzung ----------
     Haelt fest, wer man ist und bis zu welchem Zug man nachgespielt hat.
     `bis` ist die einzige Buchhaltung, die es braucht: alles danach ist
     noch nicht gesehen. */
  function Sitzung(spiel, geheim, platz) {
    return {
      spiel: spiel, geheim: geheim, platz: platz,
      bis: 0,
      laeuft: false,      // laeuft gerade ein Abholen? (kein zweites daneben)
      takt: null,
      fehlerZaehler: 0,
    };
  }

  /* Neue Zuege holen und der Reihe nach anwenden. `anwenden(aktion, zufall)`
     kommt von aussen und darf fehlschlagen – dann bleibt `bis` stehen und
     der naechste Versuch beginnt an derselben Stelle. */
  async function abholen(s, anwenden) {
    if (s.laeuft) return 0;
    s.laeuft = true;
    try {
      const antwort = await ruf("zuege", null, { spiel: s.spiel, seit: String(s.bis) });
      let n = 0;
      for (const z of antwort.zuege) {
        anwenden(z.aktion, z.zufall);
        s.bis = z.nr;
        n++;
      }
      s.fehlerZaehler = 0;
      return n;
    } finally {
      s.laeuft = false;
    }
  }

  /* Einen eigenen Zug einreichen. Angewendet wird er NICHT hier, sondern
     erst, wenn er ueber `abholen` zurueckkommt. Das ist Absicht: so laeuft
     der eigene Zug durch genau denselben Weg wie ein fremder, und es gibt
     nur eine Stelle, an der der Zustand fortgeschrieben wird. Ein Zug, den
     der Server nicht angenommen hat, wirkt sich damit auch nirgends aus. */
  async function einreichen(s, aktion, anwenden) {
    await ruf("zug", { spiel: s.spiel, geheim: s.geheim, aktion: aktion });
    return abholen(s, anwenden);
  }

  /* Regelmaessig nachsehen. Kein WebSocket: ein Webhoster-Paket haelt
     keinen dauerhaften Prozess. Alle paar Sekunden nachfragen genuegt fuer
     ein Spiel, in dem ein Zug Minuten dauert.

     Bei Fehlern wird der Takt laenger statt gleich zu bleiben – ein Server,
     der gerade nicht kann, soll nicht auch noch beschossen werden. */
  function taktStarten(s, anwenden, gemeldet, takt) {
    taktStoppen(s);
    const grund = takt || 2500;
    const einmal = async () => {
      try {
        const n = await abholen(s, anwenden);
        if (n && gemeldet) gemeldet(n);
      } catch (e) {
        s.fehlerZaehler++;
        if (gemeldet) gemeldet(0, e);
      }
      const warten = Math.min(grund * Math.pow(2, Math.min(s.fehlerZaehler, 4)), 60000);
      s.takt = setTimeout(einmal, s.fehlerZaehler ? warten : grund);
    };
    s.takt = setTimeout(einmal, grund);
  }
  function taktStoppen(s) {
    if (s.takt) { clearTimeout(s.takt); s.takt = null; }
  }

  return { anlegen, beitreten, lage, starten, Sitzung, abholen, einreichen,
           taktStarten, taktStoppen };
})();
if (typeof module !== "undefined") module.exports = RiskNetz;
