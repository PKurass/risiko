# Online spielen: bei IONOS einrichten

Ergebnis am Ende: `https://www.deine-seite.de/risiko.html` — dort eröffnet
einer ein Spiel, die anderen treten mit einer sechsstelligen Kennung bei.

Aufwand: einmalig eine gute halbe Stunde. Danach nie wieder.

Es läuft auf **jedem** Webhosting-Paket mit PHP und MySQL, nicht nur bei
IONOS. Die Klickwege unten sind IONOS; bei anderen Anbietern heißen die
Menüpunkte anders, die Schritte sind dieselben.

---

## Schritt 1 · Das Paket bauen

Im Projektordner auf deinem Rechner:

```bash
npm run hochladen
```

Das legt einen Ordner **`hochladen/`** an, in dem genau die Dateien liegen,
die auf den Webspace gehören — und keine einzige mehr. Rund 4,5 MB, das
meiste davon deine gemalte Weltkarte.

Warum nicht einfach das ganze Repo hochladen? Weil dort auch Werkzeuge,
Tests, die Ausgangs-SVG und die Malerei in voller Auflösung liegen. Nichts
davon wird zum Spielen gebraucht, und `Risk_tex.png` allein sind 8,7 MB.

---

## Schritt 2 · Datenbank anlegen

Im IONOS-Kundenmenü:

1. **Hosting & WordPress** → dein Paket → **Datenbanken**
2. **Neue Datenbank erstellen** → MySQL
3. Als Beschreibung z. B. `risiko` eintragen

Du bekommst danach vier Angaben. **Schreib sie dir auf**, du brauchst sie
gleich alle:

| | Beispiel |
|---|---|
| Hostname | `db5012345678.hosting-data.io` |
| Datenbankname | `dbs12345678` |
| Benutzername | `dbu1234567` |
| Passwort | das, was du beim Anlegen vergeben hast |

> Das Passwort wird nur beim Anlegen angezeigt. Verpasst? Im selben Menü
> lässt es sich zurücksetzen.

**Tabellen musst du keine anlegen.** Der Server legt seine beiden selbst an,
wenn er zum ersten Mal aufgerufen wird.

---

## Schritt 3 · PHP-Version prüfen

