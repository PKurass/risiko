<?php
/* =====================================================================
   RISIKO — POSTFACH-SERVER

   Der Server ist bewusst DUMM. Er kennt keine Regel des Spiels und soll
   sie auch nie kennen: die Regeln stehen in risiko-regeln.js, und zwar in
   einer einzigen Fassung. Ein zweiter Regelkern in PHP muesste bei jeder
   Hausregel mitgepflegt werden und liefe fruher oder spaeter auseinander –
   dann streiten sich zwei Rechner darueber, wer gewonnen hat.

   Was er stattdessen tut, sind drei Dinge:

     1. Er fuehrt eine Liste von Zuegen je Spiel, streng durchnummeriert.
        Jeder Mitspieler holt sich, was er noch nicht hat, und spielt es in
        derselben Reihenfolge nach. Dadurch stehen ueberall dieselben
        Bretter, ohne dass je ein Spielstand uebertragen wird.

     2. Er WUERFELT. Das ist der eigentliche Grund, warum es ihn gibt. Wer
        den vollen Spielstand hat, kann jeden kuenftigen Wurf ausrechnen –
        nachgemessen: 100 % Trefferquote, und ein Verteidiger, der den Wurf
        kennt, verliert 46 % weniger Truppen. Deshalb bekommt jeder Zug
        seine Zufallszahlen erst hier, beim Annehmen.

     3. Er prueft, WER etwas einreicht. Jeder Mitspieler hat ein Geheimnis;
        daraus folgt seine Platznummer. Man kann also nicht im Namen eines
        anderen ziehen.

   Was er NICHT prueft: ob ein Zug regelkonform ist. Dafuer braeuchte er den
   Regelkern. Unter Freunden, die miteinander spielen wollen, ist das die
   richtige Abwaegung – wer schummeln will, muesste den Browser umbauen, und
   dann faellt es beim Nachspielen ohnehin auf, weil die Bretter auseinander-
   laufen.

   BETRIEB
     Bei IONOS: Datei ins Web-Verzeichnis legen, server/zugang.php mit den
     MySQL-Daten daneben (Vorlage: zugang.beispiel.php). Beim ersten Aufruf
     legt der Server seine beiden Tabellen selbst an.
     Zum Ausprobieren ohne MySQL: RISIKO_DSN=sqlite:/pfad/zur/datei.db
   ===================================================================== */

header("Content-Type: application/json; charset=utf-8");
header("Cache-Control: no-store");

