/* =====================================================================
   RISIKO — EINZELDATEI BAUEN
   Packt risiko.html mit allem, was sie laedt, in eine einzige HTML-Datei:
   Karten-Modul, gebackene Karte und Three.js werden inline gestellt.

   Wozu? Zum Verschicken und Ausprobieren. Die Datei laeuft per Doppelklick
   aus jedem Ordner, ohne Repo, ohne Nachbardateien, ohne Internet. Fuer die
   Entwicklung bleibt risiko.html das Original – hier wird nur verpackt,
   nie etwas veraendert.

   Aufruf:  npm run einzeldatei
   Ergebnis: risiko-komplett.html (nicht eingecheckt, jederzeit neu baubar)

   Mit --fragment entsteht zusaetzlich risiko-artefakt.html: derselbe Inhalt,
   aber ohne <html>, <head> und <body>. Das braucht man beim Veroeffentlichen
   als Webseite, weil der Host seinen eigenen Dokumentrahmen darum legt –
   mit unserem eigenen Rahmen waeren es zwei ineinander.
   ===================================================================== */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ZIEL = path.join(WURZEL, "risiko-komplett.html");
const ZIEL_FRAGMENT = path.join(WURZEL, "risiko-artefakt.html");
const alsFragment = process.argv.includes("--fragment");

/* Ein "</script>" im eingebetteten Code wuerde den umgebenden Block
   vorzeitig schliessen – der Browser beendet das Element beim reinen
   Textvergleich, ohne den JavaScript-Kontext zu beachten. */
function sicher(js) {
  return js.replace(/<\/script/gi, "<\\/script");
}

function lies(rel) {
  const p = path.join(WURZEL, rel);
  if (!fs.existsSync(p)) throw new Error("Fehlt: " + rel + " – erst 'npm run karte' laufen lassen?");
  return fs.readFileSync(p, "utf8");
}

let html = lies("risiko.html");

/* Der dritte Wert markiert eine Datei, die fehlen darf. Die gemalte
   Weltkarte ist so ein Fall: ohne sie laeuft das Spiel, nur eben einfarbig.
   Steht sie nicht da, faellt ihr Script-Tag ersatzlos heraus – sonst suchte
   die verschickte Datei nach einem Nachbarn, den es nicht gibt. */
const ersetzungen = [
  ['<script src="risiko-regeln.js"></script>', "risiko-regeln.js"],
  ['<script src="risiko-daten.js" onerror="window.__keineDaten=1"></script>', "risiko-daten.js"],
  ['<script src="risiko-karte.js"></script>', "risiko-karte.js"],
  ['<script src="risiko-netz.js"></script>', "risiko-netz.js"],
  ['<script src="grafik/land-textur.js" onerror="window.__keineTextur=1"></script>',
    "grafik/land-textur.js", true],
  ['<script src="vendor/three.min.js"></script>', "vendor/three.min.js"],
];

for (const [tag, quelle, darfFehlen] of ersetzungen) {
  if (!html.includes(tag)) {
    throw new Error(
      "Script-Tag nicht gefunden:\n  " + tag + "\nWurde risiko.html umgebaut? Dann hier nachziehen."
    );
  }
  if (darfFehlen && !fs.existsSync(path.join(WURZEL, quelle))) {
    console.log("Nicht vorhanden, wird weggelassen: " + quelle);
    html = html.replace(tag, "<!-- " + quelle + " nicht vorhanden -->");
    continue;
  }
  html = html.replace(
    tag,
    "<script>/* " + quelle + " */\n" + sicher(lies(quelle)) + "\n</script>"
  );
}

/* Hinweis fuer den, der die Datei spaeter in die Hand bekommt */
html = html.replace(
  "<head>",
  "<head>\n<!-- Erzeugt von werkzeug/einzeldatei-bauen.mjs. Alles inline, laeuft ohne\n" +
    "     Internet und ohne Nachbardateien. Zum Weiterentwickeln nicht diese Datei\n" +
    "     bearbeiten, sondern risiko.html im Repo. -->"
);

const uebrig = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/gi)].map((m) => m[1]);
if (uebrig.length) {
  throw new Error(
    "Nicht eingebettet: " + uebrig.join(", ") +
    "\nDie Datei waere nur im Repo lauffaehig. Neuen Tag oben in 'ersetzungen' nachtragen."
  );
}

fs.writeFileSync(ZIEL, html);
console.log(
  "Geschrieben: " +
    path.basename(ZIEL) +
    " (" +
    Math.round(fs.statSync(ZIEL).size / 1024) +
    " kB)"
);

if (alsFragment) {
  const stil = html.match(/<style>[\s\S]*?<\/style>/);
  const koerper = html.match(/<body>([\s\S]*)<\/body>/);
  if (!stil || !koerper) {
    throw new Error("style- oder body-Block nicht gefunden – wurde risiko.html umgebaut?");
  }
  const frag = stil[0] + "\n" + koerper[1].trim() + "\n";
  /* Mit Wortgrenze pruefen: ein blosses "<head" trifft sonst auch <header>,
     und das steht voellig zu Recht im Fragment. */
  for (const [name, muster] of [["<!doctype", /<!doctype/i], ["<html>", /<html[\s>]/i],
                                ["<head>", /<head[\s>]/i], ["<body>", /<body[\s>]/i]]) {
    if (muster.test(frag)) throw new Error("Rahmen-Tag " + name + " steckt noch im Fragment.");
  }
  fs.writeFileSync(ZIEL_FRAGMENT, frag);
  console.log(
    "Geschrieben: " + path.basename(ZIEL_FRAGMENT) +
    " (" + Math.round(fs.statSync(ZIEL_FRAGMENT).size / 1024) + " kB, zum Veroeffentlichen)"
  );
}
console.log("Laeuft per Doppelklick, ohne Repo und ohne Internet.");