Im Kundenmenü unter **PHP-Einstellungen** (manchmal unter „Webspace"):
auf **8.1 oder neuer** stellen.

Bei IONOS steht das gelegentlich noch auf einer alten Version. Dann kommt in
Schritt 6 eine weiße Seite statt einer Antwort — deshalb lieber jetzt
nachsehen.

---

## Schritt 4 · Dateien hochladen

Per FTP (FileZilla) oder über den Datei-Manager im Kundenmenü.

Die Zugangsdaten für FTP stehen im Kundenmenü unter **FTP-Zugang**. In
FileZilla oben eintragen: Server, Benutzername, Passwort, Port 21, dann
**Verbinden**.

Auf der rechten Seite landest du im Web-Verzeichnis — das ist der Ordner, in
dem auch die `index.html` deiner Seite liegt. Jetzt den **Inhalt** von
`hochladen/` dorthin ziehen. Nicht den Ordner selbst, seinen Inhalt.

Danach muss es auf dem Server so aussehen:

```
risiko.html
risiko-regeln.js
risiko-karte.js
risiko-netz.js
risiko-daten.js
vendor/
    three.min.js
grafik/
    land-textur.js
server/
    risiko.php
    zugang.beispiel.php
```

**Die Unterordner müssen erhalten bleiben.** Liegt `three.min.js` nicht in
`vendor/`, bleibt das Brett leer.

---

## Schritt 5 · Zugangsdaten eintragen

Im Ordner `server/` auf dem Server:

1. `zugang.beispiel.php` in **`zugang.php`** umbenennen
   (in FileZilla: Rechtsklick → Umbenennen)
2. Datei bearbeiten (Rechtsklick → Ansehen/Bearbeiten) und die vier Angaben
   aus Schritt 2 eintragen:

```php
<?php
return [
    "dsn"      => "mysql:host=db5012345678.hosting-data.io;dbname=dbs12345678;charset=utf8mb4",
    "benutzer" => "dbu1234567",
    "kennwort" => "dein-passwort",
];
```

Achte auf die `dsn`-Zeile: **Hostname** hinter `host=`, **Datenbankname**
hinter `dbname=`. Die beiden werden gern verwechselt.

---

## Schritt 6 · Prüfen, ob alles steht

Im Browser aufrufen:

```
https://www.deine-seite.de/server/risiko.php?was=pruefung
```

Da steht im Klartext, was in Ordnung ist und was nicht:

```
RISIKO – Selbstprüfung des Servers
========================================

OK    PHP-Version 8.2.15 (nötig: 8.1 oder neuer)
OK    Datenbanktreiber vorhanden (mysql, sqlite)
OK    Zugangsdaten (server/zugang.php)
OK    Verbindung zur Datenbank steht
OK    Tabellen sind angelegt
OK    Schreiben und Löschen funktioniert

Alles bereit. Du kannst ein Spiel eröffnen.
```

Steht dort irgendwo `FEHLT`, sagt die Zeile darunter, was zu tun ist.

---

## Schritt 7 · Spielen

```
https://www.deine-seite.de/risiko.html
```

Im Startmenü ganz unten:

- **Spiel eröffnen** → du bekommst eine Kennung wie `K7PQ2M`
- Die Kennung an deine Freunde schicken. Sie öffnen dieselbe Adresse,
  tragen ihren Namen ein, wählen eine Farbe, klicken **Beitreten** und
  tippen die Kennung ein.
- Sobald alle in der Liste stehen, startest **du** das Spiel (nur wer
  eröffnet hat, kann starten).

Danach zieht jeder, wenn er dran ist. Wer nicht dran ist, sieht über dem
Verlauf, auf wen gewartet wird.

---

## Wenn etwas nicht geht

**Weiße Seite bei `?was=pruefung`**
PHP-Version zu alt (Schritt 3) oder die Datei liegt woanders. Prüfe, ob
`server/risiko.php` wirklich in einem Ordner `server` liegt.

**„Kein Datenbankzugang eingerichtet"**
`zugang.php` fehlt oder heißt noch `zugang.beispiel.php`. Groß- und
Kleinschreibung beachten — der Server unterscheidet sie, Windows nicht.

**„SQLSTATE[HY000] [1045] Access denied"**
Benutzername oder Passwort stimmen nicht. Im Kundenmenü nachsehen; im
Zweifel das Passwort neu setzen.

**„SQLSTATE[HY000] [2002]" oder Zeitüberschreitung**
Der Hostname stimmt nicht. Es ist *nicht* `localhost`, sondern die lange
`db….hosting-data.io`-Adresse aus Schritt 2.

**Die Seite lädt, aber das Brett bleibt leer**
`vendor/three.min.js` oder `risiko-daten.js` fehlt. Im Browser F12 drücken,
Reiter „Konsole" — dort steht, welche Datei nicht gefunden wurde.

**„Spiel … gibt es nicht" beim Beitreten**
Vertippt. Die Kennung enthält nie `0`, `O`, `1` oder `I` — genau deshalb,
weil man die verwechselt.

**Die Mitspieler sehen den Zug nicht sofort**
Nachgesehen wird alle 2,5 Sekunden. Ein Dauerdraht (WebSocket) ginge auf
einem Webhosting-Paket nicht, weil dafür ein Prozess dauerhaft laufen
müsste. Für ein Spiel, in dem ein Zug Minuten dauert, reicht Nachfragen.

---

## Später

**Neue Fassung hochladen:** `npm run hochladen`, dann dieselben Dateien
drüberkopieren. `server/zugang.php` dabei **nicht** überschreiben — die wird
vom Paket gar nicht erst mitgeliefert, genau aus diesem Grund.

**Alte Spiele wegräumen:** einmal aufrufen —

```
https://www.deine-seite.de/server/risiko.php?was=aufraeumen
```

löscht alles, was 30 Tage lang niemand angefasst hat. Muss man nicht; ein
Spiel belegt ein paar Kilobyte.

**Die Kennung ist der ganze Zugang.** Wer sie hat, kann zuschauen, solange
das Spiel nicht gestartet ist auch beitreten. Ziehen kann nur, wer sein
eigenes Geheimnis hat — das bekommt jeder beim Beitreten und es verlässt
seinen Browser nie. Unter Freunden reicht das; ein Passwort für die Lobby
gibt es bewusst nicht.
