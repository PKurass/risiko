/* =====================================================================
   RISIKO — FORMVORSCHAU
   Zeigt die Spielsteine einzeln, gross und vor neutralem Grund – statt sie
   auf dem Brett zu suchen.

   Wozu? Beim Nachbauen der Steine nach Vorlage ist die Frage immer
   dieselbe: stimmt die Silhouette? Um das zu beurteilen, braucht es die
   Form, nicht die Weltkarte. Ein Vollbild des Bretts ist dafuer um ein
   Vielfaches teurer – an Rechenzeit, an Dateigroesse und vor allem an dem,
   was ein Mensch oder ein Modell davon durchsehen muss.

   Gerechnet wird in der echten Seite: die Geometrien kommen ueber
   Board3D.intern() aus dem laufenden Spiel. Dadurch zeigt die Vorschau
   garantiert das, was auch auf dem Brett liegt, und niemand pflegt eine
   zweite Fassung der Formen.

   Aufruf:
     node werkzeug/form-vorschau.mjs
     ... --breit 1200     andere Bildbreite (Voreinstellung 820)
     ... --schraeg        von schraeg oben statt senkrecht
   ===================================================================== */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { WURZEL } from "./regeln-laden.mjs";

function argumente(argv) {
  const o = { breit: 820, schraeg: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--schraeg") o.schraeg = true;
    else if (a === "--breit") o.breit = Number(argv[++i]);
    else throw new Error("Unbekannter Schalter: " + a);
  }
  if (!Number.isFinite(o.breit) || o.breit < 200) throw new Error("--breit braucht eine Zahl ab 200.");
  return o;
}

const opt = argumente(process.argv.slice(2));
const ZIEL = path.join(WURZEL, "form-vorschau.png");

const browser = await chromium.launch();
try {
  const seite = await browser.newPage({ viewport: { width: opt.breit, height: 420 } });
  const fehler = [];
  seite.on("pageerror", (e) => fehler.push(String(e)));
  await seite.goto("file://" + path.join(WURZEL, "risiko.html"));
  await seite.waitForTimeout(1200);
  /* Ein Spiel starten, damit Board3D aufgebaut ist – vorher gibt es weder
     Szene noch Geometrien. */
  await seite.click("#startBtn");
  await seite.waitForTimeout(1500);

  const ergebnis = await seite.evaluate(
    async ({ breit, schraeg }) => {
      const THREE = window.THREE;
      const geos = Board3D.intern().truppenGeometrien();
      const namen = ["Einer (3 Zacken)", "Fuenfer (4 Zacken)", "Zehner (5 Zacken)"];

      const hoch = Math.round(breit * 0.42);
      const c = document.createElement("canvas");
      c.width = breit; c.height = hoch;
      const r = new THREE.WebGLRenderer({ canvas: c, antialias: true });
      r.setPixelRatio(1);
      r.setSize(breit, hoch, false);
      r.setClearColor(0x8d939c);           // neutrales Grau, wie ein Fotohintergrund

      const szene = new THREE.Scene();
      szene.add(new THREE.HemisphereLight(0xffffff, 0x555a63, 0.75));
      const sonne = new THREE.DirectionalLight(0xfff4e2, 0.95);
      sonne.position.set(-3, 6, 4); szene.add(sonne);

      /* Alle drei nebeneinander, gemessen an der Breite des groessten –
         so bleiben die Groessenverhaeltnisse sichtbar. */
      const masse = geos.map((g) => { g.computeBoundingBox(); return g.boundingBox; });
      const breiteste = Math.max(...masse.map((b) => b.max.x - b.min.x));
      const teilung = breiteste * 1.5;
      geos.forEach((g, i) => {
        const m = new THREE.Mesh(g, new THREE.MeshToonMaterial({ color: 0xf3c623 }));
        m.position.set((i - 1) * teilung, 0, 0);
        szene.add(m);
      });

      const sicht = teilung * 1.75;
      const kamera = new THREE.OrthographicCamera(-sicht, sicht, sicht / (breit / hoch), -sicht / (breit / hoch), 0.1, 100);
      if (schraeg) kamera.position.set(0, 6, 4.5); else kamera.position.set(0, 10, 0.001);
      kamera.lookAt(0, 0, 0);
      r.render(szene, kamera);

      const bild = c.toDataURL("image/png");
      const zahlen = masse.map((b, i) => ({
        name: namen[i],
        breite: +(b.max.x - b.min.x).toFixed(3),
        tiefe: +(b.max.z - b.min.z).toFixed(3),
        dicke: +(b.max.y - b.min.y).toFixed(3),
      }));
      r.dispose();
      return { bild, zahlen };
    },
    { breit: opt.breit, schraeg: opt.schraeg }
  );

  if (fehler.length) throw new Error("Fehler im Browser:\n" + fehler.join("\n"));

  fs.writeFileSync(ZIEL, Buffer.from(ergebnis.bild.split(",")[1], "base64"));
  console.log("Masse in Welt-Einheiten (die Platte ist " + "1.6" + " hoch):");
  for (const z of ergebnis.zahlen) {
    console.log("  " + z.name.padEnd(20) + " Breite " + z.breite + "  Tiefe " + z.tiefe + "  Dicke " + z.dicke);
  }
  console.log(
    "\nGeschrieben: form-vorschau.png (" +
      Math.round(fs.statSync(ZIEL).size / 1024) + " kB)"
  );
} finally {
  await browser.close();
}
