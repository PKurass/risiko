/* =====================================================================
   RISIKO — LANDTEXTUR PRUEFEN UND BACKEN
   Nimmt die gemalte Weltkarte (z. B. grafik/Risk_tex.png) und macht zwei
   Dinge daraus:

     1. textur-pruefung.png  – das Bild mit den gebackenen Umrissen aus
        risiko-daten.js darueber. Damit sieht man auf einen Blick, ob
        Malerei und Spielflaechen deckungsgleich liegen. Nicht eingecheckt,
        nur zum Draufschauen.

     2. grafik/land-textur.png – dieselbe Malerei, heruntergerechnet auf
        eine Kantenlaenge, die eine Grafikkarte gern als Textur nimmt
        (Voreinstellung 2048). Transparenz bleibt erhalten: die hellen
        Fugen zwischen den Laendern sind Loecher im Bild, keine gemalten
        Linien – dort scheint spaeter die Spielerfarbe durch.

     3. grafik/land-textur.js – dasselbe Bild noch einmal, als data-URL in
        einer JavaScript-Datei. Genau die laedt das Spiel. Umweg noetig,
        weil Chrome einer per Doppelklick geoeffneten Seite verbietet,
        Bilddateien aus dem Nachbarordner zu benutzen; ein <script src>
        darf sie dagegen laden. Denselben Trick benutzt risiko-daten.js,
        und die Einzeldatei-Fassung bekommt die Textur so gratis mit.

   Gerechnet wird wieder in einem unsichtbaren Chromium. Nicht aus Jux:
   dort steckt der PNG-Decoder und die Canvas-Skalierung schon drin, sonst
   braeuchte das Repo eine Bildbibliothek als Abhaengigkeit.

   Aufruf:
     node werkzeug/textur-backen.mjs grafik/Risk_tex.png
     ... --nur-pruefen        nur die Pruefansicht, nichts backen
     ... --kante 4096         andere Kantenlaenge der fertigen Textur
   ===================================================================== */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { WURZEL } from "./regeln-laden.mjs";

/* ---------- Argumente ---------- */
function argumente(argv) {
  const o = { quelle: null, kante: 2048, nurPruefen: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--nur-pruefen") o.nurPruefen = true;
    else if (a === "--kante") o.kante = Number(argv[++i]);
    else if (a.startsWith("--")) throw new Error("Unbekannter Schalter: " + a);
    else o.quelle = path.resolve(process.cwd(), a);
  }
  if (!o.quelle) o.quelle = path.join(WURZEL, "grafik/Risk_tex.png");
  if (!Number.isFinite(o.kante) || o.kante < 256) throw new Error("--kante braucht eine Zahl ab 256.");
  return o;
}

function kurz(p) {
  const r = path.relative(WURZEL, p);
  return r.startsWith("..") ? p : r;
}

/* risiko-daten.js setzt window.RISIKO_MAP – in Node gibt es kein window,
   also wird der Zuweisungsteil herausgeschnitten und geparst. */
function karteLesen() {
  const p = path.join(WURZEL, "risiko-daten.js");
  if (!fs.existsSync(p)) throw new Error("risiko-daten.js fehlt – erst 'npm run karte' laufen lassen.");
  const txt = fs.readFileSync(p, "utf8");
  const i = txt.indexOf("window.RISIKO_MAP=");
  if (i < 0) throw new Error("risiko-daten.js sieht unerwartet aus (kein window.RISIKO_MAP).");
  return JSON.parse(txt.slice(i + "window.RISIKO_MAP=".length).trim().replace(/;\s*$/, ""));
}

/* ---------- Im Browser ---------- */
/* Laeuft komplett in der Seite: Bild aus einer data-URL laden, Umrisse
   darueberzeichnen, verkleinern. Rueckgabe sind wieder data-URLs. */
