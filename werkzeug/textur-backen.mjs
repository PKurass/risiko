/* =====================================================================
   RISIKO — LANDTEXTUR PRUEFEN UND BACKEN
   Nimmt die gemalte Weltkarte (grafik/Risk_tex.png) und macht daraus die
   Textur, die ueber den Spielflaechen liegt.

   Der heikle Teil ist die Passgenauigkeit. Die Malerei entsteht in
   Photoshop, die Spielflaechen kommen aus der Risk.svg – beide zeigen
   dieselbe Welt, aber selten im exakt selben Ausschnitt: ein paar Prozent
   groesser, ein paar Pixel verschoben. Von Hand ist das Gefummel. Deshalb
   rechnet das Werkzeug die Einpassung selbst aus: es sucht die Dehnung und
   Verschiebung, bei der bemalte Flaeche und Spielflaeche am besten
   uebereinanderliegen, und backt die Textur gleich begradigt aus. Danach
   deckt sich das Bild mit dem Kartenraster 0..W / 0..H, und risiko.html
   braucht keine Sonderrechnung.

   Was entsteht:

     textur-pruefung.png    Malerei (eingepasst) mit den Umrissen aus
                            risiko-daten.js in Magenta darueber. Zum
                            Draufschauen, nicht eingecheckt.
     grafik/land-textur.png Die fertige Textur, auf das Kartenraster
                            begradigt. Transparenz bleibt erhalten: die
                            Fugen zwischen den Laendern sind Loecher im
                            Bild, keine gemalten Linien – dort scheint
                            spaeter die Spielerfarbe durch.
     grafik/land-textur.js  Dasselbe Bild als data-URL. Genau die laedt das
                            Spiel. Umweg noetig, weil Chrome einer per
                            Doppelklick geoeffneten Seite verbietet,
                            Bilddateien aus dem Nachbarordner zu benutzen;
                            ein <script src> darf sie dagegen laden.
                            Denselben Trick benutzt risiko-daten.js, und
                            die Einzeldatei-Fassung bekommt die Textur so
                            ohne Zusatzarbeit mit.

   Gerechnet wird in einem unsichtbaren Chromium. Nicht aus Jux: dort
   stecken PNG-Decoder und Canvas-Skalierung schon drin, sonst braeuchte
   das Repo eine Bildbibliothek als Abhaengigkeit.

   Aufruf:
     node werkzeug/textur-backen.mjs grafik/Risk_tex.png
     ... --roh               ohne Einpassung, Bild 1:1 uebernehmen
     ... --nur-pruefen       nur die Pruefansicht, nichts backen
     ... --kante 4096        andere Kantenlaenge der fertigen Textur
   ===================================================================== */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { WURZEL } from "./regeln-laden.mjs";

