/* =====================================================================
   RISIKO — HOCHLADEPAKET BAUEN

   Sammelt in einem Ordner `hochladen/` genau die Dateien ein, die auf den
   Webspace gehoeren – und nur die. Der Ordnerinhalt wird dann als Ganzes
   ins Web-Verzeichnis gezogen, fertig.

   Warum ueberhaupt? Im Repo liegen Werkzeuge, Tests, die Ausgangs-SVG und
   die Malerei in voller Aufloesung. Nichts davon wird zum Spielen
   gebraucht, das meiste ist gross, und die Zugangsdaten haben auf einem
   Webserver ohnehin nur einmal etwas zu suchen. Wer von Hand auswaehlt,
   vergisst irgendwann eine Datei oder laedt zwanzig Megabyte zu viel hoch.

   Aufruf: npm run hochladen
   ===================================================================== */
import fs from "node:fs";
import path from "node:path";
import { WURZEL } from "./regeln-laden.mjs";

const ZIEL = path.join(WURZEL, "hochladen");

/* Der dritte Wert markiert: darf fehlen. Ohne die Malerei laeuft das Spiel,
   nur eben einfarbig. */
const DATEIEN = [
  ["risiko.html", "Die Seite selbst"],
  ["risiko-regeln.js", "Regelkern"],
  ["risiko-karte.js", "Karten-Modul"],
  ["risiko-netz.js", "Netzteil"],
  ["risiko-daten.js", "Gebackene Karte"],
  ["vendor/three.min.js", "3D-Bibliothek"],
  ["grafik/land-textur.js", "Gemalte Weltkarte", true],
  ["server/risiko.php", "Postfach-Server"],
  ["server/zugang.beispiel.php", "Zugangsdaten – muss ausgefüllt werden", false, "server/zugang.php"],
];

const LIESMICH = `RISIKO – was hier drin liegt

Diesen Ordnerinhalt komplett ins Web-Verzeichnis des Webspace laden
(bei IONOS heisst es meist /  oder /clickandbuilds/... – das Verzeichnis,
in dem auch die index.html der Seite liegt).

Die Ordnerstruktur muss erhalten bleiben:

    risiko.html
    risiko-regeln.js
    risiko-karte.js
    risiko-netz.js
    risiko-daten.js
    vendor/three.min.js
    grafik/land-textur.js
    server/risiko.php
    server/zugang.php          <- da traegst du deine Datenbank ein

Danach:

 1. server/zugang.php oeffnen und die vier Angaben aus dem IONOS-Kundenmenue
    eintragen (alles, was mit HIER- anfaengt, ersetzen).
 2. Im Browser aufrufen:  https://DEINE-SEITE/server/risiko.php?was=pruefung
    Dort steht im Klartext, ob noch etwas fehlt.
 3. Spielen:              https://DEINE-SEITE/risiko.html

Ausfuehrlich: INSTALLATION.md im Projekt.
`;

function kopiere(von, nach) {
  fs.mkdirSync(path.dirname(nach), { recursive: true });
  fs.copyFileSync(von, nach);
  return fs.statSync(nach).size;
}

/* Ein altes Paket wird weggeraeumt, sonst schleppt man beim zweiten Mal
   Dateien mit, die gar nicht mehr dazugehoeren. */
fs.rmSync(ZIEL, { recursive: true, force: true });
fs.mkdirSync(ZIEL, { recursive: true });

let gesamt = 0;
const fehlend = [];
for (const [rel, zweck, darfFehlen, alsName] of DATEIEN) {
  const quelle = path.join(WURZEL, rel);
  if (!fs.existsSync(quelle)) {
    if (darfFehlen) { fehlend.push(rel + " (" + zweck + ") – optional"); continue; }
    console.error("FEHLT: " + rel + " (" + zweck + ")");
    console.error("Fehlt risiko-daten.js? Dann erst 'npm run karte' laufen lassen.");
    process.exit(1);
  }
  /* Die Vorlage wandert gleich unter ihrem Zielnamen mit. Umbenennen per
     FTP ist ein Schritt, bei dem viel schiefgeht – und ohne den Schritt
     kommt beim Aufruf sofort eine verstaendliche Meldung, dass die
     Platzhalter noch drinstehen. */
  const ziel = path.join(ZIEL, alsName || rel);
  const b = kopiere(quelle, ziel);
  gesamt += b;
  console.log("  " + (alsName || rel).padEnd(28) + (b / 1024).toFixed(0).padStart(6) + " kB   " + zweck);
}
fs.writeFileSync(path.join(ZIEL, "LIESMICH.txt"), LIESMICH);

console.log("");
if (fehlend.length) {
  console.log("Nicht dabei: " + fehlend.join(", "));
  console.log("(Läuft trotzdem – die Karte bleibt dann einfarbig.)");
  console.log("");
}
console.log("Paket liegt in: hochladen/  (" + Math.round(gesamt / 1024) + " kB)");
console.log("Den INHALT dieses Ordners ins Web-Verzeichnis laden, Struktur behalten.");
console.log("Danach server/zugang.php anlegen – siehe LIESMICH.txt im Paket.");