async function verarbeiten(opt, karte, datenUrl) {
  const browser = await chromium.launch();
  try {
    const seite = await browser.newPage();
    const fehler = [];
    seite.on("pageerror", (e) => fehler.push(String(e)));
    await seite.setContent("<!doctype html><html><body></body></html>");

    const ergebnis = await seite.evaluate(
      async ({ url, polys, W, H, kante, nurPruefen }) => {
        const bild = new Image();
        bild.src = url;
        await bild.decode();
        const bw = bild.naturalWidth,
          bh = bild.naturalHeight;

        function flaeche(w, h) {
          const c = document.createElement("canvas");
          c.width = w;
          c.height = h;
          return c;
        }

        /* --- Pruefansicht: Umrisse ueber das Bild --- */
        const p = flaeche(bw, bh);
        const g = p.getContext("2d");
        /* Karierter Grund, sonst sieht man Transparenz nicht von Weiss. */
        const kach = 32;
        for (let y = 0; y < bh; y += kach) {
          for (let x = 0; x < bw; x += kach) {
            g.fillStyle = ((x / kach + y / kach) & 1) ? "#c8c8c8" : "#f0f0f0";
            g.fillRect(x, y, kach, kach);
          }
        }
        g.drawImage(bild, 0, 0);

        /* Kartenkoordinaten (0..W, 0..H) auf Bildpixel. Angenommen wird,
           dass die Malerei denselben Bildausschnitt zeigt wie die SVG. */
        const sx = bw / W,
          sy = bh / H;
        g.lineJoin = "round";
        for (const [, teile] of Object.entries(polys)) {
          for (const ring of teile) {
            g.beginPath();
            ring.forEach(([x, y], i) =>
              i ? g.lineTo(x * sx, y * sy) : g.moveTo(x * sx, y * sy)
            );
            g.closePath();
            g.lineWidth = Math.max(3, bw / 500);
            g.strokeStyle = "rgba(0,0,0,0.55)";
            g.stroke();
            g.lineWidth = Math.max(1.5, bw / 1000);
            g.strokeStyle = "#ff00c8";
            g.stroke();
          }
        }
        const pruefung = p.toDataURL("image/png");

        /* --- Deckungsgrad: wie viel Flaeche innerhalb der Umrisse ist
               ueberhaupt bemalt? Ein niedriger Wert heisst Versatz. --- */
        const probe = flaeche(bw, bh);
        const pg = probe.getContext("2d");
        pg.drawImage(bild, 0, 0);
        const raster = 400;
        let drin = 0,
          deckend = 0;
        const daten = pg.getImageData(0, 0, bw, bh).data;
        function imRing(ring, x, y) {
          let t = false;
          for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const [xi, yi] = ring[i],
              [xj, yj] = ring[j];
            if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) t = !t;
          }
          return t;
        }
        const alle = Object.values(polys).flat();
        for (let gy = 0; gy < raster; gy++) {
          const my = ((gy + 0.5) / raster) * H;
          for (let gx = 0; gx < raster; gx++) {
            const mx = ((gx + 0.5) / raster) * W;
            let innen = false;
            for (const ring of alle) if (imRing(ring, mx, my)) { innen = true; break; }
            if (!innen) continue;
            drin++;
            const px = Math.min(bw - 1, Math.floor(mx * sx)),
              py = Math.min(bh - 1, Math.floor(my * sy));
            if (daten[(py * bw + px) * 4 + 3] > 128) deckend++;
          }
        }

        /* --- Fertige Textur: schrittweise halbieren, das gibt weniger
               Treppen als ein einziger grosser Sprung. --- */
        let textur = null,
          tw = 0,
          th = 0;
        if (!nurPruefen) {
          const f = Math.min(1, kante / Math.max(bw, bh));
          tw = Math.max(1, Math.round(bw * f));
          th = Math.max(1, Math.round(bh * f));
          let quelle = bild,
            qw = bw,
            qh = bh;
          while (qw > tw * 2 && qh > th * 2) {
            const halb = flaeche(Math.round(qw / 2), Math.round(qh / 2));
            const hg = halb.getContext("2d");
            hg.imageSmoothingQuality = "high";
            hg.drawImage(quelle, 0, 0, halb.width, halb.height);
            quelle = halb;
            qw = halb.width;
            qh = halb.height;
          }
          const z = flaeche(tw, th);
          const zg = z.getContext("2d");
          zg.imageSmoothingQuality = "high";
          zg.drawImage(quelle, 0, 0, tw, th);
          textur = z.toDataURL("image/png");
        }

        return { bw, bh, pruefung, textur, tw, th, drin, deckend };
      },
      { url: datenUrl, polys: karte.polys, W: karte.W, H: karte.H, kante: opt.kante, nurPruefen: opt.nurPruefen }
    );

    if (fehler.length) throw new Error("Fehler im Browser:\n" + fehler.join("\n"));
    return ergebnis;
  } finally {
    await browser.close();
  }
}