/* ---------- Argumente ---------- */
function argumente(argv) {
  const o = { quelle: null, kante: 2048, nurPruefen: false, roh: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--nur-pruefen") o.nurPruefen = true;
    else if (a === "--roh") o.roh = true;
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
/* Laeuft komplett in der Seite. Rueckgabe sind data-URLs und Kennzahlen. */
async function verarbeiten(opt, karte, datenUrl) {
  const browser = await chromium.launch();
  try {
    const seite = await browser.newPage();
    const fehler = [];
    seite.on("pageerror", (e) => fehler.push(String(e)));
    await seite.setContent("<!doctype html><html><body></body></html>");

    const ergebnis = await seite.evaluate(
      async ({ url, polys, W, H, kante, nurPruefen, roh }) => {
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

        /* ---------------------------------------------------------------
           Zwei grobe Schwarzweiss-Bilder, auf denen gerechnet wird. Grob
           deshalb, weil die Einpassung ein paar hundert Mal durchprobiert
           wird – in voller Aufloesung waere das sinnlos langsam und keinen
           Deut genauer.
           --------------------------------------------------------------- */

        /* (a) Wo ist ueberhaupt Farbe? Alphakanal des Bildes, verkleinert. */
        const AW = 800,
          AH = Math.max(1, Math.round((AW * bh) / bw));
        const ac = flaeche(AW, AH);
        const agx = ac.getContext("2d");
        agx.imageSmoothingQuality = "high";
        agx.drawImage(bild, 0, 0, AW, AH);
        const aroh = agx.getImageData(0, 0, AW, AH).data;
        const alpha = new Uint8Array(AW * AH);
        for (let i = 0; i < AW * AH; i++) alpha[i] = aroh[i * 4 + 3] > 128 ? 1 : 0;

        /* (b) Wo liegt Spielflaeche? Die Umrisse aus risiko-daten.js, in
               dasselbe Raster gefuellt. Gezeichnet statt Punkt-fuer-Punkt
               geprueft: fillRect kann das Fuellen von Polygonen selbst. */
        const GX = 480,
          GY = Math.max(1, Math.round((GX * H) / W));
        const pc = flaeche(GX, GY);
        const pgx = pc.getContext("2d");
        pgx.fillStyle = "#fff";
        for (const teile of Object.values(polys)) {
          for (const ring of teile) {
            pgx.beginPath();
            ring.forEach(([x, y], i) =>
              i ? pgx.lineTo((x / W) * GX, (y / H) * GY) : pgx.moveTo((x / W) * GX, (y / H) * GY)
            );
            pgx.closePath();
            pgx.fill();
          }
        }
        const proh = pgx.getImageData(0, 0, GX, GY).data;
        const land = new Uint8Array(GX * GY);
        let landZahl = 0;
        for (let i = 0; i < GX * GY; i++) {
          land[i] = proh[i * 4 + 3] > 128 ? 1 : 0;
          landZahl += land[i];
        }

        /* ---------------------------------------------------------------
           Die Einpassung. Gesucht sind vier Zahlen: Dehnung sx, sy und
           Verschiebung ox, oy. Sie sagen, welche Stelle des Bildes zu
           welcher Stelle der Karte gehoert:

               u = (mx/W) * sx + ox        v = (my/H) * sy + oy

           sx=sy=1, ox=oy=0 heisst "Bild deckt die Karte genau ab".
           --------------------------------------------------------------- */

        /* Guete: Schnittmenge durch Vereinigungsmenge (IoU). Reine Deckung
           taugt nicht als Massstab – die waere am hoechsten, wenn man das
           Bild einfach riesig zieht, bis es alles zuklebt. IoU bestraft
           beides: unbemalte Spielflaeche und Farbe neben der Spielflaeche. */
        function guete(sx, sy, ox, oy) {
          let schnitt = 0,
            vereinigung = 0;
          for (let gy = 0; gy < GY; gy++) {
            const v = ((gy + 0.5) / GY) * sy + oy;
            const ay = Math.floor(v * AH);
            const zeileA = ay >= 0 && ay < AH ? ay * AW : -1;
            const zeileL = gy * GX;
            for (let gx = 0; gx < GX; gx++) {
              const istLand = land[zeileL + gx];
              let istFarbe = 0;
              if (zeileA >= 0) {
                const u = ((gx + 0.5) / GX) * sx + ox;
                const ax = Math.floor(u * AW);
                if (ax >= 0 && ax < AW) istFarbe = alpha[zeileA + ax];
              }
              if (istLand & istFarbe) schnitt++;
              if (istLand | istFarbe) vereinigung++;
            }
          }
          return vereinigung ? schnitt / vereinigung : 0;
        }

        /* Startwert aus Schwerpunkt und Streuung beider Flaechen. Das ist
           kein Suchen, sondern Rechnen, und liegt meist schon nah dran –
           die Feinsuche danach hat dann wenig zu tun. */
        function momente(maske, mw, mh) {
          let n = 0,
            sx = 0,
            sy = 0,
            sxx = 0,
            syy = 0;
          for (let y = 0; y < mh; y++) {
            for (let x = 0; x < mw; x++) {
              if (!maske[y * mw + x]) continue;
              const u = (x + 0.5) / mw,
                v = (y + 0.5) / mh;
              n++;
              sx += u;
              sy += v;
              sxx += u * u;
              syy += v * v;
            }
          }
          if (!n) return null;
          const mu = sx / n,
            mv = sy / n;
          return {
            mu,
            mv,
            du: Math.sqrt(Math.max(1e-9, sxx / n - mu * mu)),
            dv: Math.sqrt(Math.max(1e-9, syy / n - mv * mv)),
          };
        }

        let best = { sx: 1, sy: 1, ox: 0, oy: 0 };
        const vorher = guete(1, 1, 0, 0);
        let iou = vorher;

        if (!roh) {
          const mFarbe = momente(alpha, AW, AH),
            mLand = momente(land, GX, GY);
          if (mFarbe && mLand) {
            const start = {
              sx: mFarbe.du / mLand.du,
              sy: mFarbe.dv / mLand.dv,
              ox: 0,
              oy: 0,
            };
            start.ox = mFarbe.mu - mLand.mu * start.sx;
            start.oy = mFarbe.mv - mLand.mv * start.sy;
            const gStart = guete(start.sx, start.sy, start.ox, start.oy);
            if (gStart > iou) {
              best = start;
              iou = gStart;
            }
          }
          /* Feinsuche: um den besten Stand herum ein Kreuz abtasten und den
             Radius halbieren, solange sich noch etwas verbessert. Ein
             vollstaendiges Raster ueber vier Zahlen waere hundertmal so
             teuer und faende dasselbe. */
          let rS = 0.06,
            rO = 0.04;
          for (let runde = 0; runde < 9; runde++) {
            let verbessert = false;
            for (const [dsx, dsy, dox, doy] of [
              [rS, 0, 0, 0], [-rS, 0, 0, 0], [0, rS, 0, 0], [0, -rS, 0, 0],
              [0, 0, rO, 0], [0, 0, -rO, 0], [0, 0, 0, rO], [0, 0, 0, -rO],
              [rS, rS, 0, 0], [-rS, -rS, 0, 0],
              [0, 0, rO, rO], [0, 0, -rO, -rO],
              [rS, 0, rO / 2, 0], [-rS, 0, -rO / 2, 0],
              [0, rS, 0, rO / 2], [0, -rS, 0, -rO / 2],
            ]) {
              const k = { sx: best.sx + dsx, sy: best.sy + dsy, ox: best.ox + dox, oy: best.oy + doy };
              const g = guete(k.sx, k.sy, k.ox, k.oy);
              if (g > iou + 1e-6) {
                best = k;
                iou = g;
                verbessert = true;
              }
            }
            if (!verbessert) {
              rS /= 2;
              rO /= 2;
            }
          }
        }

        /* ---------------------------------------------------------------
           Ausgabe. Beide Bilder entstehen im Kartenraster: das Bild wird so
           hineingezeichnet, wie die Einpassung es vorgibt. Danach gilt
           schlicht "Bildmitte = Kartenmitte", und risiko.html rechnet nichts
           mehr um.
           --------------------------------------------------------------- */
        function malen(g, zw, zh) {
          /* Aus u = (mx/W)*sx + ox wird die Zeichenanweisung: das ganze
             Bild um 1/sx gestaucht und um -ox verschoben einsetzen. */
          const bx = zw / best.sx,
            by = zh / best.sy;
          g.imageSmoothingQuality = "high";
          g.drawImage(bild, (-best.ox * zw) / best.sx, (-best.oy * zh) / best.sy, bx, by);
        }

        /* --- Pruefansicht --- */
        const PW = 2000,
          PH = Math.max(1, Math.round((PW * H) / W));
        const p = flaeche(PW, PH);
        const g = p.getContext("2d");
        const kach = 24;
        for (let y = 0; y < PH; y += kach) {
          for (let x = 0; x < PW; x += kach) {
            g.fillStyle = (x / kach + y / kach) & 1 ? "#c8c8c8" : "#f0f0f0";
            g.fillRect(x, y, kach, kach);
          }
        }
        malen(g, PW, PH);
        g.lineJoin = "round";
        for (const teile of Object.values(polys)) {
          for (const ring of teile) {
            g.beginPath();
            ring.forEach(([x, y], i) =>
              i ? g.lineTo((x / W) * PW, (y / H) * PH) : g.moveTo((x / W) * PW, (y / H) * PH)
            );
            g.closePath();
            g.lineWidth = 3.5;
            g.strokeStyle = "rgba(0,0,0,0.5)";
            g.stroke();
            g.lineWidth = 1.6;
            g.strokeStyle = "#ff00c8";
            g.stroke();
          }
        }
        const pruefung = p.toDataURL("image/png");

        /* --- Deckung: wie viel Spielflaeche ist nach der Einpassung
               bemalt? Anders als IoU eine Zahl zum Vorstellen. --- */
        function deckung(sx, sy, ox, oy) {
          let drin = 0,
            bemalt = 0;
          for (let gy = 0; gy < GY; gy++) {
            const v = (gy + 0.5) / GY * sy + oy;
            const ay = Math.floor(v * AH);
            for (let gx = 0; gx < GX; gx++) {
              if (!land[gy * GX + gx]) continue;
              drin++;
              if (ay < 0 || ay >= AH) continue;
              const ax = Math.floor((((gx + 0.5) / GX) * sx + ox) * AW);
              if (ax >= 0 && ax < AW && alpha[ay * AW + ax]) bemalt++;
            }
          }
          return drin ? bemalt / drin : 0;
        }
        const deckVorher = deckung(1, 1, 0, 0);
        const deckNachher = deckung(best.sx, best.sy, best.ox, best.oy);

        /* --- Fertige Textur --- */
        let textur = null,
          tw = 0,
          th = 0;
        if (!nurPruefen) {
          tw = kante;
          th = Math.max(1, Math.round((kante * H) / W));
          /* Schrittweise halbieren gibt weniger Treppen als ein einziger
             grosser Sprung: erst grob auf das Doppelte, dann sauber. */
          let quelle = bild,
            qw = bw,
            qh = bh;
          while (qw > tw * 2.5) {
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
          const bx = tw / best.sx,
            by = th / best.sy;
          zg.drawImage(quelle, (-best.ox * tw) / best.sx, (-best.oy * th) / best.sy, bx, by);
          textur = z.toDataURL("image/png");
        }

        return { bw, bh, pruefung, textur, tw, th, best, iou, vorher, deckVorher, deckNachher, roh };
      },
      { url: datenUrl, polys: karte.polys, W: karte.W, H: karte.H, kante: opt.kante, nurPruefen: opt.nurPruefen, roh: opt.roh }
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

function prozent(x) {
  return (x * 100).toFixed(1) + " %";
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

console.log("Bild:  " + r.bw + " x " + r.bh + " px");
console.log("Karte: " + karte.W + " x " + karte.H);

if (r.roh) {
  console.log("\nOhne Einpassung (--roh). Deckung: " + prozent(r.deckVorher));
} else {
  const b = r.best;
  console.log("\nEinpassung: Dehnung " + b.sx.toFixed(4) + " / " + b.sy.toFixed(4) +
              ", Versatz " + (b.ox * 100).toFixed(2) + " % / " + (b.oy * 100).toFixed(2) + " %");
  console.log("Ueberschneidung (IoU): " + prozent(r.vorher) + "  ->  " + prozent(r.iou));
  console.log("Bemalte Spielflaeche:  " + prozent(r.deckVorher) + "  ->  " + prozent(r.deckNachher));
  console.log(
    r.deckNachher > 0.95
      ? "  Sitzt."
      : r.deckNachher > 0.88
        ? "  Brauchbar – die Reste in textur-pruefung.png ansehen."
        : "  Zu wenig. Malerei und Umrisse haben unterschiedliche Formen,\n" +
          "  das laesst sich nicht durch Dehnen und Schieben beheben."
  );
}

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
      "   Groesse: " + r.tw + " x " + r.th + " px, auf das Kartenraster eingepasst\n" +
      "   Neu backen: npm run textur */\n" +
      "window.RISIKO_TEX=" + JSON.stringify(r.textur) + ";\n"
  );
  console.log(
    "Geschrieben: " + kurz(zielJs) + " (" +
      Math.round(fs.statSync(zielJs).size / 1024) + " kB) – die laedt risiko.html."
  );
}
