/* =====================================================================
   RISIKO — KARTE BACKEN
   Erzeugt risiko-daten.js, damit das Spiel beim Start nichts mehr
   auswaehlen muss. Macht genau das, was frueher der Knopf "Karte sichern"
   im Browser gemacht hat – nur ohne Browserfenster und ohne Klicken.

   Warum ueberhaupt ein Browser? Das Karten-Modul SvgMap tastet die
   SVG-Pfade mit getTotalLength()/getPointAtLength() ab und liest die
   Fuellfarbe per getComputedStyle(). Diese Kurvenmathematik steckt in der
   Browser-Engine; in reinem Node gibt es sie nicht. Also wird ein
   unsichtbares Chromium gestartet und dort das UNVERAENDERTE
   risiko-karte.js benutzt. Dadurch gibt es weiterhin nur eine einzige
   Implementierung des Einlesens – hier wird nichts nachgebaut.

   Aufruf:
     node werkzeug/karte-backen.mjs                  # nimmt ./Risk.svg
     node werkzeug/karte-backen.mjs pfad/zur.svg     # andere SVG
     node werkzeug/karte-backen.mjs --gezeichnet     # ohne SVG, siehe unten
     ... --ziel andere-daten.js                      # anderes Ausgabeziel

   --gezeichnet nimmt statt einer SVG die frueher im Code eingebaute,
   selbstgezeichnete Weltkarte (archiv/risiko-karte-gezeichnet.js). Das ist
   die Rueckfallebene, wenn gerade keine Risk.svg vorliegt: grob, aber
   sofort spielbar und ohne Internet.
   ===================================================================== */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const WURZEL = path.resolve(HIER, "..");

/* ---------- Argumente ---------- */
function argumente(argv) {
  const o = { svg: null, ziel: path.join(WURZEL, "risiko-daten.js"), gezeichnet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--gezeichnet") o.gezeichnet = true;
    else if (a === "--ziel") o.ziel = path.resolve(WURZEL, argv[++i] ?? "");
    else if (a.startsWith("--")) throw new Error("Unbekannter Schalter: " + a);
    else o.svg = path.resolve(process.cwd(), a);
  }
  if (!o.gezeichnet && !o.svg) o.svg = path.join(WURZEL, "Risk.svg");
  return o;
}

/* ---------- Regelkern aus risiko.html schneiden ----------
   Beide Kartenmodule greifen beim Auswerten auf RiskEngine.TERR zu. Statt
   die 42 Territorien hier ein zweites Mal zu pflegen (und damit auf Dauer
   auseinanderlaufen zu lassen), wird der Regelkern aus risiko.html
   herausgeschnitten. Stimmen die Markierungen nicht mehr, bricht das
   Werkzeug hoerbar ab, statt mit einer veralteten Kopie weiterzumachen. */
function regelkernQuelltext() {
  const html = fs.readFileSync(path.join(WURZEL, "risiko.html"), "utf8");
  const von = html.indexOf("const RiskEngine=(function(){");
  const bis = html.indexOf("</script>", von);
  if (von < 0 || bis < 0) {
    throw new Error(
      "RiskEngine liess sich nicht aus risiko.html schneiden. Wurde TEIL 1 umbenannt oder verschoben?"
    );
  }
  return html.slice(von, bis);
}

/* Pfade moeglichst kurz anzeigen – aber nichts wie ../../../tmp/... , das
   liest sich schlechter als der volle Pfad. */
function kurz(p) {
  const r = path.relative(WURZEL, p);
  return r.startsWith("..") ? p : r;
}

function datei(relativ) {
  const p = path.join(WURZEL, relativ);
  if (!fs.existsSync(p)) throw new Error("Datei fehlt: " + relativ);
  return fs.readFileSync(p, "utf8");
}

/* ---------- Backen ---------- */
async function backen(opt) {
  const browser = await chromium.launch();
  try {
    const seite = await browser.newPage();
    const fehler = [];
    seite.on("pageerror", (e) => fehler.push(String(e)));
    await seite.setContent("<!doctype html><html><body></body></html>");
    await seite.addScriptTag({ content: regelkernQuelltext() });

    let karte;
    if (opt.gezeichnet) {
      await seite.addScriptTag({ content: datei("archiv/risiko-karte-gezeichnet.js") });
      karte = await seite.evaluate(() => ({
        W: WorldMap.W,
        H: WorldMap.H,
        polys: WorldMap.polys,
        center: WorldMap.center,
        color: WorldMap.color,
        fehlend: Object.keys(RiskEngine.TERR)
          .filter((id) => !WorldMap.polys[id])
          .map((id) => RiskEngine.TERR[id].n),
      }));
      karte.V = "Gezeichnete Karte v1";
    } else {
      if (!fs.existsSync(opt.svg)) {
        throw new Error(
          "SVG nicht gefunden: " +
            opt.svg +
            "\nEntweder Risk.svg dort ablegen, den Pfad als Argument angeben," +
            "\noder ersatzweise mit --gezeichnet backen."
        );
      }
      await seite.addScriptTag({ content: datei("risiko-karte.js") });
      const svgText = fs.readFileSync(opt.svg, "utf8");
      karte = await seite.evaluate((txt) => {
        SvgMap.importSvg(txt);
        const daten = JSON.parse(SvgMap.serialize());
        daten.fehlend = SvgMap.missing();
        return daten;
      }, svgText);
    }

    if (fehler.length) throw new Error("Fehler im Browser:\n" + fehler.join("\n"));
    return karte;
  } finally {
    await browser.close();
  }
}

/* ---------- Hauptlauf ---------- */
const opt = argumente(process.argv.slice(2));
console.log(
  opt.gezeichnet
    ? "Quelle: selbstgezeichnete Karte (archiv/risiko-karte-gezeichnet.js)"
    : "Quelle: " + kurz(opt.svg)
);

const karte = await backen(opt);
const { fehlend, ...daten } = karte;
const anzahl = Object.keys(daten.polys).length;

if (fehlend.length) {
  console.log("\nNicht erkannt (" + fehlend.length + "): " + fehlend.join(", "));
  console.log("Bei einer SVG heisst das fast immer: die id im Bild passt nicht");
  console.log("zur Namensliste in risiko-karte.js (NAME2ID).");
}
if (anzahl < 42) {
  console.log("\nAbbruch: nur " + anzahl + " von 42 Territorien erkannt.");
  console.log("Es wurde nichts geschrieben.");
  process.exit(1);
}

const kopf =
  "/* Automatisch erzeugt von werkzeug/karte-backen.mjs – nicht von Hand aendern.\n" +
  "   Quelle: " +
  (opt.gezeichnet ? "archiv/risiko-karte-gezeichnet.js" : kurz(opt.svg)) +
  "\n   Neu backen: npm run karte" +
  (opt.gezeichnet ? ":gezeichnet" : "") +
  " */\n";

fs.writeFileSync(opt.ziel, kopf + "window.RISIKO_MAP=" + JSON.stringify(daten) + ";\n");

const kb = Math.round(fs.statSync(opt.ziel).size / 1024);
console.log("\n" + anzahl + " von 42 Territorien gebacken.");
console.log("Geschrieben: " + kurz(opt.ziel) + " (" + kb + " kB)");
console.log("risiko.html laedt diese Datei beim Start von selbst – fertig.");
