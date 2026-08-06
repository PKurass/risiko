/* =====================================================================
   RISIKO — REGELKERN IN NODE LADEN

   risiko-regeln.js ist bewusst gewoehnliches Browser-JavaScript ohne
   Modul-Syntax: risiko.html soll es per <script src> einbinden koennen,
   ohne Build-Schritt. Damit laesst es sich aber nicht direkt importieren.

   Diese Datei schliesst die Luecke: sie liest den Quelltext und wertet ihn
   in einem eigenen Funktionsrahmen aus. Kein zweiter Pflegepfad, keine
   Kopie – es laeuft exakt derselbe Code, den auch der Browser ausfuehrt.
   ===================================================================== */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const REGEL_PFAD = path.join(WURZEL, "risiko-regeln.js");

/* Quelltext des Regelkerns – wird auch von karte-backen.mjs gebraucht,
   das ihn in die Browser-Seite injiziert. */
export function regelQuelltext() {
  return fs.readFileSync(REGEL_PFAD, "utf8");
}

export function ladeRiskEngine() {
  const src = regelQuelltext();
  // Der Kern deklariert `const RiskEngine = (function(){...})();`
  return new Function(src + "\n;return RiskEngine;")();
}

export default ladeRiskEngine();