function schreiben(ziel, datenUrl) {
  fs.mkdirSync(path.dirname(ziel), { recursive: true });
  fs.writeFileSync(ziel, Buffer.from(datenUrl.split(",")[1], "base64"));
  return Math.round(fs.statSync(ziel).size / 1024);
}

/* ---------- Hauptlauf ---------- */
const opt = argumente(process.argv.slice(2));
if (!fs.existsSync(opt.quelle)) {
  console.log("Bild nicht gefunden: " + kurz(opt.quelle));
  process.exit(1);
}
const karte = karteLesen();
console.log("Quelle: " + kurz(opt.quelle));

const datenUrl = "data:image/png;base64," + fs.readFileSync(opt.quelle).toString("base64");
const r = await verarbeiten(opt, karte, datenUrl);

const bildSeite = r.bw / r.bh,
  karteSeite = karte.W / karte.H;
console.log("Bild:  " + r.bw + " x " + r.bh + " px, Seitenverhaeltnis " + bildSeite.toFixed(4));
console.log("Karte: " + karte.W + " x " + karte.H + ", Seitenverhaeltnis " + karteSeite.toFixed(4));
const abweichung = Math.abs(bildSeite / karteSeite - 1) * 100;
console.log(
  abweichung < 1
    ? "  Passt (" + abweichung.toFixed(2) + " % Abweichung) – gleiche Bildausschnitte."
    : "  ACHTUNG: " + abweichung.toFixed(2) + " % Abweichung. Das Bild zeigt einen anderen\n" +
      "  Ausschnitt als die SVG; gleichmaessig kann es dann nicht passen."
);

const quote = r.drin ? (r.deckend / r.drin) * 100 : 0;
console.log(
  "Deckung: " + quote.toFixed(1) + " % der Landflaeche aus risiko-daten.js ist bemalt." +
  (quote > 92 ? "  Gut." : quote > 70 ? "  Grenzwertig – Versatz in der Pruefansicht suchen."
                                      : "  Zu wenig – da liegt etwas deutlich daneben.")
);

const kbP = schreiben(path.join(WURZEL, "textur-pruefung.png"), r.pruefung);
console.log("\nGeschrieben: textur-pruefung.png (" + kbP + " kB) – Umrisse in Magenta,");
console.log("             Schachbrett heisst Transparenz.");

if (r.textur) {
  const ziel = path.join(WURZEL, "grafik/land-textur.png");
  const kbT = schreiben(ziel, r.textur);
  console.log("Geschrieben: " + kurz(ziel) + " (" + r.tw + " x " + r.th + " px, " + kbT + " kB)");

  const zielJs = path.join(WURZEL, "grafik/land-textur.js");
  fs.writeFileSync(
    zielJs,
    "/* Automatisch erzeugt von werkzeug/textur-backen.mjs – nicht von Hand aendern.\n" +
      "   Quelle: " + kurz(opt.quelle) + "\n" +
      "   Groesse: " + r.tw + " x " + r.th + " px\n" +
      "   Neu backen: npm run textur */\n" +
      "window.RISIKO_TEX=" + JSON.stringify(r.textur) + ";\n"
  );
  console.log(
    "Geschrieben: " + kurz(zielJs) + " (" +
      Math.round(fs.statSync(zielJs).size / 1024) + " kB) – die laedt risiko.html."
  );
}
