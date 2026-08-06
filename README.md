# ⚔️ Risiko – Hausregel-Edition

Browserbasiertes Risiko mit eigenen Hausregeln, hotseat (alle Spieler an einem
Gerät). Kein Framework, kein Build-Schritt, keine Installation – `risiko.html`
im Browser öffnen genügt.

Die ausführliche technische Beschreibung steht in **[DOKUMENTATION.md](DOKUMENTATION.md)**.
Wer am Code arbeitet, sollte dort mindestens Abschnitt 3 (Architektur) und
Abschnitt 4 (Regelkern) gelesen haben.

## Loslegen

1. Repo klonen bzw. herunterladen.
2. `risiko.html` in Chrome öffnen (Rechtsklick → „Öffnen mit").
3. Beim **ersten Mal** die eigene `Risk.svg` auswählen, dann auf
   **„Karte sichern"** klicken. Der Browser lädt eine `risiko-daten.js`
   herunter – diese Datei neben `risiko.html` legen. Danach startet das Spiel
   ohne jede Auswahl.

Beim ersten Start wird einmalig Internet gebraucht (Three.js kommt per CDN),
danach cacht der Browser die Bibliothek.

## Dateien

| Datei | Zweck |
|---|---|
| `risiko.html` | Regelkern (`RiskEngine`), Oberfläche und 3D-Darstellung (`Board3D`) |
| `risiko-karte.js` | Karten-Modul `SvgMap`: liest die SVG ein, wandelt sie in Polygone, cacht sie |
| `DOKUMENTATION.md` | Technische Dokumentation |
| `archiv/` | Nicht eingebundene Stände, siehe [archiv/README.md](archiv/README.md) |

Nicht im Repo, weil sie zum jeweiligen Kartenentwurf gehören:

- **`Risk.svg`** – die Ausgangs-Weltkarte mit 42 benannten Flächen. Nur für den
  einmaligen Import nötig; die Namensanforderungen stehen in
  DOKUMENTATION.md Abschnitt 5.1 und 5.3.
- **`risiko-daten.js`** – die eingelesene Karte als feste Datei. Wird per
  „Karte sichern" erzeugt. Sobald eine Fassung feststeht, darf und sollte sie
  mit eingecheckt werden – dann läuft das Spiel überall sofort.

## Stand und nächste Schritte

Der aktuelle Stand ist lokal spielbar: 3D-Karte aus SVG, frei dreh-, kipp-,
verschieb- und zoombar; Spielstand wird automatisch im Browser gespeichert.

Offene Punkte (ausführlich in DOKUMENTATION.md Abschnitt 8 und 9):

- **Toter Code:** In `risiko.html` steckt noch der ungenutzte Block
  „TEIL 2 – WELTKARTE (vollständig im Code)" (`const WorldMap=…`). Die Karte
  kommt inzwischen aus `SvgMap`; der Block kann bei einer Aufräumrunde raus.
- **Kein Test-Harness:** Der frühere Selbsttest des Regelkerns ist in der
  3D-Fassung nicht mehr verdrahtet. `RiskEngine` selbst ist unverändert
  testbar, weil es ohne HTML und ohne Three.js auskommt.
- **Three.js per CDN:** Für echtes Offline müsste die Bibliothek lokal
  beiliegen und der `<script src>` umgebogen werden.
- **Online-Multiplayer:** vorbereitet durch die Trennung Regelkern/Darstellung,
  aber noch nicht gebaut.
