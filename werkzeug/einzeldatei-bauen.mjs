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
   ===================================================================== */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ZIEL = path.join(WURZEL, "risiko-komplett.html");

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

const ersetzungen = [
  ['<script src="risiko-regeln.js"></script>', "risiko-regeln.js"],
  ['<script src="risiko-daten.js" onerror="window.__keineDaten=1"></script>', "risiko-daten.js"],
  ['<script src="risiko-karte.js"></script>', "risiko-karte.js"],
  ['<script src="vendor/three.min.js"></script>', "vendor/three.min.js"],
];

for (const [tag, quelle] of ersetzungen) {
  if (!html.includes(tag)) {
    throw new Error(
      "Script-Tag nicht gefunden:\n  " + tag + "\nWurde risiko.html umgebaut? Dann hier nachziehen."
    );
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
console.log("Laeuft per Doppelklick, ohne Repo und ohne Internet.");