/* ---------- Zugang ---------- */
function db(): PDO {
    static $pdo = null;
    if ($pdo !== null) return $pdo;

    $dsn = getenv("RISIKO_DSN") ?: "";
    $benutzer = getenv("RISIKO_USER") ?: null;
    $kennwort = getenv("RISIKO_PASS") ?: null;
    $zugang = __DIR__ . "/zugang.php";
    if ($dsn === "" && is_file($zugang)) {
        $c = require $zugang;
        $dsn = $c["dsn"]; $benutzer = $c["benutzer"] ?? null; $kennwort = $c["kennwort"] ?? null;
    }
    if ($dsn === "") fehler(500, "Kein Datenbankzugang eingerichtet (server/zugang.php fehlt).");

    $pdo = new PDO($dsn, $benutzer, $kennwort, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    tabellen($pdo);
    return $pdo;
}

/* Die Tabellen legt der Server selbst an. Ein Einrichtungsschritt weniger,
   den man vergessen kann – und die einzige Stelle, an der sich MySQL und
   SQLite unterscheiden, ist der Typ der laufenden Nummer. */
function tabellen(PDO $pdo): void {
    $sqlite = str_starts_with($pdo->getAttribute(PDO::ATTR_DRIVER_NAME), "sqlite");
    $id = $sqlite ? "INTEGER PRIMARY KEY AUTOINCREMENT" : "INTEGER PRIMARY KEY AUTO_INCREMENT";
    $pdo->exec("CREATE TABLE IF NOT EXISTS risiko_spiel (
        id VARCHAR(12) PRIMARY KEY,
        saat BIGINT NOT NULL,
        opts TEXT NOT NULL,
        spieler TEXT NOT NULL,
        gestartet INTEGER NOT NULL DEFAULT 0,
        angelegt BIGINT NOT NULL,
        beruehrt BIGINT NOT NULL)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS risiko_zug (
        lfd $id,
        spiel VARCHAR(12) NOT NULL,
        nr INTEGER NOT NULL,
        platz INTEGER NOT NULL,
        aktion TEXT NOT NULL,
        zufall TEXT NOT NULL,
        zeit BIGINT NOT NULL)");
    /* Die eindeutige Nummer je Spiel ist die ganze Gleichzeitigkeits-
       sicherung: reichen zwei Mitspieler im selben Moment ein, bekommt
       einer von beiden einen Schluesselfehler und versucht es erneut. */
    $pdo->exec("CREATE UNIQUE INDEX IF NOT EXISTS risiko_zug_nr ON risiko_zug (spiel, nr)");
}

/* ---------- Kleinkram ---------- */
function fehler(int $code, string $text): never {
    http_response_code($code);
    echo json_encode(["fehler" => $text], JSON_UNESCAPED_UNICODE);
    exit;
}
function raus(array $d): never {
    echo json_encode($d, JSON_UNESCAPED_UNICODE);
    exit;
}
function eingang(): array {
    $roh = file_get_contents("php://input");
    if ($roh === "" || $roh === false) return [];
    $d = json_decode($roh, true);
    return is_array($d) ? $d : [];
}
/* Kurz, aber ohne Zeichen, die man am Telefon verwechselt (0/O, 1/l). */
function kennung(int $n = 6): string {
    $z = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
    $s = "";
    for ($i = 0; $i < $n; $i++) $s .= $z[random_int(0, strlen($z) - 1)];
    return $s;
}
function geheimnis(): string { return bin2hex(random_bytes(16)); }

/* Die Zufallszahlen fuer einen Zug. random_int() ist kryptografisch
   sicher – hier zaehlt nicht die Qualitaet der Verteilung, sondern dass
   niemand sie vorausberechnen kann. Genau das war der Grund fuer den
   ganzen Server. */
function zufall(int $anzahl): array {
    $a = [];
    for ($i = 0; $i < $anzahl; $i++) $a[] = random_int(0, 999999999) / 1000000000;
    return $a;
}
const ZUFALL_JE_ZUG = 8;   // muss zu ZUFALL_JE_AKTION in risiko-regeln.js passen

function spielHolen(PDO $pdo, string $id): array {
    $st = $pdo->prepare("SELECT * FROM risiko_spiel WHERE id = ?");
    $st->execute([$id]);
    $s = $st->fetch();
    if (!$s) fehler(404, "Spiel $id gibt es nicht.");
    return $s;
}
/* Aus dem Geheimnis die Platznummer. Fehlt es oder passt es nicht, ist der
   Absender nicht der, der er zu sein behauptet. */
function platzVon(array $spieler, string $geheim): int {
    foreach ($spieler as $i => $p) if (hash_equals($p["geheim"], $geheim)) return $i;
    fehler(403, "Unbekanntes Geheimnis – bist du in diesem Spiel?");
}
/* Nach aussen nie das Geheimnis der anderen. */
function oeffentlich(array $spieler): array {
    return array_map(fn($p) => ["name" => $p["name"], "color" => $p["color"]], $spieler);
}

/* ---------- Selbstpruefung ----------
   Vor allem anderen, und ohne Datenbank: wer die Datei frisch hochgeladen
   hat, will im Browser sehen, was noch fehlt – nicht eine weisse Seite oder
   ein JSON, das er erst entziffern muss. Deshalb Klartext.

   Aufruf im Browser:  .../server/risiko.php?was=pruefung */
if (($_GET["was"] ?? "") === "pruefung") {
    header("Content-Type: text/plain; charset=utf-8");
    $zeilen = [];
    $alles = true;
    $sagen = function (bool $ok, string $text, string $hilfe = "") use (&$zeilen, &$alles) {
        $zeilen[] = ($ok ? "OK    " : "FEHLT ") . $text;
        if (!$ok) { $alles = false; if ($hilfe !== "") $zeilen[] = "      -> " . $hilfe; }
    };

    $sagen(PHP_VERSION_ID >= 80100, "PHP-Version " . PHP_VERSION . " (nötig: 8.1 oder neuer)",
        "Bei IONOS im Kundenmenü unter 'PHP-Einstellungen' auf 8.1+ stellen.");
    $sagen(in_array("mysql", PDO::getAvailableDrivers(), true) ||
           in_array("sqlite", PDO::getAvailableDrivers(), true),
        "Datenbanktreiber vorhanden (" . implode(", ", PDO::getAvailableDrivers()) . ")");
    $hatZugang = is_file(__DIR__ . "/zugang.php") || getenv("RISIKO_DSN");
    $sagen($hatZugang, "Datei server/zugang.php ist da",
        "Die Datei fehlt. Sie liegt im Paket bei und gehört in den Ordner server/.");

    /* Die haeufigste Stolperstelle: die Datei ist da, aber es stehen noch die
       Beispielwerte drin. Ohne diesen Hinweis kaeme gleich nur ein
       "Access denied" vom Datenbankserver, und das sagt einem Laien nichts. */
    if ($hatZugang && is_file(__DIR__ . "/zugang.php")) {
        $c = require __DIR__ . "/zugang.php";
        $offen = str_contains($c["dsn"] ?? "", "HIER-")
              || str_contains((string)($c["benutzer"] ?? ""), "HIER-")
              || str_contains((string)($c["kennwort"] ?? ""), "HIER-");
        $sagen(!$offen, "Zugangsdaten sind ausgefüllt",
            "In server/zugang.php stehen noch die Platzhalter (HIER-...). " .
            "Trag die vier Angaben aus dem IONOS-Kundenmenü ein.");
        if ($offen) { $hatZugang = false; }
    }

    if ($hatZugang) {
        try {
            $p = db();
            $sagen(true, "Verbindung zur Datenbank steht");
            $p->query("SELECT COUNT(*) FROM risiko_spiel")->fetchColumn();
            $sagen(true, "Tabellen sind angelegt");
            $probe = "PRUEF" . random_int(10, 99);
            $p->prepare("INSERT INTO risiko_spiel (id, saat, opts, spieler, gestartet, angelegt, beruehrt)
                         VALUES (?,?,?,?,0,?,?)")
              ->execute([$probe, 1, "{}", "[]", time(), time()]);
            $p->prepare("DELETE FROM risiko_spiel WHERE id = ?")->execute([$probe]);
            $sagen(true, "Schreiben und Löschen funktioniert");
        } catch (Throwable $e) {
            $sagen(false, "Datenbank: " . $e->getMessage(),
                "Zugangsdaten prüfen. Bei IONOS stehen sie im Kundenmenü unter 'Datenbanken'.");
        }
    }

    echo "RISIKO – Selbstprüfung des Servers\n";
    echo str_repeat("=", 40) . "\n\n";
    echo implode("\n", $zeilen) . "\n\n";
    echo $alles
        ? "Alles bereit. Du kannst ein Spiel eröffnen.\n"
        : "Es fehlt noch etwas – siehe oben.\n";
    exit;
}

/* ---------- Anfragen ---------- */
$was = $_GET["was"] ?? "";
$ein = eingang();
$pdo = db();
$jetzt = time();

switch ($was) {

/* Neues Spiel anlegen. Wer es anlegt, ist Spieler 1 und bekommt sein
   Geheimnis zurueck; die Spielkennung gibt er weiter. */
case "anlegen": {
    $name = trim((string)($ein["name"] ?? "")) ?: "Spieler 1";
    $farbe = (string)($ein["color"] ?? "#ff5470");
    $opts = $ein["opts"] ?? [];
    $geheim = geheimnis();
    $id = kennung();
    $spieler = [["name" => $name, "color" => $farbe, "geheim" => $geheim]];
    $st = $pdo->prepare("INSERT INTO risiko_spiel (id, saat, opts, spieler, gestartet, angelegt, beruehrt)
                         VALUES (?,?,?,?,0,?,?)");
    $st->execute([$id, random_int(1, 2147483646), json_encode($opts), json_encode($spieler), $jetzt, $jetzt]);
    raus(["spiel" => $id, "geheim" => $geheim, "platz" => 0]);
}

/* Einem Spiel beitreten, solange es nicht gestartet ist. */
case "beitreten": {
    $id = strtoupper(trim((string)($ein["spiel"] ?? "")));
    $s = spielHolen($pdo, $id);
    if ($s["gestartet"]) fehler(409, "Das Spiel läuft schon.");
    $spieler = json_decode($s["spieler"], true);
    if (count($spieler) >= 6) fehler(409, "Das Spiel ist voll (6 Plätze).");
    $geheim = geheimnis();
    $spieler[] = [
        "name" => trim((string)($ein["name"] ?? "")) ?: ("Spieler " . (count($spieler) + 1)),
        "color" => (string)($ein["color"] ?? "#4da3ff"),
        "geheim" => $geheim,
    ];
    $st = $pdo->prepare("UPDATE risiko_spiel SET spieler = ?, beruehrt = ? WHERE id = ?");
    $st->execute([json_encode($spieler), $jetzt, $id]);
    raus(["spiel" => $id, "geheim" => $geheim, "platz" => count($spieler) - 1]);
}

/* Stand der Lobby und des Spiels. Bewusst ohne Geheimnis abrufbar – es
   steht nichts darin, was ein Mitspieler nicht ohnehin sieht. */
case "lage": {
    $id = strtoupper(trim((string)($_GET["spiel"] ?? "")));
    $s = spielHolen($pdo, $id);
    $st = $pdo->prepare("SELECT MAX(nr) AS n FROM risiko_zug WHERE spiel = ?");
    $st->execute([$id]);
    raus([
        "spiel" => $id,
        "spieler" => oeffentlich(json_decode($s["spieler"], true)),
        "opts" => json_decode($s["opts"], true),
        "gestartet" => (bool)$s["gestartet"],
        "saat" => $s["gestartet"] ? (int)$s["saat"] : null,
        "zuege" => (int)($st->fetch()["n"] ?? 0),
    ]);
}

/* Spiel starten. Darf nur, wer es angelegt hat. Ab jetzt gibt der Server
   den Startwert heraus – vorher waere er nutzlos, danach brauchen ihn
   alle, um dasselbe Brett aufzubauen. */
case "starten": {
    $id = strtoupper(trim((string)($ein["spiel"] ?? "")));
    $s = spielHolen($pdo, $id);
    $spieler = json_decode($s["spieler"], true);
    if (platzVon($spieler, (string)($ein["geheim"] ?? "")) !== 0)
        fehler(403, "Nur wer das Spiel angelegt hat, kann es starten.");
    if (count($spieler) < 2) fehler(409, "Mindestens zwei Spieler.");
    if (!$s["gestartet"]) {
        $st = $pdo->prepare("UPDATE risiko_spiel SET gestartet = 1, beruehrt = ? WHERE id = ?");
        $st->execute([$jetzt, $id]);
    }
    raus(["spiel" => $id, "saat" => (int)$s["saat"], "spieler" => oeffentlich($spieler),
          "opts" => json_decode($s["opts"], true)]);
}

/* Einen Zug einreichen. Der Server haengt die Zufallszahlen an und gibt
   den fertigen Eintrag zurueck – derselbe, den gleich alle anderen holen. */
case "zug": {
    $id = strtoupper(trim((string)($ein["spiel"] ?? "")));
    $s = spielHolen($pdo, $id);
    if (!$s["gestartet"]) fehler(409, "Das Spiel läuft noch nicht.");
    $platz = platzVon(json_decode($s["spieler"], true), (string)($ein["geheim"] ?? ""));
    $aktion = $ein["aktion"] ?? null;
    if (!is_array($aktion) || !isset($aktion["type"])) fehler(400, "Aktion fehlt oder ist unbrauchbar.");

    /* Bis zu fuenf Anlaeufe: reichen zwei gleichzeitig ein, faellt einer in
       den eindeutigen Schluessel und bekommt die naechste Nummer. */
    for ($versuch = 0; $versuch < 5; $versuch++) {
        $st = $pdo->prepare("SELECT MAX(nr) AS n FROM risiko_zug WHERE spiel = ?");
        $st->execute([$id]);
        $nr = (int)($st->fetch()["n"] ?? 0) + 1;
        $wuerfel = zufall(ZUFALL_JE_ZUG);
        try {
            $st = $pdo->prepare("INSERT INTO risiko_zug (spiel, nr, platz, aktion, zufall, zeit)
                                 VALUES (?,?,?,?,?,?)");
            $st->execute([$id, $nr, $platz, json_encode($aktion), json_encode($wuerfel), $jetzt]);
        } catch (PDOException $e) {
            continue;                       // Nummer war schon vergeben
        }
        $pdo->prepare("UPDATE risiko_spiel SET beruehrt = ? WHERE id = ?")->execute([$jetzt, $id]);
        raus(["nr" => $nr, "platz" => $platz, "aktion" => $aktion, "zufall" => $wuerfel]);
    }
    fehler(503, "Zug konnte nicht eingereiht werden – bitte noch einmal.");
}

/* Alles abholen, was nach `seit` dazugekommen ist. Das ist die ganze
   Synchronisierung: Zuege in Reihenfolge nachspielen. */
case "zuege": {
    $id = strtoupper(trim((string)($_GET["spiel"] ?? "")));
    spielHolen($pdo, $id);
    $seit = max(0, (int)($_GET["seit"] ?? 0));
    $st = $pdo->prepare("SELECT nr, platz, aktion, zufall FROM risiko_zug
                         WHERE spiel = ? AND nr > ? ORDER BY nr ASC LIMIT 500");
    $st->execute([$id, $seit]);
    $zuege = array_map(fn($z) => [
        "nr" => (int)$z["nr"],
        "platz" => (int)$z["platz"],
        "aktion" => json_decode($z["aktion"], true),
        "zufall" => json_decode($z["zufall"], true),
    ], $st->fetchAll());
    raus(["spiel" => $id, "zuege" => $zuege]);
}

/* Aufraeumen: alte Spiele wegwerfen. Darf jeder aufrufen, es loescht nur,
   was lange niemand mehr angefasst hat. */
case "aufraeumen": {
    $grenze = $jetzt - 60 * 60 * 24 * 30;
    $alt = $pdo->prepare("SELECT id FROM risiko_spiel WHERE beruehrt < ?");
    $alt->execute([$grenze]);
    $ids = array_column($alt->fetchAll(), "id");
    foreach ($ids as $id) {
        $pdo->prepare("DELETE FROM risiko_zug WHERE spiel = ?")->execute([$id]);
        $pdo->prepare("DELETE FROM risiko_spiel WHERE id = ?")->execute([$id]);
    }
    raus(["geloescht" => count($ids)]);
}

default:
    fehler(400, "Unbekannte Anfrage. Erlaubt: pruefung, anlegen, beitreten, lage, starten, zug, zuege, aufraeumen.");
}
