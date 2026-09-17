# Spielbericht Generator

Client-seitiger PDF-Generator für die Hobbyliga Vorderland. Die Seite lädt Spiele, filtert nach Heimteam und Spieltag, und erzeugt pro Spiel eine PDF-Spielberichtvorlage im Browser.

## Stack

- PHP 8.5 (Server-seitige Seite + API-Proxy)
- Supabase REST API (Datenquelle)
- jsPDF 2.5.1 (Client-seitige PDF-Erstellung)
- HTML/CSS (UI)

## Features

- Filter nach Heimmannschaft und Spieltag
- Mobile-optimierte Tabellenansicht (Kurzform mit "PDF"-Button)
- PDF-Erstellung direkt im Browser (kein Server-Rendering)
- Lädt bestätigte Tore und Karten pro bestehendem Spiel aus Supabase
- Übernimmt bei Matches mit `status = "confirmed"` den gespeicherten Endstand und den aus den Toren berechneten Halbzeitstand in den Spielbericht
- Dateinamen nach Schema: `<matchday>_<home>-<away>-<YYYY-MM-DD>.pdf`
- VFV-Markierung für Spieler (kleines "VFV" im Namensfeld)
- **Manuelle Vorlage:** Erstelle PDFs für Cup- oder Testspiele ohne existierende Match-Daten
  - Eigene Seite mit Formular (Typ, Datum, Uhrzeit, Heim-/Gastmannschaft)
  - Lädt Mannschaftskader automatisch aus der Datenbank
  - Fügt Match-Typ (Cup/Testspiel) zum PDF-Titel hinzu
  - Konfigurierbare Schiedsrichterspesen (pro Spiel anpassbar)

## Caching

- Session-basierter In-Memory Cache
- TTL: 5 Minuten
- Cache pro Request-URL in der PHP-Session

## Konfiguration

Die Supabase URL und der Bearer Token sind in config.php hinterlegt. Der Token ist server-seitig und wird nicht an den Browser ausgegeben. Der verwendete Bearer Token ist der aktuell aktive anon Token von supabase. (April 2026)

### Schiedsrichterspesen

Der Standardwert für die Schiedsrichterspesen ist in `config.php` als Konstante `DEFAULT_REFEREE_FEE` hinterlegt

- **Index-Seite (Ligaspiele):** Verwendet automatisch den konfigurierten Wert
- **Manuelle Vorlage:** Zeigt den Wert als Standardwert im Formular, kann aber pro Spiel angepasst werden

Der Wert wird im generierten PDF unter "Gebühr erhalten" angezeigt. Für zukünftige Saisons kann der Wert in der `config.php` angepasst werden.

## Projektstruktur

- index.php: Hauptseite und Filter-UI
- manual.php: Formularseite für manuelle PDF-Vorlagen (Cup/Testspiele)
- api.php: JSON-Endpoint für Match/Team/Player-Daten sowie bestätigte Tore und Karten (unterstützt Match-ID oder Team-IDs)
- lib/supabase.php: Supabase-Client inkl. Cache
- assets/app.js: PDF-Erstellung und UI-Interaktionen
- assets/manual-form.js: Formular-Logik für manuelle Vorlagen
- assets/style.css: Styling

## Hinweise

- Richtigkeit der Angaben hängen von den Daten auf hobbyliga-vorderland.at ab.

## Live-Server

   https://tschuta.at/tools/sbg/